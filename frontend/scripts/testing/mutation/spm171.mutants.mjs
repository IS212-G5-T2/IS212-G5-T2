// SPM-171 frontend mutants: the assigned Coordinator's "requested to cancel" notice in the top-bar bell (which notices the
// Coordinator's bell lists, the full message and submission time, the /events/<id> link, mark-read on opening, the unread
// count). Each mutant maps to its CANCEL-REQ-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'requestNotices', file: BELL_TEST, title: `CANCEL-REQ-NOTIF-${id}` }));

export const SUITES = {
  requestNotices: {
    args: ['run', BELL_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM171-FE-01',
    name: "the Coordinator's bell does not list the notice",
    file: BELL,
    suites: ['requestNotices'],
    testMappings: bell('01-E', '02-D', '03-A', '03-B', '04-A', '04-B', '04-C'),
    edits: [['  "venue_capacity_impact",\n  "cancellation_request_submitted",\n];', '  "venue_capacity_impact",\n];']],
  },
  {
    id: 'SPM171-FE-02',
    name: 'the notice links to the Change Requests page instead of the event page',
    file: ROW,
    suites: ['requestNotices'],
    testMappings: bell('03-A', '03-B'),
    edits: [['new Set<Notification["type"]>(["change_request_approved", "change_request_denied"])', 'new Set<Notification["type"]>(["change_request_approved", "change_request_denied", "cancellation_request_submitted"])']],
  },
  {
    id: 'SPM171-FE-03',
    name: 'the notice links to the Bookings page instead of the event page',
    file: ROW,
    suites: ['requestNotices'],
    testMappings: bell('03-A', '03-B'),
    edits: [['  "venue_capacity_impact",\n]);', '  "venue_capacity_impact",\n  "cancellation_request_submitted",\n]);']],
  },
  {
    id: 'SPM171-FE-04',
    name: 'following the notice does not mark it read',
    file: ROW,
    suites: ['requestNotices'],
    testMappings: bell('03-A', '03-B'),
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (!isChangeRequest && n.type !== "cancellation_request_submitted") onMarkRead(n.id);']],
  },
  {
    id: 'SPM171-FE-05',
    name: 'the row shortens the notice to its first words',
    file: ROW,
    suites: ['requestNotices'],
    testMappings: bell('02-D'),
    edits: [['  if (type !== "change_request_denied") return message;', '  if (type === "cancellation_request_submitted") return message.split(" requested")[0];\n  if (type !== "change_request_denied") return message;']],
  },
];
