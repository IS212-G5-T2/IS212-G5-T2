# Coverage line status

Every uncovered line of an in-scope source file needs a row here (gate G5). Lines covered only by an end-to-end run are classified COVERED-BY-E2E automatically and need no row.

| Status         | Meaning                                                                        | Note required     |
| -------------- | ------------------------------------------------------------------------------ | ----------------- |
| COVERED-BY-E2E | Only an end-to-end test runs it; a unit or integration test is still preferred | Name the e2e test |
| ADD-TEST | A test will be added this cycle | Test id |
| UNREACHABLE | No valid input can execute it | Why |
| LOW-VALUE | Reachable, but only logging or trivial; no test added | Why |
| OPEN | Not yet decided; counts as a gap in the metrics | What is undecided |
| EXCLUDED | Excluded by a `line` row in coverage-exclusions.md; the gate requires that row | Pointer to the exclusion row |

Each row below is one file and line set. Sprint 1 rows name their story first; out-of-scope and scope-gap rows are labelled in the note.

| File | Lines | Status | Note |
|---|---|---|---|
| backend/src/events/status/status.service.ts | 540 | ADD-TEST | SPM-38: `requireUser` refuses a call with no identity (401). Test: `backend/src/events/status/status.identity.spec.ts`, "refuses a status-history read when there is no identity, without querying the database" and "refuses a confirmed-arrangements read when the identity has no user id". Now covered. |
| frontend/src/components/notifications/useNotificationFeed.ts | 29 | ADD-TEST | SPM-83: `refresh` returns while a load is pending. Test: `frontend/src/components/notifications/RejectionNotifications.test.tsx`, "does not start a second notification load while one is still in flight". Now covered. |
| backend/src/event-drafts/drafts.controller.ts | 6 | EXCLUDED | See coverage-exclusions.md row `backend/src/event-drafts/drafts.controller.ts:6` (line kind): decorator metadata fallback, not project logic; decided by product owner for SPM-150. |
| backend/src/clarifications/clarifications.controller.ts | 11 | EXCLUDED | See coverage-exclusions.md row `backend/src/clarifications/clarifications.controller.ts:11` (line kind): decorator metadata fallback, not project logic; decided by product owner for SPM-150. |
| backend/src/clarifications/clarifications.service.ts | 38 | EXCLUDED | See coverage-exclusions.md row `backend/src/clarifications/clarifications.service.ts:38` (line kind): decorator metadata fallback, not project logic; decided by product owner for SPM-150. |
| backend/src/clarifications/repository/clarifications.repository.ts | 53 | EXCLUDED | See coverage-exclusions.md row `backend/src/clarifications/repository/clarifications.repository.ts:53` (line kind): decorator metadata fallback, not project logic; decided by product owner for SPM-150. |
| backend/src/events/review/event-rejections.controller.ts | 5 | EXCLUDED | See coverage-exclusions.md row `backend/src/events/review/event-rejections.controller.ts:5` (line kind): decorator metadata fallback, not project logic; decided by product owner for SPM-150. |
| frontend/src/features/events/pages/edit/EventEditForm.tsx | 38 | UNREACHABLE | SPM-39: `fromDateTimeLocal` returns "" for an unparseable value. A datetime-local control only reports "" or a valid local date-time, so the form cannot pass an unparseable value. The empty value (line 36) is tested. |
| frontend/src/features/events/pages/edit/EventEditForm.tsx | 257 | UNREACHABLE | SPM-39: `input.files ? Array.from(input.files) : []`: a file input always exposes a FileList, so the fallback cannot run. The empty selection is tested ("ignores a file selection that contains no files"). |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 482 | UNREACHABLE | SPM-83: The Submit decision button is disabled unless `reviewDecision` is set, and the radio controls set only "approve" or "reject". The guard returns only for any other value. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 105, 158, 174, 230, 231, 324 | OPEN | Out of scope for Sprint 1. Last written by a commit without a Sprint 1 key. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 328 | OPEN | Out of scope for Sprint 1. Last written by SPM-135. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 544, 559, 621, 622, 623 | OPEN | Out of scope for Sprint 1. Last written by SPM-138. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 543, 558, 562, 590, 604, 620, 713, 752 | OPEN | Out of scope for SPM-38 (review). Measured in the SPM-38 run on 2026-10-21: registration report, planning change and register-button UI owned by other features. Needs a story-owner decision on which story covers them. |
| frontend/src/store/useAppStore.ts | 410, 411 | OPEN | Out of scope for Sprint 1. Last written by SPM-30 (restrict attendee operations). |
| frontend/src/store/useAppStore.ts | 131, 159, 169, 173, 268, 273, 274, 276-279, 281, 287, 293, 295, 296, 299, 304-306, 308, 311-313, 319, 323, 330, 331, 337, 338, 346-348, 350, 353, 354, 358, 417, 501-503, 507-509, 511 | OPEN | Out of scope for Sprint 1. Last written by commits without a Sprint 1 key (store code from the earlier feature branches). |
| backend/src/events/status/status.service.ts | 168, 210, 394 | OPEN | Out of scope for Sprint 1. Last written by SPM-135. |
| backend/src/events/status/status.service.ts | 169, 211, 286, 316, 429, 435, 446, 448, 449, 463, 516, 517 | OPEN | Out of scope for Sprint 1. Last written by commits without a Sprint 1 key. |
| backend/src/events/status/arrangements.reader.ts | 42, 43 | OPEN | Out of scope for Sprint 1. Last written by SPM-135 (confirmation). The earlier note still applies: `NoSafetyRecordSource` is registered in app.module.ts but nothing injects it, so the class is dead code; a candidate for UNREACHABLE and removal in a follow-up. |
| backend/src/events/status/safety-check.source.ts | 50 | OPEN | Out of scope for Sprint 1. Last written by SPM-135. |
| backend/src/events/planning/event-planning.service.ts | 94, 767, 768 | OPEN | Out of scope for Sprint 1. Last written by SPM-49, SPM-97, SPM-85 (planning). |
| backend/src/events/planning/event-planning.repository.ts | 169 | OPEN | Out of scope for Sprint 1. Last written by SPM-49, SPM-97, SPM-85 (planning). |
| frontend/src/features/events/pages/edit/EventEditPage.tsx | 16, 17 | OPEN | Out of scope for Sprint 1. The "Event not found" branch was last written by the frontend skeleton commit (3f46e16), not by SPM-39. |
| backend/src/events/events.service.ts | 50-51, 64, 67-70, 72-74, 93-96, 188, 190, 193-194, 196, 211, 225-227, 230, 239-240, 245-246, 255-256, 258, 260, 262, 265-267, 269, 272-273, 277-278, 280, 284-285, 288-291, 295, 300, 304-307, 309, 316, 321, 328-331, 334-335, 339-342, 345-346, 349, 358, 368, 377-380, 384-387, 390-391, 394, 402, 412, 424-425, 451-452, 456-457, 465, 483-485, 489-490, 499-500, 503-504, 506-508, 518, 548, 557 | OPEN | Scope-only gap (cycle 05 G5 scope run): the story scope tests run alone do not reach this line. In the merged cycle-05 measurement (unit and e2e), the line is covered by other suites, so it is not a changed line of a Sprint 1 story. Needs a decision on whether to move it to the scope. |
| frontend/src/features/events/pages/create/EventCreatePage.tsx | 100-101, 160-161, 190, 221-222, 246, 252, 254, 300, 305, 310, 536, 647, 658 | OPEN | Scope-only gap (cycle 05 G5 scope run): the story scope tests run alone do not reach this line. In the merged cycle-05 measurement (unit and e2e), the line is covered by other suites, so it is not a changed line of a Sprint 1 story. Needs a decision on whether to move it to the scope. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 103-104, 119, 161-164, 190, 196-198, 202-203, 212, 262, 274, 278, 282, 285, 291, 295, 299, 302, 348, 364-366, 378-379, 445-446, 474, 483-485, 493-494, 496-502, 504, 508, 563, 591, 605, 714, 753 | OPEN | Scope-only gap (cycle 05 G5 scope run): the story scope tests run alone do not reach this line. In the merged cycle-05 measurement (unit and e2e), the line is covered by other suites, so it is not a changed line of a Sprint 1 story. Needs a decision on whether to move it to the scope. |
| frontend/src/store/useAppStore.ts | 25-27, 29-31, 115, 119, 128-129, 152-153, 157, 165, 167, 172, 174, 266, 366, 369-370, 372, 384, 387, 390, 394-395, 398, 401, 407, 414, 416, 424, 426-427, 429, 433-434, 438, 441, 445-447, 449, 451, 453-454, 456, 461-465, 467, 470, 475-477, 480, 485-490, 496-497, 517, 523 | OPEN | Scope-only gap (cycle 05 G5 scope run): the story scope tests run alone do not reach this line. In the merged cycle-05 measurement (unit and e2e), the line is covered by other suites, so it is not a changed line of a Sprint 1 story. Needs a decision on whether to move it to the scope. |

