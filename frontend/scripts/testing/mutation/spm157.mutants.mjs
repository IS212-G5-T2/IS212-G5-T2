// SPM-157 frontend mutants: the history client, the event history page and its display rules (which sections are shown and in which
// order, how values and changes read, grouping by Singapore day, the author and reason of each entry, the error
// state, and who sees View History on the event page). Each mutant maps to the AUDIT-HISTORY tests that kill it.
const API_TEST = 'src/features/events/api/event-history-api.test.ts';
const RULES_TEST = 'src/features/events/lib/eventHistory.test.ts';
const PAGE_TEST = 'src/features/events/pages/history/EventHistoryPage.test.tsx';
const DETAIL_TEST = 'src/features/events/pages/detail/EventDetailPage.history.test.tsx';
const API = 'src/features/events/api/event-history-api.ts';
const RULES = 'src/features/events/lib/eventHistory.ts';
const PAGE = 'src/features/events/pages/history/EventHistoryPage.tsx';
const DETAIL = 'src/features/events/pages/detail/EventDetailPage.tsx';
const client = (...titles) => titles.map((title) => ({ suite: 'history', file: API_TEST, title }));
const rules = (...titles) => titles.map((title) => ({ suite: 'history', file: RULES_TEST, title }));
const page = (...titles) => titles.map((title) => ({ suite: 'history', file: PAGE_TEST, title }));
const detail = (...titles) => titles.map((title) => ({ suite: 'history', file: DETAIL_TEST, title }));

export const SUITES = {
  history: {
    args: ['run', API_TEST, RULES_TEST, PAGE_TEST, DETAIL_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM157-FE-01',
    name: 'sections shown in the order the server sent them instead of AC1 to AC4 order',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-08-B lists only the returned sections in order'),
    edits: [['return SECTION_ORDER.filter((section) => Array.isArray(history.sections[section]));', 'return Object.keys(history.sections) as HistorySection[];']],
  },
  {
    id: 'SPM157-FE-02',
    name: 'an instant shown as stored instead of in Singapore time',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-05-E formats each kind of value'),
    edits: [['return `${formatSgtDateTime(value)} SGT`;', 'return value;']],
  },
  {
    id: 'SPM157-FE-03',
    name: 'an empty value shown blank instead of "None"',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-05-E formats each kind of value'),
    edits: [['if (value === null || value === undefined || value === "") return "None";', 'if (value === null || value === undefined || value === "") return "";']],
  },
  {
    id: 'SPM157-FE-04',
    name: 'a removed value shown as a change to "None" instead of "removed"',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-05-E turns changes into readable lines'),
    edits: [['    } else if (isEmpty(change.to)) {', '    } else if (false) {']],
  },
  {
    id: 'SPM157-FE-05',
    name: 'a new slot merged into one range even when an end was already set',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-05-E merges a new slot into one time range only when both ends are new'),
    edits: [['start && end && isEmpty(start.from) && isEmpty(end.from) && typeof start.to', 'start && end && typeof start.to']],
  },
  {
    id: 'SPM157-FE-06',
    name: 'a message shown as a plain value instead of a quote',
    file: RULES,
    suites: ['history'],
    testMappings: [
      ...rules('AUDIT-HISTORY-05-E turns changes into readable lines'),
      ...page('AUDIT-HISTORY-05-E quotes messages and shows a new slot as one time range'),
    ],
    edits: [['const QUOTED_FIELDS = new Set(["message", "operationalNotes", "description", "purpose"]);', 'const QUOTED_FIELDS = new Set<string>([]);']],
  },
  {
    id: 'SPM157-FE-07',
    name: 'entries of different Singapore days grouped together',
    file: RULES,
    suites: ['history'],
    testMappings: rules('AUDIT-HISTORY-06-C groups entries by Singapore day in order'),
    edits: [['if (last && last.key === key) last.entries.push(entry);', 'if (last) last.entries.push(entry);']],
  },
  {
    id: 'SPM157-FE-08',
    name: 'the reason of an entry is not shown',
    file: PAGE,
    suites: ['history'],
    testMappings: page("AUDIT-HISTORY-05-E / 06-C shows each entry's change, author, time and reason in order"),
    edits: [['<span className="font-medium">Reason:</span> {entry.reason}', '<span className="font-medium">Reason:</span>']],
  },
  {
    id: 'SPM157-FE-09',
    name: 'a person is shown without "by", like the system',
    file: PAGE,
    suites: ['history'],
    testMappings: page("AUDIT-HISTORY-05-E / 06-C shows each entry's change, author, time and reason in order"),
    edits: [['{person ? `by ${entry.actor.name}` : entry.actor.name}', '{entry.actor.name}']],
  },
  {
    id: 'SPM157-FE-10',
    name: "the server's refusal replaced by the generic message",
    file: PAGE,
    suites: ['history'],
    testMappings: page("AUDIT-HISTORY-09-C shows the server's refusal"),
    edits: [['if (active) setError(e instanceof Error ? e.message : "Could not load the event history.");', 'if (active) setError("Could not load the event history.");']],
  },
  {
    id: 'SPM157-FE-11',
    name: 'the owner of a draft also sees View History',
    file: DETAIL,
    suites: ['history'],
    testMappings: detail('AUDIT-HISTORY-08-B shows View History to the owner of a submitted event but not of a draft'),
    edits: [['{(isAssignedCoordinator || (isOwner && event.status !== "draft")) && (', '{(isAssignedCoordinator || isOwner) && (']],
  },
  {
    id: 'SPM157-FE-12',
    name: 'any coordinator sees View History, not only the one assigned',
    file: DETAIL,
    suites: ['history'],
    testMappings: detail('AUDIT-HISTORY-09-C hides View History from %s'),
    edits: [['{(isAssignedCoordinator || (isOwner && event.status !== "draft")) && (', '{(currentUser.role === "coordinator" || isAssignedCoordinator || (isOwner && event.status !== "draft")) && (']],
  },
  {
    id: 'SPM157-FE-13',
    name: 'the event id is put into the path without encoding',
    file: API,
    suites: ['history'],
    testMappings: client('AUDIT-HISTORY-01-G reads the history of one event'),
    edits: [['`/events/${encodeURIComponent(eventId)}/history`', '`/events/${eventId}/history`']],
  },
];
