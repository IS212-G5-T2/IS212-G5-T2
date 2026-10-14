# SPM-136 Cancel an Event and Release its Reservations: test results

Status of this document: implementation evidence for the Implementation Agent report. It is not a review gate result. Test Code Review, Requirement Review and Code Quality Review have not run.

Story: SPM-136 (Jira status In Progress when implemented). Acceptance criteria AC1 to AC8. Test cases: CANCEL-EVENT-01-A to 08-B (21 IDs) in the Confluence space SP, plus the matrix page "Cancel an Event & Release its Reservations Matrix". Pages were read through the Atlassian connector on 2026-10-14; the matrix was used for traceability.

## Decisions applied (Gate 1 answers, from the assignment brief)

| Ref | Decision | Where it is applied |
|---|---|---|
| D2 (option A) | Release registry with a cancelled guard. Releasers registered for `event_registrations`, `venue_bookings` (approved bookings and pending holds) and `equipment_reservations`. There is no waiting-list table (SPM-138): nothing is registered for it, and its cases are Blocked. Safety-check rows are left untouched; every safety action is guarded. | `backend/src/events/cancel/release.registry.ts`, `backend/migrations/011_spm136_cancel_event.sql` (safety triggers skip the release transition) |
| D5 | The server enforces `confirmed === true` strictly. Missing, false, `"true"`, 1 and null give 400 `CANCEL_NOT_CONFIRMED` (MSG-CN-03). | `cancel-rules.ts` (`isConfirmed`), `cancel-event.service.ts` |
| D9 / F9 | Cancellable set: Submitted, Approved, Planning, Confirmed. Completed, Rejected and Cancelled give 409 `EVENT_NOT_CANCELLABLE` (MSG-CN-06). The repository has no "Under Review" or "Draft" event status. | `cancel-rules.ts` (`CANCELLABLE_STATUSES`) |
| D10 / D12 | Notifications are rows written inside the transaction, reusing `notifications`. A partial unique index `(recipient_id, related_event_id, type) WHERE type = 'EventCancelled'`. No attendee read path or bell UI. `EventCancelled` is added to the organiser and coordinator type lists of `GET /api/notifications`. | `011_spm136_cancel_event.sql`, `events.service.ts` (`notificationTypesFor`) |
| D11 | Allowed edits to finished stories only: SPM-120 withdraw of a cancelled registration gives 409 (not 422); a Registered row on a cancelled event is still withdrawable (the existing A8 assumption that the event status label never decides is kept). Registration on a cancelled event is refused by the existing closed path (422 `registration_closed`). | `registrations.service.ts` (`withdraw`), the existing `registration-window.ts` |
| F1 | Product owner decision: the assigned coordinator is notified whoever cancels. The canceller receives the record too. | `cancel-event.service.ts` (recipient set) |
| F3 | 05-B uses independent fixtures (EQ-308 and EVT-308 are separate rows). | `test/events-cancel.e2e-spec.ts` |
| Guard | Every existing mutation that takes an event answers 409 `EVENT_CANCELLED` (MSG-CN-04) after its identity and assignment checks, before any write. | `backend/src/events/cancelled-guard.ts` and its call sites (see the guard table below) |

## Traceability map (business rule to test IDs)

| Rule | AC | Test IDs | Layer |
|---|---|---|---|
| Assigned coordinator or submitting organiser only | AC1 | 01-A, 01-B, 01-C (A to F) | e2e, unit, FE page |
| Confirmation is required by the server (boolean true) | AC2 | 02-C (5 bodies); 02-A and 02-B in the dialog | e2e, unit, FE dialog |
| Status becomes Cancelled, stamped by the injected clock | AC3 | 03-A | e2e, unit, FE page |
| Cancellable set and refusals | AC3 | 03-B (7 rows) | e2e, unit, FE page |
| One winner under concurrency | AC3, AC5 | 03-C | e2e (5 parallel), unit (lost CAS) |
| Venue bookings and holds released | AC4 | 04-A, 04-B (partial), 04-C | e2e, unit |
| Equipment reservations released | AC5 | 05-A, 05-B (part) | e2e, unit |
| Notifications (organiser, coordinator, Registered attendees), once | AC6 | 06-A (DB rows), 06-C | e2e, unit |
| Nothing changes on a cancelled event | AC7 | 07-A (11 routes), 07-B (C, D) | e2e, unit, FE page |
| Registrations and waiting list show Cancelled | AC8 | 08-A (registrations), 08-B | e2e, unit |

## Evidence table (Guide 10B, cases and their main evidence)

| Test ID | AC | Level | Oracle source | Mutant it kills (examples) |
|---|---|---|---|---|
| CANCEL-EVENT-01-A | AC1 | e2e | Confluence 01-A: 200, Cancelled, actor COO-01 | M7, M8, M1 |
| CANCEL-EVENT-01-B | AC1 | e2e | Confluence 01-B: 200, actor ORG-01 | M8, M17 |
| CANCEL-EVENT-01-C | AC1 | e2e (5 subtests), unit, FE | Confluence 01-C: 403 MSG-CN-05, 401 without token | M1, M7, M8 |
| CANCEL-EVENT-02-A | AC2 | FE dialog | Confluence 02-A and MSG-CN-01/02 literals | M9 (dialog dismiss sends a request) |
| CANCEL-EVENT-02-B | AC2 | FE dialog and page | Confluence 02-B: Keep, Escape, outside click, no request | M9 |
| CANCEL-EVENT-02-C | AC2 | e2e (5 bodies), unit | Confluence 02-C and D5 | M3, M10 |
| CANCEL-EVENT-03-A | AC3 | e2e, FE page | Confluence 03-A: cancelled_by COO-01, cancelled_at T0 exact | M4, M11 |
| CANCEL-EVENT-03-B | AC3 | e2e (7 rows), unit | Confluence 03-B table and F9 | M2, M12 |
| CANCEL-EVENT-03-C | AC3, AC5 | e2e (parallel), unit | Confluence 03-C | M13 (equivalent), M15 |
| CANCEL-EVENT-04-A | AC4 | e2e (venue, safety), unit | Confluence 04-A: Released, released_at T0. Safety rows unchanged and no reset row: Gate-1 decision D2 (safety rows left untouched), DERIVED from D2, not stated in Confluence 04-A (TR-136-01, TR-136-11) | M4, M5, M14, S11, TR-T1, TR-T2 |
| CANCEL-EVENT-04-B | AC4 | e2e | Confluence 04-B: VB-308 stays Approved | M14 |
| CANCEL-EVENT-04-C | AC3, AC4, AC5 | e2e (fault injection) | Confluence 04-C: 500, nothing changed, retry completes | M15, M16 |
| CANCEL-EVENT-05-A | AC5 | e2e, unit | Confluence 05-A: Projector 2 to 4, Microphone 6 to 10; Requested and Unavailable lines Released (TR-136-04) | M6, S12, S13 |
| CANCEL-EVENT-05-B | AC5 | e2e (part) | Confluence 05-B: EQ-308 stays Reserved x1 | Blocked for x4/x5 |
| CANCEL-EVENT-06-A | AC6 | e2e (DB rows and GET /api/notifications), unit | Confluence 06-A: one unread notice per recipient; coordinator copy labelled coordinator (TR-136-05) | M17, S15, S16 |
| CANCEL-EVENT-06-B | AC6 | none | Confluence 06-B (waiting list, SPM-138) | Blocked |
| CANCEL-EVENT-06-C | AC6 | e2e | Confluence 06-C: no notice for ATT-06, ATT-07, ORG-02, COO-02 | M18 |
| CANCEL-EVENT-07-A | AC7 | e2e (11 routes), FE page | Confluence 07-A: 409 MSG-CN-04, DB unchanged | M20 |
| CANCEL-EVENT-07-B | AC7 | e2e (C, D); Blocked (A, B) | Confluence 07-B | Blocked; C deviation (see below) |
| CANCEL-EVENT-08-A | AC8 | e2e | Confluence 08-A: three Cancelled rows, reason, no promotion | M19 |
| CANCEL-EVENT-08-B | AC8 | e2e | Confluence 08-B: ATT-06 unchanged, withdraw 409, report 0, register 422 | M19 |

