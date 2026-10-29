// SPM-39 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  clarifications: { args: ['run', 'src/features/events/pages/detail/ClarificationThread.test.tsx', 'src/features/events/pages/detail/EventDetailPage.clarifications.test.tsx'] },
};

const THREAD = 'src/features/events/pages/detail/ClarificationThread.tsx';

export const MUTANTS = [
  { id: 'FE-39-01', name: 'a blank clarification is sent: the required-message check is dropped (REQ-CLAR-01-B)', file: THREAD, suites: ['clarifications'],
    edits: [['if (!draft.trim()) {\n      setDraftError', 'if (false) {\n      setDraftError']] },
];
