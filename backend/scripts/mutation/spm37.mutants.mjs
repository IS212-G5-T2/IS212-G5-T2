// SPM-37 backend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  drafts: { args: ['run', 'src/event-drafts/drafts.service.spec.ts', 'src/event-drafts/dto/draft-boundaries.spec.ts'] },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/drafts.e2e-spec.ts'],
    needsEnv: ['TEST_DATABASE_URL'],
  },
};

const SERVICE = 'src/event-drafts/drafts.service.ts';

export const MUTANTS = [
  { id: 'BE-37-01', name: 'a stale save is refused with the submitted-draft message (EVE-DRF-05-A message)', file: SERVICE, suites: ['drafts'],
    edits: [["'This draft changed in another window. Reopen it before saving again.'", "'This request was submitted. Use Event Change Requests for further changes.'"]] },
  { id: 'BE-37-02', name: 'an identical retry is treated as a stale version instead of returning the stored draft (EVE-DRF-04-B)', file: SERVICE, suites: ['drafts', 'e2e'],
    testMappings: [{ suite: 'drafts', file: 'src/event-drafts/drafts.service.spec.ts', title: 'Q1-026 retries identical save without issuing an update' }, { suite: 'e2e', file: 'test/drafts.e2e-spec.ts', title: 'EVE-DRF-SUP-21 retries idempotently and rejects stale concurrent updates' }],
    edits: [['if (row.last_operation === data.operationId) {', 'if (false) {']] },
];
