# SPM-148 Event Status Changes from Approved to Planning: build and test results

Status: features and tests written; every suite run once. **Not reviewed:** Test Code Review, Requirement Review, Code Quality Review and the mutation check (Guide 7) were deliberately not run, at the user's instruction. Nothing below is review evidence.

Sources: the pasted SPM-148 prompt (AC text, rules R1 to R12, resolved-spec table 2.6). `docs/prompts/test-code-generation-guide.md` and `docs/specs/SPM-148-test-cases.md` do **not exist in the repository**, so oracles come from the prompt only and the 32 IDs below are the prompt's `PLAN-STATUS-nn-x` list. The Jira story was not re-read.

## Repo differences from the prompt (confidence VERIFIED unless noted)

| Prompt assumption | Repo reality | What was done |
|---|---|---|
| MySQL, `EVT-801`-style ids | PostgreSQL, UUID ids, Nest + Vitest | Fixtures create per-test users, venues and events with the real schema; no shared seed edited |
| Booking endpoint, single and multi-venue | `POST /api/venues/:venueId/booking-requests`, one venue and one slot per request | Transition added inside its transaction (D2 option A). Multi-venue cases Not Automated |
| `StatusChangeService`, history table | `StatusService`; `event_status_history(from_status,to_status,actor_id,created_at)` from SPM-135 | Reused; added `GET /api/events/:eventId/status-history` and 405 handlers |
| Statuses Draft / Under Review | Events are Submitted, Approved, Rejected, Planning, Confirmed, Completed, Cancelled | Active workload list is Submitted, Approved, Planning, Confirmed (was Submitted, Approved, Confirmed) |
| Coordinator queue with `?status=` (SPM-48) | No queue endpoint. `GET /api/events` is coordinator-scoped; `EventListPage` already has a client-side Planning filter | No queue built (D8 alternative: queue cases Not Automated). AC5 asserted on the events list |
| Workload API, limit 5, `availability()` | No workload API. The Lead list returns `activeAssignments`; availability is a manual flag (`users.is_available`) plus a Lead notice that counts active events | AC6 asserted on the Lead list and the unavailable notice. Limit-5 function Not Automated |
| Unassigned Coordinator / non-Coordinator get 403 | Existing: unassigned Coordinator 404 "Assigned event not found."; other roles 403 "Coordinator access required." | Existing responses asserted as they are (F3 rule) |
| D3: every status other than Approved/Planning/Confirmed gets 409 | SPM-51 accepted bookings for Submitted events | Per your decision, Submitted now gets 409 too. SPM-51 fixtures that booked against default-Submitted events were moved to Planning (`venues-booking-requests.e2e-spec.ts`, `venues.repository.spec.ts` mocks) |
| Organiser can start a clarification thread (07-A) | SPM-39: only the assigned Coordinator starts a thread; Organiser and Coordinator reply | Existing roles asserted. Organiser-started post Not Automated (F16: stop and ask) |
| Requests for multiple venues and duplicate requests (03-B/03-D) | SPM-54 AC7 rejects another active request for the same event/venue; distinct venues remain independent | 03-B asserts five sequential requests to five venues; 03-D asserts one success and four duplicate conflicts, one booking and one history row |
| API status casing | `GET /api/events` returns lowercase (`planning`); history and DB keep `Planning` | Asserted as the repo has it |

## Changes to finished stories (D13)

`event-status.ts` (booking-open list is Approved, Planning, Confirmed; renamed `ACTIVE_COORDINATOR_EVENT_STATUSES` to `ACTIVE_WORKLOAD_STATUSES`, added Planning; new `BOOKING_OPEN_STATUSES`, `CLARIFICATION_OPEN_STATUSES`, `shouldTransitionToPlanning`), `venues.repository.ts`/`venues.service.ts` (status guard, compare-and-set, history, response fields), `booking-request.ts` (strict body), `clarifications.service.ts` (Planning open, Confirmed 409), `lead-assignment.service.ts` and `coordinator-availability.service.ts` (constant import only), `status.controller.ts`/`status.service.ts` (history read, 405), `EventDetailPage.tsx` (history panel), `VenueRecordDetailPage.tsx` (MSG-PL-01, store status). Existing tests updated for the new active list: `lead-assignment.service.spec.ts`, `lead-assignment.e2e-spec.ts`, `venues.repository.spec.ts` (mock event row now carries `status`).

Lock order: the event row is now `FOR UPDATE` (was `FOR SHARE`) after the venue row; no other code path locks the event first and then a venue, so no cycle was found (reasoned, plus 20 clean parallel runs).

## Results (all runs actual)

