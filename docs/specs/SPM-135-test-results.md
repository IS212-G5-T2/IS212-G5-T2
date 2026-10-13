# SPM-135 Confirm an Event (Coordinator): test results

**Scope.** Backend and frontend for the coordinator confirm action, the arrangements readiness rule, the organiser's confirmed-arrangements view, status history and the `EventConfirmed` notification. Spec documents were not edited.

**Provenance.** The Guide is `~/Desktop/test_gen/test-code-generation-guide-updated.md`. The 17 cases were read from Confluence (space SP): the matrix "Confirm an Event (Coordinator) Matrix" and the `CONFIRM-EVENT-01` to `06` pages. Only the matrix and case summaries were read; the full Section 0 (G1 to G19) and Section 1 document named in the prompt were not found in the repository or on Confluence. The Decision Register and the 2.6/2.7 tables in the prompt were used as the oracle, as the user confirmed at Gate 1.

**Confidence tiers.** SPEC = Jira/Confluence/prompt literal. DERIVED = follows from a cited rule. ASSUMED = neither states it (indexed in the test files as `// ASSUMPTION An`).

## Decisions applied (Gate 1 answers)

| # | Decision |
|---|---|
| D5 / Q1 | Only `Planning` may be confirmed. Other statuses: Rejected/Cancelled -> 422 `EVENT_NOT_CONFIRMABLE` with MSG-CF-05; Confirmed -> 409 `EVENT_ALREADY_CONFIRMED`; anything else -> 422 `EVENT_NOT_CONFIRMABLE` ("Only events in Planning can be confirmed.", ASSUMED text). |
| D2 / Q2 | Option (A): pure `evaluateReadiness` plus an `ArrangementsReader` port. Safety has no source yet (SPM-126 not built), so the production safety port returns "no record", which is outstanding. |
| D6 / Q3 | Accepted as written in the prompt, with one addition: released and cancelled equipment lines are ignored (ASSUMED). |
| D10 Q4 / 02-D | A venue is "flagged unavailable" when an approved booking overlaps a `blocked` venue_bookings row (no event) for the same venue. |
| D11 / Q5 | Reuse the existing `notifications` table and `GET /api/notifications`. `EventConfirmed` added to the organiser's types. Partial unique index `(recipient_id, related_event_id, type) WHERE type='EventConfirmed'`. |
| D13 / Q6 | `ConfirmEventPanel` mounted on the existing event detail page (`/events/:id`). No new `/events/:id/planning` route. |
| B3 / Q7 | Docker is running; the real-DB suite runs against `spm_test`. |
| F1, F2, F5 / Q8 | Accepted. |

## Traceability map (business rule -> test IDs)

| Rule | Test IDs |
|---|---|
| R1 assignment only, 401 without session | 01-C (BE it.each x4 + no-session; FE x2; page-level COO-02 and Lead); TR-01 (GET arrangements-status: COO-02, ORG-01, ATT-01, LEAD-01 get 403, no session 401) |
| R2 Planning only; Rejected/Cancelled 422; Confirmed 409 | 04-B (A), 06-A, 06-B, 06-B FE; TR-03 (Approved and Submitted refused 422) |
| R3 readiness: every booking Approved, every equipment Reserved, safety Approved, at least one booking | 01-A, 01-B, 02-B, 02-C, 03-A, 03-B; readiness unit (D6 table); TR-05 (other-venue block, edge-touching blocks, partial overlap); hold boundary (ASSUMED) |
| R4 readiness evaluated server-side in the confirming transaction | 02-B, 02-D, 04-B (B deterministic) |
| R5 outstanding list = unsatisfied items only, names venue, same in UI and API | 02-C, 03-A, 03-B, 03-C (rule + FE), 03-A FE |
| R6 success: Confirmed, MSG-CF-01, history row, arrangements unchanged | 01-A, 01-A FE, 04-A FE |
| R7 exactly once under double-submit and concurrency | 04-B (A), 04-B (B), 04-B (B deterministic), 04-B (C FE) |
| R8 organiser notified once (`EventConfirmed`); blocked attempts and others generate none | 05-A, 05-C |
| R9 organiser sees venue (SGT), equipment, safety; allowlist only | 05-B (BE allowlist keys + values), 05-B FE (page: shown only once Confirmed); TR-02 (ORG-02 404, owner on Planning 404, COO-01 and ATT-01 403, no session 401) |
| R10 UI: button only for assigned coordinator on Planning; too-early list; double-click safe | 01-A FE, 01-C FE, 02-A FE, 02-C FE, 02-D FE, 03-B FE, 04-B C FE, 06 FE; page level (`EventDetailPage.confirm.test.tsx`): 01-A, 01-C (COO-02, Lead), 04-A, 05-B |

