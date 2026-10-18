// SPM-54 request suitability, request details, coordinator listing, and cancellation rules.
// Run without PostgreSQL: node scripts/mutation/run.mjs --mutants spm54.mutants.mjs
export const SUITES = {
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/venues-booking-requests.e2e-spec.ts', 'test/venue-booking-request-migration.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
  unit: {
    args: [
      'run',
      'src/venues/venues.service.spec.ts',
      'src/venues/availability/booking-request.spec.ts',
      'src/venues/availability/dto/booking-request.spec.ts',
      'src/venues/repository/venues.repository.spec.ts',
    ],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const SERVICE = 'src/venues/venues.service.ts';
const REQUEST_MIGRATION = 'migrations/012_spm54_event_venue_request_key.sql';
const EVENT_STATUS_SERVICE = 'src/events/status/status.service.ts';

export const MUTANTS = [
  {
    id: 'B54-01',
    name: 'capacity mismatch is accepted',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: refuses an unsuitable venue before schedule or insert queries'],
    edits: [['venueRow.capacity < eventRow.expected_attendance', 'venueRow.capacity > eventRow.expected_attendance']],
  },
  {
    id: 'B54-11',
    name: 'capacity equality is incorrectly rejected',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: allows a venue whose capacity exactly matches event attendance'],
    edits: [['venueRow.capacity < eventRow.expected_attendance', 'venueRow.capacity <= eventRow.expected_attendance']],
  },
  {
    id: 'B54-02',
    name: 'required facilities are not assessed',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: refuses an unsuitable venue before schedule or insert queries'],
    edits: [["eventRow.required_facilities.filter((item) => !availableFacilities.has(item.trim().toLocaleLowerCase()))", '[]']],
  },
  {
    id: 'B54-03',
    name: 'accessibility requirements are not assessed',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: refuses an unsuitable venue before schedule or insert queries'],
    edits: [["eventRow.accessibility_needs.filter((item) => !availableAccessibility.has(item.trim().toLocaleLowerCase()))", '[]']],
  },
  {
    id: 'B54-04',
    name: 'layout mismatch is accepted',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: refuses an unsuitable venue before schedule or insert queries'],
    edits: [["eventRow.preferred_room_layout && !availableLayouts.has(eventRow.preferred_room_layout.trim().toLocaleLowerCase())", 'false']],
  },
  {
    id: 'B54-05',
    name: 'optional special requests are dropped before persistence',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: records a pending booking request after a clear fresh schedule check'],
    edits: [['input.specialRequests ?? null', 'null']],
  },
  {
    id: 'B54-06',
    name: 'booking history is not scoped to the verified coordinator',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: maps every coordinator venue booking with its event, venue, status, and unavailable indicator'],
    edits: [['WHERE e.coordinator_id = $1::text AND b.status <> \'blocked\'', "WHERE true AND b.status <> 'blocked'"]],
  },
  {
    id: 'B54-07',
    name: 'pending venue requests disappear from the coordinator booking history',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: maps every coordinator venue booking with its event, venue, status, and unavailable indicator'],
    edits: [["b.status <> 'blocked'", "b.status = 'approved'"]],
  },
  {
    id: 'B54-08',
    name: 'affected venue bookings are not identified',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: maps every coordinator venue booking with its event, venue, status, and unavailable indicator'],
    edits: [['v.setup_time_minutes)) AS affected', 'v.setup_time_minutes)) AS unavailable_period_exists']],
  },
  {
    id: 'B54-09',
    name: 'the final active booking is cancelled without explicit confirmation',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: requires confirmation before cancelling the last active event booking'],
    edits: [["if (Number(active.rows[0]?.count) === 1 && !confirmLastActive)", 'if (false)']],
  },
  {
    id: 'B54-10',
    name: 'cancellation no longer targets one owned booking',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: requires confirmation before cancelling the last active event booking'],
    edits: [['b.id = $1::uuid AND e.coordinator_id = $2::text', 'b.id = $1::uuid AND true']],
  },
  {
    id: 'B54-12',
    name: 'rejected and cancelled requests count as active for last-booking warning',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: does not count rejected or cancelled rows as active and updates only the selected booking'],
    edits: [["WHERE event_id = $1::uuid AND status IN ('pending','approved')", "WHERE event_id = $1::uuid AND status IN ('pending','approved','rejected','cancelled')"]],
  },
  {
    id: 'B54-13',
    name: 'booking cancellation is not scoped to the selected row',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: does not count rejected or cancelled rows as active and updates only the selected booking'],
    edits: [["FROM events e WHERE b.id = $1::uuid AND b.event_id = e.id", "FROM events e WHERE true AND b.event_id = e.id"]],
  },
  {
    id: 'B54-14',
    name: 'booking conflict ignores venue setup/turnaround occupancy',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: does not record a request when a fresh booking conflict appears after the availability read'],
    edits: [['b.start_at - make_interval(mins => $4::int)', 'b.start_at']],
  },
  {
    id: 'B54-15',
    name: 'blockout touching the exact setup boundary is treated as overlapping',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: does not record a request when a fresh booking conflict appears after the availability read'],
    edits: [['end_at > $2::timestamptz - make_interval(mins => $4::int)', 'end_at >= $2::timestamptz - make_interval(mins => $4::int)']],
  },
  {
    id: 'B54-16',
    name: 'an expired request hold remains an availability conflict at its expiry boundary',
    file: REPOSITORY,
    suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: does not record a request when a fresh booking conflict appears after the availability read'],
    edits: [['hold_expires_at > $6::timestamptz', 'hold_expires_at >= $6::timestamptz']],
  },
  {
    id: 'B54-20', name: 'duplicate requests lose their stable booking reference conflict response', file: SERVICE, suites: ['unit'],
    kills: ['src/venues/venues.service.spec.ts :: returns a conflict with the existing booking reference for a duplicate request'],
    edits: [["if (result.kind === 'duplicate-request')", "if (false)"]],
  },
  {
    id: 'B54-17', name: 'duplicate guard omits event identity', file: REPOSITORY, suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: returns the existing booking for a prior event and venue request'],
    edits: [['r.event_id = $1::uuid AND r.venue_id = $2::uuid', 'r.venue_id = $2::uuid']],
  },
  {
    id: 'B54-18', name: 'duplicate guard filters terminal booking history', file: REPOSITORY, suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: returns the existing booking for a prior event and venue request'],
    edits: [["WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid", "WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid AND b.status = 'pending'"]],
  },
  {
    id: 'B54-19', name: 'duplicate guard filters requests by event time', file: REPOSITORY, suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: returns the existing booking for a prior event and venue request'],
    edits: [["LIMIT 1`,\n        [input.eventId, venueId],", "AND b.start_at > now()\n          LIMIT 1`,\n        [input.eventId, venueId],"]],
  },
  {
    id: 'B54-21', name: 'duplicate guard ignores event identity in PostgreSQL', file: REPOSITORY, suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: returns the existing booking reference for a repeated same-venue request but allows another venue'],
    edits: [['r.event_id = $1::uuid AND r.venue_id = $2::uuid', 'r.venue_id = $2::uuid']],
  },
  {
    id: 'B54-22', name: 'duplicate guard ignores terminal booking history in PostgreSQL', file: REPOSITORY, suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: cancelled booking history permanently prevents another request at the same venue'],
    edits: [["WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid", "WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid AND b.status = 'pending'"]],
  },
  {
    id: 'B54-23', name: 'duplicate guard result is ignored in PostgreSQL', file: REPOSITORY, suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: returns the existing booking reference for a repeated same-venue request but allows another venue'],
    edits: [["if (duplicate.rows[0]) return { kind: 'duplicate-request', id: duplicate.rows[0].id };", "if (false && duplicate.rows[0]) return { kind: 'duplicate-request', id: duplicate.rows[0].id };"]],
  },
  {
    id: 'B54-24', name: 'ineligible confirmed event accepted by booking request endpoint', file: REPOSITORY, suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: rejects a confirmed event with HTTP 409 and does not insert a venue booking'],
    edits: [["if (!['approved', 'planning'].includes(event.rows[0].status.trim().toLocaleLowerCase()))", 'if (false)']],
  },
  {
    id: 'B54-25', name: 'booking request event lookup ignores coordinator assignment', file: REPOSITORY, suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: rejects an unassigned coordinator without persisting a request'],
    edits: [['AND coordinator_id = $2::text FOR SHARE', 'AND (coordinator_id = $2::text OR true) FOR SHARE']],
  },
  {
    id: 'B54-26', name: 'booking start time comes from a different event field', file: REPOSITORY, suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: records a pending booking request after a clear fresh schedule check'],
    edits: [['const start = eventRow.start_date_time;', 'const start = eventRow.end_date_time;']],
  },
  {
    id: 'B54-27', name: 'booking end time comes from a different event field', file: REPOSITORY, suites: ['unit'],
    kills: ['src/venues/repository/venues.repository.spec.ts :: records a pending booking request after a clear fresh schedule check'],
    edits: [['const end = eventRow.end_date_time;', 'const end = eventRow.start_date_time;']],
  },
  {
    id: 'B54-28', name: 'client-supplied event times are accepted', file: 'src/venues/availability/dto/booking-request.ts', suites: ['unit'],
    kills: ['src/venues/availability/dto/booking-request.spec.ts :: rejects client-supplied booking times'],
    edits: [["if ('start' in input || 'end' in input || 'startDateTime' in input || 'endDateTime' in input)", 'if (false)']],
  },
  {
    id: 'B54-29',
    name: 'duplicate request guard filters by the event current start time',
    file: REPOSITORY,
    suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: rejects a repeat event/venue request after the event period changes'],
    edits: [[
      'WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid\n          ORDER BY b.created_at DESC, b.id DESC',
      'WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid\n            AND b.start_at = (SELECT start_date_time FROM events WHERE id = $1::uuid)\n          ORDER BY b.created_at DESC, b.id DESC',
    ]],
  },
  {
    id: 'B54-30',
    name: 'legacy request notes are combined in reverse creation order',
    file: REQUEST_MIGRATION,
    suites: ['e2e'],
    kills: ['test/venue-booking-request-migration.e2e-spec.ts :: preserves legacy booking history and combines notes in creation order'],
    edits: [[
      "string_agg(special_requests, E'\\n\\n' ORDER BY created_at, id)",
      "string_agg(special_requests, E'\\n\\n' ORDER BY created_at DESC, id DESC)",
    ]],
  },
  {
    id: 'B54-31',
    name: 'removing a Planning venue request deletes its permanent booking history',
    file: EVENT_STATUS_SERVICE,
    suites: ['e2e'],
    kills: ['test/venues-booking-requests.e2e-spec.ts :: preserves the cancelled request key when a Planning venue request is removed'],
    edits: [[
      "UPDATE venue_bookings SET status = 'cancelled' WHERE id = $1 AND event_id = $2",
      'DELETE FROM venue_bookings WHERE id = $1 AND event_id = $2',
    ]],
  },
];