## Test case results (every test case ID)

Result key: PASS = every step of the Confluence case is covered by a passing test. PARTIAL = some steps covered. BLOCKED = the route, table or story the case needs is not in this repository; no test is written for the missing part.

| Test ID | Result | What is tested | Not tested and why |
|---|---|---|---|
| 01-A | PASS | e2e: COO-01 cancels EVT-301 (200, Cancelled, history Confirmed to Cancelled by COO-01). FE: Cancel Event on a Planning event for the assigned coordinator. | The dialog-then-click path is covered by FE tests; the e2e call is the POST body from the case. |
| 01-B | PASS | e2e: ORG-01 cancels (200, history actor ORG-01, COO-01 notified). FE: Cancel Event for the submitting organiser. | None. |
| 01-C | PASS | e2e: COO-02, ORG-02, ATT-01, LEAD-01 get 403 MSG-CN-05; no token gets 401; nothing changes. FE: no action for COO-02, ORG-02, LEAD-01. | None. |
| 02-A | PASS (FE) | Dialog text (MSG-CN-01 consequences paragraph and heading), Keep event focused, zero requests while open, one request with `confirmed: true` on confirm, MSG-CN-02 announced, 409 shown as alert. | Status Confirmed while the dialog is open is shown as "no request was made", not read back from the page. |
| 02-B | PASS (FE) | Keep event, Escape and outside click each close with zero requests; Tab stays inside; a letter key does nothing; page-level Keep event leaves the event Planning. | None. |
| 02-C | PASS | e2e: omitted, false, `"true"`, 1 and null each give 400 CANCEL_NOT_CONFIRMED and nothing changes. Unit: the same set plus no body. | None. D5 applies: the server enforces confirmation, so the case is not N/A. |
| 03-A | PASS | e2e: cancelled_by = COO-01 and cancelled_at = T0 exactly (injected clock, not SQL now()); GET shows `cancelled`. FE: banner after confirm. | The coordinator queue and ORG-01's event list screens are not separately tested; only the event read model and the page are. |
| 03-B | PASS | e2e: Planning, Confirmed, Submitted and Approved cancel (200); Completed, Rejected and Cancelled give 409 MSG-CN-06, with the event, history and notices unchanged. Unit: the cancellable set. | Cancelled again produces no duplicate notice: covered by the unchanged snapshot. |
| 03-C | PASS | e2e: five parallel requests (COO-01 and ORG-01 mixed) give one 200 and four 409; one history row; one notice per recipient; Projector available 4. Unit: a lost compare-and-set writes nothing. | "Available 4" is derived in the test by SQL (stock minus held quantities) because the repository has no equipment availability function. |
| 04-A | PASS (with limit) | e2e: VB-301a and VB-301b are `released` with released_at T0; GET venue reservations are empty for both venues. | Calendar screens and the buffer maths of the availability view are not tested: no calendar function is called. |
| 04-B | PARTIAL | e2e: VB-308 stays Approved; Main Hall reservations after cancel list only VB-308. | The request for the old slot (ORG-02 submits a venue booking) is not run: no venue-request submission route was located in this repository. |
| 04-C | PASS | e2e: a fault in the equipment releaser after the status, notice, venue and registration writes gives 500 with no stack text; every table is unchanged (snapshot includes notifications and history); retry gives full release. | None. |
| 05-A | PASS | e2e: both lines `Released` with released_at T0; Projector 4 (before 2), Microphone 10 (before 6), derived by SQL. | Equipment availability screen not tested (no such view called). |
| 05-B | PARTIAL | e2e: EQ-308 stays Reserved x1. | x4 accepted and x5 rejected: BLOCKED, no equipment request route exists in this repository. |
| 06-A | PARTIAL | e2e: ORG-01, COO-01, ATT-01, ATT-02, ATT-03 each get exactly one unread `EventCancelled` notice naming "Annual Gala Dinner", for both cancellers (two clones). | The attendee bell and `GET /notifications/me` for attendees: BLOCKED, there is no attendee read path (D10/D12). Checked in the database instead. |
| 06-B | BLOCKED | Nothing. | Waiting list does not exist (SPM-138). |
| 06-C | PARTIAL | e2e: ATT-06 (Withdrawn), ATT-07, ORG-02 and COO-02 get no notice; the event has exactly five notices. | The mail catcher assertion: no email transport exists in this repository, so "no email sent" is UNABLE TO VERIFY. |
| 07-A | PASS | e2e: 11 existing mutation routes on a cancelled event answer 409 EVENT_CANCELLED (MSG-CN-04) and every table is unchanged (route list below). FE: banner shown, Update Event Information and Confirm Event hidden on a cancelled event. | Replacement-venue request route: not located in this repository, not tested. |
| 07-B | PARTIAL | e2e: D (COO-01 Confirmed gives 422 MSG-CF-05; Planning gives 422 INVALID_STATUS_TRANSITION (ASSUMED); status stays Cancelled). C: see the deviation below. | A (Safety Officer approve or change request) and B (Venue Staff approve booking): BLOCKED, no such routes exist (safety check outcome is SPM-126). |
| 08-A | PARTIAL | e2e: three Registered rows become `Cancelled` with reason "Event cancelled"; the Withdrawn row is untouched; no promotion; ATT-01 registration view shows `cancelled`. | Waiting-list entries (ATT-04, ATT-05) becoming Cancelled: BLOCKED (SPM-138). |
| 08-B | PASS | e2e: ATT-06 row identical including withdrawn_at; ATT-01 withdraw of the cancelled registration gives 409 EVENT_CANCELLED with no status change; report `totalConfirmed` 0; ATT-07 registration gives 422 `registration_closed` "Registration has closed for this event.". | None. |

### Deviations and assumptions