## Evidence table (Guide 10B)

| Test ID | AC | Level | Oracle source | Mutant(s) it kills |
|---|---|---|---|---|
| CONFIRM-EVENT-01-A | AC1 | BE e2e, FE, rule | SPEC 2.6 literals (EVT-201, VB-201, EQ-201, MSG-CF-01) | M15 (history actor) |
| CONFIRM-EVENT-01-B | AC1 | BE e2e, rule | SPEC 2.6 (EVT-211) | M1 (first booking only) |
| CONFIRM-EVENT-01-C | AC1 | BE e2e, FE | SPEC 01-C; MSG-CF-03 | M7 and M8 and M9 (GET path, TR-01), M7c (assignment removed at both sites), M8c (Lead), M9c (Organiser) |
| CONFIRM-EVENT-02-A | AC2 | FE; rule | SPEC 02-A (EVT-202 venue Pending) | M2, M4 (rule) |
| CONFIRM-EVENT-02-B | AC2 | BE e2e | SPEC 02-B; D8 code CONFIRM_BLOCKED (ASSUMED name); full MSG-CF-02 text, join "; " ASSUMED (D7) | M5 (no server check) |
| CONFIRM-EVENT-02-C | AC2 | BE e2e, FE, rule | SPEC 02-C (Breakout Room 1 Pending) | M1 |
| CONFIRM-EVENT-02-D | AC2 | BE e2e, FE | SPEC 02-D; D6 flagged venue unavailable | M6 (page-load snapshot), M17 (flag ignored), R1 to R4 (overlap SQL, TR-05) |
| CONFIRM-EVENT-03-A | AC3 | BE e2e, FE, rule | SPEC 03-A (3 items, order, states) | M16 (satisfied items listed), M18 |
| CONFIRM-EVENT-03-B | AC3 | BE e2e, FE | SPEC 03-B | M16 |
| CONFIRM-EVENT-03-C | AC3 | FE, rule | SPEC 03-C literals; D7 | (text) |
| CONFIRM-EVENT-04-A | AC4 | FE | SPEC 04-A; badge from response | Badge from local state (FE callback) |
| CONFIRM-EVENT-04-B | AC4, AC5 | BE e2e (real DB), FE | SPEC 04-B; code EVENT_ALREADY_CONFIRMED (D8) | M11c (no lock, unconditional UPDATE, deterministic test), M19 (FE, 04-B C) |
| CONFIRM-EVENT-05-A | AC5 | BE e2e | SPEC 05-A; D11 text (ASSUMED wording "{event} has been confirmed.") | M13 (wrong recipient) |
| CONFIRM-EVENT-05-B | AC5 | BE e2e, FE | SPEC 05-B; D14 allowlist | M14 (spread event row) |
| CONFIRM-EVENT-05-C | AC5 | BE e2e | SPEC 05-C | M12 (notification before guards / duplicated) |
| CONFIRM-EVENT-06-A | AC6 | BE e2e, FE | SPEC 06-A (MSG-CF-05) | M10 (status guard removed); NP1, NP2 (TR-03 non-Planning source) |
| CONFIRM-EVENT-06-B | AC6 | BE e2e, FE | SPEC 06-B | M10 |

