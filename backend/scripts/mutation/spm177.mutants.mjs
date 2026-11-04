// SPM-177 backend mutants: the three clarification notices (clarification, clarification_reply, clarification_resolved)
// reaching the Organiser's and the Coordinator's bell feed (read allow-lists, audience label), the previous Coordinator's
// read-marking on reassignment, and the notice wording naming the person who acted. Several mutants re-create the
// original bug (types missing from a list, every notice labelled Organiser) or the old role-label wording. Each mutant
// maps to its CLARIFY-NOTIF tests by ID prefix.
const FEED_SPEC = 'src/events/clarification-notifications.spec.ts';
const LEAD_SPEC = 'src/lead/lead-assignment.service.spec.ts';
const SERVICE_SPEC = 'src/clarifications/clarifications.service.spec.ts';
const REJECT_SPEC = 'src/events/review/events.reject.spec.ts';
const E2E = 'test/clarification-notifications.e2e-spec.ts';
const EVENTS = 'src/events/events.service.ts';
const LEAD = 'src/lead/lead-assignment.service.ts';
const CLAR = 'src/clarifications/clarifications.service.ts';
const map = (suite, file, ...ids) => ids.map((id) => ({ suite, file, title: `CLARIFY-NOTIF-${id}` }));
const feed = (...ids) => map('backendUnit', FEED_SPEC, ...ids);
const lead = (...ids) => map('backendUnit', LEAD_SPEC, ...ids);
const service = (...ids) => map('backendUnit', SERVICE_SPEC, ...ids);
const e2e = (...ids) => map('backendE2E', E2E, ...ids);
const BOTH = ['backendUnit', 'backendE2E'];

export const SUITES = {
  backendUnit: {
    args: ['run', FEED_SPEC, LEAD_SPEC, SERVICE_SPEC, REJECT_SPEC],
  },
  backendE2E: {
    args: ['run', '--config', './vitest.config.e2e.ts', E2E],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  {
    id: 'SPM177-BE-01',
    name: "the clarification types are dropped from the Organiser's read list (the original bug)",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('01-A', '04-A'), ...e2e('06-A', '06-B')],
    edits: [['clarification.\n            ...CLARIFICATION_NOTICE_TYPES,\n          ]\n        : []),\n      ...(user.roles.includes(\'COORDINATOR\')', 'clarification.\n          ]\n        : []),\n      ...(user.roles.includes(\'COORDINATOR\')']],
  },
  {
    id: 'SPM177-BE-02',
    name: "the clarification types are dropped from the Coordinator's read list (the original bug)",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('02-A', '04-A'), ...e2e('06-B')],
    edits: [['a clarification.\n            ...CLARIFICATION_NOTICE_TYPES,\n          ]\n        : []),\n      ...(user.roles.includes(\'COORDINATOR_LEAD\')', 'a clarification.\n          ]\n        : []),\n      ...(user.roles.includes(\'COORDINATOR_LEAD\')']],
  },
  {
    id: 'SPM177-BE-03',
    name: "every clarification notice is labelled an Organiser notice (the pre-fix audience)",
    file: EVENTS,
    suites: BOTH,
    testMappings: [...feed('03-A'), ...e2e('06-B')],
    edits: [["return row.event_coordinator_id === row.recipient_id ? 'coordinator' : 'organiser';", "return 'organiser';"]],
  },
  {
    id: 'SPM177-BE-04',
    name: "the clarification types are dropped from the previous Coordinator's reassignment read-marking",
    file: LEAD,
    suites: BOTH,
    testMappings: [...lead('05-A'), ...e2e('06-C')],
    edits: [[",\n                         ${CLARIFICATION_NOTICE_TYPES.map((type) => `'${type}'`).join(', ')}) AND read = false`", ') AND read = false`']],
  },
  {
    id: 'SPM177-BE-05',
    name: 'the request notice reverts to the unnamed wording',
    file: CLAR,
    suites: BOTH,
    testMappings: [...service('09-A'), ...e2e('06-A')],
    edits: [['`${this.displayName(user)} requested clarification on "${event.event_name}".`', '`Clarification requested on "${event.event_name}".`']],
  },
  {
    id: 'SPM177-BE-06',
    name: 'the reply notice reverts to the role-label wording',
    file: CLAR,
    suites: ['backendUnit'],
    testMappings: service('09-B'),
    edits: [['`${this.displayName(user)} replied to a clarification on "${event.event_name}".`', '`The ${authorRole} replied on "${event.event_name}".`']],
  },
  {
    id: 'SPM177-BE-07',
    name: 'the resolved notice reverts to the role-label wording',
    file: CLAR,
    suites: ['backendUnit'],
    testMappings: service('09-C'),
    edits: [['`${this.displayName(user)} marked a clarification on "${event.event_name}" as resolved.`', '`The ${resolverRole} marked a clarification on "${event.event_name}" as resolved.`']],
  },
  {
    id: 'SPM177-BE-08',
    name: 'the request notice names the recipient instead of the actor',
    file: CLAR,
    suites: BOTH,
    testMappings: [...service('09-A'), ...e2e('06-A')],
    edits: [['`${this.displayName(user)} requested clarification', '`${event.organiser_id} requested clarification']],
  },
  {
    id: 'SPM177-BE-09',
    name: 'the reply notice names the recipient instead of the actor',
    file: CLAR,
    suites: ['backendUnit'],
    testMappings: service('09-B'),
    edits: [['`${this.displayName(user)} replied to', '`${recipientId} replied to']],
  },
  {
    id: 'SPM177-BE-10',
    name: 'the resolved notice names the recipient instead of the actor',
    file: CLAR,
    suites: ['backendUnit'],
    testMappings: service('09-C'),
    edits: [['`${this.displayName(user)} marked a clarification', '`${recipientId} marked a clarification']],
  },
];
