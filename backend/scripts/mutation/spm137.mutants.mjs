// SPM-137 backend mutants: the venue booking decision notification written when Venue Staff approve or reject a booking
// (message wording, recipient, type, event and booking links, decision time, one notice per decision, tentative holds
// excluded, written in the decision transaction, refused or conflicting decisions write nothing, the Coordinator's feed
// allow-list). Each mutant maps to its BOOKING-NOTIFY tests by ID prefix; the runner matches the prefix by name.
const REPO_SPEC = 'src/venues/repository/venues.repository.spec.ts';
const SERVICE_SPEC = 'src/venues/venues.service.spec.ts';
const FEED_SPEC = 'src/events/venue-booking-notifications.spec.ts';
const E2E = 'test/venue-booking-decision-notifications.e2e-spec.ts';
const REPO = 'src/venues/repository/venues.repository.ts';
const NOTICE = 'src/venues/review/booking-decision-notice.ts';
const MESSAGES = 'src/registrations/helpers/messages.ts';
const EVENTS = 'src/events/events.service.ts';
const VENUES_SERVICE = 'src/venues/venues.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `BOOKING-NOTIFY-${id} ` }));
const repo = (...ids) => map('backendUnit', REPO_SPEC, ...ids);
const service = (...ids) => map('backendUnit', SERVICE_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);

