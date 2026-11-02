const REVIEW_PAGE_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const HOLD_TEST = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx';
const MODAL = 'src/features/bookings/pages/requests/BookingDetailModal.tsx';
const BOOKINGS = 'src/features/bookings/pages/requests/BookingsPage.tsx';
const CARD = 'src/features/bookings/pages/requests/BookingCard.tsx';
const BADGE = 'src/components/ui/StatusBadge.tsx';
const BADGE_TEST = 'src/components/ui/StatusBadge.test.tsx';
const CALENDAR = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx';
const CALENDAR_TEST = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx';

export const SUITES = {
  holdUi: {
    args: [
      'run',
      REVIEW_PAGE_TEST,
      HOLD_TEST,
      CALENDAR_TEST,
      BADGE_TEST,
    ],
  },
};

export const MUTANTS = [
  {
    id: 'SPM132-REJECT-WHITESPACE',
    name: 'whitespace-only rejection reasons are accepted by the UI',
    file: MODAL,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-07-B requires a nonblank reason before rejecting a hold',
    }],
    edits: [[
      '(decision === "rejected" && !reason.trim())',
      '(decision === "rejected" && !reason)',
    ]],
  },
  {
    id: 'SPM132-EXPIRED-HOLD-ACTIONS',
    name: 'scheduler-expired holds still offer conversion and release controls',
    file: MODAL,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-09-B hides conversion and release when the server marks an approved hold expired',
    }],
    edits: [['!booking?.holdExpired', 'true']],
  },
  {
    id: 'SPM132-EXPIRED-HOLD-LABEL',
    name: 'scheduler-persisted expired status is omitted from the staff hold card',
    file: CARD,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-06-BND-1 shows persisted expiry without conversion or release actions',
    }],
    edits: [[
      '(booking.status === "approved" || booking.status === "expired") && booking.holdExpiresAt',
      'booking.status === "approved" && booking.holdExpiresAt',
    ]],
  },
  {
    id: 'SPM132-RELEASE-ROUTE',
    name: 'releasing a hold calls the convert endpoint instead of release',
    file: MODAL,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-10-A releases an active hold and reloads the staff queue',
    }],
    edits: [[
      '`/venues/bookings/${encodeURIComponent(booking.id)}/release`',
      '`/venues/bookings/${encodeURIComponent(booking.id)}/convert`',
    ]],
  },
  {
    id: 'SPM132-CONVERT-ROUTE',
    name: 'converting a hold calls the release endpoint instead of convert',
    file: MODAL,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-09-A converts an active hold and reloads the staff queue',
    }],
    edits: [[
      '`/venues/bookings/${encodeURIComponent(booking.id)}/convert`',
      '`/venues/bookings/${encodeURIComponent(booking.id)}/release`',
    ]],
  },
  {
    id: 'SPM132-COORDINATOR-EXPIRED-LABEL',
    name: 'the Coordinator list hides a persisted expired hold label',
    file: BOOKINGS,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-06-BND-1 labels a scheduler-expired hold in the Coordinator\'s request list',
    }],
    edits: [[
      'if (booking.status !== "approved" && booking.status !== "expired") return null;',
      'if (booking.status !== "approved") return null;',
    ]],
  },
  {
    id: 'SPM132-RELEASED-BADGE-LABEL',
    name: 'released hold status is shown with a misleading label',
    file: BADGE,
    suites: ['holdUi'],
    kills: [{
      file: BADGE_TEST,
      title: 'VEN-HOLD-DEC-10-A labels a released hold',
    }],
    edits: [['released: "Released"', 'released: "Cancelled"']],
  },
  {
    id: 'SPM132-CALENDAR-HOLD-TITLE',
    name: 'calendar does not label the reservation as a Tentative hold',
    file: CALENDAR,
    suites: ['holdUi'],
    kills: [{
      file: CALENDAR_TEST,
      title: 'VEN-HOLD-DEC-08-A renders the Tentative hold title and exact setup, event, and turnaround edges',
    }],
    edits: [[
      'const title = isBooked ? "Confirmed booking" : "Tentative hold";',
      'const title = isBooked ? "Confirmed booking" : "Hold";',
    ]],
  },
  {
    id: 'SPM132-CALENDAR-SETUP-BUFFER',
    name: 'calendar drops the setup buffer from a hold interval',
    file: CALENDAR,
    suites: ['holdUi'],
    kills: [{
      file: CALENDAR_TEST,
      title: 'VEN-HOLD-DEC-08-A renders the Tentative hold title and exact setup, event, and turnaround edges',
    }],
    edits: [['venue.setupTimeMinutes * 60_000', '0']],
  },
  {
    id: 'SPM132-CALENDAR-TURNAROUND-BUFFER',
    name: 'calendar drops the turnaround buffer from a hold interval',
    file: CALENDAR,
    suites: ['holdUi'],
    kills: [{
      file: CALENDAR_TEST,
      title: 'VEN-HOLD-DEC-08-A renders the Tentative hold title and exact setup, event, and turnaround edges',
    }],
    edits: [['venue.turnaroundTimeMinutes * 60_000', '0']],
  },
  {
    id: 'SPM132-CALENDAR-BOOKED-TITLE',
    name: 'calendar labels a confirmed booking as a tentative hold',
    file: CALENDAR,
    suites: ['holdUi'],
    kills: [{
      file: CALENDAR_TEST,
      title: 'VEN-HOLD-DEC-12-A renders a booked reservation with the Confirmed booking title',
    }],
    edits: [[
      'const title = isBooked ? "Confirmed booking" : "Tentative hold";',
      'const title = isBooked ? "Tentative hold" : "Tentative hold";',
    ]],
  },
  {
    id: 'SPM132-MODAL-RELEASE-FALLBACK',
    name: 'modal release failure loses its non-Error fallback message',
    file: MODAL,
    suites: ['holdUi'],
    kills: [{
      file: REVIEW_PAGE_TEST,
      title: 'VEN-HOLD-DEC-10-B shows the release fallback for a non-Error rejection',
    }],
    edits: [[': "Unable to release this hold.",', ': "Unable to release hold.",']],
  },
  {
    id: 'SPM132-PAGE-RELEASE-FALLBACK',
    name: 'venue record release failure loses its non-Error fallback message',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    kills: [{
      file: HOLD_TEST,
      title: 'VEN-HOLD-DEC-13-B reports the release fallback for a non-Error rejection',
    }],
    edits: [[': "Unable to release this hold.",', ': "Unable to release hold.",']],
  },
];
