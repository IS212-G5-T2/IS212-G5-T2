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

## Test case results (per test case ID)

Each block is one test case from the matrix (17 cases). Results come from the runs listed under **Runs** below, mapped by the case ID in each test name. Test bodies are counted per test; a parameterised test counts once per row.

Run at HEAD `84699fc` (branch `feature/SPM-135-Confirm-an-Event`). Execution date: 14 Oct 2026.

### CONFIRM-EVENT-01-A: Successful confirmation with all arrangements complete

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 4 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-01-B: Several bookings and equipment lines confirmed

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-01-C: Non-assigned users cannot confirm

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 8 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-02-A: Blocked when one arrangement is outstanding

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 1 |
| Executed By | Automated (Vitest) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-02-B: Backend rejects confirmation when the UI is bypassed

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 1 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-02-C: Blocked by one unapproved venue booking among several

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 3 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-02-D: Readiness re-checked at submit time

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-03-A: Outstanding list shows every outstanding arrangement

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 3 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-03-B: No outstanding arrangement falsely reported

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-03-C: Outstanding list names the specific venue

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-04-A: Status change and confirmation message

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 1 |
| Executed By | Automated (Vitest) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-04-B: Concurrent confirmations handled safely

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 4 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-05-A: Organiser notified on confirmation

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 1 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-05-B: Organiser sees confirmed arrangements

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 4 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-05-C: Notifications sent only on success

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 1 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-06-A: Rejected event cannot be confirmed

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

### CONFIRM-EVENT-06-B: Cancelled event cannot be confirmed

| Item | Description |
|------|-------------|
| Actual Result | Pass. All test bodies with this ID passed. |
| Pass/Fail | Pass |
| Test bodies | 2 |
| Executed By | Automated (Vitest, PostgreSQL) |
| Date of Execution | 14 Oct 2026 |

**Notes on this section**

- Not in the 17-case matrix, so not counted above: `CONFIRM-EVENT-03-D` (frontend, 1 body: equipment pending also lists the safety check) and one frontend body under 06 (no Confirm button on a confirmed event). Both pass.
- Known gaps with no test body, unchanged from the Gap list: 02-A has no backend HTTP twin; 04-A's coordinator-queue step is blocked (SPM-48); 05-A's bell click-through is blocked (SPM-137).
- The 01-C, 04-B and 05-B bodies are split across layers; the Test bodies count includes all of them.

## Results table (every test case ID)

Result = Pass, Fail, Blocked (with the upstream story) or Not Automated. Runs (14 Oct 2026, HEAD `84699fc`): backend unit 1200 passed in 48 files, 0 failed (`npx vitest run`, this pass); backend e2e (`events-confirm`, real PostgreSQL `spm_test`) 41/41 (this pass, after the CONFIRM-EVENT-06 rename); `npx vitest run src/events` 379 passed in 10 files; frontend 997 tests, 996 passed, 1 todo, 0 failed (re-run in this pass with `npx vitest run`: 71 files, 996 passed, 1 todo). The earlier counts (1167, 39, 952) were from iteration 2 and are superseded. Counts are from the run commands in the Run commands section.

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

**Resolved: HTTP status for Rejected and Cancelled events (CONFIRM-EVENT-06-A/06-B).** Jira AC6 says only that a rejected or cancelled event cannot be confirmed. The Confluence expected result is HTTP 422 with MSG-CF-05, and that is the oracle: the code returns 422 `EVENT_NOT_CONFIRMABLE` with the MSG-CF-05 text, and the backend e2e asserts all three. The execution notes on both Confluence pages say "HTTP 409". That status belongs to the already-Confirmed case (CONFIRM-EVENT-04-B, `EVENT_ALREADY_CONFIRMED`), so the note is a copy slip and not a second requirement. Decision: 422 stands, so no `ASSUMED` tag is needed on the tests. The test carries a comment recording this. Still open: the two "HTTP 409" lines in the Notes of the 06-A and 06-B Confluence pages should be corrected to 422, and a Product Owner confirmation of 422 was not obtained. The Confluence pages have not been edited from this branch.