Measurement basis for the Sprint 1 rows (cycle 05, SPM-150): the changed lines of each story (`ai/runtime/test-cycles/<story>/cycle-05/changed-lines.md`), measured on the merged runs of backend unit (`npm run test:cov`), backend e2e (`npm run test:cov:e2e`, full suite) and frontend unit (`npm run test:cov`). A line is uncovered when it has a statement, branch path or function that never ran.

**Sprint 1 stories (SPM-36, SPM-37, SPM-38, SPM-39, SPM-40, SPM-83)**

Rows removed in this cycle because the line is no longer uncovered in the merged measurement: the SPM-36 rows for `EventCreatePage.tsx` (all lines run now), the SPM-38/SPM-40/SPM-83 rows for `events.service.ts` (all lines run now), and the earlier `status.service.ts` rows 121, 161, 383 and 450 (run by the e2e suite in the merged measurement). The old explanations are kept in the git history of this file (commit d8c8d2c) for the mutation notes M7b, M8b, M9b and M11 of SPM-135/SPM-136.

**Out of scope for Sprint 1 (no tests written in this cycle)**

These uncovered lines are not changed by SPM-36, SPM-37, SPM-38, SPM-39, SPM-40 or SPM-83 at HEAD (blame, see `changed-lines.md`). The label is "out of scope for Sprint 1"; each row stays OPEN.

**Scope-only gaps from the G5 scope run (cycle 05)**

The G5 gate measures each story's whole scope source files with that story's own test files only. Lines below are uncovered in that scope-only run. None of them is a changed line of a Sprint 1 story that is uncovered in the merged measurement (checked in cycle 05), so they stay OPEN as scope gaps. Decide whether the scope files need other tests or whether the scope is too wide.
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
