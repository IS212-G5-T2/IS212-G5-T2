// SPM-88 backend mutants: approval and rejection notifications (transaction, recipient scope, type,
// decision timestamp, reason trimming, no reason in the notification, length, read persistence). Each mutant maps to its DECISION-NOTIFY
// test by ID prefix; the runner matches the prefix by name.
const UNIT = 'src/events/review/events.approve.spec.ts';
const E2E = 'test/decision-notifications.e2e-spec.ts';
const SERVICE = 'src/events/events.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `DECISION-NOTIFY-${id}: ` }));

export const SUITES = {
  backendUnit: {
    args: ['run', UNIT],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM88-BE-01',
    name: 'approval notification inserted outside the decision transaction',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: map('backendUnit', UNIT, '06-D'),
    edits: [[
      "      await client.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'approval', $3, $4)`",
      "      await this.database.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'approval', $3, $4)`",
    ]],
  },
  {
    id: 'SPM88-BE-02',
    name: 'rejection notification inserted outside the decision transaction',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: map('backendUnit', UNIT, '06-D'),
    edits: [[
      "      await client.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'rejection', $3, $4)`",
      "      await this.database.query(\n        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)\n         VALUES ($1, $2, 'rejection', $3, $4)`",
    ]],
  },
  {
    id: 'SPM88-BE-03',
    name: 'approval notification written with the rejection type',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '01-A'),
    edits: [["VALUES ($1, $2, 'approval', $3, $4)", "VALUES ($1, $2, 'rejection', $3, $4)"]],
  },
  {
    id: 'SPM88-BE-04',
    name: 'notification feed not scoped to the recipient',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '01-SEC-1'),
    edits: [['WHERE n.recipient_id = $1 AND n.type = ANY($2)', 'WHERE $1::text IS NOT NULL AND n.type = ANY($2)']],
  },
  {
    id: 'SPM88-BE-05',
    name: 'mark-read not scoped to the recipient (another organiser can mark it read)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '01-SEC-2'),
    edits: [["'UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = ANY($3) RETURNING id'", "'UPDATE notifications SET read = true WHERE id = $1 AND $2::text IS NOT NULL AND type = ANY($3) RETURNING id'"]],
  },
  {
    id: 'SPM88-BE-06',
    name: 'decision timestamp diverges from the notification timestamp (clock_timestamp in approve)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '02-B'),
    edits: [["SET status = 'Approved',\n               updated_at = now()", "SET status = 'Approved',\n               updated_at = clock_timestamp()"]],
  },
  {
    id: 'SPM88-BE-07',
    name: 'stored rejection reason is not trimmed',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '03-B'),
    edits: [['    return trimmed;', '    return raw;']],
  },
  {
    id: 'SPM88-BE-10',
    name: 'rejection reason added back into the notification message (AC3 amended: reason only on the event)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '03-B'),
    edits: [['was rejected`,', 'was rejected: ${reason}`,']],
  },
  {
    id: 'SPM88-BE-08',
    name: 'rejection reason minimum length off by one (9 characters accepted)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '06-A'),
    edits: [['trimmed.length < 10 ||', 'trimmed.length < 9 ||']],
  },
  {
    id: 'SPM88-BE-09',
    name: 'mark-read on an already read notification reports not found',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: map('backendE2E', E2E, '05-STATE-2'),
    edits: [['AND type = ANY($3) RETURNING id', 'AND type = ANY($3) AND read = false RETURNING id']],
  },
];