**Timing-dependent test (kept, bounded).** `CONFIRM-EVENT-04-B (B, deterministic)` in `events-confirm.e2e-spec.ts` polls `pg_stat_activity` for up to 200 x 10 ms. A promise gate or barrier is not possible here: the confirm request runs on the application's own connection and transaction, so the test has no hook to hold it, and the only observable sign that it is blocked behind the competing change is the lock wait PostgreSQL reports. The poll is bounded (2 s), and the test asserts `lockWaitObserved`, so a wait that is never seen fails the test instead of passing silently. The reason is also written beside the loop.

**Not applicable.** Configuration tests (`-CFG-X`): the confirm feature has no configurable parameter (the 15 s refresh `PLANNING_REFRESH_MS` is a constant). The tier suffixes `-BND`, `-INT`, `-STATE` and `-ISO` are not used in test names; the happy, negative, boundary, interaction and state cases exist and are named by the behaviour they check.

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

**Kills evidence policy.** The mutant files are the record of which wrong implementation each suite catches, by mutant ID: `spm135.mutants.mjs` (backend app code), `spm135.triggers.mutants.mjs` (reset triggers) and the frontend `spm135.mutants.mjs`. That suite-level mapping is the evidence for most tests, so they do not each carry a `Kills:` line. A test carries one where its mutant mapping is missing or the intent is not obvious from its name, for example the `CHECKLIST-ACTION` tests, the `readiness.spec.ts` boundary cases and the race test. Test-level comments say which acceptance criterion a supporting test supports and what it prevents.

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
| M11 | Unconditional UPDATE under the row lock | EQUIVALENT | The status is re-read under `FOR UPDATE`, so the extra `AND status = 'Planning'` in the UPDATE cannot change the outcome through the routes. An earlier pass recorded this as killed. In the Improve Test Case Evaluation Workflow pass it was equivalent in every run (three targeted runs and the full run), the earlier kill could not be reproduced, and the flag in `spm135.mutants.mjs` is correct. |
| M11c | No row lock and unconditional UPDATE | KILLED | e2e 04-B (B, deterministic) |
| M12 | Notification written before the guards | KILLED | The partial unique index with `ON CONFLICT ... DO NOTHING` means no duplicate notification is ever written; M12 is caught on success by the 05-A message text ('early' instead of MSG-CF-01), and on the 04-B re-sends by the unique violation returning a 500 instead of 409 |
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

Summary of the iteration-2 table above: 37 backend runner entries; 32 killed; 5 equivalent; 0 survived. The earlier claim that M7 to M9 were equivalent was wrong for the GET route and is corrected. **This summary is superseded by the current run below** (the iteration-2 table is kept for its "Killed by" notes, which were not re-run in this pass).

### Current run (this pass): backend app-code runner

Command: `cd backend && DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test_merge node scripts/mutation/run.mjs --mutants spm135.mutants.mjs` (exit 0). `spm_test_merge` is a database built from the current `database/postgresql/init` files; the older `spm_test` still has the venue operating columns that SPM-50 removed. Baselines green: unit, e2e, safetyUnit, confirmRealSafety, venueSummary, removal, checklistActions. One earlier attempt in this pass stopped at `baseline e2e: NOT GREEN` (three `POST /api/auth/login` calls returned 404 inside the scratch copy); the same suite then passed three times in the repository and the runner passed on the next attempt. The cause was not established, so treat the first attempt as one unexplained transient failure.

Result: **89 mutants: 82 killed, 7 equivalent (R5, M7b, M8b, M9b, M11, RV7, EQ7), 0 survived, 0 misapplied, 0 skipped.** Original files untouched: yes. The runner runs entries flagged `equivalent` as well: a flagged entry that fails the suite is reported as killed, and one that survives is reported as equivalent. M11 survived in every run in this pass (three targeted runs and the full run), so its `equivalent: true` flag is correct. An earlier pass recorded it as killed; that could not be reproduced, and the counts above replace the earlier 76 killed and 6 equivalent.

