// SPM-132 fault injections for the converted-hold calendar presentation.
const CALENDAR = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx';
const TEST = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx';
const DETAIL = 'src/features/bookings/pages/requests/BookingDetailModal.tsx';
const PAGE = 'src/features/bookings/pages/requests/BookingsPage.tsx';
const BOOKING_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const CALENDAR_TEST = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx';
const HISTORY = 'src/features/venues/pages/records/detail/bookingHistory.ts';
const HISTORY_TEST = 'src/features/venues/pages/records/detail/VenueBookingHistory.test.tsx';
const calendarCase = {
  suite: 'venueHoldCalendar',
  file: TEST,
  title: 'VEN-HOLD-DEC-12-A refreshes the calendar with the converted booking label',
};

export const SUITES = {
  venueHoldCalendar: { args: ['run', TEST] },
  staffHoldDecision: { args: ['run', BOOKING_TEST] },
  venueCalendar: { args: ['run', CALENDAR_TEST] },
  venueHistory: { args: ['run', HISTORY_TEST] },
};

export const MUTANTS = [
  {
    id: 'SPM132-EXPIRED-HISTORY-LABEL', name: 'persisted expired holds are mislabeled in venue history', file: HISTORY,
    suites: ['venueHistory'],
    testMappings: [{ suite: 'venueHistory', file: HISTORY_TEST, title: 'VEN-HOLD-DEC-06-B labels a persisted expired hold in venue history' }],
    edits: [['if (entry.status === "expired") return "Hold expired";', 'if (entry.status === "expired") return "Confirmed";']],
  },
  {
    id: 'SPM132-STAFF-HOLD-DURATION',
    name: 'staff see an incorrect hold duration',
    file: DETAIL,
    suites: ['staffHoldDecision'],
    testMappings: [{ suite: 'staffHoldDecision', file: BOOKING_TEST, title: 'VEN-HOLD-DEC-02-A shows hold request details and the fixed 14-day duration' }],
    edits: [['14 days (336 hours) from approval', '7 days (168 hours) from approval']],
  },
  {
    id: 'SPM132-RELEASE-REMAINS-VISIBLE',
    name: 'released holds remain in the staff list',
    file: PAGE,
    suites: ['staffHoldDecision'],
    testMappings: [{ suite: 'staffHoldDecision', file: BOOKING_TEST, title: 'VEN-HOLD-DEC-13-A releases an active tentative hold from the staff list' }],
    edits: [['setStaffBookings((rows) => rows.filter((row) => row.id !== id));', 'setStaffBookings((rows) => rows);']],
  },
  {
    id: 'SPM132-HOLD-SETUP-OMITTED',
    name: 'calendar hides setup buffers for held venues',
    file: CALENDAR,
    suites: ['venueCalendar'],
    testMappings: [{ suite: 'venueCalendar', file: CALENDAR_TEST, title: 'VEN-HOLD-DEC-08-A labels the hold and blocks its complete occupied interval' }],
    edits: [['if (venue.setupTimeMinutes > 0) {', 'if (false) {']],
  },
  {
    id: 'SPM132-HOLD-TURNAROUND-OMITTED',
    name: 'calendar hides turnaround buffers for held venues',
    file: CALENDAR,
    suites: ['venueCalendar'],
    testMappings: [{ suite: 'venueCalendar', file: CALENDAR_TEST, title: 'VEN-HOLD-DEC-08-A labels the hold and blocks its complete occupied interval' }],
    edits: [['if (venue.turnaroundTimeMinutes > 0) {', 'if (false) {']],
  },
  {
    id: 'SPM132-CALENDAR-CONVERTED-LABEL',
    name: 'a converted tentative hold keeps the Tentative hold calendar label',
    file: CALENDAR,
    suites: ['venueHoldCalendar'],
    testMappings: [calendarCase],
    edits: [['const isBooked = reservation.status === "booked";', 'const isBooked = false;']],
  },
  {
    id: 'SPM132-CALENDAR-CONVERTED-CATEGORY',
    name: 'a converted booking keeps the hold calendar category',
    file: CALENDAR,
    suites: ['venueHoldCalendar'],
    testMappings: [calendarCase],
    edits: [['const category: ScheduleCategory = isBooked ? "booking" : "hold";', 'const category: ScheduleCategory = "hold";']],
  },
];
