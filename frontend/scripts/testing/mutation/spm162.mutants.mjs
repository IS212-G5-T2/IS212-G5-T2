// SPM-162 frontend mutants: the Organiser's cancellation request outcome notices in the top-bar bell (which notices the
// bell lists for each role, the full message and decision time, the /events/<id> link, mark-read on opening, the
// unread count). Each mutant maps to its CANCEL-OUTCOME test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'outcomeNotices', file: BELL_TEST, title: `CANCEL-OUTCOME-${id}` }));

export const SUITES = {
  outcomeNotices: {
    args: ['run', BELL_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM162-FE-01',
    name: "the Coordinator's bell also lists the accepted outcome type",
    file: BELL,
    suites: ['outcomeNotices'],
    testMappings: bell('01-H'),
    edits: [['  "coordinator_safety_response",\n', '  "coordinator_safety_response",\n  "cancellation_request_accepted",\n']],
  },
  {
    id: 'SPM162-FE-02',
    name: 'an outcome notice links to the Change Requests page instead of the event page',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('04-B', '04-C'),
    edits: [['new Set<Notification["type"]>(["change_request_approved", "change_request_denied"])', 'new Set<Notification["type"]>(["change_request_approved", "change_request_denied", "cancellation_request_accepted", "cancellation_request_declined"])']],
  },
  {
    id: 'SPM162-FE-03',
    name: 'an outcome notice links to the Bookings page instead of the event page',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('04-B', '04-C'),
    edits: [['new Set<Notification["type"]>(["venue_booking_approved", "venue_booking_rejected"])', 'new Set<Notification["type"]>(["venue_booking_approved", "venue_booking_rejected", "cancellation_request_accepted", "cancellation_request_declined"])']],
  },
  {
    id: 'SPM162-FE-04',
    name: "the Organiser's bell hides outcome notices",
    file: BELL,
    suites: ['outcomeNotices'],
    testMappings: bell('01-G', '02-F', '04-B', '04-C', '05-D', '05-E', '05-F'),
    edits: [['filter: isCoordinator ? isCoordinatorNotice : undefined,', 'filter: isCoordinator ? isCoordinatorNotice : (n: Notification) => !n.type.startsWith("cancellation_request"),']],
  },
  {
    id: 'SPM162-FE-05',
    name: 'following an outcome notice does not mark it read',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('04-B', '04-C'),
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (!isChangeRequest && !n.type.startsWith("cancellation_request")) onMarkRead(n.id);']],
  },
  {
    id: 'SPM162-FE-06',
    name: 'the row shortens an outcome message to its first sentence',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('01-G', '02-F'),
    edits: [['  if (type !== "change_request_denied") return message;', '  if (type !== "change_request_denied") return message.split(". ")[0];']],
  },
  {
    id: 'SPM162-FE-07',
    name: 'the decision time is no longer shown',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('02-F'),
    edits: [['{decisionDate && (', '{false && decisionDate && (']],
  },
  {
    id: 'SPM162-FE-08',
    name: 'Mark As Read no longer posts the read call',
    file: ROW,
    suites: ['outcomeNotices'],
    testMappings: bell('05-E'),
    edits: [['            onClick={() => onMarkRead(n.id)}\n          >\n            Mark As Read', '            onClick={() => undefined}\n          >\n            Mark As Read']],
  },
  {
    id: 'SPM162-FE-09',
    name: 'the unread dot and count treat an outcome notice as read',
    file: BELL,
    suites: ['outcomeNotices'],
    testMappings: bell('01-G', '05-D', '05-F'),
    edits: [['.filter((n) => !n.read)', '.filter((n) => !n.read && !n.type.startsWith("cancellation_request"))']],
  },
];
