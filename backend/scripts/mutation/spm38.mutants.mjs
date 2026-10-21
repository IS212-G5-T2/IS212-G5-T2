// SPM-38 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  events: { args: ['run', 'src/events/events.service.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/events-assign.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  { id: 'BE-38-01', name: 'a coordinator who is not assigned can read the request details (EVE-REV-04-B, EVE-REV-04-F)',
    file: 'src/events/events.service.ts', suites: ['events', 'e2e'],
    testMappings: [{ suite: 'events', file: 'src/events/events.service.spec.ts', title: 'EVE-REV-04-B hides the event from a coordinator it is not assigned to' }, { suite: 'e2e', file: 'test/events-assign.e2e-spec.ts', title: 'EVE-REV-04-F returns 404 for a coordinator the event is not assigned to' }],
    edits: [["user.roles.includes('COORDINATOR') && row.coordinator_id === user.uid;", "user.roles.includes('COORDINATOR') && true;"]] },
  { id: 'BE-38-02', name: 'the events list returns attachment file contents as well as the detail (EVE-REV-SUP-01)',
    file: 'src/events/events.service.ts', suites: ['e2e'],
    testMappings: [{ suite: 'e2e', file: 'test/events-assign.e2e-spec.ts', title: 'EVE-REV-SUP-01 omits attachment dataUrl from the events list but keeps it on the detail' }],
    edits: [['({ dataUrl: _dataUrl, ...meta }) => meta,', '(meta) => meta,']] },
];