| ID | Change | Status (this run) |
|---|---|---|
| R5 | `event_id IS NULL` dropped from the overlap | equivalent |
| M7b | Assignment removed at the locked re-check only | equivalent |
| M8b | Lead allowed at the locked re-check only | equivalent |
| M9b | Organiser allowed at the locked re-check only | equivalent |
| M11 | Unconditional UPDATE under the row lock | equivalent |
| RV7 | Venue delete not scoped to the event | equivalent |
| EQ7 | Rejected equipment status no longer counted as unavailable | equivalent |
| CK1 to CK15 | Checklist mutants (`backend/src/events/status/checklist.ts`) | all 15 killed |
| SF1 to SF4 | Safety-check state mapping | all 4 killed |
| VS1 to VS12 | Venue summary (`venue` text, overlap) | all 12 killed |
| RV1 to RV6 | Venue request removal rules | all 6 killed |
| EQ1 to EQ6 | Equipment request removal rules | all 6 killed |
| CHA1 to CHA7 | confirm-no-equipment, request-safety-check and the status-change input guard (`status.service.ts`) | all 7 killed |

Names for the groups above (from `backend/scripts/mutation/spm135.mutants.mjs`):
- **CK1** approved booking shown confirmed even when its venue is blocked; **CK2** rejected booking shown pending; **CK3** pending booking shown confirmed; **CK4** pending beats unavailable in the combined venue status; **CK5** pending ignored when another request is confirmed; **CK6** equipment Requested shown confirmed; **CK7** unavailable equipment shown pending; **CK8** Released lines counted as outstanding; **CK9** no-equipment section satisfied without confirmation; **CK10** safety check shown while a prerequisite blocks; **CK11** safety request allowed while a prerequisite blocks; **CK12** text "None" treated as a requirement; **CK13** equipment confirmed by statuses alone; **CK14** pending venue does not block the safety check; **CK15** no venue request shown as confirmed.
- **SF1** pending safety mapped to Approved; **SF2** changes_needed mapped to Approved; **SF3** approved mapped to Awaiting Check; **SF4** pending and changes_needed swapped.
- **VS1** approved unblocked booking labelled unavailable; **VS2** window block at another venue flags this venue; **VS3** pending labelled unavailable; **VS4** rejected labelled pending; **VS5** blocked status literal changed; **VS6** window start bound inclusive; **VS7** window end bound inclusive; **VS8** names joined with "; "; **VS9** names in reverse start order; **VS10** overlap equality-only; **VS11** overlap containment (block inside booking) only; **VS12** overlap containment (booking inside block) only.
- **RV1** any venue request removable; **RV2** rejected request not removable; **RV3** window-blocked request not removable; **RV4** unknown request not 404; **RV5** removal allowed outside Planning; **RV6** removal without the assignment check; **RV7** delete not scoped to the event (equivalent).
- **EQ1** any equipment request removable; **EQ2** unavailable status compared case-sensitively; **EQ3** unknown request not 404; **EQ4** removal allowed outside Planning; **EQ5** removal without the assignment check; **EQ6** Requested line removable; **EQ7** rejected status no longer counted as unavailable (equivalent).
- **CHA1** confirm-no-equipment accepted for an event that lists equipment; **CHA2** the stored confirmation time overwritten on every call; **CHA3** safety check requestable before venue and equipment are confirmed; **CHA4** a pending safety check requested again; **CHA5** an approved safety check requested again; **CHA6** a malformed event id reaching the database; **CHA7** a non-string targetStatus treated as Confirmed.

### Current run (this pass): trigger (SQL) runner

Command: `cd backend && DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test node scripts/mutation/run-triggers.mjs` (exit 0, 57 s). Result: **7 trigger mutants: 6 killed, 1 equivalent, 0 survived, 0 misapplied.** Baseline (clean init; removal, safetyInvalidation) green. `database/postgresql/init untouched: yes`.

| ID | Change | Status | First failing test (killing suite) |
|---|---|---|---|
| TG1 | Venue DELETE reset reason text changed | killed | removal: VENUE-REMOVE-01 |
| TG2 | Equipment DELETE reset reason text changed | killed | removal: EQUIPMENT-REMOVE-01 |
| TG3 | Venue DELETE path does not invalidate (early return after delete) | killed | removal: VENUE-REMOVE-01 |
| TG4 | Equipment DELETE path does not invalidate | killed | removal: EQUIPMENT-REMOVE-01 |
| TG5 | `invalidate_safety_check` does nothing when no safety row | killed | safetyInvalidation: SAFETY-STALE (leftover feedback) |
| TG6 | `invalidate_safety_check` guard inverted | killed | removal: EQUIPMENT-REMOVE-01 |
| TG7 | `OLD.event_id IS NOT NULL` guard removed from the venue DELETE branch | equivalent | n/a |

