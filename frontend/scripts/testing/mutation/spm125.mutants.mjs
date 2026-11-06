// SPM-125 frontend fault injection: the unavailability history card (AC1), the unavailable period in the calendar
// (AC2), the search rule while a venue is unavailable and its occupied-period boundary (AC3, AC4), the booking history
// card (AC5), the Venue Staff results that say which Coordinators were notified (AC6, AC8, AC9) and the Coordinator's
// bell and booking details (AC7). Each mutant names the exact test that must fail under it.
// Run: node scripts/testing/mutation/run.mjs --mutants spm125.mutants.mjs
const DETAIL = 'src/features/venues/pages/records/detail';
const HIST = `${DETAIL}/VenueUnavailabilityHistory.tsx`;
const HIST_TEST = `${DETAIL}/VenueUnavailabilityHistory.test.tsx`;
const BOOK = `${DETAIL}/VenueBookingHistory.tsx`;
const BOOK_STATUS = `${DETAIL}/bookingHistory.ts`;
const BOOK_TEST = `${DETAIL}/VenueBookingHistory.test.tsx`;
const PAGE = `${DETAIL}/VenueRecordDetailPage.tsx`;
const PAGE_TEST = `${DETAIL}/VenueRecordDetailPage.test.tsx`;
const CAL = `${DETAIL}/VenueScheduleCalendar.tsx`;
const CAL_TEST = `${DETAIL}/VenueScheduleCalendar.test.tsx`;
const PANEL = `${DETAIL}/VenueUnavailabilityPanel.tsx`;
const PANEL_TEST = `${DETAIL}/VenueUnavailabilityPanel.test.tsx`;
const EDIT = 'src/features/venues/pages/edit/VenueEditPage.tsx';
const EDIT_TEST = 'src/features/venues/pages/edit/VenueEditPage.test.tsx';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const ROW = 'src/components/notifications/NotificationRow.tsx';
const BELL_TEST = 'src/components/notifications/NotificationBell.test.tsx';
const DIALOG = 'src/features/bookings/pages/requests/CoordinatorBookingDialog.tsx';
const BOOKINGS_TEST = 'src/features/bookings/pages/requests/BookingsPage.test.tsx';
const AVAILABILITY = 'src/features/venues/pages/records/availability.ts';
const SEARCH = 'src/features/venues/lib/venueSearch.ts';
const SEARCH_TEST = 'src/features/venues/lib/venueSearch.test.ts';

export const SUITES = {
  history: { args: ['run', HIST_TEST] },
  bookingHistory: { args: ['run', BOOK_TEST] },
  page: { args: ['run', PAGE_TEST] },
  calendar: { args: ['run', CAL_TEST] },
  panel: { args: ['run', PANEL_TEST] },
  edit: { args: ['run', EDIT_TEST] },
  bell: { args: ['run', BELL_TEST] },
  bookings: { args: ['run', BOOKINGS_TEST] },
  search: { args: ['run', SEARCH_TEST] },
};

const at = (suite, file) => (title) => ({ suite, file, title });
const hi = at('history', HIST_TEST);
const bh = at('bookingHistory', BOOK_TEST);
const pg = at('page', PAGE_TEST);
const cl = at('calendar', CAL_TEST);
const pn = at('panel', PANEL_TEST);
const ed = at('edit', EDIT_TEST);
const bl = at('bell', BELL_TEST);
const bk = at('bookings', BOOKINGS_TEST);
const sr = at('search', SEARCH_TEST);

