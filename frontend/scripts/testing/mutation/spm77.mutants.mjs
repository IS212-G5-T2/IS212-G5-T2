// SPM-77 frontend mutants: the Coordinator's assignment notices in the top-bar bell (who gets the bell, which types it
// lists, link and mark-read behaviour, unassignment without a link, unread count, no panel on the events page).
// Each mutant maps to its ASSIGN-NOTIFY test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const LIST_TEST = 'src/features/events/pages/list/EventListPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const FEED = 'src/components/notifications/useNotificationFeed.ts';
const LIST_PAGE = 'src/features/events/pages/list/EventListPage.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'notifications', file: BELL_TEST, title: `ASSIGN-NOTIFY-${id} ` }));
const list = (...ids) => ids.map((id) => ({ suite: 'notifications', file: LIST_TEST, title: `ASSIGN-NOTIFY-${id} ` }));

export const SUITES = {
  notifications: {
    args: ['run', BELL_TEST, LIST_TEST],
  },
};

const IS_COORDINATOR = 'const isCoordinator = !isOrganiser && hasRole(user, "coordinator");';

export const MUTANTS = [
  {
    id: 'SPM77-FE-01',
    name: 'bell stays organiser-only (no bell for a Coordinator)',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('01-C', '01-D', '02-C', '03-C', '04-C', '04-D', '04-E', '06-A', '06-B', '06-C'),
    edits: [[IS_COORDINATOR, 'const isCoordinator = false;']],
  },
  {
    id: 'SPM77-FE-02',
    name: 'Coordinator detected from the primary role only (multi-role Coordinator gets no bell)',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('01-D'),
    edits: [[IS_COORDINATOR, 'const isCoordinator = !isOrganiser && user.role === "coordinator";']],
  },
  {
    id: 'SPM77-FE-03',
    name: 'bell opened to every signed-in role',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('01-E'),
    edits: [[IS_COORDINATOR, 'const isCoordinator = !isOrganiser;']],
  },
  {
    id: 'SPM77-FE-04',
    name: 'Coordinator bell lists every notification type returned (no type filter)',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('06-C'),
    edits: [['filter: isCoordinator ? isCoordinatorNotice : undefined,', 'filter: undefined,']],
  },
  {
    id: 'SPM77-FE-05',
    name: 'reassignment notices left out of the Coordinator bell',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('06-A', '04-C'),
    edits: [['  "coordinator_reassignment",\n', '']],
  },
  {
    id: 'SPM77-FE-06',
    name: 'unassignment notices left out of the Coordinator bell',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('06-B', '04-C'),
    edits: [['  "coordinator_unassignment",\n', '']],
  },
  {
    id: 'SPM77-FE-07',
    name: 'assignment notices left out of the Coordinator bell',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('01-C', '01-D', '02-C', '03-C', '04-C', '04-D', '04-E'),
    edits: [['  "coordinator_assignment",\n', '']],
  },
  {
    id: 'SPM77-FE-08',
    name: 'unassignment notice links to an event the Coordinator no longer has',
    file: ROW,
    suites: ['notifications'],
    testMappings: bell('06-B'),
    edits: [['const hasLink = n.type !== "coordinator_unassignment";', 'const hasLink = true;']],
  },
  {
    id: 'SPM77-FE-09',
    name: 'View Request on an assignment does not mark it read',
    file: ROW,
    suites: ['notifications'],
    testMappings: bell('03-C', '06-A'),
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (false) onMarkRead(n.id);']],
  },
  {
    id: 'SPM77-FE-10',
    name: 'assignment link goes to the events list instead of the event',
    file: ROW,
    suites: ['notifications'],
    testMappings: bell('03-C', '06-A'),
    edits: [['`/events/${n.relatedEventId}`}\n', '`/events`}\n']],
  },
  {
    id: 'SPM77-FE-11',
    name: 'notice message (event name, assignment wording, proposed date) not shown',
    file: ROW,
    suites: ['notifications'],
    testMappings: bell('01-C', '02-C'),
    edits: [['if (type !== "change_request_denied") return message;', 'if (type !== "change_request_denied") return "";']],
  },
  {
    id: 'SPM77-FE-12',
    name: 'notification time not rendered as a time element',
    file: ROW,
    suites: ['notifications'],
    testMappings: bell('02-C'),
    edits: [
      ['<time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>', '<span title={formatDateTime(n.createdAt)}>'],
      ['{timeAgo(n.createdAt)}\n            </time>', '{timeAgo(n.createdAt)}\n            </span>'],
      ['<time dateTime={n.createdAt}>{decisionDate}</time>', '<span>{decisionDate}</span>'],
    ],
  },
  {
    id: 'SPM77-FE-13',
    name: 'bell counts and lists read notices',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('04-C', '04-E'),
    edits: [['.filter((n) => !n.read)', '.filter(() => true)']],
  },
  {
    id: 'SPM77-FE-14',
    name: 'Mark As Read does not call the server',
    file: FEED,
    suites: ['notifications'],
    testMappings: bell('04-D', '03-C'),
    edits: [['await api(`/notifications/${id}/read`, { method: "POST" });', 'await Promise.resolve();']],
  },
  {
    id: 'SPM77-FE-15',
    name: 'Mark As Read leaves the notice unread in the bell',
    file: FEED,
    suites: ['notifications'],
    testMappings: bell('04-D'),
    edits: [['setNotifications((items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));', 'setNotifications((items) => items);']],
  },
  {
    id: 'SPM77-FE-16',
    name: 'Assignment Updates panel back on the Coordinator events page',
    file: LIST_PAGE,
    suites: ['notifications'],
    testMappings: list('01-F'),
    edits: [['      <PageHeader\n        title={isPlanning', '      <section aria-label="Assignment updates"><h2>Assignment Updates</h2></section>\n      <PageHeader\n        title={isPlanning']],
  },
  {
    id: 'SPM77-FE-17',
    name: 'events page loads the notifications feed for the Coordinator again',
    file: LIST_PAGE,
    suites: ['notifications'],
    testMappings: list('01-F'),
    edits: [
      ['import { useAppStore } from "@/store/useAppStore";', 'import { useAppStore } from "@/store/useAppStore";\nimport { useNotificationFeed } from "@/components/notifications/useNotificationFeed";'],
      ['      <PageHeader\n        title={isPlanning', '      <FeedProbe />\n      <PageHeader\n        title={isPlanning'],
      ['export function EventListPage() {', 'function FeedProbe() {\n  useNotificationFeed({ enabled: true, userId: "x", loadError: "x" });\n  return null;\n}\n\nexport function EventListPage() {'],
    ],
  },
  {
    id: 'SPM77-FE-18',
    name: 'Coordinator bell shows the organiser load error text',
    file: BELL,
    suites: ['notifications'],
    testMappings: bell('04-F'),
    edits: [['"Could not load your assignment notifications."', '"Could not load request decisions."']],
  },
];
