// SPM-177 frontend mutants: the three clarification notices in the top-bar bell (the Coordinator's filter, the row icon).
// Each mutant maps to its CLARIFY-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const ITEM_TEST = 'src/components/notifications/NotificationItem.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ITEM = 'src/components/notifications/NotificationItem.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'clarificationNotices', file: BELL_TEST, title: `CLARIFY-NOTIF-${id}` }));
const item = (...ids) => ids.map((id) => ({ suite: 'clarificationNotices', file: ITEM_TEST, title: `CLARIFY-NOTIF-${id}` }));

export const SUITES = {
  clarificationNotices: {
    args: ['run', BELL_TEST, ITEM_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM177-FE-01',
    name: "the Coordinator's bell filters out all three clarification types",
    file: BELL,
    suites: ['clarificationNotices'],
    testMappings: bell('07-B'),
    edits: [['  "clarification",\n  "clarification_reply",\n  "clarification_resolved",\n];', '];']],
  },
  {
    id: 'SPM177-FE-02',
    name: "the Coordinator's bell filters out clarification_reply",
    file: BELL,
    suites: ['clarificationNotices'],
    testMappings: bell('07-B'),
    edits: [['  "clarification_reply",\n  "clarification_resolved",\n];', '  "clarification_resolved",\n];']],
  },
  {
    id: 'SPM177-FE-03',
    name: "the Coordinator's bell filters out clarification_resolved",
    file: BELL,
    suites: ['clarificationNotices'],
    testMappings: bell('07-B'),
    edits: [['  "clarification_resolved",\n];', '];']],
  },
  {
    id: 'SPM177-FE-04',
    name: 'the clarification_reply icon entry is removed',
    file: ITEM,
    suites: ['clarificationNotices'],
    testMappings: item('08-A'),
    edits: [['  clarification_reply: "💬",\n', '']],
  },
  {
    id: 'SPM177-FE-05',
    name: 'the clarification_resolved icon entry is removed',
    file: ITEM,
    suites: ['clarificationNotices'],
    testMappings: item('08-A'),
    edits: [['  clarification_resolved: "✅",\n', '']],
  },
];
