// SPM-165 backend mutants: the tentative hold decision notification written when Venue Staff approve or reject a hold
// request (hold wording and types, never the booking decision ones, recipient, links, decision time, one notice per
// decision, reassignment clearing, the Coordinator's feed allow-list). Each mutant maps to its VENUE-HOLD-NOTIF tests
// by ID prefix; the runner matches the prefix by name. The SPM-137 mutants (spm137.mutants.mjs) cover the shared flow.
const REPO_SPEC = 'src/venues/repository/venues.repository.spec.ts';
const FEED_SPEC = 'src/events/tentative-hold-notifications.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const E2E = 'test/tentative-hold-decision-notifications.e2e-spec.ts';
const REPO = 'src/venues/repository/venues.repository.ts';
const NOTICE = 'src/venues/review/booking-decision-notice.ts';
const MESSAGES = 'src/registrations/helpers/messages.ts';
const EVENTS = 'src/events/events.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `VENUE-HOLD-NOTIF-${id} ` }));
const repo = (...ids) => map('backendUnit', REPO_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const lead = (...ids) => map('backendUnit', LEAD_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);

export const SUITES = {
  backendUnit: {
    args: ['run', REPO_SPEC, FEED_SPEC, LEAD_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM165-BE-01',
    name: 'hold message wording changed ("was approved" instead of "has been approved")',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-A', '02-B'), ...e2e('02-D', '02-E')],
    edits: [['for "${eventName}" has been ${decision}.`;\n}\n\n/** Formats', 'for "${eventName}" was ${decision}.`;\n}\n\n/** Formats']],
  },
  {
    id: 'SPM165-BE-02',
    name: 'hold message says "booking" instead of "tentative hold"',
    file: MESSAGES,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-A', '02-BND-1'), ...e2e('02-D', '01-H')],
    edits: [['Your tentative hold of ${venueName}', 'Your booking of ${venueName}']],
  },
  {
    id: 'SPM165-BE-03',
    name: 'a hold decision is reported with the booking decision type',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '01-B'), ...e2e('01-C', '01-D', '01-H')],
    edits: [['NOTICE_TYPE[requestKind][decision]', 'NOTICE_TYPE.booking[decision]'], ['NOTICE_MESSAGE[requestKind](row.venue_name', 'NOTICE_MESSAGE.booking(row.venue_name']],
  },
  {
    id: 'SPM165-BE-04',
    name: 'a booking decision is reported with the hold type',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-E'), ...e2e('01-H')],
    edits: [['NOTICE_TYPE[requestKind][decision]', 'NOTICE_TYPE.tentative_hold[decision]'], ['NOTICE_MESSAGE[requestKind](row.venue_name', 'NOTICE_MESSAGE.tentative_hold(row.venue_name']],
  },
  {
    id: 'SPM165-BE-05',
    name: 'approved and rejected hold types swapped',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '01-B'), ...e2e('01-C', '01-D')],
    edits: [['tentative_hold: { approved: HOLD_APPROVED_NOTICE, rejected: HOLD_REJECTED_NOTICE }', 'tentative_hold: { approved: HOLD_REJECTED_NOTICE, rejected: HOLD_APPROVED_NOTICE }']],
  },
  {
    id: 'SPM165-BE-06',
    name: 'the repository stops passing the request kind on approval (a hold is reported as a booking)',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A'), ...e2e('01-C', '01-H')],
    edits: [["this.clock.now(), booking.request_kind ?? 'booking');", 'this.clock.now());']],
  },
  {
    id: 'SPM165-BE-07',
    name: 'the repository stops passing the request kind on rejection',
    file: REPO,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-B'), ...e2e('01-D', '01-H')],
    edits: [["this.clock.now(), locked.booking.request_kind ?? 'booking');", 'this.clock.now());']],
  },
  {
    id: 'SPM165-BE-08',
    name: 'hold notification stamped with the real time instead of the decision time',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('02-C'), ...e2e('02-D')],
    edits: [['      decidedAt,\n    ],', '      new Date(),\n    ],']],
  },
  {
    id: 'SPM165-BE-09',
    name: 'hold notification written without the hold link',
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...repo('01-A', '05-A'), ...e2e('03-H', '05-B')],
    edits: [['      bookingId,\n      decidedAt,', '      null,\n      decidedAt,']],
  },
  {
    id: 'SPM165-BE-10',
    name: "the hold decision types are left out of the Coordinator's feed allow-list",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('01-F', '04-B'), ...e2e('01-C', '04-A')],
    edits: [['            HOLD_APPROVED_NOTICE,\n            HOLD_REJECTED_NOTICE,\n', '']],
  },
  {
    id: 'SPM165-BE-11',
    name: "a hold decision notice is labelled for the Organiser, not the Coordinator",
    file: EVENTS,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...feed('03-G'), ...e2e('03-H')],
    edits: [["  if (row.type === HOLD_APPROVED_NOTICE || row.type === HOLD_REJECTED_NOTICE) return 'coordinator';\n", '']],
  },
  {
    id: 'SPM165-BE-12',
    name: "the previous Coordinator's unread hold notices are not cleared on reassignment",
    file: NOTICE,
    suites: ['backendUnit', 'backendE2E'],
    testMappings: [...lead('06-E'), ...e2e('06-C')],
    edits: [['  HOLD_APPROVED_NOTICE,\n  HOLD_REJECTED_NOTICE,\n] as const;', '] as const;']],
  },
  {
    id: 'SPM165-BE-13',
    name: 'an event with no Coordinator is still given a hold notification (null recipient)',
    file: NOTICE,
    suites: ['backendUnit'],
    testMappings: repo('06-D'),
    edits: [['if (!row?.coordinator_id) return;', 'if (!row) return;']],
  },
];
