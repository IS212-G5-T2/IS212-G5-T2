// SPM-94 frontend mutants (Track My Event Status, Organiser), run by the frontend runner:
//   node scripts/testing/mutation/run.mjs --mutants spm94.mutants.mjs            # every mutant
//   node scripts/testing/mutation/run.mjs --mutants spm94.mutants.mjs --only M12
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// The runner mutates a scratch copy only and proves the original files untouched.
// M9 and M12 are spec mutants; X4 to X6 are extra mutants found while writing the suite.
export const SUITES = {
  spm94: {
    args: [
      'run',
      'src/features/events/components/StatusIndicators.test.tsx',
      'src/features/events/pages/detail/EventDetailPage.status.test.tsx',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/store/useAppStore.logout.test.ts',
    ],
  },
};

const INDICATORS = 'src/features/events/components/StatusIndicators.tsx';
const STORE = 'src/store/useAppStore.ts';
const LIST = 'src/features/events/pages/list/EventListPage.tsx';
const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';

export const MUTANTS = [
  { id: 'M9', name: 'two safety indicators rendered at once (03-B)', file: INDICATORS,
    edits: [['if (!event.safetyIndicator) return null;',
      'if (!event.safetyIndicator) return null;\n  if (event.safetyIndicator === "AWAITING_CHECK") return <><span>Safety changes requested</span><span>Safety check cleared</span></>;']],
    suites: ['spm94'] },
  { id: 'M12', name: 'events store not cleared on logout (04-B C)', file: STORE,
    edits: [['currentUser: PLACEHOLDER_USER, events: [] });', 'currentUser: PLACEHOLDER_USER });']],
    suites: ['spm94'] },
  { id: 'X4', name: 'assignment indicator shown without the server flag (02-A, 02-B)', file: INDICATORS,
    edits: [['if (!event.awaitingCoordinatorAssignment) return null;', '']],
    suites: ['spm94'] },
  { id: 'X5', name: 'planning-page indicators removed (02-A, 03-A, 03-B on the detail page)', file: DETAIL,
    edits: [['{isOwner && (\n            <div className="mb-6 flex flex-wrap gap-2">', '{false && (\n            <div className="mb-6 flex flex-wrap gap-2">']],
    suites: ['spm94'] },
  { id: 'X6', name: 'drafts fetched for every role, and a superseded drafts response kept (01-A drafts)', file: LIST,
    edits: [['if (currentUser.role !== "organiser") return;', ''],
      ['return () => { active = false; };\n  }, [currentUser.role, retry]);', 'return () => {};\n  }, [currentUser.role, retry]);']],
    suites: ['spm94'] },
  { id: 'X7', name: 'detail page skips the refetch when the store already holds the event (04-B revisit)', file: DETAIL,
    edits: [['    setLoading(true); setLoadError("");\n    api<EventRecord>(',
      '    setLoading(true); setLoadError("");\n    if (useAppStore.getState().events.some((e) => e.id === id)) { setLoading(false); return; }\n    api<EventRecord>(']],
    suites: ['spm94'] },
  { id: 'X8', name: 'events cleared on logout only when the request succeeds (04-B C)', file: STORE,
    edits: [['    try {\n      await logout();\n    } finally {\n      // SPM-94 AC4 / 04-B C: nothing from the previous session survives logout.\n      set({ isAuthenticated: false, authLoading: false, currentUser: PLACEHOLDER_USER, events: [] });',
      '    try {\n      await logout();\n      set({ events: [] });\n    } finally {\n      set({ isAuthenticated: false, authLoading: false, currentUser: PLACEHOLDER_USER });']],
    suites: ['spm94'] },
  { id: 'X9', name: 'list page drops the indicator fields before the card (01-A, AC2, AC3)', file: LIST,
    edits: [['              key={e.id}\n              event={e}',
      '              key={e.id}\n              event={{ ...e, awaitingCoordinatorAssignment: undefined, safetyIndicator: undefined }}']],
    suites: ['spm94'] },
];
