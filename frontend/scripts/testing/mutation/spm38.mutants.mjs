// SPM-38 frontend mutants, run by the component runner (see ai/docs/test-workflow.md section 7, G6).
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Each mutant names the behaviour it breaks. The runner mutates a scratch copy only.

export const SUITES = {
  detail: { args: ['run', 'src/features/events/pages/detail/EventDetailPage.test.tsx', 'src/features/events/pages/detail/EventDetailPage.decision.test.tsx'] },
};

const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';

export const MUTANTS = [
  { id: 'FE-38-01', name: 'the Review Event entrypoint is shown to every coordinator, not only the assigned one (EVE-REV-04-A/B)', file: DETAIL, suites: ['detail'],
    edits: [['{isAssignedCoordinator && event.status === "submitted" && (', '{currentUser.role === "coordinator" && event.status === "submitted" && (']] },
];