export const SUITES = {
  backendUnit: {
    args: ['run', REPO_SPEC, SERVICE_SPEC, FEED_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

const APPROVE_NOTIFY = "      await notifyBookingDecision(client, bookingId, 'approved', this.clock.now(), booking.request_kind ?? 'booking');\n";
const REJECT_NOTIFY = "      await notifyBookingDecision(client, bookingId, 'rejected', this.clock.now(), locked.booking.request_kind ?? 'booking');\n";
const INSERT_HEAD = '  await client.query(\n    `INSERT INTO notifications';

export const MUTANTS = [
  {
    id: 'SPM137-BE-01',
    name: 'message wording changed ("was approved" instead of "has been approved")',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-A', '02-B'), ...e2e('02-D', '02-E')],
    edits: [['Your booking of ${venueName} for "${eventName}" has been ${decision}.`;', 'Your booking of ${venueName} for "${eventName}" was ${decision}.`;']],
  },
  {
    id: 'SPM137-BE-02',
    name: 'venue name and event name swapped in the message',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-A', '02-BND-1'), ...e2e('02-D')],
    edits: [['Your booking of ${venueName} for "${eventName}"', 'Your booking of ${eventName} for "${venueName}"']],
  },
  {
    id: 'SPM137-BE-03',
    name: 'notification addressed to the event Organiser instead of the Coordinator',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('01-C', '01-D', '01-SEC-1'),
    edits: [['SELECT e.coordinator_id, e.id AS event_id', 'SELECT e.organiser_id AS coordinator_id, e.id AS event_id']],
  },
  {
    id: 'SPM137-BE-04',
    name: 'approved and rejected notification types swapped',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '01-B'), ...e2e('01-C', '01-D')],
    edits: [['booking: { approved: BOOKING_APPROVED_NOTICE, rejected: BOOKING_REJECTED_NOTICE }', 'booking: { approved: BOOKING_REJECTED_NOTICE, rejected: BOOKING_APPROVED_NOTICE }']],
  },
  {
    id: 'SPM137-BE-05',
    name: 'notification written without the booking link',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '05-A'), ...e2e('03-E', '05-B')],
    edits: [['      bookingId,\n      decidedAt,', '      null,\n      decidedAt,']],
  },
  {
    id: 'SPM137-BE-06',
    name: 'notification written without the event link',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '01-B'), ...e2e('05-B')],
    edits: [['      row.event_id,\n      bookingId,', '      null,\n      bookingId,']],
  },
  {
    id: 'SPM137-BE-07',
    name: 'notification stamped with the real time instead of the decision time',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-C'), ...e2e('02-D', '02-E')],
    edits: [['      decidedAt,\n    ],', '      new Date(),\n    ],']],
  },
  {
    id: 'SPM137-BE-08',
    name: 'notification written twice for one decision',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '01-B'), ...e2e('01-C', '01-D', '05-B')],
    edits: [[INSERT_HEAD, '  for (const _copy of [1, 2]) await client.query(\n    `INSERT INTO notifications']],
  },
  {
    id: 'SPM137-BE-09',
    name: 'an event with no Coordinator is still given a notification (null recipient)',
    file: NOTICE,
    suites: ['backendUnit'],
    testMappings: repo('06-D'),
    edits: [['if (!row?.coordinator_id) return;', 'if (!row) return;']],
  },
  {
    id: 'SPM137-BE-10',
    name: 'an approval of a tentative hold request is reported as a booking decision (the SPM-165 hold notice is replaced)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-E'), ...e2e('01-H')],
    edits: [["this.clock.now(), booking.request_kind ?? 'booking');", "this.clock.now(), 'booking');"]],
  },
  {
    id: 'SPM137-BE-11',
    name: 'a rejection of a tentative hold request is reported as a booking decision (the SPM-165 hold notice is replaced)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-E'), ...e2e('01-H')],
    edits: [["this.clock.now(), locked.booking.request_kind ?? 'booking');", "this.clock.now(), 'booking');"]],
  },
  {
    id: 'SPM137-BE-12',
    name: 'an approval writes no notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A'), ...e2e('01-C', '05-B')],
    edits: [[APPROVE_NOTIFY, '']],
  },
  {
    id: 'SPM137-BE-13',
    name: 'a rejection writes no notification',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-B'), ...e2e('01-D', '05-B')],
    edits: [[REJECT_NOTIFY, '']],
  },
  {
    id: 'SPM137-BE-14',
    name: 'the approval notification is written outside the decision transaction (on the pool)',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: repo('06-A', '07-C'),
    edits: [["await notifyBookingDecision(client, bookingId, 'approved'", "await notifyBookingDecision(this.database as unknown as typeof client, bookingId, 'approved'"]],
  },
  {
    id: 'SPM137-BE-15',
    name: 'the rejection notification is written outside the decision transaction (on the pool)',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: repo('06-A', '07-C'),
    edits: [["await notifyBookingDecision(client, bookingId, 'rejected'", "await notifyBookingDecision(this.database as unknown as typeof client, bookingId, 'rejected'"]],
  },
  {
    id: 'SPM137-BE-16',
    name: 'a failing approval notification is swallowed, so the approval is saved without it',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('07-C', '07-D'), ...e2e('07-H')],
    edits: [["await notifyBookingDecision(client, bookingId, 'approved', this.clock.now(), booking.request_kind ?? 'booking');", "await notifyBookingDecision(client, bookingId, 'approved', this.clock.now(), booking.request_kind ?? 'booking').catch(() => undefined);"]],
  },
  {
    id: 'SPM137-BE-17',
    name: 'a failing rejection notification is swallowed, so the rejection is saved without it',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('07-C'), ...e2e('07-H')],
    edits: [["await notifyBookingDecision(client, bookingId, 'rejected', this.clock.now(), locked.booking.request_kind ?? 'booking');", "await notifyBookingDecision(client, bookingId, 'rejected', this.clock.now(), locked.booking.request_kind ?? 'booking').catch(() => undefined);"]],
  },
  {
    id: 'SPM137-BE-18',
    name: 'an already-decided booking can be rejected again (a second notification)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('07-A'), ...e2e('07-F', '07-G')],
    edits: [["      if (locked.booking.status !== 'pending')\n        return {\n          kind: 'already-decided' as const,\n          status: locked.booking.status,\n        };\n", '']],
  },
  {
    id: 'SPM137-BE-19',
    name: 'the approval slot-conflict check is skipped (a conflicting approval is saved and notified)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('07-B'), ...e2e('07-F')],
    edits: [['      if (conflict.rows.length)\n        return {', '      if (false)\n        return {']],
  },
  {
    id: 'SPM137-BE-20',
    name: 'the venue row lock is dropped, so racing decisions are not serialised',
    file: REPO,
    suites: ['backendE2E'],
    testMappings: e2e('07-G'),
    edits: [['        WHERE id = $1::uuid FOR UPDATE`,\n      [venueId],', '        WHERE id = $1::uuid`,\n      [venueId],']],
  },
  {
    id: 'SPM137-BE-21',
    name: 'a blank rejection reason is accepted',
    file: VENUES_SERVICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...service('07-E'), ...e2e('07-F')],
    edits: [["  if (!trimmed)\n    throw new BadRequestException({\n      message: 'A rejection reason is required.',", "  if (false)\n    throw new BadRequestException({\n      message: 'A rejection reason is required.',"]],
  },
  {
    id: 'SPM137-BE-22',
    name: "the booking decision types are left out of the Coordinator's feed allow-list",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('01-F', '04-F'), ...e2e('01-C', '04-D')],
    edits: [['            // SPM-137: Venue Staff approved or rejected a booking for an event assigned to them.\n            BOOKING_APPROVED_NOTICE,\n            BOOKING_REJECTED_NOTICE,\n', '']],
  },
  {
    id: 'SPM137-BE-23',
    name: "the booking decision types are added to the Organiser's feed allow-list",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('01-F', '04-F'), ...e2e('01-SEC-1')],
    edits: [["            CANCELLATION_DECLINED_NOTICE,\n          ]\n        : []),\n      ...(user.roles.includes('COORDINATOR')", "            CANCELLATION_DECLINED_NOTICE,\n            BOOKING_APPROVED_NOTICE,\n            BOOKING_REJECTED_NOTICE,\n          ]\n        : []),\n      ...(user.roles.includes('COORDINATOR')"]],
  },
  {
    id: 'SPM137-BE-24',
    name: 'the feed drops the booking id of a notification',
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('03-N'), ...e2e('03-E')],
    edits: [['      relatedBookingId: row.related_booking_id ?? null,\n', '']],
  },
  {
    id: 'SPM137-BE-25',
    name: 'a booking decision notification is labelled for the Organiser, not the Coordinator',
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('03-N'),
    edits: [["  if (row.type === BOOKING_APPROVED_NOTICE || row.type === BOOKING_REJECTED_NOTICE) return 'coordinator';\n", '']],
  },
  {
    id: 'SPM137-BE-26',
    name: "any Coordinator can mark another Coordinator's booking notification read",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('04-F'), ...e2e('04-E')],
    edits: [['AND recipient_id = $2 AND type = ANY($3)', 'AND $2::text IS NOT NULL AND type = ANY($3)']],
  },
  {
    id: 'SPM137-BE-27',
    name: 'the notification goes to the first Coordinator the event had, not the one assigned at decision time',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('06-B'),
    edits: [[
      'SELECT e.coordinator_id, e.id AS event_id',
      'SELECT COALESCE((SELECT r.from_coordinator_id FROM event_reassignments r WHERE r.event_id = e.id ORDER BY r.reassigned_at LIMIT 1), e.coordinator_id) AS coordinator_id, e.id AS event_id',
    ]],
  },
  {
    id: 'SPM137-BE-28',
    name: 'every notice type that is not a coordinator_ type is labelled a Coordinator notice',
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('03-N'),
    edits: [["if (row.type === BOOKING_APPROVED_NOTICE || row.type === BOOKING_REJECTED_NOTICE) return 'coordinator';", "if (true) return 'coordinator';"]],
  },
  {
    id: 'SPM137-BE-29',
    name: 'the booking decision notice is inserted already read',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('04-D'),
    edits: [[
      'related_booking_id, created_at)\n     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`',
      'related_booking_id, created_at, read)\n     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, true)`',
    ]],
  },
  {
    id: 'SPM137-BE-30',
    name: 'marking a notice read does not persist (the read flag is written false)',
    file: EVENTS,
    suites: ['backendE2E'],
    testMappings: e2e('04-D'),
    edits: [['UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = ANY($3)', 'UPDATE notifications SET read = false WHERE id = $1 AND recipient_id = $2 AND type = ANY($3)']],
  },
  {
    id: 'SPM137-BE-31',
    name: 'reassignment no longer marks the previous Coordinator\'s booking decision notices read',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('06-C'),
    edits: [[
      'export const VENUE_DECISION_NOTICE_TYPES = [\n  BOOKING_APPROVED_NOTICE,\n  BOOKING_REJECTED_NOTICE,\n',
      'export const VENUE_DECISION_NOTICE_TYPES = [\n',
    ]],
  },
];
