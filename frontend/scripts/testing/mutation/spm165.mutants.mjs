// SPM-165 frontend mutants: the Coordinator's tentative hold decision notices in the top-bar bell (which types the bell
// lists, the /bookings?booking=<id> link and its fallback, mark-read) and the details dialog the link opens for a hold
// (request type, hold expiry once approved, none for a rejected hold, expired label). Each mutant maps to its
// VENUE-HOLD-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const PAGE_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const DIALOG = 'src/features/bookings/pages/requests/CoordinatorBookingDialog.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'holdNotices', file: BELL_TEST, title: `VENUE-HOLD-NOTIF-${id} ` }));
const page = (...ids) => ids.map((id) => ({ suite: 'holdNotices', file: PAGE_TEST, title: `VENUE-HOLD-NOTIF-${id} ` }));

export const SUITES = {
  holdNotices: {
    args: ['run', BELL_TEST, PAGE_TEST],
  },
};

export const MUTANTS = [
  {
    id: 'SPM165-FE-01',
    name: "the Coordinator's bell lists neither tentative hold decision type",
    file: BELL,
    suites: ['holdNotices'],
    testMappings: bell('01-G', '02-F', '03-A', '03-B', '03-C', '04-D', '05-C'),
    edits: [['  ...VENUE_DECISION_NOTICE_TYPES,\n', '  ...VENUE_DECISION_NOTICE_TYPES.filter((type) => !type.startsWith("tentative_hold")),\n']],
  },
  {
    id: 'SPM165-FE-02',
    name: "the Coordinator's bell lists approved hold notices but not rejected ones",
    file: BELL,
    suites: ['holdNotices'],
    testMappings: bell('01-G', '02-F', '03-B', '05-C'),
    edits: [['  ...VENUE_DECISION_NOTICE_TYPES,\n', '  ...VENUE_DECISION_NOTICE_TYPES.filter((type) => type !== "tentative_hold_rejected"),\n']],
  },
  {
    id: 'SPM165-FE-03',
    name: 'the row no longer treats hold types as booking notices, so a hold notice links to the event page',
    file: ROW,
    suites: ['holdNotices'],
    testMappings: bell('03-A', '03-B', '03-C', '05-C'),
    edits: [['  ...VENUE_DECISION_NOTICE_TYPES,\n', '  ...VENUE_DECISION_NOTICE_TYPES.filter((type) => !type.startsWith("tentative_hold")),\n']],
  },
  {
    id: 'SPM165-FE-04',
    name: 'a hold notice links to /bookings without the hold id',
    file: ROW,
    suites: ['holdNotices'],
    testMappings: bell('03-A', '03-B', '05-C'),
    edits: [['`/bookings?booking=${encodeURIComponent(n.relatedBookingId)}`', '"/bookings"']],
  },
  {
    id: 'SPM165-FE-05',
    name: 'the dialog never shows the request type of a tentative hold',
    file: DIALOG,
    suites: ['holdNotices'],
    testMappings: page('03-D'),
    edits: [['booking.requestKind === "tentative_hold" && (\n          <div>\n            <dt className="text-gray-400 dark:text-gray-500">Request type', 'false && (\n          <div>\n            <dt className="text-gray-400 dark:text-gray-500">Request type']],
  },
  {
    id: 'SPM165-FE-06',
    name: 'the dialog never shows the hold expiry of an approved hold',
    file: DIALOG,
    suites: ['holdNotices'],
    testMappings: page('03-D', '03-F'),
    edits: [['booking.requestKind === "tentative_hold" && (booking.status === "approved" || booking.status === "expired") && booking.holdExpiresAt', 'false']],
  },
  {
    id: 'SPM165-FE-07',
    name: 'the dialog shows a hold expiry for a hold that was rejected',
    file: DIALOG,
    suites: ['holdNotices'],
    testMappings: page('03-E'),
    edits: [['booking.requestKind === "tentative_hold" && (booking.status === "approved" || booking.status === "expired") && booking.holdExpiresAt', 'booking.requestKind === "tentative_hold" && booking.holdExpiresAt']],
  },
  {
    id: 'SPM165-FE-08',
    name: 'an expired hold is labelled as still expiring',
    file: DIALOG,
    suites: ['holdNotices'],
    testMappings: page('03-F'),
    edits: [['{booking.holdExpired ? "Hold expired" : "Hold expires"}', '{"Hold expires"}']],
  },
  {
    id: 'SPM165-FE-09',
    name: 'an ordinary booking is shown as a tentative hold',
    file: DIALOG,
    suites: ['holdNotices'],
    testMappings: page('03-F'),
    edits: [['booking.requestKind === "tentative_hold" && (\n          <div>\n            <dt className="text-gray-400 dark:text-gray-500">Request type', 'booking.requestKind !== undefined && (\n          <div>\n            <dt className="text-gray-400 dark:text-gray-500">Request type']],
  },
];