TG7 justification (from `backend/scripts/mutation/spm135.triggers.mutants.mjs`): `DELETE ... WHERE event_id = NULL` matches no row, and `EXISTS (... WHERE event_id = NULL)` is false, so no safety row is touched and no reset row is written. The function does nothing for a NULL event, with or without the guard. The scratch run of TG7 reported no change in any suite result in this pass.

### Current run (this pass): frontend runner

Command: `cd frontend && node scripts/testing/mutation/run.mjs --mutants spm135.mutants.mjs` (exit 0). Result: **37 mutants: 37 killed, 0 equivalent, 0 survived, 0 misapplied, 0 skipped.** Original files untouched: yes. This includes FM1 to FM10 (with FM9b; 11 entries), X1 to X10, PP1 to PP12 and VT1 to VT4.

| ID | Change | Status |
|---|---|---|
| PP1 | Remove From List offered on a non-unavailable venue request | killed |
| PP2 | Remove From List offered on a non-unavailable equipment request | killed |
| PP3 | Remove From List deletes without the confirmation step | killed |
| PP4 | Cancel sends the removal | killed |
| PP5 | Confirm Remove does not send the removal | killed |
| PP6 | Pending request badge text changed | killed |
| PP7 | Unavailable request badge text changed | killed |
| PP8 | Pending request row shows the complete tick | killed |
| PP9 | Venues ticked when any request is confirmed | killed |
| PP10 | Equipment tab not red when unavailable | killed |
| PP11 | Venues tab red instead of yellow when unavailable | killed |
| PP12 | Equipment ticked when any request is confirmed | killed |
| VT1 | Card venue fallback blank instead of "Not booked" | killed |
| VT2 | Detail Venue field fallback blank instead of "Not yet booked" | killed |
| VT3 | Detail Venue field ignores the server value | killed |
| VT4 | Edit form Venue field ignores the server value | killed |

The PP and VT entries are applied to `PlanningInformationPage.tsx`, `EventCard.tsx`, `EventDetailPage.tsx` and the edit form. The other 21 entries in the same run (FM1 to FM10 with FM9b, X1 to X10) were all killed.

Lock-wait check (TR-07): the 04-B (B, deterministic) test was run with its lock-wait filter made impossible to match. It then failed with `AssertionError: expected false to be true` (lock wait not observed), and the file was restored. The original filter passes.

Missing-field check (TR-09): the 02-B full-text assertion was run with the join changed from `"; "` to `", "`. It failed on the exact-text comparison, and the file was restored.

## Test ID traceability (test names in the repository, this pass)

IDs below are copied from the `it(...)` / `describe(...)` names in the files. Nothing was invented; unnumbered tests are listed by name.