| Test case | Subtest | File :: test | Layer | Result | Notes |
|---|---|---|---|---|---|
| 01-A | | `test/events-planning-transition.e2e-spec.ts` :: PLAN-STATUS-01-A; `VenueRecordDetailPage.planning.test.tsx` :: 01-A | BE integration, FE | Pass | MSG-PL-01 wording ASSUMED |
| 01-B | 5 statuses | e2e :: PLAN-STATUS-01-B (it.each) | BE | Pass | Confirmed 201 no change; Submitted/Rejected/Completed/Cancelled 409. Unit table in `event-status.spec.ts`. Cancelled uses MSG-PL-02 (no SPM-136 guard on this branch) |
| 01-C | conflict | e2e :: 01-C | BE | Pass | |
| 01-C | capacity / suitability | | | Not Automated | Endpoint has no capacity or suitability check |
| 01-D | 4 roles + 401 | e2e :: 01-D | BE | Pass | Existing 404/403 text |
| 01-E | multi-venue | | | Not Automated | One venue per request |
| 02-A | | e2e :: 02-A | BE | Pass | `booking.created_at` is DB time, so only history and `events.updated_at` equal T0 |
| 02-B, 02-C, 02-D | faults after status UPDATE, booking INSERT, history INSERT | e2e :: 02-B/C/D | BE real DB | Pass | Database trigger raises right after the write; retry succeeds. No hold table, no hold assertion |
| 02-E | parallel | e2e :: 02-E | BE real DB | Pass | Adapted: two venues, same event |
| 03-A | | e2e :: 03-A; FE :: 03-A | BE, FE | Pass | |
| 03-B | | e2e :: 03-B | BE | Pass | Five sequential requests use distinct venues to avoid violating SPM-54 AC7. |
| 03-C | | e2e :: 03-C | BE | Pass | Rejection by direct SQL fixture (no reject path exists) |
| 03-D | parallel / double click | e2e :: 03-D; FE :: 03-D | BE real DB, FE | Pass | Parallel same-event/same-venue submissions: one 201, four `ACTIVE_VENUE_REQUEST_EXISTS` conflicts, one booking, one transition. |
| 04-A | | e2e :: 04-A (x2); `StatusHistory.test.tsx` | BE, FE | Pass | Shows "15 Oct 2026 12:00 SGT" |
| 04-B | | e2e :: 04-B | BE | Pass | PUT and DELETE 405 with `Allow: GET` for Coordinator and Organiser |
| 04-C | | e2e :: 04-C; `booking-request.spec.ts` | BE, unit | Pass | 400 `UNSUPPORTED_BOOKING_FIELDS` |
| 04-D | | e2e :: 04-D; `StatusHistory.test.tsx` | BE, FE | Pass | Also run under three `TZ` values |
| 05-A | | e2e :: 05-A/B; `EventListPage.planning.test.tsx` | BE, FE | Pass | Events list, not a queue endpoint |
| 05-B | | covered inside e2e :: 05-A/B | BE | Pass | No FE reload test |
| 05-C | empty / foreign / bad value | foreign events asserted in 05-A/B | BE | Not Automated | No queue endpoint, no `status` parameter, no 400 for unknown value |
| 06-A | | e2e :: 06-A/B | BE | Pass | Active count 4 before and after the move |
| 06-B | | e2e :: 06-A/B | BE | Pass | API only; no Lead UI breakdown text exists |
| 06-C | notice | e2e :: 06-C | BE | Pass | Planning-only coordinator gives "1 active event" notice |
| 06-C | limit 5 / `availability()` | | | Not Automated | Function does not exist |
| 07-A, 07-B | | e2e :: 07-A/B | BE | Pass | Coordinator posts, Organiser and Coordinator reply. Organiser-started post Not Automated. No FE composer test |
| 07-C | | e2e :: 07-C | BE | Pass | |
| 07-D | | e2e :: 07-D | BE | Pass | Confirmed set by SQL, not by the real confirm flow |
| 07-E | | e2e :: 07-E | BE | Pass | |
| 08-A | | e2e :: 08-A | BE | Pass | Status-change endpoint refuses Planning (400 `UNSUPPORTED_TARGET_STATUS`) |
| 09-A | | e2e :: 09-A | BE | Pass | No Organiser FE test |
| 10-A | | e2e :: 10-A | BE | Pass (partial) | Refusal from Approved asserted; the 200 from Planning needs full arrangements, covered by SPM-135 |

## Evidence Table (oracle tier)

All e2e rows: oracle SPEC (prompt 2.6 table) except: 01-D messages and 404/403 (VERIFIED existing behaviour), 03-D (VERIFIED existing behaviour, adapted), `statusChanged`/`eventStatus` response shape (ASSUMED, D5), error code `UNSUPPORTED_BOOKING_FIELDS` (ASSUMED), MSG-PL-01 wording (ASSUMED), fault placement by trigger (DERIVED, Guide 5G). Each test carries a `Kills:` line naming the mutant it targets; the targets were not mutation-verified.

