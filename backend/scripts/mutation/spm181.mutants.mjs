// SPM-181 backend mutants: the attendee "event rescheduled" notice (written by every way a start or end change is applied,
// to Registered and Waitlisted attendees only, once per save, with the exact wording and the change time, never for a
// flagged, rejected, failed or other-field change) and the attendee's feed allow-list and audience. Each mutant maps to
// its EVENT-CHANGE-NOTIF tests by ID prefix.
const HELPER_SPEC = 'src/events/planning/event-reschedule-notice.spec.ts';
const PLANNING_SPEC = 'src/events/planning/event-planning.service.spec.ts';
const REVIEW_SPEC = 'src/events/change-requests/review/change-request-review.service.spec.ts';
const FEED_SPEC = 'src/events/event-reschedule-notifications.spec.ts';
const E2E = 'test/event-reschedule-notification.e2e-spec.ts';
const HELPER = 'src/events/planning/event-reschedule-notice.ts';
const PLANNING = 'src/events/planning/event-planning.service.ts';
const REVIEW = 'src/events/change-requests/review/change-request-review.service.ts';
const EVENTS = 'src/events/events.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `EVENT-CHANGE-NOTIF-${id}` }));
const helper = (...ids) => map('backendUnit', HELPER_SPEC, ...ids);
const planning = (...ids) => map('backendUnit', PLANNING_SPEC, ...ids);
const review = (...ids) => map('backendUnit', REVIEW_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);
const BOTH = ['backendUnit', 'backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', HELPER_SPEC, PLANNING_SPEC, REVIEW_SPEC, FEED_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

const CALL_DIRECT = '        await notifyAttendeesOfReschedule(this.repository, event, current, appliedAt); // SPM-181\n';
const CALL_CONFIRM = '      await notifyAttendeesOfReschedule(this.repository, event, current, resolution.resolvedAt); // SPM-181\n    }\n    const resolved';
const CALL_APPROVE = '      await notifyAttendeesOfReschedule(this.repository, event, applied, now); // SPM-181\n';

export const MUTANTS = [
  {
    id: 'SPM181-BE-01',
    name: "a Coordinator's direct edit no longer notifies",
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('03-A'), ...e2e('01-B', '03-E')],
    edits: [[CALL_DIRECT, '']],
  },
  {
    id: 'SPM181-BE-02',
    name: 'a confirmed flagged change no longer notifies',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('03-B', '03-C'), ...e2e('03-F')],
    edits: [[CALL_CONFIRM, '    }\n    const resolved']],
  },
  {
    id: 'SPM181-BE-03',
    name: 'an approved change request no longer notifies',
    file: REVIEW,
    suites: BOTH,
    testMappings: [...review('03-D'), ...e2e('03-G')],
    edits: [[CALL_APPROVE, '']],
  },
  {
    id: 'SPM181-BE-04',
    name: 'a flagged change closed as Rejected also notifies (with the proposed schedule)',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('04-C', '03-C'), ...e2e('04-E')],
    edits: [[CALL_CONFIRM, '    }\n    await notifyAttendeesOfReschedule(this.repository, event, { ...current, [change.field]: change.proposedValue }, resolution.resolvedAt);\n    const resolved']],
  },
  {
    id: 'SPM181-BE-05',
    name: 'Waitlisted attendees are not notified',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('01-B')],
    edits: [["['Registered', 'Waitlisted'] as const", "['Registered'] as const"]],
  },
  {
    id: 'SPM181-BE-06',
    name: 'Withdrawn attendees are notified too',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('01-B')],
    edits: [["['Registered', 'Waitlisted'] as const", "['Registered', 'Waitlisted', 'Withdrawn'] as const"]],
  },
  {
    id: 'SPM181-BE-07',
    name: 'every saved change counts as a schedule change (a name-only or other-field change notifies)',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('05-A', '05-B'), ...planning('05-A'), ...review('05-A'), ...e2e('05-C')],
    edits: [['    Date.parse(before.startDateTime) !== Date.parse(after.startDateTime) ||', '    true ||']],
  },
  {
    id: 'SPM181-BE-08',
    name: 'only the start is compared, so an end-only change does not notify',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('05-B'), ...planning('03-A'), ...review('03-D'), ...e2e('04-F')],
    edits: [[' ||\n    Date.parse(before.endDateTime) !== Date.parse(after.endDateTime)', '']],
  },
  {
    id: 'SPM181-BE-09',
    name: 'the helper no longer checks for a schedule change before writing',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('05-A'), ...planning('05-A'), ...e2e('05-C')],
    edits: [['  if (!scheduleChanged(before, after)) return 0;\n', '']],
  },
  {
    id: 'SPM181-BE-10',
    name: 'the message uses the name before the change',
    file: HELPER,
    suites: BOTH,
    testMappings: [...planning('05-A'), ...helper('02-C')],
    edits: [['eventRescheduledMessage(after),', 'eventRescheduledMessage({ ...after, name: before.name }),']],
  },
  {
    id: 'SPM181-BE-11',
    name: 'the message swaps the start and the end',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('02-A', '02-C'), ...e2e('02-B', '03-E')],
    edits: [['It now runs ${start} to ${end} (SGT).', 'It now runs ${end} to ${start} (SGT).']],
  },
  {
    id: 'SPM181-BE-12',
    name: 'the message drops "(SGT)"',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('02-A', '02-C'), ...e2e('02-B', '03-E')],
    edits: [[' to ${end} (SGT).`', ' to ${end}.`']],
  },
  {
    id: 'SPM181-BE-13',
    name: 'the notice is stamped with the database clock instead of the time the change was applied',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('02-B', '03-F', '03-G')],
    edits: [['$4::timestamptz\n', 'CASE WHEN $4::timestamptz IS NOT NULL THEN clock_timestamp() END\n']],
  },
  {
    id: 'SPM181-BE-14',
    name: 'the notice is not labelled an attendee notice',
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('06-B'), ...e2e('02-B')],
    edits: [["  if (row.type === EVENT_RESCHEDULED_NOTICE) return 'attendee';\n", '']],
  },
  {
    id: 'SPM181-BE-15',
    name: "the Attendee's read list no longer includes the rescheduled type",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('06-A', '06-C'), ...e2e('06-D')],
    edits: [["'EventCancelled', EVENT_RESCHEDULED_NOTICE] : [])", "'EventCancelled'] : [])"]],
  },
  {
    id: 'SPM181-BE-16',
    name: 'denying a change request notifies the attendees (with the requested schedule)',
    file: REVIEW,
    suites: BOTH,
    testMappings: [...review('04-D'), ...e2e('04-E')],
    edits: [["      await this.notifyOrganiser(\n        event,\n        'change_request_denied',", "      await notifyAttendeesOfReschedule(this.repository, event, { ...event, ...this.patchOf(request) } as never, now);\n      await this.notifyOrganiser(\n        event,\n        'change_request_denied',"]],
  },
  {
    id: 'SPM181-BE-17',
    name: 'a flagged change notifies when it is saved, not when it is applied',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('04-B'), ...e2e('03-F')],
    edits: [['      const flagged: FlaggedChangeRow[] = [];\n', '      if (needsReview.length) await notifyAttendeesOfReschedule(this.repository, event, { ...event, ...pick(patch, needsReview) } as never, new Date());\n      const flagged: FlaggedChangeRow[] = [];\n']],
  },
  {
    id: 'SPM181-BE-18',
    name: 'the direct edit writes the notice before saving the fields',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('07-A'), ...e2e('07-C')],
    edits: [
      [CALL_DIRECT, ''],
      ['        const appliedAt = new Date();\n', '        const appliedAt = new Date();\n        await notifyAttendeesOfReschedule(this.repository, event, { ...event, ...pick(patch, immediate) } as never, appliedAt);\n'],
    ],
  },
  {
    id: 'SPM181-BE-19',
    name: 'the approval writes the notice outside its transaction',
    file: REVIEW,
    suites: BOTH,
    testMappings: [...e2e('07-C')],
    edits: [[CALL_APPROVE, '      await notifyAttendeesOfReschedule({ query: (t: string, p?: unknown[]) => (this.repository as never as { database: { getPool: () => { query: (t: string, p?: unknown[]) => Promise<never> } } }).database.getPool().query(t, p) }, event, applied, now);\n']],
  },
  {
    id: 'SPM181-BE-20',
    name: 'a confirmed flagged change writes the notice outside its transaction',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...e2e('03-F', '07-C')],
    edits: [[CALL_CONFIRM, '      await notifyAttendeesOfReschedule({ query: (t: string, p?: unknown[]) => (this.repository as never as { database: { getPool: () => { query: (t: string, p?: unknown[]) => Promise<never> } } }).database.getPool().query(t, p) }, event, current, resolution.resolvedAt);\n    }\n    const resolved']],
  },
  {
    id: 'SPM181-BE-21',
    name: 'Removed attendees are notified too',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('01-B')],
    edits: [["['Registered', 'Waitlisted'] as const", "['Registered', 'Waitlisted', 'Removed'] as const"]],
  },
  {
    id: 'SPM181-BE-22',
    name: 'Cancelled attendees are notified too',
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('01-B')],
    edits: [["['Registered', 'Waitlisted'] as const", "['Registered', 'Waitlisted', 'Cancelled'] as const"]],
  },
  {
    id: 'SPM181-BE-23',
    name: "the event filter is dropped, so other events' attendees are notified",
    file: HELPER,
    suites: BOTH,
    testMappings: [...helper('01-A'), ...e2e('01-B')],
    edits: [['WHERE r.event_id = $1::uuid AND r.status = ANY', 'WHERE r.status = ANY']],
  },
  {
    id: 'SPM181-BE-24',
    name: 'one notice statement per changed field',
    file: PLANNING,
    suites: BOTH,
    testMappings: [...planning('03-A'), ...e2e('01-B')],
    edits: [[CALL_DIRECT, '        for (const _field of immediate) await notifyAttendeesOfReschedule(this.repository, event, current, appliedAt);\n']],
  },
  {
    id: 'SPM181-BE-25',
    name: 'the notice is created already read',
    file: HELPER,
    suites: BOTH,
    testMappings: [...e2e('02-B', '06-D')],
    edits: [
      ['related_user_id, created_at)', 'related_user_id, created_at, read)'],
      ['$4::timestamptz\n', '$4::timestamptz, true\n'],
    ],
  },
  {
    id: 'SPM181-BE-26',
    name: 'the notice is addressed to the event instead of the attendee',
    file: HELPER,
    suites: BOTH,
    testMappings: [...e2e('01-B', '06-D')],
    edits: [['SELECT gen_random_uuid(), r.attendee_id::text,', 'SELECT gen_random_uuid(), r.event_id::text,']],
  },
  {
    id: 'SPM181-BE-27',
    name: 'every notice type is labelled an attendee notice',
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('06-B')],
    edits: [["  if (row.type === EVENT_RESCHEDULED_NOTICE) return 'attendee';\n", "  return 'attendee';\n"]],
  },
];
