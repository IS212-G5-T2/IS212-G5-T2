# Coverage line status

Every uncovered line of an in-scope source file needs a row here (gate G5). Lines covered only by an end-to-end run are classified COVERED-BY-E2E automatically and need no row.

| Status         | Meaning                                                                        | Note required     |
| -------------- | ------------------------------------------------------------------------------ | ----------------- |
| COVERED-BY-E2E | Only an end-to-end test runs it; a unit or integration test is still preferred | Name the e2e test |
| ADD-TEST       | A test will be added this cycle                                                | Test id           |
| UNREACHABLE    | No valid input can execute it                                                  | Why               |
| LOW-VALUE      | Reachable, but only logging or trivial; no test added                          | Why               |
| OPEN           | Not yet decided; counts as a gap in the metrics                                | What is undecided |

| File                                                                       | Lines     | Status      | Note                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frontend/src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx | 431,433,436 | LOW-VALUE   | Event status update after first booking is SPM-148 lifecycle behavior and not part of the SPM-54 booking-request criteria. The request result is shown without mutating event lifecycle status.                                                                                             |
| frontend/src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx | 28,292,296 | UNREACHABLE | Generic selection handlers are not connected to the SPM-54 page: assigned-event times are fixed, and browse-only mode is read-only. The calendar keeps schedule navigation but does not provide time-range selection in these modes.                                                       |

### Branch-only residuals from cycle 05

These are branch misses whose source lines are otherwise executed, so they do not appear in the uncovered-line table above. They explain the remaining metrics-floor miss without treating it as completed coverage:

- `frontend/src/features/events/pages/detail/planning/PlanningInformationPage.tsx` (branches at 230, 455–459, 485–499, 539–540, 604–605, 691–698, 712–714) and `PlanningInformationPanel.tsx` (187–188): the missed paths are planning-tab/refresh lifecycle, venue/equipment removal actions, conditional people details, and safety-check reset/request rendering. SPM-54 changes only which cancelled venue rows these existing planning views display; the new filtering predicate is separately covered in `activeVenueRequests.test.ts` and the page/panel tests. The remaining paths are owned by planning and safety-check criteria, not venue booking requests.
- `frontend/src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx` branch 251: the no-booking cancellation guard is not reachable through the page because the Cancel action is rendered only when an active booking summary exists. Branches 430, 433, 617–618, and 811–817 cover the SPM-148 event status transition and its corresponding notices; SPM-54 does not change event lifecycle status. Lines 431, 433, and 436 remain explicitly marked LOW-VALUE for that boundary.
- `frontend/src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx` branches 29–31, 223, 263, 295, and 300: 29–31 belong to the generic range-validity helper, 295 to optional range selection, and 300 to clearing a selected range. The SPM-54 page intentionally passes no selection callback in assigned-event booking mode (the event period is fixed) or browse-only mode (read-only); the mobile calendar behavior is covered without restoring range selection. Branches 223 and 263 are optional initial-date navigation; their effects are ancillary to the assigned-time contract and the calendar's initial event date is supplied by the page.