| ID family | File | Test names (IDs as written) |
|---|---|---|
| VENUE-REMOVE-01 to 09 | `backend/test/events-venue-removal.e2e-spec.ts` | 01 (leaves venue not requested), 02 (confirmed cannot be removed), 03 (unknown is 404), 04 (other venue stays confirmed), 05 (pending cannot be removed, 409), 06 (rejected removed, 200), 07 (not assigned, 403), 08 (not in Planning, 422), 09 (no session, 401). Plus unnumbered "VENUE-REMOVE (no safety record)" |
| EQUIPMENT-REMOVE-01 to 08 | `backend/test/events-equipment-removal.e2e-spec.ts` | 01 (only unavailable line removed), 02 (Reserved cannot be removed, 409), 03 (unknown, 404), 04 (other line stays confirmed), 05 (Requested cannot be removed, 409), 06 (not assigned, 403), 07 (not in Planning, 422), 08 (no session, 401) |
| VENUE-SUMMARY-01 to 08 | `backend/test/events-venue-summary.e2e-spec.ts` | 01 (plain name), 01 organiser view, 02 ("(pending)"), 03 ("(unavailable)" rejected), 04 (window block "(unavailable)"), 05 (joined ", " in start order), 06 (no venue), 07 (other venue block ignored), 08 (edge-touching blocks ignored). Plus two "VENUE-SUMMARY (partial overlap)" tests |
| SAFETY-SOURCE-01 to 04 | `backend/test/events-confirm-safety-source.e2e-spec.ts` | 01 (real pending blocks, 422), 02 (changes_needed blocks, 422), 03 (no row blocks, 422), 04 (real approved allows, 200) |
| SAFETY-STALE-01 to 07 | `backend/test/events-safety-invalidation.e2e-spec.ts` | 01 (equipment change resets), 02 (venue change resets), 03 (event detail change resets), 05 (new venue or pending equipment resets), 06 (planning save records reason), 07 (no-op save keeps approval), 04 (status change alone keeps approval). Plus unnumbered "(never requested)" and "(leftover feedback)" |
| SAFETY-RESET-UPDATE-01 to 03 | `backend/src/events/planning/event-planning.service.spec.ts` | 01 (reports reset when a check was removed), 02 (no reset when none existed), 03 (no reset when nothing changed) |
| SAFETY-SOURCE (unit, not numbered) | `backend/src/events/status/safety-check.source.spec.ts` | "maps a pending/changes_needed/approved safety check to ..." (3), "returns undefined when the event has no safety check row", and the `view` tests. These carry no SAFETY-SOURCE ID in their names |
| Frontend venue text (`PlanningInformationPage.test.tsx`) | `frontend/src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx` | "shows a yellow Action needed caution on the Venues tab ..."; "offers Remove From List only on unavailable venue requests"; "cancelling the removal of a venue request sends no DELETE"; "removes an unavailable venue, confirms it, and ticks Venues ..."; "keeps the unavailable venue listed and shows an error when removal fails"; "lists every venue request with its own status ..."; equipment counterparts for Equipment. No IDs in these names |
| Frontend venue text (`EventDetailPage.test.tsx`) | `frontend/src/features/events/pages/detail/EventDetailPage.test.tsx` | "shows the server venue text, including a pending label, in the Venue field" |
| Frontend venue text (`EventEditForm.test.tsx`) | `frontend/src/features/events/pages/edit/EventEditForm.test.tsx` | "shows the server venue text in the read-only Venue field"; "shows Not yet booked in the Venue field when the event has no venue" |
| Frontend venue text (`EventCard.test.tsx`) | `frontend/src/features/events/pages/list/EventCard.test.tsx` | "shows the server venue text, including a pending label, on the card"; "shows Not booked when no venue has been booked yet"; "truncates a long venue name ..." |

Also present: `SAFETY-FEEDBACK-01 to 03` in `backend/test/events-safety-feedback.e2e-spec.ts` (the IDs exist in the names) and `CHECKLIST-ACTION-01 to 07` in `backend/test/events-checklist-actions.e2e-spec.ts` (01 stores the confirm-no-equipment time once, 02 refuses it when equipment is listed, 03 refuses a safety request before venue and equipment are confirmed, 04 and 05 refuse it while pending or approved, 06 gives 404 for an unknown or malformed event id, 07 gives 400 for a status change without a usable target).

### Supporting tests (internal IDs) and the AC they support

The `CONFIRM-EVENT-01` to `06` cases in Confluence are the specified test cases for SPM-135. The families below are **supporting tests**: they extend a specified case with a rule it depends on and are not given Confluence rows (the matrix stays minimal). Each is mapped to the SPM-135 acceptance criterion it supports. `TR-nn` in test names are Test Code Review finding labels, not test case IDs.