## Run record

| Suite | Command | Baseline | After |
|---|---|---|---|
| Backend unit | `npx vitest run` (backend) | 51 files, 1264 pass | 52 files, 1278 pass |
| Backend e2e (PostgreSQL) | `DATABASE_URL=postgres://spm:spm@localhost:55432/spm npx vitest run --config ./vitest.config.e2e.ts` | 360 pass, 11 skipped, 1 todo | 396 pass, 11 skipped, 1 todo |
| Frontend | `npx vitest run` (frontend) | 71 of 75 files ran; 4 failed to load (`@fullcalendar/react` declared but not installed). After `npm ci`: 75 files, 1084 pass | 78 files, 1091 pass, 1 todo |
| RED evidence | implementation stashed, new e2e file run | | 30 of 36 failed against the original source (the 6 that passed cover behaviour that already existed) |
| Timezones | `TZ=UTC`, `Asia/Singapore`, `America/Los_Angeles` | | e2e file 36/36 and `StatusHistory.test.tsx` 3/3 each |
| Concurrency | 02-E, 20 consecutive runs | | 20 of 20 pass |
| Transition regression after SPM-54 alignment | `DATABASE_URL=<local-test-database-url> npm run test:e2e -- test/events-planning-transition.e2e-spec.ts` | | 40/40 pass |
| Lint / build | `npm run lint`, `tsc -p tsconfig.build.json`, frontend `tsc -b` | | No errors; remaining lint warnings were already present |

Database used: a postgres container built from `database/postgresql` at the current init scripts. The pre-built `spm-local-postgres` image on this machine was stale (no `venue_bookings`) and gave false failures, so it was not used. Coverage was not measured.

## Gap list

- Not Automated: 01-C capacity/suitability, 01-E multi-venue, 05-C, 06-C limit-5 function, Organiser-started clarification, FE tests for the clarification composer, Organiser event list/history view and the 05-B reload.
- Handoffs: SPM-57 (equipment request transition), SPM-48 (queue endpoint with `status`), SPM-136 (Cancelled guard message MSG-CN-04), SPM-54 (multi-venue), SPM-132/133 (hold rows).
- Decisions taken: D3 Submitted events cannot take booking requests (you); D9, F10 and F24 confirmed by you as proposed. Still open: F16 (Organiser-started thread; the prompt says stop and ask). Equipment requests have no backend yet, so the Submitted rule is enforced for venue requests only.
- Not run: Test Code Review, Requirement Review, Code Quality Review, Playwright.

## Evaluation against the Test Code Generation Guide and the SPM-63 learnings

Scope: my own reading of the new SPM-148 tests against the two documents only. No review agent ran and no mutation check was done, so this is not an independent gate. Fixes were **not** applied (evaluation only). Severity: H blocks Guide Section 11, M should fix, L minor.

