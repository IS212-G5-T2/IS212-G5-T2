// SPM-95 frontend mutants (Filter My Events by Status), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm95.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file.
// M1–M5 target the core filter predicate (organiserStatusFilter.ts).
// M6–M8 target the EventListPage filter UI branches.
export const SUITES = {
  spm95: {
    args: [
      'run',
      'src/features/events/lib/organiserStatusFilter.test.ts',
      'src/features/events/components/StatusLabels.test.tsx',
      'src/features/events/components/StatusIndicators.test.tsx',
      'src/features/events/pages/list/EventListPage.test.tsx',
      'src/features/events/pages/list/EventListPage.planning.test.tsx',
    ],
  },
};

const FILTER = 'src/features/events/lib/organiserStatusFilter.ts';
const LABELS = 'src/features/events/components/StatusLabels.tsx';
const PAGE = 'src/features/events/pages/list/EventListPage.tsx';

export const MUTANTS = [
  { id: 'M1', name: 'empty-set guard removed: no filter selected no longer matches every event (AC1)', file: FILTER,
    edits: [['  if (selected.size === 0) return true;', '  // if (selected.size === 0) return true;']],
    suites: ['spm95'] },
  { id: 'M2', name: 'OR changed to AND: event must satisfy every selected filter instead of any one (AC2)', file: FILTER,
    edits: [['  return [...selected].some((filter) => {', '  return [...selected].every((filter) => {']],
    suites: ['spm95'] },
  { id: 'M3', name: 'safetyCheckReady gate dropped: arrangements state not checked for virtual filter (AC5)', file: FILTER,
    edits: [['        return event.safetyIndicator === "AWAITING_CHECK" && safetyCheckReady(event);', '        return event.safetyIndicator === "AWAITING_CHECK";']],
    suites: ['spm95'] },
  { id: 'M4', name: 'AWAITING_CHECK negated: wrong safety indicator matches the virtual filter (AC5)', file: FILTER,
    edits: [['event.safetyIndicator === "AWAITING_CHECK" && safetyCheckReady(event)', 'event.safetyIndicator !== "AWAITING_CHECK" && safetyCheckReady(event)']],
    suites: ['spm95'] },
  { id: 'M5', name: 'safetyCheckReady length guard added back: no-equipment events excluded from virtual filter (AC5)', file: LABELS,
    edits: [
      ['  return event.status === "planning" && event.venueRequestStatus === "approved" && statuses.every((s) => s === "Reserved");',
       '  return event.status === "planning" && event.venueRequestStatus === "approved" && statuses.length > 0 && statuses.every((s) => s === "Reserved");'],
    ],
    suites: ['spm95'] },
  { id: 'M6', name: 'active-filter text omitted: organiser cannot see which filters are active (AC3)', file: PAGE,
    edits: [['          {selectedOrganiserLabels.length > 0 && (', '          {false && (']],
    suites: ['spm95'] },
  { id: 'M7', name: 'no-match message removed: empty result gives no feedback (AC4)', file: PAGE,
    edits: [['          {isOrganiser ? "No matching events found" : "No events match this filter."}', '          {""}']],
    suites: ['spm95'] },
  // M8 EQUIVALENT: changing the lazy initialiser `() => new Set()` to `new Set()` gives identical mount-time behaviour —
  // both create an empty set on every mount, so the remount-reset assertion (AC7) cannot distinguish them.
  // The real AC7 risk (filters persisting in a global store) is covered by M1 and the Zustand null assertion in FILTER-EVT-07-A.
  { id: 'M8', name: 'EQUIVALENT: lazy initialiser vs eager new Set() — both empty on every mount (AC7)', file: PAGE,
    edits: [['  const [organiserFilters, setOrganiserFilters] = useState<ReadonlySet<OrganiserStatusFilter>>(() => new Set());',
             '  const [organiserFilters, setOrganiserFilters] = useState<ReadonlySet<OrganiserStatusFilter>>(new Set());']],
    suites: ['spm95'],
    equivalent: true },
];
