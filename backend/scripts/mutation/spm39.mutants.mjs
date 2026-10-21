// SPM-39 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  clarifications: { args: ['run', 'src/clarifications/clarifications.service.spec.ts', 'src/clarifications/dto/clarification-input.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/clarifications.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

export const MUTANTS = [
  { id: 'BE-39-01', name: 'a whitespace-only clarification message is accepted: the blank check is dropped (REQ-CLAR-01-B)',
    file: 'src/clarifications/dto/clarification-input.ts', suites: ['clarifications', 'e2e'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/dto/clarification-input.spec.ts', title: 'rejects a blank message' }, { suite: 'e2e', file: 'test/clarifications.e2e-spec.ts', title: 'REQ-CLAR-01-B: Event Coordinator cannot submit a blank clarification message' }],
    edits: [['if (!message) {', 'if (false) {']] },
  { id: 'BE-39-02', name: 'a coordinator who is not assigned to the event may request a clarification (REQ-CLAR-03)',
    file: 'src/clarifications/clarifications.service.ts', suites: ['clarifications', 'e2e'],
    testMappings: [{ suite: 'clarifications', file: 'src/clarifications/clarifications.service.spec.ts', title: 'rejects a coordinator not assigned to the event, with no DB mutation' }, { suite: 'e2e', file: 'test/clarifications.e2e-spec.ts', title: 'REQ-CLAR-03: Event Coordinator cannot request clarification on an event assigned to another Coordinator' }],
    edits: [['if (event.coordinator_id !== user.uid) {', 'if (false) {']] },
];