## Results table (every test case ID)

Result = Pass, Fail, Blocked (with the upstream story) or Not Automated. Runs (after Test Review remediation, iteration 2): backend unit 46 files / 1167 passed; backend e2e (`events-confirm`) 39/39; frontend 69 files / 952 passed, 1 todo. Counts are from the run commands in the Run commands section.

| Test Case ID | Subtest | file :: test name | Layer | Result | Notes |
|---|---|---|---|---|---|
| CONFIRM-EVENT-01-A | BE | `backend/test/events-confirm.e2e-spec.ts :: CONFIRM-EVENT-01-A` | BE e2e | Pass | Safety port is a fixture (SPM-126 absent) |
| CONFIRM-EVENT-01-A | rule | `src/events/status/readiness.spec.ts :: CONFIRM-EVENT-01-A (rule level)` | Unit | Pass | |
| CONFIRM-EVENT-01-A | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-01-A (FE)` | FE | Pass | |
| CONFIRM-EVENT-01-B | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-01-B` | BE e2e | Pass | |
| CONFIRM-EVENT-01-B | rule | `readiness.spec.ts :: CONFIRM-EVENT-01-B (rule level)` | Unit | Pass | |
| CONFIRM-EVENT-01-C | BE (4 roles) | `events-confirm.e2e-spec.ts :: refuses %s with 403 MSG-CF-03` | BE e2e | Pass | COO-02, ORG-01, ATT-01, LEAD-01 |
| CONFIRM-EVENT-01-C | BE (D) | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-01-C (D)` | BE e2e | Pass | 401 |
| CONFIRM-EVENT-01-C | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-01-C (FE)` | FE | Pass | Not assigned (prop level) |
| CONFIRM-EVENT-01-C | FE page (COO-02, Lead) | `EventDetailPage.confirm.test.tsx :: CONFIRM-EVENT-01-C (page)` (x2) | FE page | Pass | TR-06; the Lead is modelled as role `coordinator_lead`, replacing the old prop-level Lead test |
| CONFIRM-EVENT-01-A | FE page | `EventDetailPage.confirm.test.tsx :: CONFIRM-EVENT-01-A (page)` | FE page | Pass | TR-06 |
| CONFIRM-EVENT-02-A | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-02-A (FE)` | FE | Pass | |
| CONFIRM-EVENT-02-A | BE twin | — | BE | **Not Automated** | HTTP twin for single items (EVT-202/203/204/210) not written; the rule unit covers each item, and 02-B covers the combined HTTP case |
| CONFIRM-EVENT-02-B | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-02-B` | BE e2e | Pass | TR-09: asserts the full MSG-CF-02 text ("; " join ASSUMED, D7) |
| CONFIRM-EVENT-02-C | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-02-C` | BE e2e | Pass | |
| CONFIRM-EVENT-02-C | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-02-C (FE)` | FE | Pass | |
| CONFIRM-EVENT-02-D | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-02-D` | BE e2e | Pass | Flag = overlapping `blocked` row |
| CONFIRM-EVENT-02-D | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-02-D (FE)` | FE | Pass | |
| CONFIRM-EVENT-03-A | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-03-A` | BE e2e | Pass | |
| CONFIRM-EVENT-03-A | rule | `readiness.spec.ts :: CONFIRM-EVENT-03-A (rule level)` | Unit | Pass | |
| CONFIRM-EVENT-03-A | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-03-A (FE)` | FE | Pass | |
| CONFIRM-EVENT-03-B | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-03-B` | BE e2e | Pass | |
| CONFIRM-EVENT-03-B | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-03-B (FE)` | FE | Pass | |
| CONFIRM-EVENT-03-C | FE + rule | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-03-C (FE)`; `readiness.spec.ts :: CONFIRM-EVENT-03-C (rule level)` | FE, Unit | Pass | |
| CONFIRM-EVENT-04-A | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-01-A (FE)` (MSG-CF-01, badge callback, button gone) | FE | Pass | Badge update is the callback to `setEventStatus`; the remount-after-fetch check is not automated |
| CONFIRM-EVENT-04-A | queue | — | FE | **Blocked (SPM-48)** | No Coordinator queue route exists |
| CONFIRM-EVENT-04-B | A | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-04-B (A)` | BE e2e | Pass | |
| CONFIRM-EVENT-04-B | B | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-04-B (B)` | BE e2e | Pass | Probabilistic; passed, but not a strong race test on its own |
| CONFIRM-EVENT-04-B | B (deterministic) | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-04-B (B, deterministic)` | BE e2e | Pass | Competing committed change while the request is blocked on a lock; the test asserts that a lock wait was observed (TR-07) and filters pg_stat_activity to the confirm statements; this is the test that kills M11c |
| CONFIRM-EVENT-04-A | page | `EventDetailPage.confirm.test.tsx :: CONFIRM-EVENT-04-A (page)` | FE page | Pass | TR-06: timeline shows confirmed as the current step after a confirm, the event is not refetched |
| CONFIRM-EVENT-05-B | page | `EventDetailPage.confirm.test.tsx :: CONFIRM-EVENT-05-B (page)` (x2) | FE page | Pass | TR-06: organiser sees the confirmed arrangements only when the event is Confirmed |
| CONFIRM-EVENT-04-B | C | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-04-B (C, FE)` | FE | Pass | |
| CONFIRM-EVENT-05-A | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-05-A` | BE e2e | Pass | |
| CONFIRM-EVENT-05-A | FE bell | — | FE | **Blocked (SPM-137 / bell UI)** | No notification bell exists (D17) |
| CONFIRM-EVENT-05-B | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-05-B` | BE e2e | Pass | Keys asserted exactly; SENTINEL check not done (see Gap) |
| CONFIRM-EVENT-05-B | FE | `ConfirmedArrangementsPanel.test.tsx :: CONFIRM-EVENT-05-B (FE)` | FE | Pass | SGT slot "5 Nov 2026 10:00 to 12:00 SGT" |
| CONFIRM-EVENT-05-C | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-05-C` | BE e2e | Pass | |
| CONFIRM-EVENT-06-A | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-06 (Rejected)` | BE e2e | Pass | |
| CONFIRM-EVENT-06-A | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-06 (FE) rejected` | FE | Pass | |
| CONFIRM-EVENT-06-B | BE | `events-confirm.e2e-spec.ts :: CONFIRM-EVENT-06 (Cancelled)` | BE e2e | Pass | |
| CONFIRM-EVENT-06-B | FE | `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-06 (FE) cancelled` | FE | Pass | |
| TR-01 (GET, not in matrix) | BE e2e | `events-confirm.e2e-spec.ts :: TR-01: arrangements-status is for the assigned coordinator only` (4 roles + no session) | BE e2e | Pass | Characterisation: passes on the code; kills M7, M8, M9, GET1 |
| TR-02 (GET, not in matrix) | BE e2e | `events-confirm.e2e-spec.ts :: TR-02: confirmed-arrangements is for the submitting organiser of a Confirmed event` (5 cases) | BE e2e | Pass | Characterisation: kills CA1, CA2, CA3 |
| TR-03 (R2, D5) | BE e2e | `events-confirm.e2e-spec.ts :: TR-03: a %s event is refused ...` (Approved, Submitted) | BE e2e | Pass | Characterisation: kills NP1, NP2 |
| TR-05 (R3, D10) | BE e2e | `events-confirm.e2e-spec.ts :: TR-05: ...` (different venue; edge-touching x2; partial overlap) | BE e2e | Pass | Characterisation: kills R1, R2, R3, R4 |
| Hold boundary (ASSUMED) | rule | `readiness.spec.ts :: a hold that expires exactly at the check time is expired (ASSUMED boundary)` | Unit | Pass | Kills M-HOLD-EQ |
| Tie-break and order (DERIVED) | rule | `readiness.spec.ts :: outstanding venue items are listed by booking id ...`; `... share an id keep their input order ...` | Unit | Pass | Ordering; covers the comparator branches |

Added subtests (DERIVED, not in the matrix): `readiness.spec.ts` D6 table (11 single-failure rows, released/cancelled, zero equipment, live hold, all-failures ordering); `events-confirm` unsupported target 400; fail-closed production default (no safety record) 422; expired hold over HTTP; FE `confirmed` status shows no button.

## Review checklist (Guide 10C)

| Question | Answer |
|---|---|
| Does every test trace to an AC? | Yes. Added subtests are listed above and tagged DERIVED or ASSUMED. |
| Does every test have a plausible failing implementation? | Yes. Each has a Kills line in the file header or the test body. |
| Can each setup, action and expected result be explained? | Yes. |
| Are expected values justified independently of the code? | Literals from the matrix and prompt. ASSUMED items are indexed in each file. |
| Deterministic and non-vacuous? | Yes, except: the 04-B (B) parallel test is probabilistic (the deterministic 04-B test covers the race); the deterministic test waits for a lock with a bounded poll (500 x 10 ms), which is a synchronisation wait, not a timing assertion. |

## Pre-submit checklist (Guide 11)

- [x] Every test traces to a rule/AC; spec worked examples included.
- [x] Every test has a Kills line or a plausible failing implementation.
- [x] Each rule has happy, sad and boundary coverage for the values in the matrix. Boundary cases beyond the matrix were not added.
- [x] Output fields and stored state asserted (status, history row, notification count, arrangements unchanged).
- [x] Expected values are literals; assumptions tagged and indexed.
- [x] No loops that compute expectations (the only loop is a bounded lock wait, documented above).
- [x] Sad-path no-side-effect checks run after the failure point (the readiness throw is inside the transaction and the rollback is observed).
- [ ] Rule-order interactions: the order (401, 404, 403, 400, guards, readiness) is implemented but not tested as an interaction.
- [x] Time injected via `CLOCK` (backend) and fixed in the frontend tests.
- [x] Mutation run complete (below); survivors reviewed.
- [x] Original implementation files untouched by the mutation harness (scratch copies only, removed afterwards).

## Gap list (Guide 10D)

**Blocked (upstream story).**
- 04-A coordinator queue: SPM-48 (no queue route).
- 05-A bell click-through: notification bell UI (SPM-137, D17).
- 05-B SENTINEL check: there is no coordinator-notes field in the schema, so the "absent from raw body" assertion has nothing to test. The allowlist keys are asserted exactly instead, which kills M14.

**Not automated.**
- 02-A BE twin for single outstanding items over HTTP.

**Safety (SPM-126, SPM-129 to 131).** The production safety port returns "no record", so the confirmed path is only exercised with a fixture port. Integration tests override the port only; readiness is not mocked.

**Untested orderings.** 401 -> 404 -> 403 -> 400 -> guards -> readiness is implemented; the interactions between these checks are not tested.

**Assumptions (ASSUMED).** A hold whose expiry equals the check time is expired (D6, no literal; tested in readiness.spec); the equal-id tie-break keeps input order (coverage only); equipment Released/Cancelled ignored; zero equipment satisfied; "No record" state name and "Awaiting check" wording; `{list}` joined with "; "; `EVENT_NOT_CONFIRMABLE` wording for non-Planning sources; the notification text; the organiser's safety state "Not recorded" when no record exists.

**Out of scope.** Cancel (SPM-136), organiser list (SPM-94), email, the bell UI.

**Deviations from the prompt (and why).**
1. Test paths: backend unit tests are beside the source (`src/events/status/readiness.spec.ts`); the real-DB suite is `backend/test/events-confirm.e2e-spec.ts`; frontend tests are beside the components. The repo has no `backend/tests/` or `frontend/tests/`.
2. Auth is a session cookie, not a bearer token; ids are UUIDs.
3. `POST /api/events/:id/status-change` returns 200 (`@HttpCode(200)`), as the prompt specifies.
4. The organiser view is a new `GET /api/events/:id/confirmed-arrangements`. `GET /api/events/:id` was not changed.
5. Migration: `backend/migrations/010_spm135_confirm_event.sql` and `database/postgresql/init/012_spm135_confirm_event.sql` (identical). Applied to `spm_test` manually. The dev `spm` database was not migrated.
6. Finished-story edits: `events.service.ts` (organiser notification types gain `EventConfirmed`); `events.reject.spec.ts` (two assertions updated to include `EventConfirmed`); `app.module.ts` (wiring); `EventDetailPage.tsx` (mounts two panels).

**Process gaps.**
- Iteration 2 (remediation of the BLOCKED Test Code Review, TR-01 to TR-09) was implemented by the Implementation Agent. Test Code Review must be re-run by the Orchestrator on the new snapshot; this document does not claim it passes.
- CLAUDE.md requires the Orchestrator flow (implementation agent, then Test Code Review, then Requirement and Code Quality reviews). **Iteration 1 reviews did not run in-session.** The implementation was done in-session; no subagents were spawned because the user did not ask for one.
- The frontend slice was not test-first. Its tests were written after the component. The backend readiness slice was RED first (20 tests run failing for the missing module, then GREEN). The backend e2e slice had a RED run that failed for the wrong reason (login 500 from the wrong DB env var), then a 201-vs-200 failure, then GREEN.

**Flow gap (B1).** No app code sets an event to `Planning` (approval sets `Approved`). The confirm button will not appear in the running app until something moves an event to Planning. The tests seed `Planning` directly.

## Document-defect resolutions (prompt 2.7)

| # | Resolution applied |
|---|---|
| F1 | Button rendered only for the assigned coordinator on a Planning event (test: 06 FE, 01-C FE). |
| F2 | 03-A asserts structured data; 03-C asserts the literal text. |
| F3 | Venue-unavailable flag only; holds are outstanding anyway. |
| F4 | Button not rendered; API returns MSG-CF-05. |
| F5 | D5 as answered. |
| F6 | Zero bookings outstanding (unit "zero venue bookings"). |
| F7 | One state, "Awaiting Check". |
| F8 | Synchronous in-transaction notification; no wall-clock assertion. |
| F9 | No action rendered whichever way the page responds (01-C FE). |
| F10 | Blocked as listed above. |
| F11 | Asserts `code` and text from the catalogue. |
| F12 | BE e2e for 02-B and 02-D; the 02-A BE twin is not automated (see Gap). |
| F13 | ASSUMED slot 2026-11-05 10:00 to 12:00 SGT. |
| F14 | `event_status_history` created (D10). |

## Mutation results (committed runner, scratch copy only)

Runner: `backend/scripts/mutation/spm135.mutants.mjs`, run with `node scripts/mutation/run.mjs --mutants spm135.mutants.mjs` (needs `DATABASE_URL`). The runner copies the backend to a scratch directory, applies one exact text edit per mutant (each anchor must occur exactly once), runs the suites there and reports the result. It checks that the original files are unchanged. Final run in iteration 2: baselines green (unit and e2e), **37 mutants: 32 killed, 5 equivalent, 0 survived, 0 misapplied; exit 0**.

The frontend mutant M19 is not in this runner (run.mjs copies the backend tree only). It was run through the frontend fault-injection check and is listed as killed by `ConfirmEventPanel.test.tsx :: CONFIRM-EVENT-04-B (C, FE)`.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M1 | Only the first venue booking checked | KILLED | readiness unit 02-C (rule level, deterministic); not by 01-B |
| M2 | Equipment `Requested` treated as Reserved | KILLED | readiness unit |
| M3 | Safety `Changes Requested` treated as approved | KILLED | readiness unit |
| M4 | Safety `Awaiting Check` treated as approved | KILLED | readiness unit |
| M5 | Server readiness check removed | KILLED | e2e 02-B, 01-C, 02-D |
| M6 | Readiness from a page-load snapshot | KILLED | e2e 02-D |
| M7 | Assignment removed in `assignedEventOrThrow` (shared by POST and GET) | KILLED | e2e TR-01 (GET arrangements-status, COO-02 and others). Re-classified: previously "equivalent"; the GET route had no other check |
| M7b | Assignment removed at the locked re-check only | EQUIVALENT | The pre-check refuses first. A reassignment race between the pre-check and the lock is not reproducible in the suite |
| M7c | Assignment removed at both sites | KILLED | e2e 01-C (4 cases) |
| M8 | Lead allowed in `assignedEventOrThrow` | KILLED | e2e TR-01 (LEAD-01, GET) |
| M8b | Lead allowed at the locked re-check only | EQUIVALENT | As M7b |
| M8c | Lead allowed at both sites | KILLED | e2e 01-C (LEAD-01) |
| M9 | Organiser allowed in `assignedEventOrThrow` | KILLED | e2e TR-01 (ORG-01, GET) |
| M9b | Organiser allowed at the locked re-check only | EQUIVALENT | As M7b |
| M9c | Organiser allowed at both sites | KILLED | e2e 01-C (ORG-01) |
| GET1 | GET arrangements-status skips the assignment check | KILLED | e2e TR-01 |
| M10 | Rejected and Cancelled guard removed | KILLED | e2e 06-A, 06-B |
| NP1 | Non-Planning source falls through (no refusal) | KILLED | e2e TR-03 |
| NP2 | Approved accepted as a source | KILLED | e2e TR-03 |
| M11 | Unconditional UPDATE under the row lock | EQUIVALENT | The status is re-read under `FOR UPDATE` |
| M11c | No row lock and unconditional UPDATE | KILLED | e2e 04-B (B, deterministic) |
| M12 | Notification written before the guards | KILLED | e2e 05-A (duplicate on success); blocked attempts roll back |
| M13 | Notification to the coordinator (wrong recipient) | KILLED | e2e 05-A, 05-C |
| M14 | Event row spread into the organiser response | KILLED | e2e 05-B (exact keys) |
| M15 | History actor is the organiser | KILLED | e2e 01-A |
| M16 | Satisfied equipment listed as outstanding | KILLED | readiness unit, e2e 01-A, 01-B, 03-B |
| M17 | Venue-unavailable flag ignored | KILLED | readiness unit, e2e 02-D |
| M18 | Zero bookings treated as ready | KILLED | readiness unit |
| M-HOLD-EQ | Hold-expiry `<=` changed to `<` | KILLED | readiness unit (ASSUMED boundary: a hold expiring exactly at the check time is expired) |
| R1 | Overlap ignores the venue | KILLED | e2e TR-05 (different venue) |
| R2 | Overlap start bound inclusive | KILLED | e2e TR-05 (block starts when the slot ends) |
| R3 | Overlap end bound inclusive | KILLED | e2e TR-05 (block ends when the slot starts) |
| R4 | Blocked status literal changed | KILLED | e2e 02-D |
| R5 | `event_id IS NULL` dropped from the overlap | EQUIVALENT | The `venue_bookings_kind_check` constraint (001 and migration 009) forces a blocked row to have no event |
| CA1 | Organiser role check removed (confirmed-arrangements) | KILLED | e2e TR-02 (COO-01 gets 403) |
| CA2 | Submitting-organiser check removed | KILLED | e2e TR-02 (ORG-02 gets 404) |
| CA3 | Confirmed-status check removed | KILLED | e2e TR-02 (owner on Planning gets 404) |

Page-level mutants (applied by hand to a copy of `EventDetailPage.tsx` and restored byte-for-byte, then `EventDetailPage.confirm.test.tsx` run):

| Mutant | Result | Reason |
|---|---|---|
| Page shows the Confirm panel to every non-organiser (COO-02 and Lead included) | KILLED: 2 failed | "expected document not to contain element, found <button" (01-C page COO-02, Lead) |
| Organiser panel shown for a Planning event (status check removed) | KILLED: 1 failed | "expected document not to contain element, found <h2" (05-B page, Planning) |
| No store update after confirm (`setEventStatus` removed) | KILLED: 1 failed | timeline pill `confirmed` lacks `text-primary-800` (04-A page) |

Summary: 37 backend runner entries; 32 killed; 5 equivalent (M7b, M8b, M9b, M11, R5, each with the reason above); 0 survived. The earlier claim that M7 to M9 were equivalent was wrong for the GET route and is corrected.

Lock-wait check (TR-07): the 04-B (B, deterministic) test was run with its lock-wait filter made impossible to match. It then failed with `AssertionError: expected false to be true` (lock wait not observed), and the file was restored. The original filter passes.

Missing-field check (TR-09): the 02-B full-text assertion was run with the join changed from `"; "` to `", "`. It failed on the exact-text comparison, and the file was restored.

## Run commands (Guide 10E, 12)

```bash
# Backend unit
cd backend && npx vitest run

