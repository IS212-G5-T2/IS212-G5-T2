// SPM-125 backend fault injection: unavailability history (AC1) and its immutability, the unavailable period
// blocking bookings and its occupied-period boundary (AC3, AC4), the booking history (AC5) and the Coordinator
// notifications for unavailability, setup or turnaround and capacity changes (AC6 to AC9).
// Run: node scripts/mutation/run.mjs --mutants spm125.mutants.mjs   (the e2e suite needs DATABASE_URL on the host LAN IP)
//
// Unit-level mutants name the exact test that must fail (`testMappings`); the real-database suite
// (test/venue-impact.e2e-spec.ts) is one ordered scenario whose cases build on each other's rows, so a single case
// cannot be selected alone and its mutants carry no mapping: `--measure-kills` records which cases fail under each one.
const NOTICES = 'src/venues/notifications/venue-impact-notifications.ts';
const REPO = 'src/venues/repository/venues.repository.ts';
const SERVICE = 'src/venues/venues.service.ts';
const CONTROLLER = 'src/venues/venues.controller.ts';
const EVENTS = 'src/events/events.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const VALIDATOR = 'src/venues/availability/dto/venue-unavailability.ts';

const NOTICES_SPEC = 'src/venues/notifications/venue-impact-notifications.spec.ts';
const REPO_SPEC = 'src/venues/repository/venues.repository.spec.ts';
const SERVICE_SPEC = 'src/venues/venues.service.spec.ts';
const CONTROLLER_SPEC = 'src/venues/venues.controller.spec.ts';
const REJECT_SPEC = 'src/events/review/events.reject.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const E2E_FILE = 'test/venue-impact.e2e-spec.ts';

export const SUITES = {
  notices: { args: ['run', NOTICES_SPEC] },
  repository: { args: ['run', REPO_SPEC] },
  service: { args: ['run', SERVICE_SPEC] },
  controller: { args: ['run', CONTROLLER_SPEC] },
  reject: { args: ['run', REJECT_SPEC] },
  lead: { args: ['run', LEAD_SPEC] },
  e2e: { args: ['run', '--config', './vitest.config.e2e.ts', E2E_FILE], needsEnv: ['DATABASE_URL'] },
};

const at = (suite, file) => (title) => ({ suite, file, title });
const nt = at('notices', NOTICES_SPEC);
const rp = at('repository', REPO_SPEC);
const sv = at('service', SERVICE_SPEC);
const ct = at('controller', CONTROLLER_SPEC);
const rj = at('reject', REJECT_SPEC);
const ld = at('lead', LEAD_SPEC);

