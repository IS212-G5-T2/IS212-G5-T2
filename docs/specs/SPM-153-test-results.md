# SPM-153 Test Results

Status: implementation and automated tests in progress on `feature/SPM-153-Event-Status-Changes-from-Confirmed-to-Completed`. Not committed, not pushed. Test-case source: `SPM-153-test-cases.md` (33 cases; the cases are not in this repo's `docs/specs/`).

## 1. Decisions applied (Decision Register)

| # | Decision | Applied as |
|---|---|---|
| D2 | Mutation routes that do not exist | Option A: every existing route that changes date, time, venue bookings or equipment gets the guard. Routes not present in the repo are listed in section 5. |
| D3 | Organiser access to the record | Assigned Coordinator only (Organiser, other Coordinators, Lead not assigned, Attendee get 403; no token 401). |
| D4 | What the lock covers | Recommended four items (date, time, venue bookings, equipment). **Deviation:** name and description are also locked on Completed events, because the existing planning rule (`EDITABLE_STATUSES = approved, planning`, `event-planning.service.ts:58`) already refuses every planning edit on a Confirmed or Completed event. See section 6. |
| D13 | Edits to finished stories | Yes, limited to the listed edits (section 4). |
| Stack | Repo's Vitest and PostgreSQL | Used. |

## 2. What ran

| Check | Command (in `backend/`, env `DATABASE_URL` set to the `spm_test` database) | Result |
|---|---|---|
| Completion e2e (new) | `npx vitest run --config ./vitest.config.e2e.ts test/events-completion.e2e-spec.ts` | 40/40 pass |
| Confirm e2e (existing, one assertion updated, see section 6) | `test/events-confirm.e2e-spec.ts` with the completion suite | 82/82 pass together (Confirm 42 and completion 40) in isolation |
| Status tracking, cancel (existing) | `test/events-status-tracking.e2e-spec.ts`, `test/events-cancel.e2e-spec.ts` | 12/12, 35/35 in isolation |
| Backend unit (full) | `npx vitest run` | 98 files, 2276/2276 pass |
| Frontend unit (full) | `npx vitest run` in `frontend/` | 158/158 files pass; 2364 tests pass, 1 skipped, 1 todo (one existing assertion updated, see section 6) |
| Backend lint | `npx oxlint` on changed backend files | clean |
| Backend build | `npx nest build` | pass |
| Frontend lint | `npx eslint` on changed frontend files | clean |
| Frontend build | `npx vite build` and `npx tsc -b` | pass |

Full backend e2e suite: **flaky on the baseline too.** A clean worktree of HEAD (before these changes), run against its own rebuilt database, gave 2 failures in one run and 6 failures in another (a third baseline run was cut short at 406 of 1046 tests while other suites ran against the same database, so it is not evidence) (`coordinator-queue`, `registrations.withdraw`, `event-options-migration`, `events-planning`). The two migration-rollback tests (`EVENT-UPDATE-07-SEC-1`, `EVENT-UPDATE-08-SEC-1`) fail on the baseline every time. On my branch, full-suite runs failed in different suites each time (`change-request-review`, `safety-officer`, `venues`, `coordinator-queue`, `registrations`); each of those suites passed when run alone. I did not change anything to make these pass, and I have not established a root cause for the cross-suite interference.

## 3. Mutation checks (Guide 7, run on the working tree and restored after each)

| Mutant | Description | Result |
|---|---|---|
| M2 | `>` instead of `>=` at the end instant | Killed by COMPLETE-EVENT-01-C (boundary cases) |
| M4 | Status check removed from completion | Survived first; killed after adding COMPLETE-EVENT-02-C order test (409 before 422) |
| M7 | History row not written on completion | Killed by 03-A and the history-equality checks (4 failures) |
| M19 | Planning arrangements guard removed | Killed by COMPLETE-EVENT-06-B |
| M20 | Venue approval guard removed | Killed by COMPLETE-EVENT-06-C |

Not run in this pass (no result claimed): M1, M3, M5, M6, M8 to M18, M21 to M26. Mutants M3 and M5 are equivalent under the row lock and the locked re-check, so their kill needs a concurrency or unit design rather than an e2e flip.

## 4. Changed and added code

Backend
- `events/status/status.service.ts`: `Completed` target handled after authorisation; `complete()` takes the event row lock, checks assignment, status (409 `EVENT_NOT_COMPLETABLE`), end instant (422 `EVENT_NOT_ENDED`), compare-and-set, history row. Cancelled and other target handling unchanged.
- `events/cancelled-guard.ts`: new `assertArrangementsEditable` (Cancelled keeps MSG-CN-04; Completed gives 409 `EVENT_COMPLETED`, MSG-CP-06). `assertEventNotCancelled` unchanged.
- Guard call sites: planning update (`event-planning.service.ts`), change-request review approve/deny/recheck (`change-request-review.service.ts`), change-request submit (Completed only, `change-requests.service.ts`).
- Venue repository and service: approve, reject and coordinator cancel of a booking on a Completed event refused with MSG-CP-06 (`venues.repository.ts`, `venues.service.ts`).
- Equipment requests repository and service: update, reserve and cannot-provide refused for a Completed event with MSG-CP-06.
- New: `events/completion/` (messages, pure rules: `hasEventEnded`, `validateCompletionRecord`; record service; controller at `api/events/:eventId/completion-record`). Registered in `app.module.ts`.
- Migration `029_spm153_completion_records.sql` (in `backend/migrations/` and `database/postgresql/init/`): `completion_records`, `completion_record_issues`.

Frontend
- `utils/completion.ts`: API helpers and the client end-instant check.
- `pages/detail/planning/CompleteEventPanel.tsx`: Mark as Completed, disabled with the reason until the end instant, enabled by a timer; a server refusal keeps it disabled until reload.
- `pages/detail/planning/CompletionRecordForm.tsx`: record form on Completed events, assigned Coordinator only; entered values kept on error.
- `PlanningInformationPage.tsx`: renders both.

Tests
- `test/events-completion.e2e-spec.ts` (new, 40 cases, real PostgreSQL).
- `events/completion/completion.rules.spec.ts` (new, pure).
- `CompleteEventPanel.test.tsx`, `CompletionRecordForm.test.tsx` (new).

## 5. Gap list

| Case | Status | Reason |
|---|---|---|
| 06-F | **Not done, accepted by product owner.** A Completed event may still be flagged when a venue is marked unavailable. | Owner decision: no change needed, since the event has completed. |
| 06-D | Code added (equipment repository and service guard); **no test** | Needs an equipment request fixture. |
| 06-E | Unit tests only (mocked); no e2e | Change-request e2e fixture not written. |
| 06-C | Approve, reject and cancel guarded and tested; create, update, delete, release and replace not inventoried | No route for some of these in the repo; the others need the same treatment as approve. |
| 06-G | Name-only edit on a Completed event is refused, not allowed (D4 recommendation) | See section 6. |
| 06-A | Not done | Read-only display of arrangements on a Completed event not changed; no test. |
| 01-F, M24 | Not tested | No scheduled job check. |
| 03-B, 03-C, 03-D | Partly covered (refused attempts leave no row; UTC instant asserted). Not tested: SGT display across the boundary, three time zones, strict body (400 for `changedBy`), history PUT and DELETE (405) | Status change ignores unknown body keys (F6 expects 400). |
| 04-B, 04-C | Not tested | Queue before and after completion, empty state, other Coordinators' events. |
| 05-E | Boundaries tested in pure rules; not through HTTP | Validation logic covered; HTTP mapping of maxima not asserted. |
| 05-G | Not tested | Plain-text rendering of script and SQL text not asserted. |
| 02-A, 02-B (queue) | Partly covered (panel shown only for Confirmed) | Queue-level action absence not asserted. |

## 6. Deviations and changes to existing tests

- **Name and description** on Completed events are locked (D4 deviation, see section 1). This matches the existing rule for Confirmed events. Accepted by product owner.
- `events-confirm.e2e-spec.ts` (CONFIRM-EVENT-SUP-03): the "unsupported target" example was `Completed`, which is now a supported target. Changed to `Planning`, which the endpoint still refuses with 400.
- `EventDetailPage.planning.test.tsx` (EVENT-VIEW-01-C): the read-only assertion allowed only "View Registrations". The filter now also allows "Mark as Completed", the action this story adds, and its comment says so.
- `change-requests.service.spec.ts` and `change-request-review.service.spec.ts`: the Completed case was grouped with other closed statuses under the generic message. Completed now has its own case expecting `EVENT_COMPLETED`; Rejected and Cancelled keep their old expectations.
- `venues.repository.spec.ts`: two exact-SQL assertions updated for the added `e.status AS event_status` column.

## 7. Known limitations

- Two existing migration-rollback e2e tests fail on the baseline (not introduced here).
- The full e2e suite is flaky (section 2).
- No commit, push, PR or Jira transition has been made.