# Backend real-DB suite (requires docker Postgres with spm_test, init 001 to 012 applied)
export DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test TEST_DATABASE_URL=$DATABASE_URL
npx vitest run --config ./vitest.config.e2e.ts test/events-confirm.e2e-spec.ts

# Frontend
cd frontend && npx vitest run src/features/events/pages/detail/planning
npx tsc -b && npx eslint src/features/events/pages/detail/planning src/utils/arrangements.ts

# Mutation runner (scratch copy; needs DATABASE_URL)
node scripts/mutation/run.mjs --mutants spm135.mutants.mjs

# Coverage is diagnostic only; it does not measure test strength.
npx vitest run --coverage
```

Coverage (`npm run test:cov`, diagnostic only; iteration 2):
- Backend unit: 46 files, 1167 passed. `src/events/status/readiness.ts`: 100% statements, branches, functions, lines. `status.service.ts` and `arrangements.reader.ts` are exercised by the e2e suite only, which `test:cov` does not measure, so they are not in this figure.
- Frontend: 69 files, 952 passed, 1 todo. `src/utils/arrangements.ts` 100%. `ConfirmEventPanel.tsx` branches 81.48%, `ConfirmedArrangementsPanel.tsx` branches 70%, `EventDetailPage.tsx` branches 91.7% (the whole page). These are below the 100% changed-code rule of the implementation playbook; the uncovered branches are error and refresh paths that the findings did not ask for. Reported as a limitation.

## Regression result for finished stories

| Suite | Result |
|---|---|
| Backend unit (46 files) | 1167 passed, 0 failed (iteration 2). `events.reject.spec.ts` assertions updated for `EventConfirmed`. |
| Backend e2e (18 files) | 17 files pass. **`drafts.e2e-spec.ts`: 11 failing. Pre-existing:** the same 11 fail on a clean checkout of HEAD (verified with a temporary worktree, now removed). The drafts routes need a session cookie, but the suite sends none. Not caused by this change. |
| Frontend (69 files) | 952 passed, 1 todo, 0 failed (iteration 2). `EventDetailPage.planning` unchanged; the arrangements helpers validate response shapes, as `planning.ts` does. The drafts and other finished-story suites were not re-run in iteration 2 beyond the full frontend run. |
| `tsc -b` (frontend) | Clean (iteration 2, exit 0) |
| `oxlint` (backend changed files) | Clean |
| `eslint` (frontend changed files) | Clean |
