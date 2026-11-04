// SPM-134 backend mutants: the Coordinator's tentative hold expiry reminder (48-hour window and its two boundaries, the
// reminder guards, exactly-once marker), the expired notice (written in the expiry transaction, stamped with the hold's
// expiry), the released and converted notices, the cancelled-event guard, the recipient, the AC11 mark-read of the
// reminder, the scheduler and the feed. Each mutant maps to its HOLD-EXP-NOTIF tests by ID prefix; the runner matches
// the prefix by name.
const NOTICE_SPEC = 'src/venues/review/hold-lifecycle-notice.spec.ts';
const REPO_SPEC = 'src/venues/repository/venues.repository.spec.ts';
const SCHED_SPEC = 'src/venues/tentative-hold-expiry.scheduler.spec.ts';
const FEED_SPEC = 'src/events/hold-lifecycle-notifications.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const E2E = 'test/tentative-hold-lifecycle-notifications.e2e-spec.ts';
const REPO = 'src/venues/repository/venues.repository.ts';
const NOTICE = 'src/venues/review/hold-lifecycle-notice.ts';
const MESSAGES = 'src/registrations/helpers/messages.ts';
const EVENTS = 'src/events/events.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const SCHED = 'src/venues/tentative-hold-expiry.scheduler.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `HOLD-EXP-NOTIF-${id} ` }));
const notice = (...ids) => map('backendUnit', NOTICE_SPEC, ...ids);
const repo = (...ids) => map('backendUnit', REPO_SPEC, ...ids);
const sched = (...ids) => map('backendUnit', SCHED_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const lead = (...ids) => map('backendUnit', LEAD_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);
const BOTH = ['backendUnit', 'backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', NOTICE_SPEC, REPO_SPEC, SCHED_SPEC, FEED_SPEC, LEAD_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

const REMINDER_WHERE_STATUS = "AND b.request_kind = 'tentative_hold' AND b.status = 'approved'\n";

export const MUTANTS = [
  {
    id: 'SPM134-BE-01',
    name: 'the reminder window is 24 hours instead of 48',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('01-BND-1')],
    edits: [["interval '48 hours'", "interval '24 hours'"]],
  },
  {
    id: 'SPM134-BE-02',
    name: 'the reminder window is 72 hours instead of 48',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('01-BND-1')],
    edits: [["interval '48 hours'", "interval '72 hours'"]],
  },
  {
    id: 'SPM134-BE-03',
    name: 'the far edge of the window excludes exactly 48 hours (<= becomes <)',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('01-BND-1')],
    edits: [['b.hold_expires_at <= $1::timestamptz + interval', 'b.hold_expires_at < $1::timestamptz + interval']],
  },
  {
    id: 'SPM134-BE-04',
    name: 'the near edge includes a hold expiring exactly now (> becomes >=)',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('05-C')],
    edits: [['AND b.hold_expires_at > $1::timestamptz', 'AND b.hold_expires_at >= $1::timestamptz']],
  },
  {
    id: 'SPM134-BE-05',
    name: 'the reminder UPDATE no longer requires status approved (a released hold is reminded)',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('05-A')],
    edits: [[REMINDER_WHERE_STATUS.trimEnd(), "AND b.request_kind = 'tentative_hold'"]],
  },
  {
    id: 'SPM134-BE-06',
    name: 'the reminder UPDATE no longer requires request kind tentative_hold [behaviourally unobservable at DB level: a converted hold has hold_expires_at NULL, so `hold_expires_at > now` already excludes it; killed only by the unit SQL assertion 01-C]',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: repo('01-C'),
    edits: [[REMINDER_WHERE_STATUS.trimEnd(), "AND b.status = 'approved'"]],
  },
  {
    id: 'SPM134-BE-07',
    name: 'the reminder UPDATE no longer requires an unprocessed hold [behaviourally unobservable at DB level: hold_expiry_processed_at is only set together with status expired, which `status = approved` already excludes; killed only by the unit SQL assertion 01-C]',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: repo('01-C'),
    edits: [['AND b.hold_expiry_processed_at IS NULL AND b.hold_reminder_sent_at IS NULL', 'AND b.hold_reminder_sent_at IS NULL']],
  },
  {
    id: 'SPM134-BE-08',
    name: 'the reminder UPDATE no longer requires a hold not yet reminded (a hold is reminded on every run)',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('01-G', '01-CONC-1')],
    edits: [['AND b.hold_expiry_processed_at IS NULL AND b.hold_reminder_sent_at IS NULL', 'AND b.hold_expiry_processed_at IS NULL']],
  },
  {
    id: 'SPM134-BE-09',
    name: 'the reminder UPDATE no longer excludes a cancelled event',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('10-B')],
    edits: [["WHERE e.id = b.event_id AND e.status <> 'Cancelled'", 'WHERE e.id = b.event_id']],
  },
  {
    id: 'SPM134-BE-10',
    name: 'the expired notice is not written',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('02-A'), ...e2e('02-D', '02-CONC-1')],
    edits: [["      for (const row of result.rows) await notifyHoldLifecycle(client, row.id, { event: 'expired', expiresAt: row.hold_expires_at }, row.hold_expires_at);\n", '']],
  },
  {
    id: 'SPM134-BE-11',
    name: 'the expired notice is written outside the expiry transaction (on the pool) [behaviourally unobservable at DB level: the forced failure rolls the transaction back either way; killed only by the unit call assertions 02-A and 02-C]',
    file: REPO,
    suites: ['backendUnit'],
    testMappings: repo('02-A', '02-C'),
    edits: [["await notifyHoldLifecycle(client, row.id, { event: 'expired'", "await notifyHoldLifecycle(this.database as never, row.id, { event: 'expired'"]],
  },
  {
    id: 'SPM134-BE-12',
    name: 'the expired notice is stamped with the processing time instead of the hold expiry',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('02-A'), ...e2e('02-D', '04-C')],
    edits: [["{ event: 'expired', expiresAt: row.hold_expires_at }, row.hold_expires_at)", "{ event: 'expired', expiresAt: row.hold_expires_at }, now)"]],
  },
  {
    id: 'SPM134-BE-13',
    name: 'the reminder is stamped with the hold expiry instead of the time it was sent',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('01-C'), ...e2e('01-BND-1', '04-C')],
    edits: [["{ event: 'reminder', expiresAt: row.hold_expires_at }, now)", "{ event: 'reminder', expiresAt: row.hold_expires_at }, row.hold_expires_at)"]],
  },
  {
    id: 'SPM134-BE-14',
    name: 'released and converted notices are swapped',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('03-A', '03-B'), ...e2e('03-E', '03-F')],
    edits: [["{ event: 'converted' }, now);", "{ event: 'RELEASED_TMP' }, now);"], ["{ event: 'released' }, now);", "{ event: 'converted' }, now);"], ["{ event: 'RELEASED_TMP' }, now);", "{ event: 'released' }, now);"]],
  },
  {
    id: 'SPM134-BE-15',
    name: 'the AC11 mark-read is missing on conversion',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('11-A'), ...e2e('11-E')],
    edits: [["        await markHoldRemindersRead(client, bookingId);\n        await notifyHoldLifecycle(client, bookingId, { event: 'converted' }, now);", "        await notifyHoldLifecycle(client, bookingId, { event: 'converted' }, now);"]],
  },
  {
    id: 'SPM134-BE-16',
    name: 'the AC11 mark-read is missing on release',
    file: REPO,
    suites: BOTH,
    testMappings: [...repo('11-B'), ...e2e('11-F')],
    edits: [["      await markHoldRemindersRead(client, bookingId);\n      await notifyHoldLifecycle(client, bookingId, { event: 'released' }, now);", "      await notifyHoldLifecycle(client, bookingId, { event: 'released' }, now);"]],
  },
  {
    id: 'SPM134-BE-17',
    name: 'the AC11 mark-read ignores the notice type (other notices of the hold are marked read)',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...repo('11-A', '11-B'), ...e2e('11-G')],
    edits: [['AND type = $2 AND read = false', 'AND $2::text IS NOT NULL AND read = false']],
  },
  {
    id: 'SPM134-BE-18',
    name: 'the AC11 mark-read ignores the hold (every reminder is marked read)',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...repo('11-A', '11-B'), ...e2e('11-G')],
    edits: [['WHERE related_booking_id = $1::uuid AND type', 'WHERE $1::uuid IS NOT NULL AND type']],
  },
  {
    id: 'SPM134-BE-19',
    name: 'the AC11 mark-read drops the unread condition [behaviourally unobservable at DB level: setting an already read row to read changes nothing; killed only by the unit SQL assertions 11-A and 11-B]',
    file: NOTICE,
    suites: ['backendUnit'],
    testMappings: [...repo('11-A', '11-B')],
    edits: [['AND type = $2 AND read = false', 'AND type = $2']],
  },
  {
    id: 'SPM134-BE-20',
    name: 'the AC11 mark-read deletes the reminder instead of marking it read',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...repo('11-A', '11-B'), ...e2e('11-E', '11-F')],
    edits: [["`UPDATE notifications SET read = true\n      WHERE related_booking_id", "`DELETE FROM notifications\n      WHERE related_booking_id"]],
  },
  {
    id: 'SPM134-BE-21',
    name: 'a cancelled event still gets a hold notice',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('10-A'), ...e2e('10-B')],
    edits: [[" || row.event_status === 'Cancelled'", '']],
  },
  {
    id: 'SPM134-BE-22',
    name: 'an event with no Coordinator is still given a hold notice (null recipient)',
    file: NOTICE,
    suites: ['backendUnit'],
    testMappings: notice('01-B'),
    edits: [['if (!row?.coordinator_id ||', 'if (!row ||']],
  },
  {
    id: 'SPM134-BE-23',
    name: 'the recipient is the event organiser instead of the assigned Coordinator',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('01-G', '09-B'),
    edits: [['SELECT e.coordinator_id, e.id AS event_id', 'SELECT e.organiser_id AS coordinator_id, e.id AS event_id']],
  },
  {
    id: 'SPM134-BE-24',
    name: 'the reminder and expired types are swapped',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-A'), ...e2e('01-G', '02-D')],
    edits: [['  reminder: HOLD_EXPIRY_REMINDER_NOTICE,\n  expired: HOLD_EXPIRED_NOTICE,', '  reminder: HOLD_EXPIRED_NOTICE,\n  expired: HOLD_EXPIRY_REMINDER_NOTICE,']],
  },
  {
    id: 'SPM134-BE-25',
    name: 'the notice ignores the timestamp passed in (stamped with the real time)',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-A'), ...e2e('04-C')],
    edits: [['row.event_id, holdId, at]', 'row.event_id, holdId, new Date()]']],
  },
  {
    id: 'SPM134-BE-26',
    name: 'the notice is written without the hold link',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-A'), ...e2e('06-G')],
    edits: [['row.event_id, holdId, at]', 'row.event_id, null, at]']],
  },
  {
    id: 'SPM134-BE-27',
    name: 'the released wording changed',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('04-A'), ...e2e('04-C')],
    edits: [['has been released.`', 'has been cancelled.`']],
  },
  {
    id: 'SPM134-BE-28',
    name: 'the converted wording changed',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('04-A'), ...e2e('04-C')],
    edits: [['has been confirmed as a booking.`', 'has been approved.`']],
  },
  {
    id: 'SPM134-BE-29',
    name: 'the reminder says "expired on" instead of "expires on"',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('04-A', '04-B'), ...e2e('04-C')],
    edits: [['expires on ${formatSgt(expiresAt)}', 'expired on ${formatSgt(expiresAt)}']],
  },
  {
    id: 'SPM134-BE-30',
    name: 'the reminder writes the expiry in UTC instead of Singapore time',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('04-A', '04-B'), ...e2e('04-C')],
    edits: [['expires on ${formatSgt(expiresAt)}', 'expires on ${expiresAt.toISOString()}']],
  },
  {
    id: 'SPM134-BE-31',
    name: "the hold lifecycle types are left out of the Coordinator's feed allow-list",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-F', '07-C'), ...e2e('01-G', '07-A')],
    edits: [['            ...HOLD_LIFECYCLE_NOTICE_TYPES,\n', '']],
  },
  {
    id: 'SPM134-BE-32',
    name: 'a hold lifecycle notice is labelled for the Organiser, not the Coordinator',
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: feed('06-A'),
    edits: [["  if ((HOLD_LIFECYCLE_NOTICE_TYPES as readonly string[]).includes(row.type)) return 'coordinator';\n", '']],
  },
  {
    id: 'SPM134-BE-33',
    name: "the previous Coordinator's unread hold lifecycle notices are not cleared on reassignment",
    file: LEAD,
    suites: BOTH,
    testMappings: [...lead('09-C'), ...e2e('09-D')],
    edits: [["                         ${HOLD_LIFECYCLE_NOTICE_TYPES.map((type) => `'${type}'`).join(', ')},\n", '']],
  },
  {
    id: 'SPM134-BE-34',
    name: 'the scheduler never runs the reminder processor',
    file: SCHED,
    suites: ['backendUnit'],
    testMappings: sched('01-I'),
    edits: [["      await this.run('Tentative hold reminder processing', () => this.venues.processTentativeHoldReminders());\n", '']],
  },
  {
    id: 'SPM134-BE-35',
    name: 'a failing reminder processor stops the tick (not isolated from the expiry processor)',
    file: SCHED,
    suites: ['backendUnit'],
    testMappings: sched('02-F'),
    edits: [["await this.run('Tentative hold reminder processing', () => this.venues.processTentativeHoldReminders());", 'await this.venues.processTentativeHoldReminders();']],
  },
  {
    id: 'SPM134-BE-36',
    name: 'a reminder is not consumed when the event has no Coordinator (it would be sent to a later assignee)',
    file: REPO,
    suites: BOTH,
    testMappings: e2e('09-E'),
    edits: [["WHERE e.id = b.event_id AND e.status <> 'Cancelled'", "WHERE e.id = b.event_id AND e.status <> 'Cancelled' AND e.coordinator_id IS NOT NULL"]],
  },
];
