// SPM-162 backend mutants: the request-outcome notice the Organiser receives when the Coordinator accepts or declines a
// cancellation request (wording, recipient, type, event link, decision time, one notice per decision, written in the
// decision transaction, refused or lost decisions write nothing, the Organiser skipped by EventCancelled on the request
// path only, the Organiser's feed allow-list). Each mutant maps to its CANCEL-OUTCOME tests by ID prefix.
const NOTICE_SPEC = 'src/events/cancellation-requests/cancellation-request-notice.spec.ts';
const SERVICE_SPEC = 'src/events/cancellation-requests/cancellation-requests.service.spec.ts';
const CANCEL_SPEC = 'src/events/cancel/cancel-event.service.spec.ts';
const FEED_SPEC = 'src/events/cancellation-request-notifications.spec.ts';
const E2E = 'test/cancellation-request-outcome.e2e-spec.ts';
const NOTICE = 'src/events/cancellation-requests/cancellation-request-notice.ts';
const MESSAGES = 'src/events/cancellation-requests/cancellation-request.messages.ts';
const SERVICE = 'src/events/cancellation-requests/cancellation-requests.service.ts';
const CANCEL = 'src/events/cancel/cancel-event.service.ts';
const EVENTS = 'src/events/events.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `CANCEL-OUTCOME-${id}` }));
const notice = (...ids) => map('backendUnit', NOTICE_SPEC, ...ids);
const service = (...ids) => map('backendUnit', SERVICE_SPEC, ...ids);
const cancel = (...ids) => map('backendUnit', CANCEL_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);
const BOTH = ['backendUnit', 'backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', NOTICE_SPEC, SERVICE_SPEC, CANCEL_SPEC, FEED_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM162-BE-01',
    name: 'accepted wording shortened (the "The event is cancelled." sentence dropped)',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('02-A'), ...service('01-D'), ...e2e('02-D')],
    edits: [['was accepted. The event is cancelled.`', 'was accepted.`']],
  },
  {
    id: 'SPM162-BE-02',
    name: 'declined wording shortened (the "The event keeps its current status." sentence dropped)',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('02-B'), ...service('01-E'), ...e2e('02-E')],
    edits: [['was declined. The event keeps its current status.`', 'was declined.`']],
  },
  {
    id: 'SPM162-BE-03',
    name: 'event name no longer quoted in the accepted message',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('02-A', '02-BND-1'), ...e2e('02-D')],
    edits: [['request for "${eventName}" was accepted', 'request for ${eventName} was accepted']],
  },
  {
    id: 'SPM162-BE-04',
    name: 'notice addressed to the event id instead of the Organiser',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-C'), ...e2e('01-A', '01-B', '01-SEC-1')],
    edits: [['      event.organiser_id,\n      accepted ?', '      event.id,\n      accepted ?']],
  },
  {
    id: 'SPM162-BE-05',
    name: 'accepted and declined notification types swapped',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-C'), ...service('01-D', '01-E'), ...e2e('01-A', '01-B')],
    edits: [['accepted ? CANCELLATION_ACCEPTED_NOTICE : CANCELLATION_DECLINED_NOTICE', 'accepted ? CANCELLATION_DECLINED_NOTICE : CANCELLATION_ACCEPTED_NOTICE']],
  },
  {
    id: 'SPM162-BE-06',
    name: 'notice stamped with the real time instead of the decision time',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('02-C'), ...e2e('02-D', '02-E')],
    edits: [['      decidedAt,\n    ],', '      new Date(),\n    ],']],
  },
  {
    id: 'SPM162-BE-07',
    name: 'notice written without the event link',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-C'), ...e2e('01-A', '01-B')],
    edits: [['      event.id,\n      decidedAt,', '      null,\n      decidedAt,']],
  },
  {
    id: 'SPM162-BE-08',
    name: 'accepted message built from the declined wording',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('02-A', '02-B'), ...service('01-D', '01-E'), ...e2e('02-D', '02-E')],
    edits: [['accepted ? MESSAGES.outcomeAccepted(event.event_name) : MESSAGES.outcomeDeclined(event.event_name)', 'MESSAGES.outcomeDeclined(event.event_name)']],
  },
  {
    id: 'SPM162-BE-09',
    name: 'accept no longer asks the cancellation core to skip the Organiser',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-D'), ...e2e('03-A')],
    edits: [['now, { skipOrganiserNotice: true });', 'now);']],
  },
  {
    id: 'SPM162-BE-10',
    name: 'accept writes no outcome notice',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-D'), ...e2e('01-A', '03-A')],
    edits: [["        await notifyCancellationOutcome(client, event, 'accepted', now);\n", '']],
  },
  {
    id: 'SPM162-BE-11',
    name: 'decline writes no outcome notice',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-E'), ...e2e('01-B')],
    edits: [["      await notifyCancellationOutcome(client, event, 'declined', now);\n", '']],
  },
  {
    id: 'SPM162-BE-12',
    name: 'accept writes the declined outcome',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-D'), ...e2e('01-A')],
    edits: [["notifyCancellationOutcome(client, event, 'accepted', now)", "notifyCancellationOutcome(client, event, 'declined', now)"]],
  },
  {
    id: 'SPM162-BE-13',
    name: 'a decision that loses the compare-and-set still writes a notice',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: service('06-E'),
    edits: [[
      "      if (!updated.rows[0]) throw this.decided();\n\n      if (decision === 'accept')",
      "      if (!updated.rows[0]) {\n        await notifyCancellationOutcome(client, event, 'declined', now);\n        throw this.decided();\n      }\n\n      if (decision === 'accept')",
    ]],
  },
  {
    id: 'SPM162-BE-14',
    name: 'accept writes its notice outside the decision transaction (on the pool)',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-D'), ...e2e('06-D')],
    edits: [["notifyCancellationOutcome(client, event, 'accepted', now)", "notifyCancellationOutcome(this.database, event, 'accepted', now)"]],
  },
  {
    id: 'SPM162-BE-15',
    name: 'decline writes its notice outside the decision transaction (on the pool)',
    file: SERVICE,
    suites: ['backendUnit'],
    testMappings: service('01-E', '06-F'),
    edits: [["notifyCancellationOutcome(client, event, 'declined', now)", "notifyCancellationOutcome(this.database, event, 'declined', now)"]],
  },
  {
    id: 'SPM162-BE-16',
    name: 'the Organiser is never skipped (option ignored)',
    file: CANCEL,
    suites: BOTH,
    testMappings: [...cancel('03-C', '03-E'), ...e2e('03-A')],
    edits: [['    if (skipOrganiserNotice) recipients.delete(event.organiser_id);\n', '']],
  },
  {
    id: 'SPM162-BE-17',
    name: 'the Coordinator is skipped instead of the Organiser',
    file: CANCEL,
    suites: BOTH,
    testMappings: [...cancel('03-C'), ...e2e('03-A', '03-F')],
    edits: [['recipients.delete(event.organiser_id)', 'recipients.delete(user.uid)']],
  },
  {
    id: 'SPM162-BE-18',
    name: 'the Organiser is skipped on every cancellation (direct cancel included)',
    file: CANCEL,
    suites: BOTH,
    testMappings: [...cancel('03-D'), ...e2e('03-B')],
    edits: [['skipOrganiserNotice = false,', 'skipOrganiserNotice = true,'], ['options.skipOrganiserNotice === true', 'options.skipOrganiserNotice !== false']],
  },
  {
    id: 'SPM162-BE-19',
    name: 'any options object skips the Organiser (the flag value is not read)',
    file: CANCEL,
    suites: ['backendUnit'],
    testMappings: cancel('03-D'),
    edits: [['options.skipOrganiserNotice === true', 'options !== undefined']],
  },
  {
    id: 'SPM162-BE-20',
    name: 'the Organiser is removed before the releasers add their recipients',
    file: CANCEL,
    suites: ['backendUnit'],
    testMappings: cancel('03-E'),
    edits: [
      ['    if (skipOrganiserNotice) recipients.delete(event.organiser_id);\n', ''],
      ['    for (const releaser of this.releasers)\n      for (const recipient of', '    if (skipOrganiserNotice) recipients.delete(event.organiser_id);\n    for (const releaser of this.releasers)\n      for (const recipient of'],
    ],
  },
  {
    id: 'SPM162-BE-21',
    name: "the Organiser's feed no longer includes the accepted type",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-F', '05-C'), ...e2e('01-A')],
    edits: [['            CANCELLATION_ACCEPTED_NOTICE,\n            CANCELLATION_DECLINED_NOTICE,\n          ]', '            CANCELLATION_DECLINED_NOTICE,\n          ]']],
  },
  {
    id: 'SPM162-BE-22',
    name: "the Organiser's feed no longer includes the declined type",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-F', '05-C'), ...e2e('01-B')],
    edits: [['            CANCELLATION_ACCEPTED_NOTICE,\n            CANCELLATION_DECLINED_NOTICE,\n          ]', '            CANCELLATION_ACCEPTED_NOTICE,\n          ]']],
  },
  {
    id: 'SPM162-BE-23',
    name: "the Coordinator's feed also includes the accepted type",
    file: EVENTS,
    suites: ['backendUnit'],
    testMappings: [...feed('01-F', '05-C')],
    edits: [['            ...COORDINATOR_NOTIFICATION_TYPES,\n', '            ...COORDINATOR_NOTIFICATION_TYPES,\n            CANCELLATION_ACCEPTED_NOTICE,\n']],
  },
  {
    id: 'SPM162-BE-24',
    name: 'an outcome notice is labelled a Coordinator notice',
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('04-A'), ...e2e('01-A')],
    edits: [["  if (row.type === 'coordinator_unavailable') return 'coordinator_lead';", "  if (row.type === CANCELLATION_ACCEPTED_NOTICE) return 'coordinator';\n  if (row.type === 'coordinator_unavailable') return 'coordinator_lead';"]],
  },
  {
    id: 'SPM162-BE-25',
    name: 'marking an outcome notice read does not persist (the read flag is written false)',
    file: EVENTS,
    suites: ['backendE2E'],
    testMappings: e2e('05-B'),
    edits: [['UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = ANY($3)', 'UPDATE notifications SET read = false WHERE id = $1 AND recipient_id = $2 AND type = ANY($3)']],
  },
  {
    id: 'SPM162-BE-26',
    name: 'an outcome notice is created already read',
    file: NOTICE,
    suites: ['backendE2E'],
    testMappings: e2e('05-A'),
    edits: [['(id, recipient_id, type, message, related_event_id, created_at)\n     VALUES ($1, $2, $3, $4, $5::uuid, $6)', '(id, recipient_id, type, message, related_event_id, created_at, read)\n     VALUES ($1, $2, $3, $4, $5::uuid, $6, true)']],
  },
  {
    id: 'SPM162-BE-27',
    name: 'marking read is not scoped to the recipient',
    file: EVENTS,
    suites: ['backendE2E'],
    testMappings: e2e('05-SEC-1'),
    edits: [['WHERE id = $1 AND recipient_id = $2 AND type = ANY($3) RETURNING id', 'WHERE id = $1 AND type = ANY($3) AND $2 IS NOT NULL RETURNING id']],
  },
  {
    id: 'SPM162-BE-28',
    name: 'a decision refused before the check order is reached writes a notice (authorisation check removed)',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('06-E'), ...e2e('06-B')],
    edits: [["if (!user.roles.includes('COORDINATOR') || event.coordinator_id !== user.uid) throw this.forbidden();", '']],
  },
  {
    id: 'SPM162-BE-29',
    name: 'an already-decided request writes a committed notice outside the transaction (pool) before the refusal',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('06-A', '06-CONC-1'),
    edits: [[
      "      if (request.status !== 'pending') throw this.decided();",
      "      if (request.status !== 'pending') {\n        await notifyCancellationOutcome(this.database, event, 'declined', now0);\n        throw this.decided();\n      }",
    ], ['      const { decision } = validateDecisionBody(body);', '      const now0 = this.clock.now();\n      const { decision } = validateDecisionBody(body);']],
  },
  {
    id: 'SPM162-BE-30',
    name: 'the cancellable-status check is removed, so a decision on a Completed event writes a notice',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('06-C'),
    edits: [['      if (!isCancellable(event.status)) throw this.notCancellable();\n\n      const now', '      const now']],
  },
  {
    id: 'SPM162-BE-31',
    name: 'the decision body is no longer validated (any unknown value is treated as a decline)',
    file: SERVICE,
    suites: ['backendE2E'],
    testMappings: e2e('06-C'),
    edits: [["const { decision } = validateDecisionBody(body);", "const decision = (body as { decision?: string })?.decision === 'accept' ? 'accept' : 'decline';"]],
  },
];
