// SPM-39 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  clarifications: { args: ['run', 'src/clarifications/clarifications.service.spec.ts', 'src/clarifications/dto/clarification-input.spec.ts'] },
};

export const MUTANTS = [
  { id: 'BE-39-01', name: 'a whitespace-only clarification message is accepted: the blank check is dropped (REQ-CLAR-01-B)',
    file: 'src/clarifications/dto/clarification-input.ts', suites: ['clarifications'],
    edits: [['if (!message) {', 'if (false) {']] },
  { id: 'BE-39-02', name: 'a coordinator who is not assigned to the event may request a clarification (REQ-CLAR-03)',
    file: 'src/clarifications/clarifications.service.ts', suites: ['clarifications'],
    edits: [['if (event.coordinator_id !== user.uid) {', 'if (false) {']] },
];