- **07-B (C), expected 409 MSG-CN-04, actual 403.** ORG-01 editing the planning details goes through `requireCoordinatorRole` before any event lookup (an existing rule). The planning PATCH is coordinator-only, so the organiser is refused as a non-coordinator and nothing changes. The cancelled guard runs after that check. Changing the order would alter the existing authorisation for every role, so the test expects 403 and records the deviation. Open question for the Orchestrator: confirm 403 is acceptable for this subtest.
- **INVALID_STATUS_TRANSITION (422) and "This status change is not allowed for this event.".** ASSUMED: the Confluence pages give neither the code nor the text for a Planning target on a cancelled event; no catalogue ID exists for this message.
- **Registration withdraw on a cancelled registration** gives 409 `EVENT_CANCELLED` with the MSG-CN-04 text. ASSUMED wording (the case asks for 409 only).
- **Notification text for attendees** is the same as for organisers: "{eventName} has been cancelled.".

## Guard coverage (AC7): mutation routes that take an event

| Route | Guard location | e2e test |
|---|---|---|
| `PATCH /api/events/:id/planning` | `event-planning.service.ts` `editableAccess` (after access) | 07-A planning PATCH |
| `POST /api/events/:id/planning/changes/:changeId/resolve` | same `editableAccess` | 07-A flagged change resolve |
| `POST /api/events/:id/confirm-no-equipment` | `status.service.ts` | 07-A |
| `POST /api/events/:id/safety-check/request` | `status.service.ts` | 07-A |
| `POST /api/events/:id/safety-check/feedback/:feedbackId/resolve` | `status.service.ts` | 07-A |
| `DELETE /api/events/:id/safety-check/feedback/:feedbackId/resolve` | `status.service.ts` | 07-A |
| `DELETE /api/events/:id/equipment-reservations/:id` | `status.service.ts` | 07-A |
| `DELETE /api/events/:id/venue-requests/:id` | `status.service.ts` | 07-A |
| `POST /api/events/:id/clarifications` | `clarifications.service.ts` | 07-A clarification create |
| `POST /api/events/:id/clarifications/:id/reply` | `clarifications.service.ts` | 07-A clarification reply |
| `POST /api/events/:id/clarifications/:id/resolve` | `clarifications.service.ts` | 07-A clarification resolve |

Not guarded because they are not event arrangements or do not exist: venue unavailable periods (venue-level), equipment inventory create and availability (inventory), coordinator availability, lead assignment (requires Submitted status already), registration create (closed path) and withdraw (own 409 rule). Read routes are not guarded.

## Gap list (Guide 10D) and handoff table

| Gap | Case | Why it is not tested | Needed to test it (story or owner) |
|---|---|---|---|
| Waiting list entries and their notice | 06-B, 08-A (waitlist half) | No waiting-list table or routes | SPM-138 |
| Attendee notification read path and bell | 06-A (bell), 06-C (mail) | No attendee read path (D10/D12) | Unknown: attendee notifications story |
| Email transport ("no email sent") | 06-C | No mail transport in this repository | Unknown: email delivery story |
| Equipment request flow for x4/x5 | 05-B | No route to request equipment for an event | Unknown: equipment request story |
| Venue booking request submission (old slot) | 04-B | No route located for a new venue request | Unknown: venue request story |
| Safety Officer approve or change request | 07-B (A) | Outcome route is not built | SPM-126 |
| Venue Staff approve pending booking | 07-B (B) | No approval route in this repository | Unknown: venue booking approval story |
| Replacement venue request | 07-A | No route located | Unknown: replacement venue story |
| Equipment availability and calendar views | 04-A, 05-A | No availability function; checked by SQL and reservation lists | Unknown: availability view story |
| Coordinator queue and organiser list screens | 03-A | Not separately tested | Frontend list tests (not in this change) |
| Dialog-state "status still Confirmed while open" | 02-A | Read as "zero requests" | Acceptable as is |
| Login returned 401 once in a full run (events-cancel; earlier also events-confirm and clarifications) | TR-136-08 | Environmental, not caused by SPM-136. Supertest listens on the wildcard address and then connects to 127.0.0.1:<port>; a Code Helper (editor) process listening on 127.0.0.1 with an ephemeral port can receive some of those connections, which answer `{"type":"error","error":{"type":"authentication_error",...}}`. Both SPM-136 suites now call `app.listen(0, '127.0.0.1')` (see Correction cycle 3). Diagnostics still report a non-201 login status and body. | Re-run the full e2e suite with no editor listening on loopback; a recurrence would show the non-JSON-API body above |
| Equipment-availability suite deletes role 6 (COORDINATOR_LEAD) in its teardown | TR-136-08 (ruled out) | The earlier suspicion was wrong: the 401 comes from the editor listener, not from role 6 teardown. Recorded only so the reasoning is traceable. | None for SPM-136 |
| Waiting list entries and notices (RR-136-04) | 06-B, 08-A (waitlist half), AC6, AC8 | Blocked on SPM-138. The story cannot be Done until SPM-138 is delivered, or the product owner re-scopes AC6 and AC8. | SPM-138 or PO re-scope |
| Coordinator notice UI (RR-136-06) | 06-A (coordinator copy) | No coordinator notification surface is in scope; the notice is readable through `GET /api/notifications` only. | Coordinator notification UI story |
| CQ F3 circular type import | none | Intentionally skipped in cycle 3: refactor, not a behaviour change for SPM-136. | Separate refactor task |
| CQ F6 duplicated code | none | Intentionally skipped in cycle 3. | Separate refactor task |
| TR-136-10 rejected-update trigger test | none | Intentionally skipped in cycle 3. | Separate trigger test task |
| RR-136-09 Jira traceability | AC and test IDs in Jira | Not done in this cycle: Jira is not changed here. | Jira owner |
| Unit coverage of `status.service.ts` and `arrangements.reader.ts` | all | Both files have no unit spec at HEAD; the SPM-136 lines in them are reached by e2e and `status.removal.spec.ts`. 100 percent of changed code is not met for these two files. | Unit specs for the status module (separate task) |
| Locked-row re-checks in `confirmNoEquipment` and `requestSafetyCheck` (RR-136-07) | 07-A | Tests cover the pre-check only; the removal re-checks have M26 and M27, and these two have no dedicated mutant yet. | Mutant and test follow-up |

## Mutation results (committed runners, scratch copies only)

All runs below are on the final snapshot. Each runner copies its component to a scratch location, applies one mutant at a time, and proves the original files untouched.

