// SPM-137 frontend mutants: the Coordinator's venue booking decision notices in the top-bar bell (which types the bell
// lists, the /bookings?booking=<id> link and its fallback, mark-read on opening) and the Bookings page that opens the
// linked booking (details dialog, status and rejection reason, unknown or not-visible id, loading, closing, switching).
// Each mutant maps to its VENUE-BOOK-NOTIF test by ID prefix; the runner matches the prefix by name.
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const PAGE_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const PAGE = 'src/features/bookings/pages/requests/BookingsPage.tsx';
const DIALOG = 'src/features/bookings/pages/requests/CoordinatorBookingDialog.tsx';
const bell = (...ids) => ids.map((id) => ({ suite: 'bookingNotices', file: BELL_TEST, title: `VENUE-BOOK-NOTIF-${id} ` }));
const page = (...ids) => ids.map((id) => ({ suite: 'bookingNotices', file: PAGE_TEST, title: `VENUE-BOOK-NOTIF-${id} ` }));

export const SUITES = {
  bookingNotices: {
    args: ['run', BELL_TEST, PAGE_TEST],
  },
};

const LINKED_ID = 'const linkedId = searchParams.get("booking");';
const LINKED_UNAVAILABLE = 'const linkedUnavailable = !!linkedId && coordLoaded && !linkedBooking;';