const T = {
  hList: hi('VEN-IMPACT-01-E lists each change with its period, reason, person and time'),
  hNotRecorded: hi('VEN-IMPACT-01-BND-2 shows Not recorded for an entry without a person'),
  hOpen: hi('VEN-IMPACT-01-F loads only when opened and says when there is no history'),
  hRetry: hi('VEN-IMPACT-01-G shows a load error and retries'),
  hRefresh: hi('VEN-IMPACT-01-H reads the history again after a change on the page'),
  hLate: hi('VEN-IMPACT-01-I ignores a late response or late failure after the card closed'),
  bList: bh('VEN-IMPACT-05-C lists past and future bookings of every status with their details'),
  bStatus: bh('VEN-IMPACT-05-D labels %s as %s'),
  bOpen: bh('VEN-IMPACT-05-E loads only when opened and says when there are no bookings'),
  bRetry: bh('VEN-IMPACT-05-F shows a load error, retries, and reloads after a change on the page'),
  bLate: bh('VEN-IMPACT-05-G ignores a late response or late failure after the card closed'),
  pageStaff: pg('VEN-IMPACT-01-D VEN-IMPACT-05-H shows both history cards to Venue Staff'),
  pageCoordinator: pg('VEN-IMPACT-01-SEC-2 VEN-IMPACT-05-SEC-2 hides the history cards from a Coordinator'),
  calendar: cl('VEN-IMPACT-02-A shows an unavailable period at its times with its reason'),
  pNotified: pn("VEN-IMPACT-06-C shows which affected bookings' Coordinators were notified"),
  pSingular: pn('VEN-IMPACT-06-BND-2 words one notified Coordinator in the singular'),
  pNobody: pn('VEN-IMPACT-06-BND-3 says no Coordinator was notified when no affected booking has one'),
  eTiming: ed('VEN-IMPACT-08-E marks the conflicting bookings whose Coordinators were notified'),
  eCapacity: ed('VEN-IMPACT-09-E marks only the capacity bookings whose Coordinators were notified'),
  eNobody: ed('VEN-IMPACT-09-BND-2 says no Coordinator was notified when no listed booking could be'),
  nUnavailable: bl('VEN-IMPACT-07-B lists the unavailability notice with the event, venue, period and reason for a Coordinator'),
  nOpen: bl('VEN-IMPACT-07-C View Booking opens the affected booking on the Bookings page and marks the notice read'),
  nOthers: bl('VEN-IMPACT-08-D VEN-IMPACT-09-D lists timing and capacity notices, each opening its booking'),
  dAffected: bk('VEN-IMPACT-07-D shows the linked affected booking with Find a replacement venue'),
  dUnaffected: bk('VEN-IMPACT-07-BND-1 offers no replacement for an unaffected confirmed booking'),
  sFound: sr('VEN-IMPACT-03-B keeps an unavailable venue searchable without a time and outside the period'),
  sLeftOut: sr('VEN-IMPACT-03-C leaves the venue out for a time whose occupied period overlaps the unavailable period'),
  sBoundary: sr('VEN-IMPACT-04-B offers the venue when the occupied period starts exactly as the unavailable period ends'),
};

// The Venue Edit result lists the AC8 and AC9 bookings with the same markup; the lines that follow each list make an
// edit unique to one of them.
const AFFECTED_MARK = `{b.coordinatorNotified && " — Coordinator notified"}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">These bookings remain recorded and have not been removed.</p>
              <NotifiedSummary bookings={affectedBookings} />`;
const CAPACITY_MARK = AFFECTED_MARK.replace('affectedBookings', 'capacityBookings');