| Runner | Command | Result |
|---|---|---|
| Backend app code | `cd backend && DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm136.mutants.mjs` | 53 mutants: 52 killed, 1 equivalent (M13), 0 survived, 0 misapplied; baselines (unit, e2e) green; exit 0 (cycle 4 final run; cycle 3 was 49 mutants) |
| Backend triggers (SPM-136 release-skip branches) | `cd backend && DATABASE_URL=... node scripts/mutation/run-triggers.mjs --mutants spm136.triggers.mutants.mjs` | 2 mutants: 2 killed (TR-T1, TR-T2); exit 0 |
| Backend triggers (SPM-135, repointed to 017) | `cd backend && DATABASE_URL=... node scripts/mutation/run-triggers.mjs` | 7 mutants: 6 killed, 1 equivalent (TG7); exit 0 |
| Frontend | `cd frontend && node scripts/testing/mutation/run.mjs --mutants spm136.mutants.mjs` | 24 mutants: 22 killed, 2 equivalent (F4, F5), 0 survived, 0 misapplied; exit 0 (cycle 4 final run; cycle 3 was 23 mutants) |

### Backend app-code mutants (spm136.mutants.mjs)

The M-numbers from M1 to M20 and S1 to S24 are listed below. M22 to M27 were added in cycle 3.

| ID | Result | Killed by | Mutant |
|---|---|---|---|
| M1 | killed | unit | assignment check removed (pre-check and locked row) |
| M2 | killed | unit | Completed is cancellable |
| M3 | killed | unit | confirmation check removed |
| M4 | killed | unit | handler is a no-op |
| M5 | killed | e2e | only the first venue booking released |
| M6 | killed | e2e | only the first equipment reservation released |
| M7 | killed | unit | Coordinator Lead may cancel |
| M8 | killed | unit | any Organiser may cancel |
| M10 | killed | unit | truthy confirmation accepted |
| M11 | killed | e2e | cancelled_at taken from SQL now() |
| M12 | killed | unit | cancellable set drifts (Approved removed) |
| M13 | equivalent | n/a | compare-and-set made unconditional: the row is locked FOR UPDATE and re-checked first, so the conditional WHERE cannot change behaviour; kept as defence in depth |
| M14 | killed | unit | release not scoped to the event |
| M15 | killed | unit | no transaction |
| M16 | killed | unit | notices written outside the transaction (re-anchored in cycle 3 to the single `INSERT ... SELECT unnest(...)` statement; the cycle 2 anchor matched the old per-recipient INSERT and would have misapplied) |
| M17 | killed | e2e | coordinator not notified when the organiser cancels |
| M18 | killed | unit | withdrawn attendees notified |
| M19 | killed | unit | withdrawn rows touched by the release |
| M20 | killed | e2e | guard removed from clarification reply |
| S1 | killed | e2e | guard removed: confirm-no-equipment |
| S2 | killed | e2e | guard removed: safety-check request |
| S3 | killed | e2e | guard removed: equipment request removal |
| S4 | killed | e2e | guard removed: venue request removal |
| S5 | killed | e2e | guard removed: safety feedback resolve and unresolve |
| S6 | killed | e2e | guard removed: planning PATCH and flagged-change resolve |
| S7 | killed | e2e | guard removed: clarification create |
| S8 | killed | e2e | guard removed: clarification resolve |
| S9 | killed | unit | withdraw of a cancelled registration falls through to 422 |
| S10 | killed | e2e | invalid-transition 422 for Cancelled removed |
| S11 | killed | unit | pending holds not released |
| S12 | killed | unit | only Reserved equipment released |
| S13 | killed | unit | Requested equipment lines not released |
| S14 | killed | unit | registration cancellation_reason not set |
| S15 | killed | unit | EventCancelled missing from coordinator type list |
| S16 | killed | unit | EventCancelled missing from organiser type list |
| S17 | killed | unit | canceller excluded from recipients |
| S18 | killed | unit | history from_status hard-coded Confirmed |
| S19 | killed | e2e | cancel dispatch moved after the coordinator-only check |
| S20 | killed | unit | Registered attendees not notified |
| S21 | killed | unit | Rejected is cancellable |
| S22 | killed | unit | Submitted not cancellable |
| S23 | killed | unit | guard compares lower-case status (never fires) |
| S24 | killed | unit | coordinator not notified (any canceller) |
| M22 | killed | e2e | venue summary counts released bookings (RR-136-01) |
| M23 | killed | unit | readiness reports a released booking as outstanding (RR-136-02) |
| M24 | killed | unit | checklist keeps released bookings (RR-136-02) |
| M25 | killed | e2e | audience derivation joins coordinator_id as the event organiser (RR-136-05) |
| M26 | killed | unit | equipment removal has no locked-row cancelled check (RR-136-07) |
| M27 | killed | unit | venue request removal has no locked-row cancelled check (RR-136-07) |
| B1 | killed | unit (status.removal.spec.ts, TR-136-12 a) | confirm-no-equipment has no locked-row cancelled check |
| B2 | killed | unit (status.removal.spec.ts, TR-136-12 a) | safety-check request has no locked-row cancelled check |
| B3 | killed | unit (status.removal.spec.ts, TR-136-12 b) | equipment request removal has no locked-row Planning check |
| B4 | killed | unit (status.removal.spec.ts, TR-136-12 b) | venue request removal has no locked-row Planning check |

M9 (the dialog Keep button sending a request) is a frontend mutant; it is F8 below. M21 (waiting list) is not applicable: there is no waiting list in this repository (SPM-138).

### Trigger mutants (SQL)

| ID | Result | Killed by | Mutant |
|---|---|---|---|
| TR-T1 | killed | e2e CANCEL-EVENT-04-A (safety) | venue release no longer skips the safety reset (release-skip branch removed) |
| TR-T2 | killed | e2e CANCEL-EVENT-04-A (safety) | equipment release no longer skips the safety reset |
| TG1 to TG6 | killed | SPM-135 removal and safety suites | (see docs/specs/SPM-135-test-results.md) |
| TG7 | equivalent | n/a | OLD.event_id guard removed in the venue DELETE branch: a NULL event_id makes invalidate_safety_check a no-op |

Why the trigger mutants also edit the migration copy. The SPM-136 suites re-apply `backend/migrations/011_spm136_cancel_event.sql` to the shared database in their `beforeAll`. A mutant that edited only `017` was overwritten by that re-apply. Control run: TR-T1 without the migration-copy edit SURVIVED; with it, KILLED. `run-triggers.mjs` gained `--mutants <file>` (default `spm135.triggers.mutants.mjs`) and a `backendEdits` hook; both edits are applied to the scratch copies only, and the repository files are checked unchanged after each run.

### Frontend mutants (scripts/testing/mutation/spm136.mutants.mjs)

