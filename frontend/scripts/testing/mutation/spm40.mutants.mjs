// SPM-40 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  approve: { args: ['run', 'src/store/useAppStore.decisions.test.ts', 'src/features/events/pages/detail/EventDetailPage.decision.test.tsx', 'src/features/events/pages/list/EventListPage.test.tsx', 'src/components/notifications/NotificationBell.test.tsx'] },
};

const STORE = 'src/store/useAppStore.ts';

export const MUTANTS = [
  { id: 'FE-40-01', name: 'the approved request keeps its Submitted status in the store, so it stays in the pending view (EVENT-APPROVE-02-A/C)', file: STORE, suites: ['approve'],
    edits: [['? { ...event, status: "approved" as const, updatedAt: new Date().toISOString() }', '? { ...event, status: "submitted" as const, updatedAt: new Date().toISOString() }']] },
];