const T = {
  msgUnavailable: nt('VEN-IMPACT-07-A builds the unavailability message with the event, venue, period and reason'),
  msgTiming: nt('VEN-IMPACT-08-A builds the setup or turnaround message with the venue and the conflicting booking'),
  msgCapacity: nt('VEN-IMPACT-09-A builds the capacity message with the old and new capacity and the booking'),
  once: nt('VEN-IMPACT-06-A notifies each booking Coordinator once and nobody else'),
  noCoordinator: nt('VEN-IMPACT-06-BND-1 skips a booking with no assigned Coordinator'),
  eachType: nt('VEN-IMPACT-08-A VEN-IMPACT-09-A writes one %s notice and nothing else'),
  historyCreated: rp('VEN-IMPACT-01-A records the created period and its history entry with the Venue Staff member in one statement'),
  notifyListed: rp('VEN-IMPACT-06-B notifies the Coordinators of the listed affected bookings only and marks them notified'),
  historyEnded: rp('VEN-IMPACT-01-B records an early end with the previous end and the Venue Staff member in the same statement'),
  historyList: rp('VEN-IMPACT-01-C lists history entries with the period, reason, person and time, newest first'),
  unknownVenue: rp('VEN-IMPACT-01-BND-1 VEN-IMPACT-05-BND-1 returns undefined for an unknown venue without reading history'),
  bookingHistory: rp('VEN-IMPACT-05-A lists every booking and hold of the venue with its status and unavailable-period overlap'),
  timingNotify: rp('VEN-IMPACT-08-B notifies the Coordinators of upcoming bookings that now conflict after a setup change'),
  endedBooking: rp('VEN-IMPACT-08-BND-1 VEN-IMPACT-09-BND-1 lists but does not notify a booking that has ended'),
  capacityNotify: rp('VEN-IMPACT-09-B notifies the Coordinators of upcoming bookings of a capacity change with old and new values'),
  expiredHold: rp('VEN-IMPACT-09-BND-3 lists but does not notify an expired hold after a capacity change'),
  routes: ct('VEN-IMPACT-01-C VEN-IMPACT-05-A routes the two history reads with the verified caller'),
  svcReads: sv('VEN-IMPACT-01-C VEN-IMPACT-05-A returns both histories to Venue Staff'),
  svcRefuses: sv('VEN-IMPACT-01-SEC-1 VEN-IMPACT-05-SEC-1 refuses callers who are not Venue Staff before reading'),
  svcUnknown: sv('VEN-IMPACT-01-BND-1 VEN-IMPACT-05-BND-1 answers 404 for a malformed or unknown venue'),
  svcWrites: sv('VEN-IMPACT-01-BND-1 writes no history for a malformed venue or period, or a period that cannot be ended'),
  feed: rj('VEN-IMPACT-07-E labels the three Coordinator venue notices and gives their booking'),
  // The source title has an escaped apostrophe (coordinator\'s); the mapping uses the text before it, which Vitest's name pattern and the runner's source check both accept.
  reassign: ld('VEN-IMPACT-07-H also marks the original coordinator'),
};

// The two blocking checks of the booking request route and the tentative hold route share their SQL; the comment
// above the booking request route's check makes this fragment unique to it.
const REQUEST_BLOCK_HEAD = `Only standalone pending holds need an expiry here; event-linked pending booking requests also block below.
      const conflict = await client.query<{ reason: string }>(
        \`SELECT reason FROM (
           SELECT COALESCE(reason, 'Venue unavailable') AS reason
             FROM venue_bookings
            WHERE venue_id = $1::uuid AND status = 'blocked'
              AND start_at < $3::timestamptz + make_interval(mins => $5::int)
              AND end_at > $2::timestamptz - make_interval(mins => $4::int)`;
const requestBlock = (from, to) => {
  if (!REQUEST_BLOCK_HEAD.includes(from) || REQUEST_BLOCK_HEAD.split(from).length !== 2)
    throw new Error(`SPM-125 mutant anchor is not unique in the booking request blocking SQL: ${from}`);
  return [REQUEST_BLOCK_HEAD, REQUEST_BLOCK_HEAD.replace(from, () => to)];
};

const HISTORY_GUARD = `    const venue = await this.database.query('SELECT id FROM venues WHERE id = $1::uuid', [venueId]);
    if (!venue.rows[0]) return undefined;
    const result = await this.database.query<{
      id: string;
`;