| ID | Result | Killed by / reason | Mutant |
|---|---|---|---|
| F1 | killed | cancellation.test.ts | Coordinator Lead offered Cancel Event |
| F2 | killed | cancellation.test.ts, page test | any organiser offered Cancel Event |
| F3 | killed | cancellation.test.ts | approved dropped from the cancellable statuses |
| F4 | equivalent (TR-136-06) | n/a | planning information page not hidden on a cancelled event. PLANNING_STATUSES excludes "cancelled", so once cancelled the planning effect clears planningView and the panel does not render; the `!isCancelled` guard is redundant. Not credited as evidence. |
| F5 | equivalent (TR-136-06) | n/a | planning update form not hidden on a cancelled event. Same reason as F4. Not credited as evidence. |
| F6 | killed | page test | cancelled banner removed |
| F7 | killed | page test | status not updated after a cancel |
| F8 | killed | dialog test 02-B (A) | Keep event also sends the cancel request (the M9 mutant) |
| F9 | killed | dialog test 02-A | confirm not disabled while pending |
| F10 | killed | dialog test 02-A | confirmed flag dropped from the cancel body |
| F11 | killed | dialog test 02-B (B) | Escape does not close |
| F12 | killed | dialog test 02-B (C) | outside click does not close |
| F13 | killed | dialog test 02-A | initial focus not on Keep event |
| F14 | killed | dialog test 02-A | MSG-CN-02 status line removed from the dialog |
| F15 | killed | page test 03-A | dialog unmounted on success, so MSG-CN-02 is never shown (the TR-136-02 defect) |
| F16 | killed | page test RR-136-03 | clarification Reply offered on a cancelled event |
| F17 | killed | page test RR-136-03 | clarification Resolve offered on a cancelled event |
| F18 | killed | dialog test CQ F2 | forward Tab trap disabled once only Close remains (after success) |
| F19 | killed | dialog test CQ F2 | backward Tab trap disabled once only Close remains (after success) |
| F20 | killed | dialog test CQ F2 | focus not moved to Close after success |
| F21 | killed | dialog test CQ F2 | dialog close does not return focus to the stable target |
| F22 | killed | page test CQ F2 | page does not pass the stable return-focus target |
| F23 | killed | page test CQ F2 | cancelled banner not focusable (no tabIndex -1), so it cannot receive return focus |
| P2 | killed | dialog test TR-136-13 (mapped; also killed by the existing 02-B Shift+Tab case and the CQ F2 after-success Shift+Tab case) | Shift+Tab wrap condition uses the non-shift check: Shift+Tab from Keep event (the first control) no longer wraps to Confirm cancellation (cycle 4) |

Frontend runner note: `frontend/scripts/testing/mutation/spm136.mutants.mjs` uses the existing `run.mjs` (copied from the same tooling as the backend). Its suite is the four cancel test files.

## Checks and results (exact commands; the rows marked cycle 4 are the final snapshot of correction cycle 4)

Environment: macOS, Docker container `spm-local-postgres-1` (healthy), database `spm_test`, user `spm`. Migration 017 applied to `spm_test` by hand. The same SQL is `backend/migrations/011_spm136_cancel_event.sql`. Cycle 3 changed only comments in the two SQL files, so `spm_test` was not re-migrated.

| Check | Command | Result |
|---|---|---|
| Backend unit (cycle 4 final) | `cd backend && npx vitest run` | exit 0; 56 files passed (56); 1295 tests passed (1295). Cycle 3 was 1289 passed; HEAD 86b9a34 was 49 files, 1231 passed |
| Backend unit + coverage (final) | `cd backend && npm run test:cov` | exit 0; 56 files, 1289 passed; all files 90.45 statements, 91.83 branches, 90.94 functions, 90.51 lines. The cycle 2 figure (98.42 statements) is not reproduced by this tree and is not carried forward. Changed-file rows (see the coverage note below) |
| Backend e2e (cycle 4 final; exit 1 with the 11 known failures only, 9 "expected 200, got 401" and 2 "expected 404, got 401" in `drafts.e2e-spec.ts`) | `DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test TEST_DATABASE_URL=... npx vitest run --config ./vitest.config.e2e.ts` | 26 files: 395 passed, 11 failed (all in `test/drafts.e2e-spec.ts`, the pre-existing HTTP 401 cases), 1 todo (407 tests). The two SPM-136 suites: 48 passed |
| Backend lint (cycle 4 final) | `cd backend && npm run lint` | exit 0; 3 pre-existing warnings (`checklist.ts` x2, `events-safety-feedback.e2e-spec.ts`), none new; 0 errors |
| Backend build | `cd backend && npm run build` | exit 0 (after the cycle 3 type fix in `events.service.ts`, see below) |
| Frontend unit (cycle 4 final) | `cd frontend && npx vitest run` | exit 0; 74 files passed (74); 1057 tests passed, 1 todo (1058). Coverage was not re-run in cycle 4; the next row is the cycle 3 coverage figure |
| Frontend unit + coverage (cycle 3, not re-run in cycle 4) | `cd frontend && npm run test:cov` | exit 0; 74 files, 1055 passed, 1 todo; all files 88.64 statements, 86.71 branches, 83.42 functions, 89.93 lines (whole-app figures). `CancelEventDialog.tsx` 100 / 100 / 100 / 100; `cancellation.ts` and `cancelEvent.ts` 100 in all four; `EventDetailPage.tsx` 96.57 lines (pre-existing gaps in the page) |
| Frontend lint (cycle 4 final) | `cd frontend && npm run lint` | exit 0; 0 errors, 1 pre-existing warning (`PlanningUpdateForm.tsx`, not changed) |
| Frontend build | `cd frontend && npm run build` | exit 0 |
| Trigger mutants (SPM-136) | `cd backend && DATABASE_URL=... node scripts/mutation/run-triggers.mjs --mutants spm136.triggers.mutants.mjs` | exit 0; 2 killed |
| Trigger mutants (SPM-135) | `cd backend && DATABASE_URL=... node scripts/mutation/run-triggers.mjs` | exit 0; 6 killed, 1 equivalent |
| Backend mutation (cycle 4 final) | `cd backend && DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm136.mutants.mjs` | exit 0; 53 mutants: 52 killed, 1 equivalent (M13), 0 survived, 0 misapplied; baselines unit and e2e green; original files untouched |
| Frontend mutation (cycle 4 final) | `cd frontend && node scripts/testing/mutation/run.mjs --mutants spm136.mutants.mjs` | exit 0; 24 mutants: 22 killed, 2 equivalent (F4, F5), 0 survived, 0 misapplied; original files untouched |
| Not run in cycle 4 | backend and frontend `npm run build`, `npm run test:cov`, trigger mutants | Not re-run: cycle 4 changed only test files and the mutant files (no production code), so the cycle 3 results stand for these checks |

Coverage note (changed backend files, unit run). 100 percent on every statement, branch and function for the new cancel module, the guard, the three releasers, `venue-summary.ts`, `readiness.ts` and `checklist.ts`, `events.service.ts` (branch 99.11 is a pre-existing branch), and `clarifications.service.ts` (branch 98.43). Not 100 percent: `src/events/status/status.service.ts` (lines 22.54, branches 10.67; the file has no unit spec at HEAD and is exercised by the e2e suites) and `src/events/status/arrangements.reader.ts` (lines 30.76; no unit spec at HEAD; SPM-136 changed only its status union type). Changed-code 100 percent is therefore NOT met for these two files; see the gap list.

Pre-existing failures: `test/drafts.e2e-spec.ts` fails with HTTP 401 on the unmodified HEAD as well (11 cases, same names). Not investigated; out of scope.

### Test-isolation finding (shared test database)

