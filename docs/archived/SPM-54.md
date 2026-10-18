# SPM-54 AI usage archive

Historical AI-assisted work associated with SPM-54.

## 2026-10-18

- swr - testing - SPM-54 - Rerun booking test flow and sync Jira: Re-ran backend/frontend unit and coverage suites, four PostgreSQL integration suites, SPM-54 backend/frontend mutations, responsive Playwright, lint, builds, and the broader SPM-135 mutation set (77 killed, 6 equivalent, 1 misapplied RV7). Then verified the complete coordinator submit/duplicate/cancel flow in Chrome against the real API and disposable PostgreSQL database; updated Confluence matrix and Jira with evidence, and left Jira In Progress for the 33 unexecuted manual procedures and unavailable staff decision workflow.

## 2026-10-17

- swr - implementation - SPM-54 - Check venue availability in the background: Automatically fetch the current schedule for a valid event time, debounce edits, ignore stale responses, and retain the server-side submit check.
- swr - implementation - SPM-54 - Reject duplicate venue requests: Check overlapping pending requests for the same event inside the venue-locked transaction, including setup/turnaround, and return HTTP 409 instead of inserting another row.
- swr - implementation - SPM-54 - Remove disconnected venue links: Removed Venue Availability from coordinator and Venue Staff navigation and hid the nonfunctional staff booking-review link while retaining coordinator Bookings.
- swr - implementation - SPM-54 - Show existing request after duplicate submit: Return the existing booking ID/reference with duplicate conflicts, hide the repeat submission form, and link the coordinator to Bookings.
- swr - implementation - SPM-54 - Replace submitted form with confirmation: Hide the special-request field and submit button after success; show a request confirmation, booking reference, and Bookings link.
- swr - implementation - SPM-54 - Detect prior pending requests on page load: Include the coordinator's persisted bookings in the background check and suppress repeat submission for an overlapping request at the same venue.
- swr - implementation - SPM-54 - Remove fake booking decisions: The coordinator booking detail modal no longer exposes approve/reject controls that only mutated local frontend state; pending requests are shown as awaiting Venue Staff review.
- swr - implementation - SPM-54 - Remediate booking workflow test review: Updated stale frontend expectations, added duplicate-request and pending-review coverage with mutation mappings, and verified SPM-54 unit mutants plus the SPM-135 cancelled-row read-model mutant.
- swr - implementation - SPM-54 - Complete booking test review remediation: Added PostgreSQL-backed repeat-request, request history, eligibility, coordinator-assignment, and SPM-135 cancelled-booking read-model coverage with exact mapped SQL mutants; PostgreSQL execution delegated to Orchestrator because this worker cannot reach the disposable database.
- swr - implementation - SPM-54 - Close lifecycle-state test gaps: Added per-status UI suppression coverage for pending, approved, rejected, and cancelled requests; corrected legacy removal E2E expectations to retain cancelled booking history. Backend PostgreSQL E2E passed 88/88, backend SPM-54 mutants 31/31 killed, and frontend SPM-54 mutants 17/17 killed; SPM-135 AR2 was killed in the database-backed run (the broader 84-mutant script also reported one pre-existing misapplied mutant and six equivalent mutants).
- swr - implementation - SPM-54 - Enforce event/venue request identity and event-owned booking times: Added the composite request association and forward migration while retaining booking history; API accepts only event ID and optional note, and booking times come from the assigned event row.
- swr - implementation - SPM-54 - Verify repeat request and legacy migration invariants: Added PostgreSQL cases for event rescheduling and legacy-note aggregation/history preservation, with mapped time-filter and reverse-order migration mutants.
- swr - implementation - SPM-54 - Preserve request history when removing a Planning venue request: Marked removed unavailable rows cancelled, added duplicate-resubmission E2E/mutant coverage, and corrected Approved/Planning eligibility docs.
- swr - implementation - SPM-54 - Complete frontend booking-flow coverage: Added isolated suitability, availability refresh, submission-to-My Bookings reference, two-venue replacement/abandonment, and cancellation-state UI checks; My Bookings now shows persisted booking references.

## 2026-10-16

- swr - implementation - SPM-54 - Style suitability warnings: Added gold warning icons before each venue mismatch reason in the event-specific availability assessment.
- swr - implementation - SPM-54 - Seed a suitable venue for Accessible hybrid seminar: Aligned the sample event's wheelchair accessibility requirement with the canonical venue label so Sample Birch Lecture Hall can pass its suitability assessment.
- swr - implementation - SPM-54 - Limit venue requests to eligible events: Restricted the event selector and request context to Approved and Planning events; Confirmed and otherwise ineligible URL selections cannot be submitted.
- swr - implementation - SPM-54 - Enforce eligible-event booking requests server-side: Reject assigned events outside Approved/Planning before schedule checks or venue-booking insertion; added repository, service, and PostgreSQL E2E coverage.
- swr - implementation - SPM-54 - Keep venue requests tied to their event: Removed event switching from the venue detail flow; booking context now comes only from the linked event URL, and missing/ineligible event context cannot submit.
- swr - implementation - SPM-54 - Streamline venue booking request: Moved schedule refresh inline with the event time fields, exposed the booking form after a successful availability check, and constrained narrow layouts to prevent horizontal overflow.
- swr - implementation - SPM-54 - Fix mobile venue availability overflow: Allowed the app shell and page flex layouts to shrink, constrained the calendar to an internally scrollable viewport, and enabled legend/caption wrapping on narrow screens.
- swr - implementation - SPM-54 - Make mobile venue calendar usable: Displayed a single-day calendar with day navigation on narrow screens, retained the weekly desktop calendar, and kept the active date when the viewport changes.

## 2026-10-15

- swr - implementation - SPM-54 - Submit a venue booking request: Added server and UI suitability checks, optional special requests, coordinator booking list, affected-booking indication, and independent cancellation with last-active confirmation; mapped 10 backend and 8 frontend mutants were killed. PostgreSQL E2E suite was skipped because DATABASE_URL is unavailable.
- swr - implementation - SPM-54 - Submit a venue booking request (review remediation): Added capacity-equality and multiple-status/selected-row tests, strengthened selected-event time and replacement-preservation assertions, added exact SQL-boundary checks and E2E cases; 16/16 backend and 9/9 frontend mutants killed. E2E suite (15 tests) remains skipped because no DATABASE_URL is configured and local PostgreSQL/Docker is unavailable.
- swr - implementation - SPM-54 - Event-specific venue suitability assessment: Verified the updated AC1 assessment in the event-selected venue availability flow (`/venue-records/:id?eventId=...`) and added VEN-BKG-01 mismatch and capacity-boundary coverage there.