| Family | Supports | Related Confluence case | Why it exists |
|---|---|---|---|
| `VENUE-REMOVE-01` to `09` and "(no safety record)" | AC1, AC2 | 02-C, 02-D | A rejected or blocked venue request must be clearable so the coordinator can request another, only that kind of request may be removed, and removal resets a stale safety approval |
| `EQUIPMENT-REMOVE-01` to `08` | AC1, AC2 | 02-A | The same rules for equipment lines |
| `EQUIPMENT-GATE-01` to `02` (in `events-confirm.e2e-spec.ts`) | AC1, AC2 | 02-A | Needed equipment that was never requested blocks confirmation; "none" confirmed by the coordinator allows it |
| `SAFETY-SOURCE-01` to `04` and `safety-check.source.spec.ts` | AC1, AC2 | 02-A, 02-B | The confirm gate reads the real stored safety check, so a pending, changes-needed or missing check blocks and only an approved one allows |
| `SAFETY-STALE-01` to `07`, `SAFETY-RESET-UPDATE-01` to `03` | AC1, AC2 | 02-A | A safety approval counts only while the venue, equipment and event details it approved are unchanged |
| `SAFETY-FEEDBACK-01` to `03` | AC1, AC2 | 02-A | Changes the Safety Officer asked for must be resolved before the safety check is requested again |
| `CHECKLIST-ACTION-01` to `07` | AC1, AC2 | 02-A, 02-B | The actions that lead to Confirm (confirm no equipment, request the safety check) refuse what they must, and the status-change input guard rejects a missing target |
| `VENUE-SUMMARY-01` to `08`, "(partial overlap)", "(planning)" and the frontend venue text tests | AC3 | 02-D, 03-C | The venue the coordinator reads (list, details, edit form, planning) shows pending and unavailable the same way as the readiness list |
| `PlanningInformationPage`, `ConfirmEventPanel` supporting frontend tests (SAFETY-RESET-CONFIRM, 03-D, TR-13 branches) | AC2, AC3 | 02-A, 03-A | The page and the panel show what is outstanding from the server's answer, including after a reset, a slow answer or a failed read |


## Confirm Event traceability

Authoritative IDs: Confluence page **"CONFIRM-EVENT-01"** through **"CONFIRM-EVENT-06"** (space SP, cloud `dd8b6b9d-4837-4ca9-a7d9-4d19ff87f2df`), indexed by **"Confirm an Event (Coordinator) Matrix"** (page 22905205, https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/22905205/Confirm+an+Event+Coordinator+Matrix). The matrix and case pages define 17 IDs: 01-A/B/C, 02-A/B/C/D, 03-A/B/C, 04-A/B, 05-A/B/C, 06-A/B. Test files were tagged or annotated in this pass where a test implements the case. Status key: **tagged** (implements the case as written), **partial** (implements part of the case; reason given), **added** (new test written in this pass).