`test/venues.e2e-spec.ts` re-applies `backend/migrations/009_venue_availability.sql` to the shared database in its own `beforeAll`. That migration restores the older `venue_bookings` constraints (no `released` status). After any run of that suite, `released` rows violate `venue_bookings_kind_check`. The SPM-136 suites therefore re-apply `011_spm136_cancel_event.sql` (idempotent) in their own `beforeAll`. The venues suite itself was not changed. Recommended follow-up: give each suite its own database, or have the venues suite apply only what it needs.

## Changed and added files

Backend source: `src/app.module.ts`, `src/events/status/status.service.ts`, `src/events/planning/event-planning.service.ts`, `src/clarifications/clarifications.service.ts`, `src/registrations/registrations.service.ts`, `src/events/events.service.ts` (type lists and the reader-based audience of EventCancelled notices). New: `src/events/cancel/` (`cancel-event.service.ts`, `cancel-rules.ts`, `cancel.messages.ts`, `release.registry.ts`, and their specs), `src/events/cancelled-guard.ts` (+ spec), `src/venues/release/venue-booking.releaser.ts`, `src/equipment/release/equipment-reservation.releaser.ts`, `src/registrations/release/registration.releaser.ts`, `src/events/cancelled-notifications.spec.ts`.

Mutation and runner files: `backend/scripts/mutation/spm136.mutants.mjs` (app code), `backend/scripts/mutation/spm136.triggers.mutants.mjs` (trigger branches), `backend/scripts/mutation/run-triggers.mjs` (gained `--mutants` and `backendEdits`), `frontend/scripts/testing/mutation/spm136.mutants.mjs`. `backend/scripts/mutation/spm135.triggers.mutants.mjs` was edited by the coordinator to point at 017 (not changed by this cycle).

Cycle 3 additions: `database/README.md` (migration application order section), `frontend/src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx` (focus, retry and edge cases), `frontend/src/features/events/pages/detail/EventDetailPage.cancel.test.tsx` (clarification gating and focus), `backend/scripts/mutation/spm136.mutants.mjs` (M16 re-anchored, M22 to M27 added), `frontend/scripts/testing/mutation/spm136.mutants.mjs` (F16 to F23 added; F6 and F13 re-anchored).

Backend tests: new `test/events-cancel.e2e-spec.ts`, `test/events-cancelled-guard.e2e-spec.ts`; extended `src/registrations/withdrawal/registrations.withdraw.spec.ts`; updated pinned expectations in `src/events/review/events.reject.spec.ts` (`EventCancelled` added to the organiser and coordinator type lists); one literal changed in `test/events-confirm.e2e-spec.ts` (the "unsupported target" case now uses `Completed`, because `Cancelled` is now handled by SPM-136).

Schema: `backend/migrations/011_spm136_cancel_event.sql` and `database/postgresql/init/017_spm136_cancel_event.sql` (identical content).

Mutation: `backend/scripts/mutation/spm136.mutants.mjs`.

Frontend: `src/features/events/lib/cancellation.ts` (+ test), `src/features/events/pages/detail/cancel/CancelEventDialog.tsx`, `cancelEvent.ts` (+ dialog test), `src/features/events/pages/detail/EventDetailPage.tsx` (action, banner, dialog mount, change controls hidden), `EventDetailPage.cancel.test.tsx`.

Documentation: this file; `backend/README.md` (section "Cancel an event (SPM-136)"); `backend/AGENTS.md` (cancellation boundary); `frontend/AGENTS.md` (cancel dialog note); `AI_USAGE.md` (entry).

## Run commands (Guide 10E, 12)

```sh
# Backend unit and coverage
cd backend && npx vitest run && npm run test:cov

# Backend real-DB suites (spm_test with database/postgresql/init 001 to 017 applied, or 011 from backend/migrations)
DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test TEST_DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test \
  npx vitest run --config ./vitest.config.e2e.ts test/events-cancel.e2e-spec.ts test/events-cancelled-guard.e2e-spec.ts

# Backend mutation check (scratch copy only; baselines first)
DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/spm_test node scripts/mutation/run.mjs --mutants spm136.mutants.mjs

# Frontend
cd frontend && npm run test:cov && npm run lint && npm run build
```

Coverage is diagnostic only; it does not measure test strength. The mutation check is the strength measure.

## Pre-submit checklist (Guide 11), short form

- Every test traces to an AC or a case ID; the names carry the IDs.
- Each sad path asserts nothing changed (snapshot before and after).
- Literal oracles from the Confluence pages; ASSUMED values are marked in the test code.
- Time is injected (`CLOCK` frozen at 2026-10-12T04:00:00Z); no sleeps.
- Original implementation files are not edited by the mutation runs (hash check).
- Not committed, not pushed, Jira not changed.

## Correction cycle 2: resolution of the Test Review findings

| Finding | Severity | Resolution | Evidence |
|---|---|---|---|
| TR-136-01 safety rows | High | Added e2e CANCEL-EVENT-04-A (safety): an approved safety check with two feedback items is unchanged after cancel and no `event_safety_resets` row exists; the released-row count is checked too so the test is not vacuous. Added trigger mutants TR-T1 and TR-T2 that remove each release-skip branch (017 and the 011 copy). The runner now also edits backend copies, because the suites re-apply 011. | Trigger runner: TR-T1 and TR-T2 killed. Control: TR-T1 without the 011 copy edit survived. |
| TR-136-02 status line unshown | Medium (defect) | The page unmounted the dialog in `onCancelled`, so the MSG-CN-02 status region never rendered. RED: page test 03-A asserts `role=status` with the message, failed with "Unable to find role=status". GREEN: the dialog stays open after success showing the message and a Close button; the page keeps the banner. Dialog test added for the Close path. | Page test passes; mutant F15 killed. |
| TR-136-03 missing mutants | Medium | Merged the reviewer's S1 to S24 mutants into `backend/scripts/mutation/spm136.mutants.mjs` (guards on the other routes, guard comparison, withdraw 409, invalid-transition 422, dispatch order, pending holds, equipment statuses, cancellation_reason, EventCancelled type lists, canceller and coordinator recipients, attendee notices, from_status, Rejected and Submitted in the set). The unit suite is now the full unit run. Frontend mutants F1 to F15 committed. | Backend: 43 mutants, 42 killed, 1 equivalent. Frontend: 15 mutants, 13 killed, 2 equivalent. |
| TR-136-04 Requested and Unavailable not asserted | Medium | 05-A now seeds a Requested line (Speaker) and an Unavailable line (Lectern) on the cancelled event and asserts all four lines Released. The stock numbers (Projector 4, Microphone 10) are unchanged. | e2e passes; mutants S12 and S13 killed. |
| TR-136-05 no API read of the notice | Medium (defect) | Added e2e: ORG-01 and COO-01 read the notice through GET /api/notifications. RED: the coordinator's copy was labelled `audienceRole: "organiser"` (the label was chosen by type, not by reader). GREEN: an EventCancelled notice is labelled by the reader's role. Unit spec added for both readers. | e2e passes; S15 and S16 killed. |
| TR-136-06 F4 and F5 dead code | Low | Marked equivalent in the frontend mutant file with the reason (PLANNING_STATUSES excludes cancelled, so the planning panels do not render). Not credited in the evidence table. | Frontend runner reports them as equivalent. |
| TR-136-07 swallowed error in a unit test | Low | `cancel-event.service.spec.ts` no longer uses `.catch(() => undefined)`; it asserts the resolved result `{ eventId, status: 'Cancelled', message }`. | Unit suite passes. |
| TR-136-08 login 401 | Low | Not fixed: cause not determined (see the gap list). Diagnostics added so a recurrence reports the login status and body. | Three isolated reruns of events-cancel passed after the change. |

