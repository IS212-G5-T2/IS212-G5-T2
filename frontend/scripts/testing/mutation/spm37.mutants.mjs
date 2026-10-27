// SPM-37 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  drafts: { args: ['run', 'src/features/events/pages/create/EventCreatePage.test.tsx', 'src/features/events/pages/drafts/DraftWorkflow.test.tsx', 'src/utils/api.test.ts'] },
};

const PAGE = 'src/features/events/pages/create/EventCreatePage.tsx';

export const MUTANTS = [
  { id: 'FE-37-01', name: 'the 50 MB limit is checked per file only: the combined-size check is dropped (EVE-DRF-10-A)', file: PAGE, suites: ['drafts'],
    edits: [['if (existingBytes + incomingBytes > 50 * 1024 * 1024) {', 'if (false) {']] },
  { id: 'FE-37-02', name: 'the API client sends no browser session credentials, so the session is not carried on requests (EVE-DRF-06-B session, api.test)', file: 'src/utils/api.ts', suites: ['drafts'],
    edits: [['credentials: "include",', 'credentials: "omit",']] },
  { id: 'FE-37-03', name: 'the My Drafts list does not drop its cleanup on unmount or reload, so a superseded list load replaces the newer list (EVE-DRF-SUP-40)', file: 'src/features/events/pages/drafts/MyRequestsPage.tsx', suites: ['drafts'],
    testMappings: [{ suite: 'drafts', file: 'src/features/events/pages/drafts/DraftWorkflow.test.tsx', title: 'EVE-DRF-SUP-40 ignores late list' }],
    edits: [['active = false;', 'active = true;']] },
  { id: 'FE-37-04', name: 'the draft load on the create page does not drop its cleanup on unmount or reload, so a superseded load replaces the newer draft (EVE-DRF-SUP-31)', file: PAGE, suites: ['drafts'],
    testMappings: [{ suite: 'drafts', file: 'src/features/events/pages/drafts/DraftWorkflow.test.tsx', title: 'EVE-DRF-SUP-31 ignores late load' }],
    edits: [['active = false;', 'active = true;']] },
];
