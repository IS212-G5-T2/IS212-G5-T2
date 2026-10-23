// SPM-48 frontend mutants (Monitor Workspace Queue & Status, Coordinator), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm48.mutants.mjs
//   node scripts/testing/mutation/run.mjs --mutants spm48.mutants.mjs --only F2
// Each edit is [from, to]; `from` must occur exactly once in the file. No mutant is claimed equivalent.
export const SUITES = {
  spm48: {
    args: [
      'run',
      'src/features/events/pages/list/EventListPage.queue.test.tsx',
      'src/features/events/components/QueueIndicators.test.tsx',
      'src/components/ui/StatusBadge.test.tsx',
      'src/features/events/components/StatusLabels.test.tsx',
      'src/utils/format.test.ts',
      'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx',
      'src/store/useAppStore.logout.test.ts',
    ],
  },
};

const PAGE = 'src/features/events/pages/list/EventListPage.tsx';
const CARD = 'src/features/events/pages/list/EventCard.tsx';
const INDICATORS = 'src/features/events/components/QueueIndicators.tsx';
const BADGE = 'src/components/ui/StatusBadge.tsx';
const LABELS = 'src/features/events/components/StatusLabels.tsx';
const FORMAT = 'src/utils/format.ts';
const PLANNING = 'src/features/events/pages/detail/planning/PlanningInformationPage.tsx';
const STORE = 'src/store/useAppStore.ts';
const s = ['spm48'];

export const MUTANTS = [
  { id: 'F1', name: 'coordinator reads /events instead of the queue (01-A)', file: PAGE,
    edits: [['  const readsQueue = currentUser.role === "coordinator";', '  const readsQueue = false;']], suites: s },
  { id: 'F2', name: 'coordinator default back to Submitted (01-A)', file: PAGE,
    edits: [['  const statusFilter = eventListFilters.status ?? "";', '  const statusFilter = eventListFilters.status ?? (currentUser.role === "coordinator" ? "submitted" : "");']], suites: s },
  { id: 'F3', name: 'All statuses option removed from the coordinator filter (02-A)', file: PAGE,
    edits: [['options={isCoordinator ? statusOptions : statusOptions.filter((o) => o.value !== "")}', 'options={statusOptions.filter((o) => o.value !== "")}']], suites: s },
  { id: 'F4', name: 'Needs action marker shown on every queue card (05-B)', file: INDICATORS,
    edits: [['  if (!queue.needsAction) return null;', '']], suites: s },
  { id: 'F5', name: 'queue safety label replaced by the SPM-94 indicator (06-A)', file: CARD,
    edits: [['{event.queue ? <QueueSafetyLabel queue={event.queue} /> : !attendeeView && <SafetyIndicator event={event} />}', '{!attendeeView && <SafetyIndicator event={event} />}']], suites: s },
  { id: 'F6', name: 'venue notes not rendered (08-A, 09-A)', file: CARD,
    edits: [['{event.queue && <QueueVenueNotes queue={event.queue} />}', '']], suites: s },
  { id: 'F7', name: 'expired hold worded as active (08-B)', file: INDICATORS,
    edits: [['hold.state === "ACTIVE" ? (', 'true ? (']], suites: s },
  { id: 'F8', name: 'hold expiry shown in the runner’s zone instead of SGT (08-A)', file: FORMAT,
    edits: [['    timeZone: "Asia/Singapore",\n    day: "2-digit",\n    month: "short",\n    year: "numeric",\n    hour: "2-digit",\n    minute: "2-digit",\n    hourCycle: "h23",\n  });\n  return `${formatter.format(new Date(value))} SGT`;', '    timeZone: "UTC",\n    day: "2-digit",\n    month: "short",\n    year: "numeric",\n    hour: "2-digit",\n    minute: "2-digit",\n    hourCycle: "h23",\n  });\n  return `${formatter.format(new Date(value))} SGT`;']], suites: s },
  { id: 'F9', name: 'Planning shares the Submitted colour again (05-A)', file: BADGE,
    edits: [['  planning: "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300",', '  planning: "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300",']], suites: s },
  { id: 'F10', name: 'Cancelled shares the Rejected colour again (05-A)', file: BADGE,
    edits: [['  cancelled: "bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900",', '  cancelled: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",']], suites: s },
  { id: 'F11', name: 'reserved-venue claim kept when the venue is unavailable (09-A)', file: CARD,
    edits: [['  if (!event.queue?.unavailableVenues.length) return labels;', '  return labels;']], suites: s },
  { id: 'F12', name: 'rejected safety check labelled Not Requested (07-C)', file: LABELS,
    edits: [['    case "rejected":\n      return { label: "Rejected", tone: "red" };\n', '']], suites: s },
  { id: 'F13', name: 'no re-request for a rejected safety check (07-C)', file: PLANNING,
    edits: [['            {safety.status === "rejected" && (', '            {false && (']], suites: s },
  // F14 comes from Test Review 1 (TR-02, probe R3): a queue card shows the safety state once.
  { id: 'F14', name: 'queue card shows the SPM-94 safety indicator as well as the queue label (06-A shown once)', file: CARD,
    edits: [['{event.queue ? <QueueSafetyLabel queue={event.queue} /> : !attendeeView && <SafetyIndicator event={event} />}',
             '{event.queue && <QueueSafetyLabel queue={event.queue} />}{!attendeeView && <SafetyIndicator event={event} />}']], suites: s },
  // F15 comes from Code Quality Review 1 (CQ-48-01): the reasons are text screen readers announce.
  { id: 'F15', name: 'needs-action reasons not in the accessible text (05-B)', file: INDICATORS,
    edits: [['      <span className="sr-only">{`: ${reasons}`}</span>\n', '']], suites: s },
  // F16 and F17 come from the PR #80 review: event list filters never outlive a session.
  { id: 'F16', name: 'event list filters kept on logout (01-A)', file: STORE,
    edits: [['        events: [],\n        eventListFilters: { ...DEFAULT_EVENT_LIST_FILTERS },\n', '        events: [],\n']], suites: s },
  { id: 'F17', name: 'event list filters kept on a new login (01-A)', file: STORE,
    edits: [['authLoading: false, eventListFilters: { ...DEFAULT_EVENT_LIST_FILTERS } });', 'authLoading: false });']], suites: s },
];
