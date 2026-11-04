// SPM-171 backend mutants: the "requested to cancel" notice the assigned Coordinator receives when the Organiser submits a
// cancellation request (wording, recipient, type, event link, submission time, written in the request's transaction, only
// for an assigned event and only for a saved request), its delivery on assignment and reassignment (the pending request
// only, with its submission time, the previous Coordinator's unread notice cleared), and the Coordinator's feed allow-list
// and audience. Each mutant maps to its CANCEL-REQ-NOTIF tests by ID prefix.
const NOTICE_SPEC = 'src/events/cancellation-requests/cancellation-request-notice.spec.ts';
const SERVICE_SPEC = 'src/events/cancellation-requests/cancellation-requests.service.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const FEED_SPEC = 'src/events/cancellation-request-notifications.spec.ts';
const E2E = 'test/cancellation-request-submitted-notification.e2e-spec.ts';
const NOTICE = 'src/events/cancellation-requests/cancellation-request-notice.ts';
const MESSAGES = 'src/events/cancellation-requests/cancellation-request.messages.ts';
const SERVICE = 'src/events/cancellation-requests/cancellation-requests.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const EVENTS = 'src/events/events.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `CANCEL-REQ-NOTIF-${id}` }));
const notice = (...ids) => map('backendUnit', NOTICE_SPEC, ...ids);
const service = (...ids) => map('backendUnit', SERVICE_SPEC, ...ids);
const lead = (...ids) => map('backendUnit', LEAD_SPEC, ...ids);
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);
const BOTH = ['backendUnit', 'backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', NOTICE_SPEC, SERVICE_SPEC, LEAD_SPEC, FEED_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM171-BE-01',
    name: 'notice wording loses its final full stop',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('02-B', '02-BND-1'), ...service('01-A', '02-A'), ...lead('06-D'), ...e2e('02-E', '06-H')],
    edits: [['requested to cancel "${eventName}".`', 'requested to cancel "${eventName}"`']],
  },
  {
    id: 'SPM171-BE-02',
    name: 'event name no longer quoted in the notice',
    file: MESSAGES,
    suites: BOTH,
    testMappings: [...notice('02-B', '02-BND-1'), ...service('01-A', '02-A'), ...lead('06-D'), ...e2e('02-E', '06-H')],
    edits: [['requested to cancel "${eventName}".`', 'requested to cancel ${eventName}.`']],
  },
  {
    id: 'SPM171-BE-03',
    name: 'notice type changed to another string',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-B'), ...service('01-A'), ...lead('06-D'), ...e2e('01-C', '06-H')],
    edits: [["'cancellation_request_submitted';", "'cancellation_request_requested';"]],
  },
  {
    id: 'SPM171-BE-04',
    name: 'notice addressed to the Organiser instead of the assigned Coordinator',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-A'), ...e2e('01-C', '01-SEC-1')],
    edits: [['notifyCancellationRequested(client, event.coordinator_id,', 'notifyCancellationRequested(client, event.organiser_id,']],
  },
  {
    id: 'SPM171-BE-05',
    name: 'notice written even when no Coordinator is assigned',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('06-A'), ...e2e('06-H')],
    edits: [['        if (event.coordinator_id)\n          await notifyCancellationRequested', '        await notifyCancellationRequested']],
  },
  {
    id: 'SPM171-BE-06',
    name: 'notice stamped with the database clock instead of the submission time',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-A'), ...e2e('02-E')],
    edits: [['event.event_name, requestedBy, now);', 'event.event_name, requestedBy, new Date());']],
  },
  {
    id: 'SPM171-BE-07',
    name: 'notice names a fixed Organiser instead of the session user',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('01-A', '02-A'), ...e2e('02-E')],
    edits: [["const requestedBy = displayName(user, 'Organiser');", "const requestedBy = 'Organiser';"]],
  },
  {
    id: 'SPM171-BE-08',
    name: 'a failing notice write is swallowed, so the request commits without its notice',
    file: SERVICE,
    suites: BOTH,
    testMappings: [...service('07-B'), ...e2e('07-D')],
    edits: [['event.event_name, requestedBy, now);', 'event.event_name, requestedBy, now).catch(() => undefined);']],
  },
  {
    id: 'SPM171-BE-09',
    name: 'assignment hands over any request on the event, not only the pending one',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('06-B'), ...e2e('06-J')],
    edits: [[" WHERE event_id = $1 AND status = 'pending'`,\n    [eventId],\n  );\n  const request = pending.rows[0];\n  if (!request) return false;\n  await notifyCancellationRequested", " WHERE event_id = $1`,\n    [eventId],\n  );\n  const request = pending.rows[0];\n  if (!request) return false;\n  await notifyCancellationRequested"]],
  },
  {
    id: 'SPM171-BE-10',
    name: 'assignment stamps the notice with the assignment time instead of the submission time',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('06-B'), ...lead('06-D'), ...e2e('06-H')],
    edits: [['request.requested_by, request.requested_at);', 'request.requested_by, new Date());']],
  },
  {
    id: 'SPM171-BE-11',
    name: 'assignment no longer hands a pending cancellation request to the Coordinator',
    file: LEAD,
    suites: BOTH,
    testMappings: [...lead('06-D'), ...e2e('06-H')],
    edits: [['      // SPM-171 AC6: so does a cancellation request made before assignment.\n      await notifyPendingCancellationRequest(client, eventId, event.event_name, coordinator.id);', '      // SPM-171 AC6: so does a cancellation request made before assignment.']],
  },
  {
    id: 'SPM171-BE-12',
    name: 'reassignment no longer hands a pending cancellation request to the new Coordinator',
    file: LEAD,
    suites: BOTH,
    testMappings: [...lead('06-F'), ...e2e('06-I')],
    edits: [['      // SPM-171 AC6: and so does a pending cancellation request.\n      await notifyPendingCancellationRequest(client, eventId, event.event_name, coordinator.id);', '      // SPM-171 AC6: and so does a pending cancellation request.']],
  },
  {
    id: 'SPM171-BE-13',
    name: "reassignment leaves the previous Coordinator's unread cancellation notice in place",
    file: LEAD,
    suites: BOTH,
    testMappings: [...lead('06-F'), ...e2e('06-I')],
    edits: [["\n                         '${CANCELLATION_REQUESTED_NOTICE}',", '']],
  },
  {
    id: 'SPM171-BE-14',
    name: "a notice insert failure on assignment is swallowed, so the assignment commits without the notice",
    file: LEAD,
    suites: ['backendUnit'],
    testMappings: [...lead('06-G')],
    edits: [['await notifyPendingCancellationRequest(client, eventId, event.event_name, coordinator.id);\n      return {\n        event: {\n          id: eventId,\n          name: event.event_name,\n          coordinatorId: coordinator.id,\n          coordinatorName: coordinator.display_name,\n        },\n        message: `Event request', 'await notifyPendingCancellationRequest(client, eventId, event.event_name, coordinator.id).catch(() => false);\n      return {\n        event: {\n          id: eventId,\n          name: event.event_name,\n          coordinatorId: coordinator.id,\n          coordinatorName: coordinator.display_name,\n        },\n        message: `Event request']],
  },
  {
    id: 'SPM171-BE-15',
    name: "the Coordinator's feed does not list the notice",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-D', '04-D'), ...e2e('01-C', '04-E')],
    edits: [[
      '            // SPM-171: the Organiser requested to cancel an event assigned to them.\n            CANCELLATION_REQUESTED_NOTICE,\n',
      '            // SPM-171: the Organiser requested to cancel an event assigned to them.\n',
    ]],
  },
  {
    id: 'SPM171-BE-16',
    name: "the Organiser's feed also lists the notice",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-D', '04-D')],
    edits: [['            CANCELLATION_DECLINED_NOTICE,\n', '            CANCELLATION_DECLINED_NOTICE,\n            CANCELLATION_REQUESTED_NOTICE,\n']],
  },
  {
    id: 'SPM171-BE-17',
    name: 'the notice is labelled an Organiser notice in the feed',
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('03-C'), ...e2e('01-C')],
    edits: [["  if (row.type === CANCELLATION_REQUESTED_NOTICE) return 'coordinator';\n", '']],
  },
  {
    id: 'SPM171-BE-18',
    name: 'the notice is linked to no event',
    file: NOTICE,
    suites: BOTH,
    testMappings: [...notice('01-B'), ...service('01-A'), ...e2e('01-C', '03-D')],
    edits: [['MESSAGES.requestedNotice(requestedBy, eventName), eventId, requestedAt]', 'MESSAGES.requestedNotice(requestedBy, eventName), null, requestedAt]']],
  },
];