| Confluence ID | Test file and test name | Status |
|---|---|---|
| CONFIRM-EVENT-01-A | `backend/test/events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-01-A: the assigned coordinator confirms a fully arranged Planning event"; `backend/src/events/status/readiness.spec.ts`: "CONFIRM-EVENT-01-A (rule level)"; `frontend/.../planning/ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-01-A (FE)"; `frontend/.../detail/EventDetailPage.confirm.test.tsx`: "CONFIRM-EVENT-01-A (page)" | tagged |
| CONFIRM-EVENT-01-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-01-B: every one of several Approved bookings and equipment lines is checked"; `readiness.spec.ts`: "CONFIRM-EVENT-01-B (rule level)" | tagged |
| CONFIRM-EVENT-01-C | `events-confirm.e2e-spec.ts`: describe "CONFIRM-EVENT-01-C: authorisation is assignment" and "CONFIRM-EVENT-01-C (D): no session gets 401"; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-01-C (FE)"; `EventDetailPage.confirm.test.tsx`: two "CONFIRM-EVENT-01-C (page)" tests | tagged |
| CONFIRM-EVENT-02-A | `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-02-A (FE)" (subtest A, EVT-202 venue Pending, only); `readiness.spec.ts`: "CONFIRM-EVENT-02-A (rule level)" (added, four cases, see below) | partial: the FE test covers subtest A only; subtests B to D (EVT-203, EVT-204, EVT-210) have no UI or e2e test; the readiness test checks only the blocking decision, not the MSG-CF-02 text, status staying Planning, no audit row or no notification |
| CONFIRM-EVENT-02-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-02-B: a blocked confirm returns CONFIRM_BLOCKED with the three outstanding items ..." | tagged |
| CONFIRM-EVENT-02-C | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-02-C: one Pending booking blocks confirmation ..."; `readiness.spec.ts`: "CONFIRM-EVENT-02-C (rule level)"; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-02-C (FE)" | tagged |
| CONFIRM-EVENT-02-D | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-02-D: a venue flagged unavailable after page load blocks ..."; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-02-D (FE)" | tagged |
| CONFIRM-EVENT-03-A | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-03-A: arrangements-status lists venue, equipment and safety in order ..."; `readiness.spec.ts`: "CONFIRM-EVENT-03-A (rule level)"; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-03-A (FE)" | tagged |
| CONFIRM-EVENT-03-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-03-B: only the unsatisfied venue is listed ..."; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-03-B (FE)" | tagged |
| CONFIRM-EVENT-03-C | `readiness.spec.ts`: "CONFIRM-EVENT-03-C (rule level)"; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-03-C (FE)" | tagged |
| CONFIRM-EVENT-04-A | `frontend/.../detail/EventDetailPage.confirm.test.tsx`: "CONFIRM-EVENT-04-A (page)" | partial: the status change and the timeline update are checked; the message text MSG-CF-01 and the reload/queue checks in the case are not (the case notes say the remount-after-fetch check is not automated) |
| CONFIRM-EVENT-04-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-04-B (A)", "(B)", "(B, deterministic)"; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-04-B (C, FE)" | tagged |
| CONFIRM-EVENT-05-A | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-05-A: the submitting organiser sees one unread EventConfirmed notification after confirm" | partial: backend notification only; the bell UI and the 10-second bell count and click-through are not tested (SPM-137, blocked per the Confluence result) |
| CONFIRM-EVENT-05-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-05-B: the organiser sees venue, equipment and safety ..."; `frontend/.../planning/ConfirmedArrangementsPanel.test.tsx`: "CONFIRM-EVENT-05-B (FE)"; `EventDetailPage.confirm.test.tsx`: "CONFIRM-EVENT-05-B (page)" (two) | tagged |
| CONFIRM-EVENT-05-C | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-05-C: a blocked attempt notifies nobody; the success notifies only the submitting organiser" | tagged |
| CONFIRM-EVENT-06-A | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-06-A: a Rejected event is refused with 422 EVENT_NOT_CONFIRMABLE ..." (it.each row); `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-06-A/06-B (FE)" (rejected row) | tagged. The Confluence expected result (HTTP 422 MSG-CF-05) is the oracle and the e2e asserts the status, the code `EVENT_NOT_CONFIRMABLE` and the message text. The "HTTP 409" in the Confluence execution notes is a different case (already Confirmed, 04-B); see Assumptions (ASSUMED) |
| CONFIRM-EVENT-06-B | `events-confirm.e2e-spec.ts`: "CONFIRM-EVENT-06-B: a Cancelled event is refused with 422 ..."; `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-06-A/06-B (FE)" (cancelled row) | tagged (same notes as 06-A) |
| CONFIRM-EVENT-03-D | `ConfirmEventPanel.test.tsx`: "CONFIRM-EVENT-03-D (FE)" | not in Confluence. The name is left unchanged; no matching Confluence case exists |

Added in this pass: `backend/src/events/status/readiness.spec.ts`, `it.each` "CONFIRM-EVENT-02-A (rule level): ... blocks readiness" for venue Pending (EVT-202), equipment Requested (EVT-203), safety Awaiting Check (EVT-204), safety Changes Requested (EVT-210). Each asserts not ready and exactly one outstanding item of the expected type.

Cases with no matching test: none beyond the partial items above.

## Static checks and build (this pass)

- `cd backend && npx tsc --noEmit -p tsconfig.json`: exit 1, **32 errors** (31 before the merge with dev; the extra one is in a dev-owned spec). 14 are in SPM-135 specs: `events-venue-removal` and `events-equipment-removal` (lines 7 and 73), `events-venue-summary` (lines 7 and 84), `events-confirm-safety-source` (lines 7 and 87), `events-confirm` (lines 7 and 122), `events-safety-feedback` (lines 7 and 73), `events-safety-invalidation` (lines 7 and 75). All are the shared pattern: `supertest/types` import (TS2307) and `.find` on `set-cookie` typed as `string` (TS2339), also used by older specs. The other 18 are in older or dev-owned specs and `vitest.spm37.config.ts`. The new `events-checklist-actions.e2e-spec.ts` (this pass) adds none: it avoids the `supertest/types` import and types the cookie header.
- `cd backend && npx tsc --noEmit -p tsconfig.build.json`: exit 0, 0 errors. The build config excludes test and `*spec.ts` files, so the production build is unaffected.

## Run commands (Guide 10E, 12)

```bash
# Backend unit
cd backend && npx vitest run