export const MUTANTS = [
  // ---- Unavailability history card (AC1) ----
  { id: 'FE-125-01', name: 'the history shows nothing for an entry without a recorded person (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hNotRecorded],
    edits: [['{entry.changedBy ?? "Not recorded"}', '{entry.changedBy ?? ""}']] },
  { id: 'FE-125-02', name: 'the history leaves out the reason (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList],
    edits: [['<p className="break-words text-gray-600 dark:text-gray-300">Reason: {entry.reason}</p>', '<p className="break-words text-gray-600 dark:text-gray-300"></p>']] },
  { id: 'FE-125-03', name: 'the history leaves out the end an early end replaced (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList],
    edits: [['{entry.previousEnd && (', '{false && (']] },
  { id: 'FE-125-04', name: 'the history shows only the start of the period (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList],
    edits: [['formatSingaporeRange(entry.start, entry.end)', 'formatSingaporeRange(entry.start, entry.start)']] },
  { id: 'FE-125-05', name: 'the history shows the period start as the time of the change (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList],
    edits: [['{formatSingaporeDateTime(entry.changedAt)}</time>', '{formatSingaporeDateTime(entry.start)}</time>']] },
  { id: 'FE-125-06', name: 'the history lists the oldest change first (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList],
    edits: [['{entries.map((entry) => (', '{[...entries].reverse().map((entry) => (']] },
  { id: 'FE-125-07', name: 'the history swaps the Marked unavailable and Ended early labels (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hList, T.hRetry, T.hRefresh],
    edits: [['created: "Marked unavailable",\n  ended_early: "Ended early",', 'created: "Ended early",\n  ended_early: "Marked unavailable",']] },
  { id: 'FE-125-08', name: 'the history is read before it is opened (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hOpen],
    edits: [['if (!open) return;', 'if (false) return;']] },
  { id: 'FE-125-09', name: 'the history cannot be hidden once opened (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hOpen, T.hLate],
    edits: [['onClick={() => setOpen((value) => !value)}', 'onClick={() => setOpen(true)}']] },
  { id: 'FE-125-10', name: 'the empty history shows a different message (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hOpen],
    edits: [['No unavailable periods have been recorded for this venue.', 'Nothing here.']] },
  { id: 'FE-125-11', name: 'the history shows no loading status (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hOpen],
    edits: [['Loading the unavailability history…', 'Loading…']] },
  { id: 'FE-125-12', name: 'a failed read of the history shows a different error (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hRetry],
    edits: [['setError("Unable to load the unavailability history.")', 'setError("Error")']] },
  { id: 'FE-125-13', name: 'Retry does not read the history again (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hRetry],
    edits: [['onClick={() => setRetry((value) => value + 1)}', 'onClick={() => setRetry((value) => value)}']] },
  { id: 'FE-125-14', name: 'a change on the page does not reload the history (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hRefresh],
    edits: [['[open, venueId, refreshKey, retry]', '[open, venueId, retry]']] },
  { id: 'FE-125-15', name: 'a late response is shown after the history card closed (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hLate],
    edits: [['if (current) setEntries(rows);', 'setEntries(rows);']] },
  { id: 'FE-125-16', name: 'a late failure is shown after the history card closed (AC1)', file: HIST, suites: ['history'],
    testMappings: [T.hLate],
    edits: [['if (current) setError("Unable to load the unavailability history.");', 'setError("Unable to load the unavailability history.");']] },

  // ---- Booking history card (AC5) ----
  { id: 'FE-125-17', name: 'the booking history hides bookings that have ended (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bList],
    edits: [['{entries.map((entry) => (', '{entries.filter((entry) => Date.parse(entry.end) > now).map((entry) => (']] },
  { id: 'FE-125-18', name: 'the booking history shows nothing for a booking without a Coordinator (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bList],
    edits: [['{entry.coordinatorName ?? "Not assigned"}', '{entry.coordinatorName ?? ""}']] },
  { id: 'FE-125-19', name: 'the booking history never says a booking overlaps an unavailable period (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bList],
    edits: [['{entry.affectedByUnavailablePeriod && (', '{false && (']] },
  { id: 'FE-125-20', name: 'the booking history never shows when a hold expires (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bList],
    edits: [['{entry.requestKind === "tentative_hold" && entry.status === "approved" && entry.holdExpiresAt && (', '{false && (']] },
  { id: 'FE-125-21', name: 'the booking history swaps the Tentative hold and Booking kinds (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bList],
    edits: [['{entry.requestKind === "tentative_hold" ? "Tentative hold" : "Booking"}', '{entry.requestKind === "tentative_hold" ? "Booking" : "Tentative hold"}']] },
  { id: 'FE-125-22', name: 'an approved booking is labelled a tentative hold (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bList, T.bStatus],
    edits: [['if (!hold) return "Confirmed";', 'if (!hold) return "Tentative hold";']] },
  { id: 'FE-125-23', name: 'an approved hold is still tentative at its expiry instant (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bStatus],
    edits: [['new Date(entry.holdExpiresAt).getTime() <= now', 'new Date(entry.holdExpiresAt).getTime() < now']] },
  { id: 'FE-125-24', name: 'a cancelled booking is labelled Rejected (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bList, T.bStatus],
    edits: [['cancelled: "Cancelled"', 'cancelled: "Rejected"']] },
  { id: 'FE-125-25', name: 'a pending hold request is labelled Pending (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bStatus],
    edits: [['return hold ? "Hold requested" : "Pending";', 'return "Pending";']] },
  { id: 'FE-125-26', name: 'an approved hold with no expiry is labelled expired (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bStatus],
    edits: [['return entry.holdExpiresAt && new Date(entry.holdExpiresAt)', 'return !entry.holdExpiresAt || new Date(entry.holdExpiresAt)']] },
  { id: 'FE-125-27', name: 'a rejected booking is labelled Released and a released one Rejected (AC5)', file: BOOK_STATUS, suites: ['bookingHistory'],
    testMappings: [T.bStatus],
    edits: [['{ rejected: "Rejected", released: "Released", cancelled: "Cancelled" }', '{ rejected: "Released", released: "Rejected", cancelled: "Cancelled" }']] },
  { id: 'FE-125-28', name: 'the booking history is read before it is opened (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bOpen],
    edits: [['if (!open) return;', 'if (false) return;']] },
  { id: 'FE-125-29', name: 'the booking history cannot be hidden once opened (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bOpen, T.bLate],
    edits: [['onClick={() => setOpen((value) => !value)}', 'onClick={() => setOpen(true)}']] },
  { id: 'FE-125-30', name: 'a venue with no bookings shows a different message (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bOpen],
    edits: [['No bookings or tentative holds have been made at this venue.', 'Nothing here.']] },
  { id: 'FE-125-31', name: 'the booking history shows no loading status (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bOpen],
    edits: [['Loading the booking history…', 'Loading…']] },
  { id: 'FE-125-32', name: 'a failed read of the booking history shows a different error (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bRetry],
    edits: [['setError("Unable to load the booking history.")', 'setError("Error")']] },
  { id: 'FE-125-33', name: 'Retry does not read the booking history again (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bRetry],
    edits: [['onClick={() => setRetry((value) => value + 1)}', 'onClick={() => setRetry((value) => value)}']] },
  { id: 'FE-125-34', name: 'a change on the page does not reload the booking history (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bRetry],
    edits: [['[open, venueId, refreshKey, retry]', '[open, venueId, retry]']] },
  { id: 'FE-125-35', name: 'a late response is shown after the booking history card closed (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bLate],
    edits: [['if (current) setEntries(rows);', 'setEntries(rows);']] },
  { id: 'FE-125-36', name: 'a late failure is shown after the booking history card closed (AC5)', file: BOOK, suites: ['bookingHistory'],
    testMappings: [T.bLate],
    edits: [['if (current) setError("Unable to load the booking history.");', 'setError("Unable to load the booking history.");']] },

  // ---- Venue record page: who sees the history cards (AC1, AC5) ----
  { id: 'FE-125-37', name: 'the history cards are shown to every role (AC1, AC5)', file: PAGE, suites: ['page'],
    testMappings: [T.pageCoordinator],
    edits: [['{hasRole(user, "venue_staff") && (\n        <div className="mt-4 grid gap-4 lg:grid-cols-2">', '{true && (\n        <div className="mt-4 grid gap-4 lg:grid-cols-2">']] },
  { id: 'FE-125-38', name: 'the history cards are hidden from Venue Staff (AC1, AC5)', file: PAGE, suites: ['page'],
    testMappings: [T.pageStaff],
    edits: [['{hasRole(user, "venue_staff") && (\n        <div className="mt-4 grid gap-4 lg:grid-cols-2">', '{false && (\n        <div className="mt-4 grid gap-4 lg:grid-cols-2">']] },
  { id: 'FE-125-39', name: 'the booking history card is missing from the venue page (AC5)', file: PAGE, suites: ['page'],
    testMappings: [T.pageStaff],
    edits: [['<VenueBookingHistory venueId={venue.id} refreshKey={revision} />', '{null}']] },
  { id: 'FE-125-40', name: 'the unavailability history card is missing from the venue page (AC1)', file: PAGE, suites: ['page'],
    testMappings: [T.pageStaff],
    edits: [['<VenueUnavailabilityHistory venueId={venue.id} refreshKey={revision} />', '{null}']] },

  // ---- Calendar (AC2) ----
  { id: 'FE-125-41', name: 'the calendar entry for an unavailable period carries no reason (AC2)', file: CAL, suites: ['calendar'],
    testMappings: [T.calendar],
    edits: [['extendedProps: { detail: period.reason, category: "unavailable" }', 'extendedProps: { detail: "", category: "unavailable" }']] },
  { id: 'FE-125-42', name: 'the calendar entry for an unavailable period ends when it starts (AC2)', file: CAL, suites: ['calendar'],
    testMappings: [T.calendar],
    edits: [['start: period.start,\n      end: period.end,\n      backgroundColor: "#b4534b",', 'start: period.start,\n      end: period.start,\n      backgroundColor: "#b4534b",']] },
  { id: 'FE-125-43', name: 'the calendar entry for an unavailable period is titled Blocked (AC2)', file: CAL, suites: ['calendar'],
    testMappings: [T.calendar],
    edits: [['title: "Unavailable",', 'title: "Blocked",']] },

  // ---- Venue Staff: which Coordinators were notified (AC6) ----
  { id: 'FE-125-44', name: 'the saved period counts every affected booking as notified (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pNotified, T.pNobody],
    edits: [['count={result.affectedBookings.filter((booking) => booking.coordinatorNotified).length}', 'count={result.affectedBookings.length}']] },
  { id: 'FE-125-45', name: 'one notified Coordinator is worded in the plural (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pSingular],
    edits: [['count === 1 ? " of 1 affected booking has"', 'count === 0 ? " of 1 affected booking has"']] },
  { id: 'FE-125-46', name: 'the result says Coordinators were notified when none was (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pNobody],
    edits: [['{count\n      ? `The Event Coordinator', '{true\n      ? `The Event Coordinator']] },
  { id: 'FE-125-47', name: 'the result swaps the notified and not-notified marks of an affected booking (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pNotified],
    edits: [['{booking.coordinatorNotified ? "Coordinator notified" : "No assigned Coordinator to notify"}', '{booking.coordinatorNotified ? "No assigned Coordinator to notify" : "Coordinator notified"}']] },
  { id: 'FE-125-48', name: 'the plural notice does not say affected bookings (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pNotified],
    edits: [['s of ${count} affected bookings have', 's of ${count} bookings have']] },
  { id: 'FE-125-49', name: 'the affected bookings are not shown after a period is saved (AC6)', file: PANEL, suites: ['panel'],
    testMappings: [T.pNotified, T.pSingular, T.pNobody],
    edits: [['{result && <section aria-label="Affected bookings"', '{false && <section aria-label="Affected bookings"']] },

  // ---- Venue Staff: venue edit results (AC8, AC9) ----
  { id: 'FE-125-50', name: 'a setup or turnaround booking is never marked Coordinator notified (AC8)', file: EDIT, suites: ['edit'],
    testMappings: [T.eTiming],
    edits: [[AFFECTED_MARK, AFFECTED_MARK.replace('{b.coordinatorNotified && " — Coordinator notified"}', '{false && " — Coordinator notified"}')]] },
  { id: 'FE-125-51', name: 'every capacity booking is marked Coordinator notified (AC9)', file: EDIT, suites: ['edit'],
    testMappings: [T.eCapacity],
    edits: [[CAPACITY_MARK, CAPACITY_MARK.replace('{b.coordinatorNotified && " — Coordinator notified"}', '{" — Coordinator notified"}')]] },
  { id: 'FE-125-52', name: 'the setup or turnaround result counts no notified Coordinator (AC8)', file: EDIT, suites: ['edit'],
    testMappings: [T.eTiming],
    edits: [['<NotifiedSummary bookings={affectedBookings} />', '<NotifiedSummary bookings={[]} />']] },
  { id: 'FE-125-53', name: 'the capacity result counts no notified Coordinator (AC9)', file: EDIT, suites: ['edit'],
    testMappings: [T.eCapacity],
    edits: [['<NotifiedSummary bookings={capacityBookings} />', '<NotifiedSummary bookings={[]} />']] },
  { id: 'FE-125-54', name: 'one notified Coordinator is worded in the plural in the venue edit result (AC9)', file: EDIT, suites: ['edit'],
    testMappings: [T.eCapacity],
    edits: [['count === 1 ? " of 1 booking has"', 'count === 0 ? " of 1 booking has"']] },
  { id: 'FE-125-55', name: 'the plural notice in the venue edit result is misworded (AC8)', file: EDIT, suites: ['edit'],
    testMappings: [T.eTiming],
    edits: [['s of ${count} bookings have', 's of ${count} booking have']] },
  { id: 'FE-125-56', name: 'the venue edit result claims Coordinators were notified when none was (AC9)', file: EDIT, suites: ['edit'],
    testMappings: [T.eNobody],
    edits: [['{count\n        ? `The Event Coordinator', '{true\n        ? `The Event Coordinator']] },

  // ---- Coordinator: the bell and the booking details (AC7) ----
  { id: 'FE-125-57', name: 'the Coordinator bell drops the unavailability notice (AC7)', file: BELL, suites: ['bell'],
    testMappings: [T.nUnavailable, T.nOpen],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n  "cancellation_request_submitted",', '  "venue_timing_impact",\n  "venue_capacity_impact",\n  "cancellation_request_submitted",']] },
  { id: 'FE-125-58', name: 'the Coordinator bell drops the setup or turnaround notice (AC8)', file: BELL, suites: ['bell'],
    testMappings: [T.nOthers],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n  "cancellation_request_submitted",', '  "venue_unavailable_impact",\n  "venue_capacity_impact",\n  "cancellation_request_submitted",']] },
  { id: 'FE-125-59', name: 'the Coordinator bell drops the capacity notice (AC9)', file: BELL, suites: ['bell'],
    testMappings: [T.nOthers],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n  "cancellation_request_submitted",', '  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "cancellation_request_submitted",']] },
  { id: 'FE-125-60', name: 'an unavailability notice links to the event page instead of the booking (AC7)', file: ROW, suites: ['bell'],
    testMappings: [T.nOpen],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n]);', '  "venue_timing_impact",\n  "venue_capacity_impact",\n]);']] },
  { id: 'FE-125-61', name: 'a setup or turnaround notice links to the event page instead of the booking (AC8)', file: ROW, suites: ['bell'],
    testMappings: [T.nOthers],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n]);', '  "venue_unavailable_impact",\n  "venue_capacity_impact",\n]);']] },
  { id: 'FE-125-62', name: 'a capacity notice links to the event page instead of the booking (AC9)', file: ROW, suites: ['bell'],
    testMappings: [T.nOthers],
    edits: [['  "venue_unavailable_impact",\n  "venue_timing_impact",\n  "venue_capacity_impact",\n]);', '  "venue_unavailable_impact",\n  "venue_timing_impact",\n]);']] },
  { id: 'FE-125-63', name: 'a notice without a booking id links to an event page instead of the Bookings page (AC8, AC9)', file: ROW, suites: ['bell'],
    testMappings: [T.nOthers],
    edits: [['      : "/bookings"\n', '      : `/events/${n.relatedEventId}`\n']] },
  { id: 'FE-125-64', name: 'the bell row cuts the reason off a venue-change notice (AC7)', file: ROW, suites: ['bell'],
    testMappings: [T.nUnavailable],
    edits: [['if (type !== "change_request_denied") return message;', 'if (type !== "change_request_denied") return message.replace(/ \\(reason:[^)]*\\)/, "");']] },
  { id: 'FE-125-65', name: 'following View Booking does not mark the notice read (AC7)', file: ROW, suites: ['bell'],
    testMappings: [T.nOpen],
    edits: [['if (!isChangeRequest) onMarkRead(n.id);', 'if (isChangeRequest) onMarkRead(n.id);']] },
  { id: 'FE-125-66', name: 'following View Booking leaves the bell open (AC7)', file: ROW, suites: ['bell'],
    testMappings: [T.nOpen],
    edits: [['if (!isChangeRequest) onMarkRead(n.id);\n                onOpen();', 'if (!isChangeRequest) onMarkRead(n.id);']] },
  { id: 'FE-125-67', name: 'the booking details do not offer a replacement venue for an affected booking (AC7)', file: DIALOG, suites: ['bookings'],
    testMappings: [T.dAffected],
    edits: [['!!booking.eventId && (booking.affected || booking.status === "cancelled" || booking.status === "rejected")', '!!booking.eventId && (booking.status === "cancelled" || booking.status === "rejected")']] },
  { id: 'FE-125-68', name: 'the booking details offer a replacement venue for every booking (AC7)', file: DIALOG, suites: ['bookings'],
    testMappings: [T.dUnaffected],
    edits: [['!!booking.eventId && (booking.affected ||', '!!booking.eventId && (true ||']] },
  { id: 'FE-125-69', name: 'the booking details do not say an affected booking is affected (AC7)', file: DIALOG, suites: ['bookings'],
    testMappings: [T.dAffected],
    edits: [['{booking.affected && (\n        <p role="status"', '{false && (\n        <p role="status"']] },
  { id: 'FE-125-70', name: 'the booking details say every booking is affected (AC7)', file: DIALOG, suites: ['bookings'],
    testMappings: [T.dUnaffected],
    edits: [['{booking.affected && (\n        <p role="status"', '{true && (\n        <p role="status"']] },
  { id: 'FE-125-71', name: 'the replacement venue link drops the event (AC7)', file: DIALOG, suites: ['bookings'],
    testMappings: [T.dAffected],
    edits: [['href={`/venues?eventId=${encodeURIComponent(booking.eventId!)}`}', 'href="/venues"']] },

  // ---- Search while a venue is unavailable (AC3, AC4) ----
  { id: 'FE-125-72', name: 'a time that ends the unavailable period is still refused (AC4)', file: AVAILABILITY, suites: ['search'],
    testMappings: [T.sBoundary],
    edits: [['paddedStart < Date.parse(period.end) &&', 'paddedStart <= Date.parse(period.end) &&']] },
  { id: 'FE-125-73', name: 'the setup time is not counted against the unavailable period (AC3, AC4)', file: AVAILABILITY, suites: ['search'],
    testMappings: [T.sLeftOut, T.sBoundary],
    edits: [['const paddedStart = requestedStart - venue.setupTimeMinutes * 60_000;', 'const paddedStart = requestedStart;']] },
  { id: 'FE-125-74', name: 'unavailable periods are ignored by the availability check (AC3)', file: AVAILABILITY, suites: ['search'],
    testMappings: [T.sLeftOut, T.sBoundary],
    edits: [['for (const period of venue.unavailablePeriods) {', 'for (const period of venue.unavailablePeriods.filter(() => false)) {']] },
  { id: 'FE-125-75', name: 'an unavailable venue is left out of the search results (AC3)', file: SEARCH, suites: ['search'],
    testMappings: [T.sFound],
    edits: [['  if (criteria.minCapacity && venue.capacity < Number(criteria.minCapacity)) return false;', '  if (venue.availabilityStatus === "unavailable") return false;\n  if (criteria.minCapacity && venue.capacity < Number(criteria.minCapacity)) return false;']] },
  { id: 'FE-125-76', name: 'every time after the start of the unavailable period is refused (AC3)', file: AVAILABILITY, suites: ['search'],
    testMappings: [T.sFound],
    edits: [['paddedStart < Date.parse(period.end) &&\n      paddedEnd > Date.parse(period.start)', 'paddedStart < Date.parse(period.end) ||\n      paddedEnd > Date.parse(period.start)']] },
];
