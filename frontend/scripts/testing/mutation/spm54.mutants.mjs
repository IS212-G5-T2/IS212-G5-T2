// SPM-54 venue suitability, browser-state, and request interaction mutants; mapped Vitest cases run without PostgreSQL.
// Run with: node scripts/testing/mutation/run.mjs --mutants spm54.mutants.mjs
export const SUITES = {
  suitability: {
    args: ['run', 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx'],
  },
  bookings: {
    args: ['run', 'src/features/bookings/pages/requests/BookingsPage.test.tsx', 'src/features/bookings/pages/requests/BookingCard.test.tsx', 'src/features/bookings/pages/requests/BookingDetailModal.test.tsx'],
  },
};

const DETAIL = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx';
const PAGE = 'src/features/bookings/pages/requests/BookingsPage.tsx';
const CARD = 'src/features/bookings/pages/requests/BookingCard.tsx';
const testCase = (file, title) => ({ file, title });

export const MUTANTS = [
  {
    id: 'FE54-01', name: 'an unsuitable venue can continue to request review', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC1: assesses venue suitability and blocks an incompatible choice')],
    edits: [['&& suitabilityIssues.length === 0 && !existingBookingReference && !submitted && (', '&& true && !existingBookingReference && !submitted && (']],
  },
  {
    id: 'FE54-09', name: 'capacity equality is incorrectly marked unsuitable', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC1 BND-1: accepts capacity exactly equal to expected attendance')],
    edits: [['venue.capacity < selectedRequestEvent.expectedAttendance', 'venue.capacity <= selectedRequestEvent.expectedAttendance']],
  },
  {
    id: 'FE54-02', name: 'optional special requests are omitted from submission', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC3: submits a request for the event-specific URL context and optional note')],
    edits: [['specialRequests: specialRequests.trim() || undefined', 'specialRequests: undefined']],
  },
  {
    id: 'FE54-03', name: 'a booking confirmation reference is not shown after submission', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC3: submits a request for the event-specific URL context and optional note')],
    edits: [['setBookingReference(result.bookingReference)', 'setBookingReference("")']],
  },
  {
    id: 'FE54-04', name: 'the coordinator booking list uses the wrong server route', file: PAGE, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingsPage.test.tsx', 'lists each event venue booking independently')],
    edits: [['"/venues/my-bookings"', '"/venues/my-booking"']],
  },
  {
    id: 'FE54-05', name: 'My Bookings hides non-pending venue statuses by default', file: PAGE, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingsPage.test.tsx', 'lists each event venue booking independently')],
    edits: [['const [statusFilter, setStatusFilter] = useState("")', 'const [statusFilter, setStatusFilter] = useState("pending")']],
  },
  {
    id: 'FE54-06', name: 'an affected original booking is not identified for replacement', file: CARD, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingCard.test.tsx', 'identifies an affected original without cancelling or replacing it')],
    edits: [['booking.affectedByUnavailablePeriod &&', 'false &&']],
  },
  {
    id: 'FE54-16', name: 'My Bookings omits the persisted booking reference', file: CARD, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingsPage.test.tsx', 'lists each event venue booking independently')],
    edits: [['booking.bookingReference && <p', 'false && <p']],
  },
  {
    id: 'FE54-07', name: 'last-active cancellation is sent without the warning confirmation', file: CARD, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingsPage.test.tsx', 'confirms a last active cancellation and sends it for only the selected booking')],
    edits: [['(item.status === "pending" || item.status === "approved")).length === 1', '(item.status === "pending" || item.status === "approved")).length === 0']],
  },
  {
    id: 'FE54-08', name: 'cancellation targets the event instead of the selected booking', file: CARD, suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingCard.test.tsx', 'retries a stale last-active refusal after confirmation')],
    edits: [['encodeURIComponent(booking.id)', 'encodeURIComponent(booking.eventId)']],
  },
  {
    id: 'FE54-14', name: 'stale availability responses overwrite the current schedule', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'ignores a stale background availability response after the persisted event period changes')],
    edits: [['setVenue(fresh);', 'setVenue(venue);']],
  },
  {
    id: 'FE54-10', name: 'a successful submit leaves the request form available for resubmission', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC3: submits a request for the event-specific URL context and optional note')],
    edits: [['setSubmitted(true)', 'setSubmitted(false)']],
  },
  {
    id: 'FE54-11', name: 'a persisted overlapping pending request does not suppress the submit form', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC5: suppresses repeat submission for every persisted booking status')],
    edits: [['!existingBookingReference && !submitted', '!submitted']],
  },
  {
    id: 'FE54-17', name: 'approved or rejected request history permits a duplicate venue request', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC5: suppresses repeat submission for every persisted booking status')],
    edits: [[
      `booking.eventId === requestedEventId &&
            booking.venueId === id,`,
      `booking.eventId === requestedEventId &&
            booking.venueId === id &&
            (booking.status === "pending" || booking.status === "cancelled"),`,
    ]],
  },
  {
    id: 'FE54-12', name: 'duplicate 409 does not show the existing booking reference', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'SPM-54 AC5: duplicate response reveals the existing booking reference and hides submission')],
    edits: [['setExistingBookingReference(failure.bookingReference)', 'setExistingBookingReference("")']],
  },
  {
    id: 'FE54-13', name: 'pending booking detail exposes fake Venue Staff decision controls', file: 'src/features/bookings/pages/requests/BookingDetailModal.tsx', suites: ['bookings'],
    kills: [testCase('src/features/bookings/pages/requests/BookingDetailModal.test.tsx', 'shows pending review status without approval or rejection controls')],
    edits: [[
      `{booking.status === "pending" ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          This request is pending review by Venue Staff.
        </p>`,
      `{booking.status === "pending" ? (
        <>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            This request is pending review by Venue Staff.
          </p>
          <fieldset aria-label="Venue Staff Action" className="mt-4">
            <label><input type="radio" name="decision" value="approve" /> Approve — accept booking</label>
            <label><input type="radio" name="decision" value="reject" /> Reject — provide reason</label>
          </fieldset>
        </>`,
    ]],
  },
  {
    id: 'FE54-15', name: 'event booking time inputs can be edited by the coordinator', file: DETAIL, suites: ['suitability'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', 'keeps the selected event period read-only for booking requests')],
    edits: [['const selectedEventTimeReadOnly = Boolean(selectedRequestEvent)', 'const selectedEventTimeReadOnly = false']],
  },
];