# Backend real-DB suite (requires docker Postgres with a database built from database/postgresql/init, all files)
export DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test TEST_DATABASE_URL=$DATABASE_URL
npx vitest run --config ./vitest.config.e2e.ts test/events

# Backend coverage of the real-DB suites. status.service.ts is only exercised here, so `npm run test:cov` does not measure it.
npx vitest run --config ./vitest.config.e2e.ts --coverage --coverage.include='src/events/status/**' test/events
# or: npm run test:cov:e2e   (writes backend/coverage/e2e, which is git-ignored)

# Frontend
cd frontend && npx vitest run src/features/events/pages/detail/planning
npx tsc -b && npx eslint src/features/events/pages/detail/planning src/utils/arrangements.ts

# Mutation runner (scratch copy; needs DATABASE_URL)
node scripts/mutation/run.mjs --mutants spm135.mutants.mjs

# Coverage is diagnostic only; it does not measure test strength.
npx vitest run --coverage
```

Coverage (diagnostic only; Improve Test Case Evaluation Workflow pass). Coverage measures what the tests execute, not how well they check it; the mutation results above are the measure of test strength.

*Measurement scope.* `npm run test:cov` in `backend` loads only the files the unit tests import, so `status.service.ts`, which only the real-database suites exercise, was never in the figure. The gap was the scope, not the number. `backend/vitest.config.e2e.ts` now has a coverage block and `backend/package.json` has `npm run test:cov:e2e` (output `backend/coverage/e2e`, git-ignored). It needs a database built from `database/postgresql/init`.

- Backend unit: 49 files, 1231 passed (`npx vitest run`). Per-file unit figures were not re-measured in this pass.
- Backend real-database suites (`test/events`, 13 files, 129 passed), SPM-135 status files: `status.service.ts` 95.83% statements, 90.32% branches, 96.87% functions, 97.43% lines; `checklist.ts` 97.72 / 92.85 / 100 / 100; `safety-check.source.ts` 100 / 92.85 / 100 / 100. Uncovered lines in `status.service.ts`: 121, 161 and 383 are the assigned-coordinator re-checks after the row lock (the pre-check refuses first, so they can only fire in a reassignment race; mutants M7b to M9b record this), and 450 is the already-confirmed fallback for a concurrent confirm whose UPDATE finds no row to change (reachable only in a race). These are defensive and are left uncovered on purpose.
- Frontend: 71 files, 1017 passed, 1 todo (`npm run test:cov`). SPM-135 files: `ConfirmEventPanel.tsx`, `ConfirmedArrangementsPanel.tsx`, `SafetyCheckChangesNeeded.tsx` and `utils/arrangements.ts` are 100% on statements, branches, functions and lines. `PlanningInformationPage.tsx` is 97.22% statements, 90.08% branches, 100% functions and 100% lines. The 12 uncovered branch arms (of 121) are defensive or cosmetic: the "page was left while loading" guards in the load, the double-click guard in the action wrapper, the "Removing..." text arm, a fallback-message arm and a few text arms. The two lines this document previously reported as uncovered (the 15-second refresh and the Re-Request button when no feedback is listed) now have tests, and so do the failed-load, confirm-callback, unticking, and failed-tick and failed-re-request paths.
- Not chased: 100% branch coverage of the defensive arms above. They add tests that check nothing a user can see.

## Regression result for finished stories

| Suite | Result |
|---|---|
| Backend unit (46 files) | 1167 passed, 0 failed (iteration 2). `events.reject.spec.ts` assertions updated for `EventConfirmed`. |
| Backend e2e (18 files) | 17 files pass. **`drafts.e2e-spec.ts`: 11 failing. Pre-existing:** the same 11 fail on a clean checkout of HEAD (verified with a temporary worktree, now removed). The drafts routes need a session cookie, but the suite sends none. Not caused by this change. |
| Frontend (69 files) | 952 passed, 1 todo, 0 failed (iteration 2). `EventDetailPage.planning` unchanged; the arrangements helpers validate response shapes, as `planning.ts` does. The drafts and other finished-story suites were not re-run in iteration 2 beyond the full frontend run. |
| `tsc -b` (frontend) | Clean (iteration 2, exit 0) |
| `oxlint` (backend changed files) | Clean |
| `eslint` (frontend changed files) | Clean |