Decisions taken as stated by the coordinator: 07-B (C) expects 403 (the existing coordinator-only rule runs first); the assumed codes for INVALID_STATUS_TRANSITION and the withdraw-409 wording are accepted; the venues e2e migration re-apply is a separate change; the AI_USAGE user is `rickyshake3590`.

## Correction cycle 3: resolution of the Requirement, Code Quality and Test Review findings

Order followed: RED test first (shown failing for the stated reason), then the fix (GREEN). Items marked "earlier in cycle 3" were applied by the previous Implementation pass of this cycle and were verified by a test run and the mutants below, not rewritten.

| Finding | Resolution | Evidence |
|---|---|---|
| RR-136-01 venue summary counted released bookings | `src/events/venue-summary.ts` excludes `released` (`b.status <> 'released'`). Applied earlier in cycle 3. | M22 killed (e2e). |
| RR-136-02 released bookings counted as outstanding or as requested | `readiness.ts` and `checklist.ts` skip `released` bookings. `arrangements.reader.ts` widens its status type to include `released` (type only, no behaviour change). Applied earlier in cycle 3. | M23 and M24 killed by `released-venue.spec.ts`. `arrangements.reader.ts` has no mutant: the change is type-only. |
| RR-136-03 Reply and Resolve offered on a cancelled event | RED: `CANCEL-EVENT-07-A (clarifications)` failed with "expected document not to contain element", the Reply button on the cancelled event. GREEN: `canReply` and `canResolve` take `!isCancelled`. Control test: the same open clarification on a Planning event shows both buttons. | F16 and F17 killed; page tests pass. |
| RR-136-05 and CQ F1 audience of the EventCancelled notice | The reader labels the notice by the event's organiser (`e.organiser_id AS event_organiser_id` join in `events.service.ts`). Applied earlier in cycle 3. The `npm run build` error this change caused (TS2345: `QueryResultRow` passed as `AudienceRow`) is fixed by passing an explicit `AudienceRow`; no behaviour change. | M25 killed (e2e); `cancelled-notifications.spec.ts`; build exit 0. |
| RR-136-07 locked-row status re-check | `removeEquipmentRequest`, `removeVenueRequest`, `confirmNoEquipment` and `requestSafetyCheck` re-read the event with `FOR UPDATE` and refuse a cancelled event with 409 `EVENT_CANCELLED`. Applied earlier in cycle 3. | M26 and M27 killed (`status.removal.spec.ts`). No dedicated mutants for `confirmNoEquipment` and `requestSafetyCheck` (see the gap list). |
| CQ F2 dialog focus after success and on close | RED: four dialog tests failed. Tab and Shift+Tab after success left focus on the body, not on Close; Keep event and Close did not return focus to a stable element. GREEN: the Tab trap reads the currently enabled buttons; success moves focus to Close; a `returnFocus` prop (page: the cancelled banner, otherwise the Cancel Event trigger) receives focus when the dialog unmounts; the banner is `tabIndex={-1}`. Added tests: Tab from Keep moves forward; a click outside while pending does not close; Tab while pending sends nothing; a null return target still closes; page tests for focus after Keep event and after Close. The Tab tests have a page control on each side, so an escape from the modal is observable. | F18 to F23 killed; `CancelEventDialog.tsx` 100 percent in all four metrics. |
| CQ F5 notices written in one statement | `cancel-event.service.ts` writes the notices with one `INSERT ... SELECT unnest($1::text[]) ... ON CONFLICT DO NOTHING` on the transaction client. Applied earlier in cycle 3. M16 is re-anchored to that statement; the cycle 2 anchor matched the old per-recipient INSERT and would have misapplied. | M16 killed (unit). |
| TR-136-08 login 401 in a full run | Root cause (environmental): supertest listens on the wildcard address and then connects to `127.0.0.1:<port>`; an editor helper process listening on `127.0.0.1` with an ephemeral port can receive some connections and answers `{"type":"error","error":{"type":"authentication_error",...}}`, which the suite reported as a 401 login. Not caused by SPM-136. The diagnosis rests on the captured response body; the editor-listener cause was not reproduced on demand. Fix: both SPM-136 e2e suites call `app.listen(0, '127.0.0.1')` after `app.init()`. The role-6 teardown suspicion from cycle 2 was wrong and is ruled out. | Both suites pass (48 tests). The full run in this cycle (395 passed, 11 pre-existing drafts failures) had no login failure. One run is not proof that the cause is gone. |
| TR-136-09 no test that a retry after a failed cancel clears the alert | Added a dialog test: the first request is rejected, the alert shows, the retry succeeds, the alert clears, MSG-CN-02 shows, and both calls are identical. It passed immediately, so it is a regression guard, not a RED test. | Dialog test passes. |
| TR-136-11 safety oracle source for 04-A | The safety-row outcome is attributed to Gate-1 decision D2 (safety-check rows left untouched), DERIVED from D2. It is not stated in Confluence 04-A. Changed in the test comment and in the evidence table. | `events-cancel.e2e-spec.ts` comment; evidence table row 04-A. |
| Migration comment and migration order | The same supersession comment (supersedes migration 009's `venue_bookings` status and kind constraints; apply init 011-016 first; each migration is applied once, in order) is in `backend/migrations/011_spm136_cancel_event.sql` and `database/postgresql/init/017_spm136_cancel_event.sql`. `cmp` reports them identical. A "Migration application order" section is in `database/README.md`. The SQL changed only in comments, so `spm_test` was not re-migrated. | `cmp` output; README section. |
| Frontend lint error from cycle 3 changes | `CancelEventDialog.tsx` wrote a ref during render (`react-hooks/refs`). The write moved into an effect. | `npm run lint` exit 0 (1 pre-existing warning). |

### Corrections found by the checks in this cycle

- `npm run build` (backend) failed with TS2345 in `events.service.ts`; fixed as described above. The first backend mutation pass was discarded because the runner reported that file changing on disk during the run; the pass was rerun on the final code, and the rerun is the one recorded in this document.
- The F6 and F13 frontend mutants were MISAPPLIED after the dialog refactor. Their anchors were updated to the current code, and F18 and F19 were re-anchored to the simplified trap. The full frontend mutation set was rerun after the last change.

### Root cause summary for TR-136-08

Covered in the table above. The change is in `backend/test/events-cancel.e2e-spec.ts` and `backend/test/events-cancelled-guard.e2e-spec.ts` (`app.listen(0, '127.0.0.1')` after `app.init()`).

### Intentionally skipped in this cycle

CQ F3 (circular type import), CQ F6 (duplication), TR-136-10 (rejected-update trigger test), RR-136-04 (waiting list, blocked on SPM-138), RR-136-06 (coordinator notice UI), RR-136-09 (Jira traceability). Each is listed in the gap list with its owner or the story it depends on.

### Coverage note for the cycle 2 figure

The cycle 2 section reported backend unit coverage of 98.42 statements. This cycle's run of the same command gives 90.45. The difference was not traced to a cause, so the earlier figure is not carried forward. The per-file numbers in the checks section are the ones to use.

## Correction cycle 4: resolution of the Test Review (iteration 3) findings

Test-only cycle. No production code, migration, component or non-spec `src/` file was changed. The changes are the two test files, the two mutant files and this document. The Jira, commit and staging rules were not used (nothing was committed, pushed or staged).

Order followed: each new mutant was run before its tests were written (or mapped to them), then the test was added and the mutant re-run.

| Finding | Resolution | Tests | Mutants | Evidence |
|---|---|---|---|---|
| TR-136-12 (blocking) locked-row status re-checks had no tests | `backend/src/events/status/status.removal.spec.ts` gains eight cases. (a) locked row Cancelled: `confirmNoEquipment` and `requestSafetyCheck` return 409 `EVENT_CANCELLED` with the MSG-CN-04 text and issue no UPDATE, INSERT or DELETE. (b) locked row Confirmed (pre-check passed Planning): `confirmNoEquipment`, `requestSafetyCheck`, `removeEquipmentRequest` and `removeVenueRequest` return 422 `EVENT_NOT_CONFIRMABLE` with the Planning-only message and issue no write. The existing two Cancelled removal cases are kept. The helper's locked row now carries `coordinator_id`, `equipment_needs` and `equipment_confirmed_at`, which the confirm and safety-check paths read. | `TR-136-12` cases in `status.removal.spec.ts` (the two Cancelled cases for (a); the two Confirmed cases and the two removal cases for (b)) | B1 (confirm-no-equipment locked cancelled check removed), B2 (safety-check request locked cancelled check removed), B3 (equipment removal locked Planning check removed), B4 (venue removal locked Planning check removed) | Before the tests: B1 to B4 SURVIVED (`run.mjs --only B1,B2,B3,B4`, baselines green). After: B1 to B4 killed by unit. The new cases pass on the current code, as expected for characterisation of existing checks; the RED evidence is the surviving mutants. |
| TR-136-13 (blocking) Shift+Tab trap path untested | `frontend/src/features/events/pages/detail/cancel/CancelEventDialog.test.tsx` gains a describe block with two cases, both with a page control on each side of the dialog. (1) Focus starts on Keep event (initial focus); Shift+Tab must land on Confirm cancellation, not on the page control before it, and send no request. (2) Tab to Confirm cancellation, then Shift+Tab returns to Keep event inside the dialog, no request. The test titles avoid regex metacharacters (`+`), because the runner passes the title to `--testNamePattern`. | `TR-136-13: Shift Tab from Keep event, the first control, wraps to Confirm cancellation and does not leave the dialog`; `TR-136-13: Tab to Confirm cancellation then Shift Tab returns to Keep event, all inside the dialog, with no request` | P2 (`if (event.shiftKey && document.activeElement === first) {` replaced by `if (!event.shiftKey && ...)`, one occurrence in `CancelEventDialog.tsx`); P2 is mapped to the first case by `testMappings` | Before the new cases: P2 was already KILLED. A run of the existing dialog file with P2 applied (file restored afterwards, `cmp` clean) failed three cases: the existing `CANCEL-EVENT-02-B: Tab from the last button returns to Keep event, and Shift+Tab from Keep event goes to the confirm button`, the existing `CQ F2: after success, Shift+Tab from the only remaining button stays inside the dialog`, and the new TR-136-13 case. The survivor described in TR-136-13 therefore did not reproduce for P2 as written. The new case is the one mapped in `testMappings`, and the mapped run kills P2. After: P2 killed by the mapped TR-136-13 case. |
| TR-136-14 (non-blocking) `serviceWith` argument order | In `status.removal.spec.ts`, the constructor arguments are now `(database, reader, safetyChecks, safety, clock, cancellation)`. The clock is `{ now }` and the cancellation is `{ cancel }`; they were swapped. The existing removal cases never called `clock.now()`, so they passed by accident before; the helper is now safe to reuse for `confirmNoEquipment` and `requestSafetyCheck`, which do call it. | Existing removal cases plus the TR-136-12 cases (8 in the file) | none (test hygiene) | The file passes after the change (8 of 8 in `npx vitest run src/events/status/status.removal.spec.ts`, with the TR-136-12 cases in place). The argument swap was not run in isolation as a separate RED step; no mutant covers it. |

### Commands and exact results (cycle 4)

| Command | Result |
|---|---|
| `cd backend && npx vitest run` | exit 0; 56 files passed (56); 1295 tests passed (1295) |
| `cd backend && npx vitest run --config ./vitest.config.e2e.ts` (DATABASE_URL and TEST_DATABASE_URL set to `spm_test`) | exit 1; 26 files, 1 failed file (`test/drafts.e2e-spec.ts`); 395 passed, 11 failed, 1 todo (407). The 11 failures are the known drafts 401 cases (9 "expected 200, got 401", 2 "expected 404, got 401"). Both SPM-136 e2e suites pass |
| `cd backend && node scripts/mutation/run.mjs --mutants spm136.mutants.mjs` | exit 0; baselines unit and e2e green; 53 mutants: 52 killed, 1 equivalent (M13), 0 survived, 0 misapplied; original files untouched. B1 to B4 killed by unit |
| `cd frontend && npx vitest run` | exit 0; 74 files passed (74); 1057 tests passed, 1 todo (1058) |
| `cd frontend && node scripts/testing/mutation/run.mjs --mutants spm136.mutants.mjs` | exit 0; baseline spm136 green; 24 mutants: 22 killed, 2 equivalent (F4, F5), 0 survived, 0 misapplied; original files untouched. P2 killed |
| `cd backend && npm run lint` | exit 0; 0 errors; 3 pre-existing warnings (`checklist.ts` x2, `events-safety-feedback.e2e-spec.ts`) |
| `cd frontend && npm run lint` | exit 0; 0 errors; 1 pre-existing warning (`PlanningUpdateForm.tsx`) |

Not run in cycle 4: `npm run test:cov` (both components), the two builds, and the SPM-136 and SPM-135 trigger mutants. The production code and migrations did not change, so the cycle 3 numbers for these stand; they are not re-measured. No review gate was run. `AI_USAGE.md` was not edited (its user field stays `rickyshake3590`).