export const MUTANTS = [
  {
    id: 'SPM137-FE-01',
    name: "the Coordinator's bell lists neither booking decision type",
    file: BELL,
    suites: ['bookingNotices'],
    testMappings: bell('01-G', '02-F', '03-A', '03-B', '03-C', '04-G', '04-H', '05-C'),
    edits: [['  ...VENUE_DECISION_NOTICE_TYPES,\n', '  ...VENUE_DECISION_NOTICE_TYPES.filter((type) => !type.startsWith("venue_booking")),\n']],
  },
  {
    id: 'SPM137-FE-02',
    name: "the Coordinator's bell lists approved booking notices but not rejected ones",
    file: BELL,
    suites: ['bookingNotices'],
    testMappings: bell('01-G', '02-F', '03-B', '05-C'),
    edits: [['  ...VENUE_DECISION_NOTICE_TYPES,\n', '  ...VENUE_DECISION_NOTICE_TYPES.filter((type) => type !== "venue_booking_rejected"),\n']],
  },
  {
    id: 'SPM137-FE-03',
    name: 'a booking notice links to the event page instead of the Bookings page',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('03-A', '03-B', '03-C', '05-C'),
    edits: [['const isBooking = BOOKING_NOTICES.has(n.type);', 'const isBooking = false;']],
  },
  {
    id: 'SPM137-FE-04',
    name: 'a booking notice links to /bookings without the booking id',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('03-A', '03-B', '05-C'),
    edits: [['`/bookings?booking=${encodeURIComponent(n.relatedBookingId)}`', '"/bookings"']],
  },
  {
    id: 'SPM137-FE-05',
    name: 'a booking notice with no booking id links to ?booking=undefined',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('03-C'),
    edits: [['      : "/bookings"', '      : "/bookings?booking=undefined"']],
  },
  {
    id: 'SPM137-FE-06',
    name: 'following a booking notice link does not mark it read',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('03-A', '05-C'),
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (!isChangeRequest && !isBooking) onMarkRead(n.id);']],
  },
  {
    id: 'SPM137-FE-07',
    name: 'the booking link label is the event link label',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('03-A', '03-B', '03-C', '05-C'),
    edits: [['const linkLabel = isBooking ? "View Booking"', 'const linkLabel = isBooking ? "View Request"']],
  },
  {
    id: 'SPM137-FE-08',
    name: 'the not-available notice is never shown for an unknown booking id',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-H'),
    edits: [[LINKED_UNAVAILABLE, 'const linkedUnavailable = false;']],
  },
  {
    id: 'SPM137-FE-09',
    name: 'the not-available notice appears before the bookings have loaded',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-I'),
    edits: [[LINKED_UNAVAILABLE, 'const linkedUnavailable = !!linkedId && !linkedBooking;']],
  },
  {
    id: 'SPM137-FE-10',
    name: 'the first booking is opened whatever id the link names',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-H', '03-K'),
    edits: [['coordinatorBookings.find((b) => b.id === linkedId)', 'coordinatorBookings[0]']],
  },
  {
    id: 'SPM137-FE-11',
    name: 'closing the details leaves the booking in the address',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-J', '03-H'),
    edits: [['        next.delete("booking");\n', '']],
  },
  {
    id: 'SPM137-FE-12',
    name: 'the details dialog cannot be closed',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-J'),
    edits: [['onClose={clearLinkedBooking} />', 'onClose={() => undefined} />']],
  },
  {
    id: 'SPM137-FE-13',
    name: 'the booking link is read only when the page first opens',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-K', '03-J'),
    edits: [[LINKED_ID, 'const [linkedId] = useState(() => searchParams.get("booking"));']],
  },
  {
    id: 'SPM137-FE-14',
    name: 'the details dialog never shows the rejection reason',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-G', '03-K'),
    edits: [['{booking.status === "rejected" && (', '{false && (']],
  },
  {
    id: 'SPM137-FE-15',
    name: 'the details dialog shows a rejection reason line for every status',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-D', '03-L'),
    edits: [['{booking.status === "rejected" && (', '{true && (']],
  },
  {
    id: 'SPM137-FE-16',
    name: 'the details dialog does not show the current status',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-D', '03-G', '03-L'),
    edits: [['dark:text-gray-100">{booking.status}</dd>', 'dark:text-gray-100">-</dd>']],
  },
  {
    id: 'SPM137-FE-17',
    name: 'a rejected booking with no stored reason shows a blank reason',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-G'),
    edits: [['booking.rejectionReason ?? "Not provided"', 'booking.rejectionReason ?? ""']],
  },
  {
    id: 'SPM137-FE-18',
    name: 'the details dialog omits the special request',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-D'),
    edits: [['{booking.specialRequest && (', '{false && (']],
  },
  {
    id: 'SPM137-FE-19',
    name: 'the details dialog shows the raw ISO times instead of Singapore time',
    file: DIALOG,
    suites: ['bookingNotices'],
    testMappings: page('03-D'),
    edits: [['{formatSingaporeRange(booking.start, booking.end)}', '{`${booking.start} – ${booking.end}`}']],
  },
  {
    id: 'SPM137-FE-20',
    name: 'the not-available notice is hidden when the Coordinator has no bookings at all',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-H'),
    edits: [[LINKED_UNAVAILABLE, 'const linkedUnavailable = !!linkedId && coordLoaded && !linkedBooking && coordinatorBookings.length > 0;']],
  },
  {
    id: 'SPM137-FE-21',
    name: 'closing the details adds a history entry instead of replacing the address',
    file: PAGE,
    suites: ['bookingNotices'],
    testMappings: page('03-J'),
    edits: [['      { replace: true },\n', '      {},\n']],
  },
  {
    id: 'SPM137-FE-22',
    name: 'Mark As Read on a booking notice does not post the read call',
    file: ROW,
    suites: ['bookingNotices'],
    testMappings: bell('04-H'),
    edits: [['onClick={() => onMarkRead(n.id)}', 'onClick={() => undefined}']],
  },
  {
    id: 'SPM137-FE-23',
    name: 'opening the bell marks the booking decision notices read',
    file: BELL,
    suites: ['bookingNotices'],
    testMappings: bell('04-I'),
    edits: [['onClick={() => setOpen((v) => !v)}', 'onClick={() => {\n          notifications.filter((n) => n.type.startsWith("venue_booking_")).forEach((n) => void markRead(n.id));\n          setOpen((v) => !v);\n        }}']],
  },
];
