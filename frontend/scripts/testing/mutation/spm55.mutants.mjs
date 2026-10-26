export const SUITES = {
  bookingReview: {
    args: ['run', 'src/features/bookings/pages/requests/BookingsPage.test.tsx'],
  },
  formatSingapore: {
    args: ['run', 'src/utils/format.test.ts'],
  },
};

const FORMAT = 'src/utils/format.ts';
const PAGE = 'src/features/bookings/pages/requests/BookingsPage.tsx';
const MODAL = 'src/features/bookings/pages/requests/BookingDetailModal.tsx';
const PAGE_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const CARD = 'src/features/bookings/pages/requests/BookingCard.tsx';

export const MUTANTS = [
  {
    id: 'VEN-REV-M06',
    name: 'a whitespace-only rejection reason can be submitted',
    file: MODAL,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC3 requires a non-empty rejection reason and keeps the booking visible as rejected without re-fetching',
      },
    ],
    edits: [['(decision === "rejected" && !reason.trim())', '(decision === "rejected" && !reason)']],
  },
  {
    id: 'VEN-REV-M07',
    name: 'the rejection reason is shown for every booking status, not only rejected',
    file: PAGE,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC4 hides the rejection reason on a pending coordinator booking',
      },
    ],
    edits: [['{booking.status === "rejected" && (', '{true && (']],
  },
  {
    id: 'VEN-REV-M13',
    name: 'the venue review time window is formatted in UTC instead of Singapore time',
    file: FORMAT,
    suites: ['formatSingapore'],
    edits: [['timeZone: "Asia/Singapore",', 'timeZone: "UTC",']],
  },
  {
    id: 'VEN-REV-M08',
    name: 'the Venue Staff status filter is ignored, so every status is listed under every filter',
    file: PAGE,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC1 isolates each status in the Venue Staff filter and All statuses shows every status',
      },
    ],
    edits: [
      [
        'staffBookings.filter((b) => !statusFilter || b.status === statusFilter)',
        'staffBookings.filter(() => true)',
      ],
    ],
  },
  {
    id: 'VEN-REV-M39',
    name: 'a decision leaves the decided row unchanged in the local list, so it keeps its stale status',
    file: PAGE,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC2 updates only the approved row in place and leaves the other request pending',
      },
    ],
    edits: [
      [
        '? { ...b, status: outcome.status, rejectionReason: outcome.reason }',
        '? b',
      ],
    ],
  },
  {
    id: 'VEN-REV-M40',
    name: 'the read-only guard is negated, so decided requests show the decision controls and pending ones hide them',
    file: MODAL,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC6 opens an approved request read-only with no decision controls',
      },
    ],
    edits: [
      ['{booking.status === "pending" ? (', '{booking.status !== "pending" ? ('],
    ],
  },
  {
    id: 'VEN-REV-M41',
    name: 'the rejection reason is shown on every staff card, not only rejected ones (BookingCard guard negated to true)',
    file: CARD,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC1 isolates each status in the Venue Staff filter and All statuses shows every status',
      },
    ],
    edits: [['{booking.status === "rejected" && (', '{true && (']],
  },
  {
    id: 'VEN-REV-M42',
    name: 'a user with both Venue Staff and Coordinator roles loses the coordinator bookings section (the staff review list still renders)',
    file: PAGE,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC1 shows both the staff review list and the coordinator bookings to a user with both roles',
      },
    ],
    edits: [['{coordinator &&\n        (coordinatorFiltered.length === 0 ? (', '{coordinator && !staff &&\n        (coordinatorFiltered.length === 0 ? (']],
  },
  {
    id: 'VEN-REV-M44',
    name: 'a successful staff load clears the coordinator load error, reinstating the shared-error bug for a user with both roles',
    file: PAGE,
    suites: ['bookingReview'],
    kills: [
      {
        file: PAGE_TEST,
        title: 'SPM-55 AC1 keeps the coordinator load error visible when the staff load succeeds afterwards for a user with both roles',
      },
    ],
    edits: [['setStaffError("");\n        setStaffBookings(rows);', 'setStaffError("");\n        setCoordError("");\n        setStaffBookings(rows);']],
  },
];