export const MUTANTS = [
  // ---- Coordinator messages and the notice writer (AC6 to AC9) ----
  { id: 'BE-125-01', name: 'the unavailability notice leaves out the reason (AC7)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.msgUnavailable, T.notifyListed],
    edits: [[' (reason: ${change.reason}). Alternative', '. Alternative']] },
  { id: 'BE-125-02', name: 'the unavailability notice gives the booking period instead of the unavailable period (AC7)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.msgUnavailable, T.notifyListed],
    edits: [['is unavailable from ${sgtRange(change.start.getTime(), change.end.getTime())}', 'is unavailable from ${sgtRange(booking.start.getTime(), booking.end.getTime())}']] },
  { id: 'BE-125-03', name: 'every venue-change notice leaves out the event name (AC7, AC8, AC9)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.msgUnavailable, T.msgTiming, T.msgCapacity, T.notifyListed, T.capacityNotify],
    edits: [['const booked = `your booking for "${booking.eventName}" (', 'const booked = `your booking for "" (']] },
  { id: 'BE-125-04', name: 'the setup or turnaround notice leaves out the venue name (AC8)', file: NOTICES, suites: ['notices', 'e2e'],
    testMappings: [T.msgTiming],
    edits: [['The setup or turnaround time of ${venueName} changed, so', 'The setup or turnaround time changed, so']] },
  { id: 'BE-125-05', name: 'the capacity notice swaps the old and the new capacity (AC9)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.msgCapacity, T.capacityNotify],
    edits: [['changed from ${change.previousCapacity} to ${change.capacity}.', 'changed from ${change.capacity} to ${change.previousCapacity}.']] },
  { id: 'BE-125-06', name: 'a setup or turnaround change is sent as an unavailability notice (AC8)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.eachType, T.timingNotify],
    edits: [["  timing: 'venue_timing_impact',\n  capacity: 'venue_capacity_impact',\n} as const", "  timing: 'venue_unavailable_impact',\n  capacity: 'venue_capacity_impact',\n} as const"]] },
  { id: 'BE-125-07', name: 'a capacity change is sent as a setup or turnaround notice (AC9)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.eachType, T.capacityNotify],
    edits: [["  capacity: 'venue_capacity_impact',\n} as const", "  capacity: 'venue_timing_impact',\n} as const"]] },
  { id: 'BE-125-08', name: 'a booking listed twice is notified twice (AC6)', file: NOTICES, suites: ['notices'],
    testMappings: [T.once],
    edits: [['if (!booking.coordinatorId || notified.has(booking.bookingId)) continue;', 'if (!booking.coordinatorId) continue;']] },
  { id: 'BE-125-09', name: 'a booking whose event has no Coordinator is still sent a notice (AC6)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.noCoordinator, T.notifyListed],
    edits: [['if (!booking.coordinatorId || notified.has(booking.bookingId)) continue;', 'if (notified.has(booking.bookingId)) continue;']] },
  { id: 'BE-125-10', name: 'the notice is addressed to the event instead of its Coordinator (AC6)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.once, T.notifyListed, T.timingNotify, T.capacityNotify],
    edits: [['booking.coordinatorId,\n        TYPE_BY_KIND', 'booking.eventId,\n        TYPE_BY_KIND']] },
  { id: 'BE-125-11', name: 'the notice is not linked to its booking (AC7)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.once, T.notifyListed, T.timingNotify],
    edits: [['booking.eventId,\n        booking.bookingId,\n      ],', 'booking.eventId,\n        null,\n      ],']] },
  { id: 'BE-125-12', name: 'no booking is reported as notified (AC6)', file: NOTICES, suites: ['notices', 'repository', 'e2e'],
    testMappings: [T.once, T.notifyListed, T.timingNotify, T.capacityNotify],
    edits: [['    notified.add(booking.bookingId);\n', '']] },

  // ---- History: created, ended early, read (AC1) ----
  { id: 'BE-125-13', name: 'a saved period is written without the Venue Staff member in its history entry (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyCreated],
    edits: [["SELECT venue_id, id, 'created', start_at, end_at, reason, $5::uuid FROM saved", "SELECT venue_id, id, 'created', start_at, end_at, reason, NULLIF($5::uuid, $5::uuid) FROM saved"]] },
  { id: 'BE-125-14', name: 'a saved period gets no history entry (AC1)', file: REPO, suites: ['e2e'],
    edits: [["SELECT venue_id, id, 'created', start_at, end_at, reason, $5::uuid FROM saved", "SELECT venue_id, id, 'created', start_at, end_at, reason, $5::uuid FROM saved WHERE false"]] },
  { id: 'BE-125-15', name: 'an early end is written without the Venue Staff member in its history entry (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyEnded],
    edits: [['previous_end_at, reason, $4::uuid, $3::timestamptz\n           FROM ended', 'previous_end_at, reason, NULLIF($4::uuid, $4::uuid), $3::timestamptz\n           FROM ended']] },
  { id: 'BE-125-16', name: 'an early end is timed by the database clock instead of the server time (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyEnded],
    edits: [['previous_end_at, reason, $4::uuid, $3::timestamptz\n           FROM ended', 'previous_end_at, reason, $4::uuid, now()\n           FROM ended']] },
  { id: 'BE-125-17', name: 'the history is listed oldest first (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyList],
    edits: [['ORDER BY h.created_at DESC, h.id', 'ORDER BY h.created_at ASC, h.id']] },
  { id: 'BE-125-18', name: 'the history hides an entry that has no recorded person (AC1)', file: REPO, suites: ['repository'],
    testMappings: [T.historyList],
    edits: [['LEFT JOIN users u ON u.id = h.actor_user_id', 'JOIN users u ON u.id = h.actor_user_id']] },
  { id: 'BE-125-19', name: 'the history leaves out the end an early end replaced (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyList],
    edits: [['...(row.previous_end_at ? { previousEnd: row.previous_end_at.toISOString() } : {}),', '']] },
  { id: 'BE-125-20', name: 'the history never names who made the change (AC1)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.historyList],
    edits: [['changedBy: row.changed_by,', 'changedBy: null,']] },
  { id: 'BE-125-21', name: 'the history of an unknown venue is read instead of answering unknown (AC1)', file: REPO, suites: ['repository'],
    testMappings: [T.unknownVenue],
    edits: [[`${HISTORY_GUARD}      period_id: string;`, '    const result = await this.database.query<{\n      id: string;\n      period_id: string;']] },
  { id: 'BE-125-22', name: 'the booking history of an unknown venue is read instead of answering unknown (AC5)', file: REPO, suites: ['repository'],
    testMappings: [T.unknownVenue],
    edits: [[`${HISTORY_GUARD}      booking_reference: string;`, '    const result = await this.database.query<{\n      id: string;\n      booking_reference: string;']] },

  // ---- Booking history (AC5) ----
  { id: 'BE-125-23', name: 'the booking history lists only approved bookings (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [["WHERE b.venue_id = $1::uuid AND b.status <> 'blocked'", "WHERE b.venue_id = $1::uuid AND b.status = 'approved'"]] },
  { id: 'BE-125-24', name: 'the booking history hides bookings that have already ended (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [
      ["WHERE b.venue_id = $1::uuid AND b.status <> 'blocked'\n        ORDER BY b.start_at DESC, b.id`,\n      [venueId],", "WHERE b.venue_id = $1::uuid AND b.status <> 'blocked' AND b.end_at > $2::timestamptz\n        ORDER BY b.start_at DESC, b.id`,\n      [venueId, new Date('2030-01-10T12:00:00.000Z')],"],
    ] },
  { id: 'BE-125-25', name: 'the booking history lists the earliest slot first (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [["AND b.status <> 'blocked'\n        ORDER BY b.start_at DESC, b.id", "AND b.status <> 'blocked'\n        ORDER BY b.start_at ASC, b.id"]] },
  { id: 'BE-125-26', name: 'the booking history never flags a booking that overlaps an unavailable period (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [['affectedByUnavailablePeriod: row.affected,\n      requestedAt', 'affectedByUnavailablePeriod: false,\n      requestedAt']] },
  { id: 'BE-125-27', name: 'the booking history overlap test looks at approved bookings instead of unavailable periods (AC5)', file: REPO, suites: ['e2e'],
    edits: [["b.hold_expires_at, b.created_at,\n              EXISTS (SELECT 1 FROM venue_bookings blockout\n                WHERE blockout.venue_id = b.venue_id AND blockout.status = 'blocked'", "b.hold_expires_at, b.created_at,\n              EXISTS (SELECT 1 FROM venue_bookings blockout\n                WHERE blockout.venue_id = b.venue_id AND blockout.status = 'approved'"]] },
  { id: 'BE-125-28', name: 'the booking history never names the Coordinator (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [['coordinatorName: row.coordinator_name,\n      start: row.start_at.toISOString(),', 'coordinatorName: null,\n      start: row.start_at.toISOString(),']] },
  { id: 'BE-125-29', name: 'the booking history leaves out the hold expiry (AC5)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.bookingHistory],
    edits: [['...(row.hold_expires_at ? { holdExpiresAt: row.hold_expires_at.toISOString() } : {}),\n      affectedByUnavailablePeriod', 'affectedByUnavailablePeriod']] },

  // ---- Notifying when a period is saved (AC6, AC7) ----
  { id: 'BE-125-30', name: 'a pending booking request without a hold is treated as affected and notified (AC6)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.notifyListed],
    edits: [
      ["(b.status = 'pending' AND b.hold_expires_at > $3::timestamptz))\n           AND b.start_at - make_interval(mins => v.setup_time_minutes) < $2::timestamptz", "(b.status = 'pending'))\n           AND b.start_at - make_interval(mins => v.setup_time_minutes) < $2::timestamptz"],
      ["(booking.status === 'pending' &&\n                booking.hold_expires_at != null &&\n                booking.hold_expires_at.getTime() > now.getTime()),", "(booking.status === 'pending'),"],
    ] },
  { id: 'BE-125-31', name: 'the Venue Staff member is notified instead of the Coordinators (AC6)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.notifyListed],
    edits: [['coordinatorId: booking.coordinator_id,', 'coordinatorId: actorId,']] },
  { id: 'BE-125-32', name: 'the saved period does not say which affected bookings were notified (AC6)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.notifyListed],
    edits: [['...(notified.has(booking.id) ? { coordinatorNotified: true as const } : {}),\n            };', '};']] },
  { id: 'BE-125-33', name: 'the saved period marks every affected booking as notified (AC6)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.notifyListed],
    edits: [['...(notified.has(booking.id) ? { coordinatorNotified: true as const } : {}),\n            };', '...{ coordinatorNotified: true as const },\n            };']] },
  { id: 'BE-125-34', name: 'saving the period cancels the bookings it affects (AC6, SPM-122 AC7)', file: REPO, suites: ['e2e'],
    edits: [['      const row = saved.rows[0];\n      const affectedRows = affected.rows.filter(', "      await client.query(\"UPDATE venue_bookings SET status = 'cancelled' WHERE id = ANY($1::uuid[])\", [affected.rows.map((booking) => booking.id)]);\n      const row = saved.rows[0];\n      const affectedRows = affected.rows.filter("]] },

  // ---- Notifying when a venue edit changes setup, turnaround or capacity (AC8, AC9) ----
  { id: 'BE-125-35', name: 'a setup or turnaround change notifies nobody (AC8)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.timingNotify],
    edits: [['bookings: upcomingImpacted(affected.rows, now),', 'bookings: [],']] },
  { id: 'BE-125-36', name: 'a capacity change notifies nobody (AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.capacityNotify, T.expiredHold],
    edits: [['bookings: upcomingImpacted(capacityRows.rows, now),', 'bookings: [],']] },
  { id: 'BE-125-37', name: 'a booking that ends exactly now is still notified (AC8, AC9)', file: REPO, suites: ['repository'],
    testMappings: [T.endedBooking],
    edits: [['row.end_at.getTime() > now.getTime() && row.holds_venue', 'row.end_at.getTime() >= now.getTime() && row.holds_venue']] },
  { id: 'BE-125-38', name: 'a booking that has ended is still notified (AC8, AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.endedBooking, T.capacityNotify],
    edits: [['row.end_at.getTime() > now.getTime() && row.holds_venue', 'row.holds_venue']] },
  { id: 'BE-125-39', name: 'a booking that no longer holds the venue is still notified (AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.expiredHold],
    edits: [['row.end_at.getTime() > now.getTime() && row.holds_venue !== false', 'row.end_at.getTime() > now.getTime()']] },
  { id: 'BE-125-40', name: 'every pending or approved row is treated as still holding the venue (AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.expiredHold],
    edits: [["${eligibleBooking.replaceAll('$6', '$2')} AS holds_venue", 'true AS holds_venue']] },
  { id: 'BE-125-41', name: 'the capacity notice gives the new capacity as the old one (AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.capacityNotify],
    edits: [['previousCapacity: lock.rows[0].capacity, capacity: input.capacity }', 'previousCapacity: input.capacity, capacity: input.capacity }']] },
  { id: 'BE-125-42', name: 'the setup or turnaround listing never marks a booking as notified (AC8)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.timingNotify],
    edits: [['toAffectedBooking(r, timingNotified)', 'toAffectedBooking(r, new Set<string>())']] },
  { id: 'BE-125-43', name: 'the capacity listing never marks a booking as notified (AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.capacityNotify, T.expiredHold],
    edits: [['toAffectedBooking(r, capacityNotified)', 'toAffectedBooking(r, new Set<string>())']] },
  { id: 'BE-125-44', name: 'the venue edit listing marks every listed booking as notified (AC8, AC9)', file: REPO, suites: ['repository', 'e2e'],
    testMappings: [T.endedBooking, T.expiredHold],
    edits: [['...(notified.has(row.id) ? { coordinatorNotified: true as const } : {}),', '...{ coordinatorNotified: true as const },']] },

  // ---- An unavailable period blocks bookings; the occupied-period boundary (AC3, AC4) ----
  { id: 'BE-125-45', name: 'a booking request is accepted inside an unavailable period (AC3)', file: REPO, suites: ['e2e'],
    edits: [requestBlock("status = 'blocked'", "status = 'unblocked'")] },
  { id: 'BE-125-46', name: 'a booking whose occupied period starts exactly when the unavailable period ends is refused (AC4)', file: REPO, suites: ['e2e'],
    edits: [requestBlock('AND end_at > $2::timestamptz - make_interval(mins => $4::int)', 'AND end_at >= $2::timestamptz - make_interval(mins => $4::int)')] },
  { id: 'BE-125-47', name: 'the setup time is not counted when a booking request meets an unavailable period (AC4)', file: REPO, suites: ['e2e'],
    edits: [requestBlock('AND end_at > $2::timestamptz - make_interval(mins => $4::int)', 'AND end_at > $2::timestamptz')] },
  { id: 'BE-125-48', name: 'the refusal does not name the unavailable period reason (AC3)', file: SERVICE, suites: ['e2e'],
    edits: [['because it conflicts with ${result.reason}. Check availability again', 'because it conflicts with an existing booking. Check availability again']] },
  { id: 'BE-125-49', name: 'the venue list leaves out the unavailable periods (AC3)', file: REPO, suites: ['e2e'],
    edits: [["WHERE venue_id = ANY($1::uuid[]) AND status = 'blocked' AND end_at > $2::timestamptz\n         ORDER BY start_at, id", "WHERE venue_id = ANY($1::uuid[]) AND status = 'blocked' AND end_at > $2::timestamptz AND false\n         ORDER BY start_at, id"]] },
  { id: 'BE-125-50', name: 'a period whose end is not after its start is accepted and saved (AC6)', file: VALIDATOR, suites: ['e2e'],
    edits: [['if (!errors.start && !errors.end && end <= start)', 'if (false)']] },

  // ---- The Coordinator feed and reassignment (AC7) ----
  { id: 'BE-125-51', name: 'venue-change notices are labelled for the organiser instead of the Coordinator (AC7)', file: EVENTS, suites: ['reject', 'e2e'],
    testMappings: [T.feed],
    edits: [["  if ((VENUE_IMPACT_COORDINATOR_TYPES as readonly string[]).includes(row.type)) return 'coordinator';\n", '']] },
  { id: 'BE-125-52', name: 'the feed drops the booking a venue-change notice is about (AC7)', file: EVENTS, suites: ['reject', 'e2e'],
    testMappings: [T.feed],
    edits: [['relatedBookingId: row.related_booking_id ?? null,', 'relatedBookingId: null,']] },
  { id: 'BE-125-53', name: 'the Coordinator feed does not ask for venue-change notices (AC7)', file: EVENTS, suites: ['e2e'],
    edits: [['            ...VENUE_IMPACT_COORDINATOR_TYPES,\n', '']] },
  { id: 'BE-125-54', name: 'the feed drops the event name of a notice (AC7)', file: EVENTS, suites: ['e2e'],
    edits: [['relatedEventName: row.event_name,', 'relatedEventName: null,']] },
  { id: 'BE-125-55', name: 'reassigning an event leaves the previous Coordinator\'s venue-change notices unread (AC7)', file: LEAD, suites: ['lead'],
    testMappings: [T.reassign],
    edits: [["                         ${VENUE_IMPACT_COORDINATOR_TYPES.map((type) => `'${type}'`).join(', ')},\n", '']] },

  // ---- History routes, access and immutability (AC1, AC5) ----
  { id: 'BE-125-56', name: 'a Coordinator can read the unavailability history (authorisation removed)', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcRefuses],
    edits: [['async unavailabilityHistory(user: AuthenticatedUser | undefined, id: string) {\n    await this.authorizeStaff(user);\n', 'async unavailabilityHistory(user: AuthenticatedUser | undefined, id: string) {\n']] },
  { id: 'BE-125-57', name: 'a Coordinator can read the booking history (authorisation removed)', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcRefuses],
    edits: [['async bookingHistory(user: AuthenticatedUser | undefined, id: string) {\n    await this.authorizeStaff(user);\n', 'async bookingHistory(user: AuthenticatedUser | undefined, id: string) {\n']] },
  { id: 'BE-125-58', name: 'a malformed venue id reaches the unavailability history read', file: SERVICE, suites: ['service'],
    testMappings: [T.svcUnknown],
    edits: [["    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');\n    const entries = await this.repository.listUnavailabilityHistory(id);", '    const entries = await this.repository.listUnavailabilityHistory(id);']] },
  { id: 'BE-125-59', name: 'a malformed venue id reaches the booking history read', file: SERVICE, suites: ['service'],
    testMappings: [T.svcUnknown],
    edits: [["    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');\n    const entries = await this.repository.listBookingHistory(id);", '    const entries = await this.repository.listBookingHistory(id);']] },
  { id: 'BE-125-60', name: 'an unknown venue returns an empty unavailability history instead of 404', file: SERVICE, suites: ['service'],
    testMappings: [T.svcUnknown],
    edits: [["const entries = await this.repository.listUnavailabilityHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return entries;", 'const entries = await this.repository.listUnavailabilityHistory(id);\n    return entries ?? [];']] },
  { id: 'BE-125-61', name: 'an unknown venue returns an empty booking history instead of 404', file: SERVICE, suites: ['service'],
    testMappings: [T.svcUnknown],
    edits: [["const entries = await this.repository.listBookingHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return entries;", 'const entries = await this.repository.listBookingHistory(id);\n    return entries ?? [];']] },
  { id: 'BE-125-62', name: 'the unavailability history read returns nothing', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcReads],
    edits: [["const entries = await this.repository.listUnavailabilityHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return entries;", "const entries = await this.repository.listUnavailabilityHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return [];"]] },
  { id: 'BE-125-63', name: 'the booking history read returns nothing', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcReads],
    edits: [["const entries = await this.repository.listBookingHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return entries;", "const entries = await this.repository.listBookingHistory(id);\n    if (!entries) throw new NotFoundException('Venue not found.');\n    return [];"]] },
  { id: 'BE-125-64', name: 'a malformed venue id reaches the repository when a period is saved', file: SERVICE, suites: ['service'],
    testMappings: [T.svcWrites],
    edits: [["    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');\n    const result = await this.repository.markUnavailable(", '    const result = await this.repository.markUnavailable(']] },
  { id: 'BE-125-65', name: 'a malformed period id reaches the repository when a period is ended', file: SERVICE, suites: ['service'],
    testMappings: [T.svcWrites],
    edits: [['if (!UUID.test(id) || !UUID.test(periodId))', 'if (!UUID.test(id))']] },
  { id: 'BE-125-66', name: 'ending a period that cannot be ended is reported as success', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcWrites],
    edits: [["    if (!period) throw new NotFoundException('Unavailable period not found.');\n    return { period };", '    return { period };']] },
  { id: 'BE-125-67', name: 'the early end is recorded against the wrong person', file: SERVICE, suites: ['service', 'e2e'],
    testMappings: [T.svcWrites],
    edits: [['const period = await this.repository.endUnavailable(id, periodId, staff.uid);', 'const period = await this.repository.endUnavailable(id, periodId, periodId);']] },
  { id: 'BE-125-68', name: 'the unavailability history route drops the verified caller', file: CONTROLLER, suites: ['controller', 'e2e'],
    testMappings: [T.routes],
    edits: [['return this.venues.unavailabilityHistory(request[CURRENT_USER_REQUEST_KEY], id);', 'return this.venues.unavailabilityHistory(undefined, id);']] },
  { id: 'BE-125-69', name: 'the booking history route drops the verified caller', file: CONTROLLER, suites: ['controller', 'e2e'],
    testMappings: [T.routes],
    edits: [['return this.venues.bookingHistory(request[CURRENT_USER_REQUEST_KEY], id);', 'return this.venues.bookingHistory(undefined, id);']] },
  { id: 'BE-125-70', name: 'the unavailability history is served on another path', file: CONTROLLER, suites: ['controller', 'e2e'],
    testMappings: [T.routes],
    edits: [["@Get(':id/unavailability-history')", "@Get(':id/unavailability-log')"]] },
  { id: 'BE-125-71', name: 'the booking history is served on another path', file: CONTROLLER, suites: ['controller', 'e2e'],
    testMappings: [T.routes],
    edits: [["@Get(':id/booking-history')", "@Get(':id/booking-log')"]] },
  { id: 'BE-125-72', name: 'a history entry can be deleted through the API (AC1)', file: CONTROLLER, suites: ['e2e'],
    edits: [
      ["import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';", "import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';"],
      ["  @Post(':id/unavailable-periods')\n  markUnavailable(", "  @Delete(':id/unavailability-history/:entryId')\n  removeHistoryEntry() {\n    return { removed: true };\n  }\n\n  @Post(':id/unavailable-periods')\n  markUnavailable("],
    ] },
  { id: 'BE-125-73', name: 'a history entry can be edited through the API (AC1)', file: CONTROLLER, suites: ['e2e'],
    edits: [["  @Post(':id/unavailable-periods')\n  markUnavailable(", "  @Patch(':id/unavailability-history/:entryId')\n  editHistoryEntry() {\n    return { edited: true };\n  }\n\n  @Post(':id/unavailable-periods')\n  markUnavailable("]] },
  { id: 'BE-125-74', name: 'an early end is accepted for a period that is no longer active (AC1)', file: REPO, suites: ['e2e'],
    edits: [["WHERE id = $2::uuid AND venue_id = $1::uuid AND status = 'blocked'\n            AND start_at < $3::timestamptz AND end_at > $3::timestamptz\n          FOR UPDATE", "WHERE id = $2::uuid AND venue_id = $1::uuid AND status = 'blocked'\n          FOR UPDATE"]] },
];