| # | Sev | Finding | Document rule | Where |
|---|---|---|---|---|
| E1 | H | Mutation check not run; coverage not measured | Guide 7, 11 (mutation and coverage rows) | whole suite. The `Kills:` lines are claims, not evidence |
| E2 | M | One ID covers two tests (`01-D` x2, `04-A` x3) and several IDs are combined (`05-A/B`, `06-A/B`, `07-A/B`); the permission test reuses `04-A` | Learnings 1, 8, 9 (IDs must be greppable, one per behaviour, none invented) | `events-planning-transition.e2e-spec.ts` |
| E3 | M | Tests use `randomUUID()` for users, venues and events instead of fixed UUIDs | Learnings 2; Guide 3E (Repeatable) | e2e fixtures (matches older repo e2e files, but not the learnings) |
| E4 | M | No per-test oracle source comment (`SPEC`/`DERIVED`/`ASSUMED`); only `Kills:` plus a file-end index | Learnings 4, 11; Guide 5C | all new tests |
| E5 | M | Response fields not all asserted: 01-A uses `toMatchObject` without id/start/end/bookingReference; 06-A asserts only `activeAssignments`; 07-E asserts only status codes | Guide 5F (assert every output field), 5C (assert the specific error) | e2e 01-A, 06-A, 07-E |
| E6 | M | 03-B computes the expectation inside a loop (`statusChanged` is `n === 0`) | Guide 5G (no loops that recompute expectations) | e2e 03-B |
| E7 | M | Several cases do not drive the real upstream flow: reject (03-C) and Confirmed (07-D) are set by SQL; 10-A's second half asserts only `CONFIRM_BLOCKED`, which is weak evidence of "Confirm allowed from Planning" | Guide 5G (decoration), Learnings 10 | e2e 03-C, 07-D, 10-A |
| E8 | M | One new suite file per story spanning venues, events, clarifications and Lead; new FE files named `*.planning.test.tsx` per story | Learnings 3 (one suite per module, tests beside the module; later stories add to it) | placed in `backend/test/` (repo's existing e2e location) and per-story FE files |
| E9 | M | FE 05-A does not assert the "Planning" badge text; no FE tests for the clarification composer states, Organiser view, or the reload in 05-B | Prompt 2.6 oracle; Guide 11 (every rule has coverage) | FE tests |
| E10 | L | File header lacks the per-AC and test-case list required of the e2e file (FE files have it) | Guide 5B, 10A | e2e file |
| E11 | L | Arithmetic not shown for time literals in the e2e file (e.g. 04-D `00:30 SGT = 16:30Z` previous day, T0 `12:00 SGT = 04:00Z`) | Guide 5C | e2e 04-D, T0 constant |
| E12 | L | No boundary or state tiers (`-BND`, `-STATE`) written; 04-B asserts immutability against a snapshot taken from the same database | Guide 5E | e2e |
| E13 | L | Gap-list items not tested at all (01-C capacity, 01-E, 05-C, limit 5, Organiser-started thread) | Guide 10D; recorded in the gap list | see results table |

Met: AAA structure and `Kills:` on every test; oracles are literals from the prompt; fresh fixtures per test (no cross-test data); sad paths include real atomicity (faults injected after each named write, with retry); injected clock; three-timezone run for history times; 20 repeated runs of the concurrency tests; RED run shown; table-driven tests use literal tables; assumptions indexed once at the end of each file.

## Mutation check (run on a scratch copy; originals untouched)

Harness: a copy of `backend/` and `frontend/` in the session scratch directory, one mutant applied at a time, the affected e2e files and unit specs run, then the file restored. Backend e2e: `events-planning-transition`, `lead-assignment`, `clarifications`, `venues-booking-requests`. Unit: the five affected specs. FE: `EventListPage` specs. Each mutant edit must match exactly once, or the run stops.

| Mutant | Change | Killed by | Result |
|---|---|---|---|
| M1 | Unconditional transition (no guard, no CAS) | 01-B, 02-E, 03-A | Killed |
| M2 | Transition also from Confirmed | 01-B | Killed |
| M3 | Status changed before the conflict check | 01-A, 01-BND, 01-C | Killed |
| M4 | Booking and status change in separate transactions | 02-B, 02-D | Killed. 02-C passes under M4: its fault rolls back the booking's own transaction before any split can show. The prompt's design relies on the three tests together |
| M5 | History row never written | 04-A, 02-B, 02-D | Killed |
| M6 | No CAS and no event row lock | 02-E (after the race fixture, see below) | Killed after fix; survived before |
| M7 | Later requests add history | 03-A, 03-B, 01-B | Killed |
| M8 | Automatic revert to Approved when no active booking remains | 03-C | Killed. Synthetic: the repo has no reject route for venue bookings, so the mutant adds the revert query. Some venues repository unit mocks also fail, because the extra query changes call counts |
| M9 | Unknown request fields accepted | 04-C, 08-A | Killed |
| M10 | changedAt from database now() | 04-A, 04-D | Killed |
| M11 | History PUT answers 200 | 04-B | Killed |
| M12 | Status filter ignored (FE) | 05-A | Killed |
| M13 | Coordinator events list returns other Coordinators' events | 05-A | Killed. The events list is the only Coordinator list; there is no queue endpoint |
| M14 | Planning missing from workload list | 06-A, 06-C | Killed |
| M15 | Active count double counts Planning | 06-A, 06-C | Killed |
| M16 | Lead list and availability use an old status list | 06-A, 06-C | Killed |
| M17 | Clarifications blocked while Planning | 07-A | Killed |
| M18 | Clarifications allowed after Confirmed | 07-D | Killed |
| M19 | Organiser role gate removed on replies | 07-E | Killed |
| M20 | Status taken from the request body and used for the transition, with the strict check relaxed for `status` only | 08-A, unit 04-C | Killed |
| M21 | Public status-change accepts Planning | 08-A | Killed |
| M22 | Organiser may submit a booking | 01-D | Killed |
| M24 | Confirm accepts Approved | 10-A | Killed |

**Survivor and fix.** M6 survived in the first pass: the parallel tests did not force the two requests to interleave, so the mutant produced one transition by timing luck. Fix: 02-E installs a test-only `BEFORE UPDATE` trigger on the event that sleeps 300 ms, so both requests read Approved before either writes. The real code still passes, and M6 is killed (`expected [true, true] to deeply equal [false, true]`).

**Not applicable.**
- M23 (multi-venue request creates partial bookings or two transitions): the booking endpoint takes one venue per request, so no multi-venue path exists to mutate.

**Result.** 23 mutants run and killed; M23 not applicable. Real code, unmodified: backend unit 1278 pass, backend e2e 397 pass and 11 skipped, frontend 1091 pass.

## Review follow-up (test review findings F2 and F4)

- **F2 fixed:** `venues.repository.spec.ts` gains a `SPM-148 booking transition` block: Approved transitions with one history row stamped with the injected clock; Confirmed does not transition; a lost compare-and-set writes no history; Submitted is refused. Two of these fail under mutants M1 (no status guard) and M5 (no history row), verified on a scratch copy.
- **F4 fixed, and a defect found:** `EventDetailPage.tsx` listed only `submitted` and `approved` as clarifiable, so a Coordinator could not open a clarification in Planning, contrary to AC7. Planning is now included. Replies are hidden once Confirmed; the thread stays visible. Two tests added to `EventDetailPage.clarifications.test.tsx`; the Planning test fails without the fix.
- **Not changed:** F1 (test-case document absent) needs a decision; F3 (mutants not in the repo) and F5 to F8 are open.
- Checks after this change: backend unit 1282 pass; frontend 1093 pass (1 todo). The backend e2e suite was not re-run after this change; the backend source is unchanged, only a unit spec was added.

## Review follow-up, round 2 (F1, F3, F5 to F8)

- **F1, authority recorded:** the 32-case document is still absent. `docs/specs/SPM-148-test-authority.md` records the written authority (the prompt, the user's decisions) and the rule for re-checking when the document is committed.
- **F3, mutants in the repo:** `backend/scripts/mutation/spm148.mutants.mjs` follows the repo's runner format (`node scripts/mutation/run.mjs --mutants spm148.mutants.mjs`). It covers the backend mutants; M12 is frontend and not in the runner.
- **F5, race barrier:** test 02-E no longer uses a sleep trigger. The test holds the event row lock, waits until both requests are blocked (observable lock state), then releases it. The race is forced by lock state, not by time.
- **F6, fixed-id leftovers:** the suite deletes rows with the fixed `00000148-` prefix before it runs, so an aborted run cannot cause primary-key collisions.
- **F7, history gate:** `EventDetailPage.statusHistory.test.tsx` checks that the panel shows to the owning organiser of a Planning event and not for a Submitted event.
- **F8, closed without change:** the venue booking page does not render the event status, so there is no badge there to assert. The Planning badge is asserted on the events list in `EventListPage.planning.test.tsx`.
- **Repo mutation runner (F3):** `node scripts/mutation/run.mjs --mutants spm148.mutants.mjs` against a PostgreSQL database with the init scripts: 22 mutants, 22 killed, 0 survived, 0 equivalent. M20 was first misapplied (wrong file) and then fixed and re-run. Original files untouched. M12 (frontend) is not in the runner.

## Coverage (measured on the branch working tree, fresh database)

Commands:
- Backend unit: `cd backend && npx vitest run --coverage --coverage.reporter=json --coverage.reportsDirectory=./coverage/unit`
- Backend e2e (PostgreSQL, fresh database built from `database/postgresql`): `DATABASE_URL=... npx vitest run --config ./vitest.config.e2e.ts --coverage --coverage.reporter=json --coverage.reportsDirectory=./coverage/e2e`
- Frontend: `cd frontend && npx vitest run --coverage --coverage.reporter=json --coverage.reportsDirectory=./coverage`
- Per-file merge (unit and e2e per backend file, frontend per file): the repo's `ai/scripts/test-workflow/coverage-scope.mjs` functions `mergeEntry` and `summarise`. A statement counts as covered if any run executed it.

Changed files only (the 14 source files this PR changes against `origin/dev`):

| File | Statements | Branches | Functions | Uncovered lines (not from this PR unless noted) |
|---|---|---|---|---|
| backend/src/clarifications/clarifications.service.ts | 90/90 100.00% | 65/66 98.48% | 16/16 100.00% | branch in existing code |
| backend/src/coordinator-availability/coordinator-availability.service.ts | 36/36 100.00% | 29/29 100.00% | 8/8 100.00% | none |
| backend/src/events/events.service.ts | 115/115 100.00% | 108/109 99.08% | 25/25 100.00% | branch in existing code |
| backend/src/events/status/planning.messages.ts | 2/2 100.00% | n/a | n/a | none |
| backend/src/events/status/status.controller.ts | 17/17 100.00% | n/a | 16/16 100.00% | none |
| backend/src/events/status/status.service.ts | 172/179 96.09% | 96/105 91.43% | 33/34 97.06% | 157, 197, 419 (SPM-135 assignment checks), 487 (SPM-135 already-confirmed body). None are SPM-148 lines |
| backend/src/events/types/event-status.ts | 4/4 100.00% | n/a | 1/1 100.00% | none |
| backend/src/lead/lead-assignment.service.ts | 77/77 100.00% | 36/36 100.00% | 16/16 100.00% | none |
| backend/src/venues/availability/dto/booking-request.ts | 13/13 100.00% | 20/20 100.00% | 2/2 100.00% | none |
| backend/src/venues/repository/venues.repository.ts | 99/99 100.00% | 58/58 100.00% | 26/26 100.00% | none |
| backend/src/venues/venues.service.ts | 62/62 100.00% | 50/50 100.00% | 11/11 100.00% | none |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 195/204 95.59% | 184/198 92.93% | 56/58 96.55% | 99, 198, 217, 311, 412, 442 (existing page code; this PR's lines are covered) |
| frontend/src/features/events/pages/detail/planning/StatusHistory.tsx | 14/14 100.00% | 6/6 100.00% | 7/7 100.00% | none |
| frontend/src/features/events/pages/list/EventListPage.tsx | 41/41 100.00% | 42/42 100.00% | 18/18 100.00% | none |
| frontend/src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx | 225/225 100.00% | 167/167 100.00% | 67/67 100.00% | none |

Totals across the 14 files: statements 1162/1178 (98.64%), branches 861/886 (97.18%), functions 302/305 (99.02%).

Changed lines only (the repo's floor is 100% of changed testable code): 64 of 64 executable lines added or changed by this PR are covered, and no changed line has an uncovered branch in the final run. Two branches were uncovered earlier, `status.service.ts:94` (unknown event in the history read, now tested with a 404) and `VenueRecordDetailPage.tsx:251` (other events in the store left unchanged, now tested). Re-run the measurement after any further change.

Test-count changes from this round: backend e2e 407 to 410; frontend 1106 to 1110; backend unit unchanged at 1282.

Note on repeated runs: the lead assignment e2e suite (`test/lead-assignment.e2e-spec.ts`) fails on a second run against a database that the earlier run already changed (its events are no longer in the queue; the assign call returns 404). This predates this PR. The full suite passes on a fresh database, which is how CI runs it.

## Test case results (per test case)

Result table per test case. Runs on 15 Oct 2026, branch working tree: backend unit 1297 pass (after the merge), backend e2e 410 pass on a fresh database, frontend 1128 pass (after the merge). Status values: Pass, Partial (some parts of the case are not automatable), Not Automated.

### PLAN-STATUS-01-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 3 |
| Pass/Fail | 3 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit, Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M3. |

### PLAN-STATUS-01-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 5 |
| Pass/Fail | 5 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit |
| Notes | Mutants killed: M1, M2. |

### PLAN-STATUS-01-BND

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M3. |

### PLAN-STATUS-01-C

| Item | Result |
|---|---|
| Overall Status | Partial |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M3. Partial: conflict and time checks automated; capacity and suitability are not in the product (SPM-23 not built). |

### PLAN-STATUS-01-D

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M22. |

### PLAN-STATUS-01-D-401

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M22. |

### PLAN-STATUS-01-E

| Item | Result |
|---|---|
| Overall Status | Not Automated |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 0 |
| Pass/Fail | 0 passed, 0 failed (no test body) |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Automated |
| Notes | Not Automated: the booking endpoint takes one venue per request; no multi-venue path exists in the product. |

### PLAN-STATUS-02-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | None |

### PLAN-STATUS-02-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 (it.each, 3 rows) |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M4, M5. Fault raised by a database trigger after the named write; see the test name. |

### PLAN-STATUS-02-C

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 (it.each, 3 rows) |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Passes under the separate-transaction mutant (M4): its fault rolls back the booking first, so 02-B and 02-D carry that kill. Fault raised by a database trigger after the named write; see the test name. |

### PLAN-STATUS-02-D

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 (it.each, 3 rows) |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M4, M5. Fault raised by a database trigger after the named write; see the test name. |

### PLAN-STATUS-02-E

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit |
| Notes | Mutants killed: M1, M6. Race forced by a row-lock barrier (blocked sessions), not by sleeping. |

### PLAN-STATUS-03-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M1, M7. |

### PLAN-STATUS-03-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M7. |

### PLAN-STATUS-03-C

| Item | Result |
|---|---|
| Overall Status | Pass with open issue (suspected flake) |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M8. Unexplained: one full run on the merged branch failed here with a 404 on the second booking request. The test passed alone and in three later full runs. Not resolved; treat as a suspected flake. |

### PLAN-STATUS-03-D

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M6. |

### PLAN-STATUS-04-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 5 |
| Pass/Fail | 5 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M5, M10. Also run under TZ=UTC, Asia/Singapore and America/Los_Angeles for the e2e file (36 of 36 each, before the final edits). |

### PLAN-STATUS-04-A-SEC

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | None |

### PLAN-STATUS-04-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M11. |

### PLAN-STATUS-04-C

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit |
| Notes | Mutants killed: M9. |

### PLAN-STATUS-04-D

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M10. Also run under TZ=UTC, Asia/Singapore and America/Los_Angeles for the e2e file (36 of 36 each, before the final edits). |

### PLAN-STATUS-05-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M12 (frontend), M13. |

### PLAN-STATUS-05-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Frontend (Vitest, jsdom) |
| Notes | Frontend test: the fake server answers with its current list, so a remount is a reload. |

### PLAN-STATUS-05-C

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | None |

### PLAN-STATUS-06-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit |
| Notes | Mutants killed: M14, M15, M16. |

### PLAN-STATUS-06-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M16. |

### PLAN-STATUS-06-C

| Item | Result |
|---|---|
| Overall Status | Partial |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M14, M15, M16. Partial: notice and active count automated; the limit-5 availability function is not in the product. |

### PLAN-STATUS-07-A

| Item | Result |
|---|---|
| Overall Status | Partial |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 3 |
| Pass/Fail | 3 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Backend unit, Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M17. Partial: Coordinator post and Organiser reply automated; Organiser post is refused by SPM-39 and needs a PO decision. |

### PLAN-STATUS-07-B

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 (shared with 07-A) |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e) |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | The e2e test titled 07-A runs the Coordinator's post, the Organiser's reply and the Coordinator's second reply in Planning. The reverse case in 07-B (Coordinator posts, Organiser replies) is that same body; Organiser posting is not built (see 07-A). |

### PLAN-STATUS-07-C

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | None |

### PLAN-STATUS-07-D

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | Mutants killed: M18. |

### PLAN-STATUS-07-E

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M19. |

### PLAN-STATUS-08-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M9, M20, M21. |

### PLAN-STATUS-09-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 2 |
| Pass/Fail | 2 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL), Frontend (Vitest, jsdom) |
| Notes | None |

### PLAN-STATUS-10-A

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M24. |

### PLAN-STATUS-10-A-OK

| Item | Result |
|---|---|
| Overall Status | Pass |
| Execution Date | 15 Oct 2026 |
| Total Test Bodies | 1 |
| Pass/Fail | 1 passed, 0 failed |
| Executed By | Automated (Vitest; PostgreSQL for backend e2e); mutation runner for kills |
| Layers Tested | Backend e2e (PostgreSQL) |
| Notes | Mutants killed: M24. |

## Traceability index (Cmd+F the ID)

Each test case ID appears in the title of its test (file:line below) and, where production code implements it, in a `// SPM-148 PLAN-STATUS-...` comment directly above that code (file:line below). Search the ID with Cmd+F to find either.

| Test case ID | Test title (file:line) | Implementation comment (file:line) |
|---|---|---|
| PLAN-STATUS-01-A | events-planning-transition.e2e-spec.ts:207<br>venues/repository/venues.repository.spec.ts:842<br>features/venues/pages/records/detail/VenueRecordDetailPage.planning.test.tsx:93 | venues/repository/venues.repository.ts:258<br>features/venues/pages/records/detail/VenueRecordDetailPage.tsx:222<br>features/venues/pages/records/detail/VenueRecordDetailPage.tsx:247 |
| PLAN-STATUS-01-B | events-planning-transition.e2e-spec.ts:243<br>venues/repository/venues.repository.spec.ts:854<br>venues/repository/venues.repository.spec.ts:875<br>events/types/event-status.spec.ts:16<br>events/types/event-status.spec.ts:28 | venues/repository/venues.repository.ts:210<br>venues/repository/venues.repository.ts:286<br>venues/venues.service.ts:143<br>events/types/event-status.ts:16<br>events/types/event-status.ts:33 |
| PLAN-STATUS-01-BND | events-planning-transition.e2e-spec.ts:266 | test only |
| PLAN-STATUS-01-C | events-planning-transition.e2e-spec.ts:286 | venues/repository/venues.repository.ts:214 |
| PLAN-STATUS-01-D | events-planning-transition.e2e-spec.ts:323 | venues/venues.service.ts:127<br>venues/venues.service.ts:140 |
| PLAN-STATUS-01-D-401 | events-planning-transition.e2e-spec.ts:343 | test only |
| PLAN-STATUS-02-A | events-planning-transition.e2e-spec.ts:361 | venues/repository/venues.repository.ts:246 |
| PLAN-STATUS-02-E | events-planning-transition.e2e-spec.ts:415<br>venues/repository/venues.repository.spec.ts:865 | venues/repository/venues.repository.ts:201<br>venues/repository/venues.repository.ts:294 |
| PLAN-STATUS-03-A | events-planning-transition.e2e-spec.ts:462<br>features/venues/pages/records/detail/VenueRecordDetailPage.planning.test.tsx:113 | test only |
| PLAN-STATUS-03-B | events-planning-transition.e2e-spec.ts:479 | test only |
| PLAN-STATUS-03-C | events-planning-transition.e2e-spec.ts:499 | test only |
| PLAN-STATUS-03-D | events-planning-transition.e2e-spec.ts:517<br>features/venues/pages/records/detail/VenueRecordDetailPage.planning.test.tsx:129 | test only |
| PLAN-STATUS-04-A | events-planning-transition.e2e-spec.ts:547<br>features/events/pages/detail/planning/StatusHistory.test.tsx:23<br>features/events/pages/detail/planning/StatusHistory.test.tsx:49<br>features/events/pages/detail/EventDetailPage.statusHistory.test.tsx:75<br>features/events/pages/detail/EventDetailPage.statusHistory.test.tsx:84 | events/status/status.service.ts:86<br>events/status/status.controller.ts:84<br>features/events/pages/detail/EventDetailPage.tsx:485<br>features/events/pages/detail/planning/StatusHistory.tsx:24 |
| PLAN-STATUS-04-A-SEC | events-planning-transition.e2e-spec.ts:668 | test only |
| PLAN-STATUS-04-B | events-planning-transition.e2e-spec.ts:570<br>events-planning-transition.e2e-spec.ts:599 | events/status/status.controller.ts:90 |
| PLAN-STATUS-04-C | events-planning-transition.e2e-spec.ts:626<br>venues/availability/dto/booking-request.spec.ts:65 | venues/availability/dto/booking-request.ts:25 |
| PLAN-STATUS-04-D | events-planning-transition.e2e-spec.ts:652<br>features/events/pages/detail/planning/StatusHistory.test.tsx:38 | test only |
| PLAN-STATUS-05-A | events-planning-transition.e2e-spec.ts:695<br>features/events/pages/list/EventListPage.planning.test.tsx:60 | events/events.service.ts:134<br>features/events/pages/list/EventListPage.tsx:69 |
| PLAN-STATUS-05-B | features/events/pages/list/EventListPage.planning.test.tsx:108 | test only |
| PLAN-STATUS-05-C | events-planning-transition.e2e-spec.ts:716<br>features/events/pages/list/EventListPage.planning.test.tsx:84 | test only |
| PLAN-STATUS-06-A | events-planning-transition.e2e-spec.ts:730<br>events/types/event-status.spec.ts:23 | lead/lead-assignment.service.ts:18<br>events/types/event-status.ts:6 |
| PLAN-STATUS-06-B | features/lead/pages/assignment-queue/AssignmentQueuePage.planning.test.tsx:37 | test only |
| PLAN-STATUS-06-C | events-planning-transition.e2e-spec.ts:753 | coordinator-availability/coordinator-availability.service.ts:83 |
| PLAN-STATUS-07-A | events-planning-transition.e2e-spec.ts:788<br>events/types/event-status.spec.ts:33<br>features/events/pages/detail/EventDetailPage.clarifications.test.tsx:389 | events/types/event-status.ts:25<br>clarifications/clarifications.service.ts:59<br>features/events/pages/detail/EventDetailPage.tsx:41 |
| PLAN-STATUS-07-C | events-planning-transition.e2e-spec.ts:808 | test only |
| PLAN-STATUS-07-D | events-planning-transition.e2e-spec.ts:825<br>features/events/pages/detail/EventDetailPage.clarifications.test.tsx:417 | clarifications/clarifications.service.ts:105<br>features/events/pages/detail/EventDetailPage.tsx:655 |
| PLAN-STATUS-07-E | events-planning-transition.e2e-spec.ts:847 | clarifications/clarifications.service.ts:251 |
| PLAN-STATUS-08-A | events-planning-transition.e2e-spec.ts:873 | events/status/status.service.ts:74 |
| PLAN-STATUS-09-A | events-planning-transition.e2e-spec.ts:903<br>features/events/pages/list/EventListPage.planning.test.tsx:147 | test only |
| PLAN-STATUS-10-A | events-planning-transition.e2e-spec.ts:954 | events/status/status.service.ts:462 |
| PLAN-STATUS-10-A-OK | events-planning-transition.e2e-spec.ts:921 | test only |
