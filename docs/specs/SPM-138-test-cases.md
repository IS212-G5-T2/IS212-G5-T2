# SPM-138 Join Waiting List: Test Cases

> **Source note.** The original 46-case document was not available in the repository or on disk when this file was added. This file is reconstructed from the resolved-spec table in the SPM-138 build prompt (section 2.6), which lists each case's preconditions, oracle and the mutant it must kill. The W1 to W12 assumption texts are not reproduced here; they are cited by ID only. Replace this file with the original if it is found.

## Story

**SPM-138**: As an Attendee, I want to join a waiting list when an event is at capacity, so that I can be notified if a spot becomes available.

Acceptance criteria AC1 to AC12 are as stated in the build prompt, section 2.1.

## Decisions this document relies on

- Statuses: API and DB use lowercase repo values; UI labels are "Confirmed", "Waitlisted", "Withdrawn", "Cancelled", "Removed". Waitlisted entries are stored on the existing `event_registrations` row (D2, reuse the single row).
- Position is derived on read from `(joined_at, waitlist_seq)` among Waitlisted entries (D6).
- Promotion, withdrawal and cancel run under the event row lock (D7, D8).
- Waitlist messages are MSG-WL-01 to 06, asserted by text (D14).

## Decision labels (D2 to D16)

Short definitions of the SPM-138 decision labels used in code and test comments. The full decision text was given to the team with the build prompt; these lines state what each label fixes in the code.

- D2: a waiting entry is a row in `event_registrations`. Status values are `Waitlisted` and `Removed`; a rejoin reuses the row.
- D3: API status values are lowercase; the UI labels are Confirmed, Waitlisted, Withdrawn, Cancelled, Removed.
- D6: a waiting position is derived on read from `(joined_at, waitlist_seq)`, never stored. Only the owner's own entry carries it.
- D7: the lock order is the event row first (`SELECT ... FOR UPDATE`), then any registration row.
- D8: promotion moves the earliest waiting entries into free places, inside the withdrawal transaction, under the event lock.
- D9: a waiting list is removed once its registration has closed (or registration is disabled). It is settled on read for an attendee who may see the event, on join and withdrawal under the lock, and by the close job.
- D13: an attendee's promotion and cancellation notices are rows in `notifications` (WaitlistPromoted, EventCancelled), readable by that attendee only.
- D14: the locked wording of the waiting list messages MSG-WL-01 to MSG-WL-06.
- D15: join and the attendee's own reads need the attendee role; the by-id reads are owner-scoped.
- D16: the registration page state (closed, not-yet-open, register, full-join, registered, waitlisted, cancelled) is derived from the window, fullness and the attendee's own status.

## Fixtures

Suite clock `T0 = 2026-10-14T12:00:00+08:00`. Events and attendees are named by label in comments. Users have fixed ids and emails per label (attendee `ATT-NN` is `10000000-0000-4000-8000-<NNNNNNNNNNNN>`, so a lower label sorts first), so every run builds the same users. Event ids and submission keys are random; no oracle depends on them.

**Documented bounded exception (lock-waiter poll).** The backend e2e file has one timed wait: `waitForLockWaiters` polls `pg_stat_activity` for requests blocked on the event row lock, at most 200 attempts 50 ms apart (about 10 s). It throws if the waiter never appears, so it fails loudly rather than racing. Nothing else in the file waits on time. The frontend tests use a deferred promise that the test resolves; they use no timer.

| Label | Fixture |
|---|---|
| EVT-701 | Capacity 3; ATT-01, 02, 03 Confirmed; window T0-1d to T0+5d 23:59; start T0+10d 18:00; name "Gala Waitlist Night" |
| EVT-702 | Capacity 10; 9 Confirmed (A), 10 after ATT-05 registers (B) |
| EVT-703 | Capacity 2, full; closes T0+30min (12:30); ATT-04 at 1, ATT-05 at 2 |
| EVT-704 | Full, closed at T0-1d 23:59 |
| EVT-705 | Full, opens T0+3d 09:00 |
| EVT-706 | Full; clone of EVT-701 used for waitlist cases |
| EVT-707 | Start 2026-11-10T18:00:00+08:00 (cut-off cases) |

## Cases

### AC1: Join when full (JOIN-WAITLIST-01)

- **01-A** (BE + FE). ATT-04 on EVT-701 (empty list, window open): UI shows enabled "Join Waiting List" and no "Register". `POST /api/events/EVT-701/waitlist` `{}` returns 201, status Waitlisted, position 1; one row, status `waitlisted`, `joined_at` = T0; Confirmed count stays 3. *Kills M4.*
- **01-B** (BE). ATT-04 `POST /api/events/EVT-701/registrations` returns 422 `registration_full`; no row; Confirmed 3; no implicit waitlist entry. *Kills M3.*
- **01-C** (BE + FE). A: EVT-702 at 9 of 10 shows "Register", no "Join Waiting List"; join returns 422 "This event still has available spots. Please register directly." (MSG-WL-03); no row. B: after ATT-05 registers (10 of 10), ATT-04 sees "Join Waiting List" and no "Register"; join returns 201. *Kills M1, M4.*
- **01-D** (BE + FE). `it.each`: A EVT-704 (full, closed) shows "Registration closed", no controls, join returns 422 MSG-01. B EVT-705 (full, opens T0+3d 09:00) shows "Registration opens on ..." in SPM-61 format, join returns 422 MSG-02. No rows. Window is checked before fullness. *Kills M5, M6.*
- **01-E** (BE + FE). EVT-706 with ATT-04 waitlisted at 1. A: ATT-01 (Confirmed) joins, 409 "You are already registered for this event." (MSG-05). B: ATT-04 joins, 409 "You are already on the waiting list for this event." (MSG-WL-04); page shows the waitlisted indicator, not Join; position still 1. C: ATT-05 sends 5 parallel joins; exactly one 201 (position 2) and four 409 MSG-WL-04; one row. FE double-click sends one request and disables Join after the first click. *Kills M7.*
- **01-F** (BE + FE). `it.each`: no token and expired token return 401; COO-01 and ORG-01 (no Attendee role) return 403 with the existing generic permission message (F12); no row. FE: logged-out click on Join goes to login, then back to `/events/EVT-701` with Join available. A user holding both Attendee and another role is allowed. *Kills M8.*

### AC2: Event page shows full and waitlist (JOIN-WAITLIST-02)

- **02-A** (BE + FE, unit). EVT-701 full and open: UI shows "Event full", "0 of 3 available" in SPM-61's format, "This event is full. Join the waiting list to be notified if a spot opens." (MSG-WL-02), "Join Waiting List", no "Register", the closing date. `GET /api/events/EVT-701` returns `isFull: true`, `waitlistAvailable: true`, `registrationOpen: true`. *Kills waitlistAvailable ignoring window or fullness.*
- **02-B** (BE + FE, unit). EVT-702: no "full" text, Register shown, `isFull` false, `waitlistAvailable` false. EVT-704: "Registration closed", no waitlist text, `isFull` true, `waitlistAvailable` false. EVT-705: "Registration opens on ...", `isFull` true, `waitlistAvailable` false. Unit: `registrationUiState(open, full, myStatus)` table over all combinations (added).

### AC3: Status shows Waitlisted (JOIN-WAITLIST-03)

- **03-A** (BE + FE). After joining, dashboard and details show "Waitlisted" (variant distinct from Confirmed and Withdrawn). `GET /api/events/EVT-701/registrations/me` returns status `waitlisted`. Event page shows "You are on the waiting list" with no Register or Join. *Kills missing label; Join still offered.*
- **03-B** (BE + FE). EVT-701 with ATT-04 waitlisted: Confirmed count 3, `availableSpots` 0; ATT-04 still Waitlisted after logout and login; ATT-05 still sees full and Join. *Kills M2.*

### AC4: Confirmation with position (JOIN-WAITLIST-04)

- **04-A** (FE + BE). ATT-04 joins EVT-701 (empty list). Banner reads exactly "You have joined the waiting list for Gala Waitlist Night. Your position is 1." (MSG-WL-01), built by the frontend from the event name and response `position`. Dismissible; gone after reload.
- **04-B** (BE + FE). EVT-706 clone, empty list: ATT-04, ATT-05, ATT-06 join in order; messages say 1, 2, 3; each equals its POST response and later details GET. *Kills non-increasing positions.*
- **04-C** (BE, real DB). Five parallel joins by ATT-04 to ATT-08: five 201; positions exactly 1 to 5, each once; each message equals its own response; DB order by `(joined_at, waitlist_seq)` agrees. *Kills M13.*

### AC5: Position in registration details (JOIN-WAITLIST-05)

- **05-A** (BE + FE). EVT-706 with ATT-04 (1), ATT-05 (2), ATT-06 (3): details show "Waiting list position: n" and status Waitlisted; API `waitlistPosition` equals it.
- **05-B** (BE + FE). ATT-01 Confirmed: `waitlistPosition: null` (key present), no position row. ATT-07 Withdrawn: null, no row. ATT-04 Waitlisted: position shown. *Kills M31.*
- **05-C** (BE). ATT-04 requests ATT-05's registration by id: 404 "Registration not found." (MSG-07), no name or position. Router inventory shows no attendee route listing other attendees' entries. No token: 401. *Kills M30.*

### AC6: Position updates (JOIN-WAITLIST-06)

- **06-A** (BE + FE). EVT-706 clone (ATT-04 1, ATT-05 2, ATT-06 3): ATT-04 withdraws through the SPM-120 flow. On reload ATT-05 is 1, ATT-06 is 2; ATT-04 "Withdrawn". *Kills M12.*
- **06-B** (BE). ATT-01 withdraws: ATT-04 Confirmed; ATT-05 is 1, ATT-06 is 2.
- **06-C** (BE). ATT-05 (middle) withdraws: ATT-04 stays 1, ATT-06 becomes 2, ATT-05 Withdrawn.
- **06-D** (BE + FE). Clone: ATT-05 withdraws, ATT-07 joins, ATT-04 withdraws. ATT-06 is 1, ATT-07 is 2; no gaps or duplicates; API, UI and DB ranking agree.

### AC7: Order by join time (JOIN-WAITLIST-07)

- **07-A** (BE, injected clock). Clone, full, empty list: ATT-06 joins 10:00:00, ATT-04 at 10:00:05, ATT-05 at 10:00:10 (T0 date). Positions ATT-06 1, ATT-04 2, ATT-05 3. ATT-01 withdraws: ATT-06 Confirmed, ATT-04 1, ATT-05 2. *Kills M9, M14.*
- **07-B** (BE). Two entries with identical `joined_at`; lower `waitlist_seq` (ATT-04) first: positions 1 and 2, stable over repeated reads. ATT-01 withdraws: ATT-04 promoted. *Kills M10.*
- **07-C** (BE). ATT-04 (1) withdraws and joins again (new join time and sequence): ATT-05 1, ATT-06 2, ATT-04 3. ATT-01 withdraws: ATT-05 promoted. *Kills M11.*

### AC8: Automatic promotion (JOIN-WAITLIST-08)

- **08-A** (BE + FE). EVT-706 clone (ATT-04, 05, 06 waiting): ATT-01 withdraws. In the same transaction ATT-04 is Confirmed (no accept step), position null. ATT-01 Withdrawn; Confirmed 3 of 3; ATT-05 is 1; ATT-07 (no entry) still sees full and Join. *Kills M15.*
- **08-B** (BE, real DB). Two places: sequential withdrawals of ATT-01 and ATT-02 give ATT-04 and ATT-05 Confirmed in join order; ATT-06 is 1. Reset, then parallel withdrawals give the same final state; exactly 3 Confirmed rows; no entry promoted twice. *Kills M16, M17.*
- **08-C** (BE + FE). EVT-701 clone, full, empty list: ATT-01 withdraws. `availableSpots` 1, `isFull` false; ATT-07 sees Register and no Join; no promotion, no notification. *Kills M18.*
- **08-D** (BE, real DB). EVT-706 clone (ATT-04 waiting): ATT-01's withdrawal and ATT-07's direct registration run in parallel. ATT-04 gets the place; ATT-07 gets 422 `registration_full`. Second run with ATT-07's POST right after the withdrawal response gives the same. Confirmed never above 3. *Kills M3, M15.*
- **08-E** (BE, real DB). Fault injected into promotion after the withdrawal update, inside the transaction: first withdrawal returns 500 with a generic message and no stack trace; ATT-01 still Confirmed, ATT-04 still Waitlisted, no notification. Fault removed, retry returns 200 and ATT-04 is promoted. *Kills M15.*

### AC9: Promotion notification (JOIN-WAITLIST-09)

- **09-A** (BE; FE Blocked until a bell exists). After ATT-01 withdraws, ATT-04 has exactly one unread notification, type `WaitlistPromoted`, text "A spot opened up. You are now registered for Gala Waitlist Night." (MSG-WL-05), linking to ATT-04's registration, present when the 200 returns. Added: promote, withdraw, rejoin, promote again gives two notifications, one per promotion. *Kills M21.*
- **09-B** (BE). Two places: ATT-04 and ATT-05 each have exactly one promotion notification; ATT-06, ATT-01 and ATT-02 have none; the mail transport stub has zero calls. *Kills M20.*

### AC10: Withdraw from waiting list (JOIN-WAITLIST-10)

- **10-A** (FE + BE). ATT-05 (position 2, event T0+10d) opens details and clicks "Withdraw". Prompt names "Gala Waitlist Night" and uses the waiting-list copy. Confirm returns 200, status Withdrawn, "Your withdrawal from Gala Waitlist Night has been processed.", no position, `withdrawn_at` T0; ATT-06 becomes 2. *Kills refusal of waitlisted entries.*
- **10-B** (FE). Cancel in the prompt closes it; zero requests; still Waitlisted at 2. *Kills cancel sending a request.*
- **10-C** (BE + FE). EVT-707, ATT-04 waitlisted, start 2026-11-10T18:00:00+08:00. A: clock 17:59:59 returns 200 Withdrawn. B: 18:00:00 returns 422 "Event has already occurred" (SPM-120's message), still Waitlisted. C: 18:30:00 shows no "Withdraw" control; status Waitlisted.
- **10-D** (BE). ATT-05 withdraws from the waiting list: Confirmed 3, `availableSpots` 0, event still full; ATT-01 to 03 Confirmed; ATT-04 still Waitlisted at 1; no promotion, no notification. *Kills M22.*
- **10-E** (BE, real DB). A: ATT-06 withdrawing ATT-05's entry returns 404 MSG-07, unchanged. B: no token returns 401. C: ATT-05 withdraws, then repeats: 422 "This registration has already been withdrawn." (MSG-12). D: 5 parallel withdrawals give exactly one 200 and four 422. *Kills ownership and compare-and-set gaps.*

### AC11: Removed at registration close (JOIN-WAITLIST-11)

- **11-A** (BE + FE). EVT-703 (capacity 2, full; ATT-04 at 1, ATT-05 at 2; closes 12:30). Clock 12:31 and `runRegistrationCloseJob(now)`: both entries `removed` (UI "Removed"), no position. Join returns 422 MSG-01. Event page shows "Registration closed". No promotion; Confirmed 2; no notification. *Kills M23.*
- **11-B** (BE). EVT-703 clone closing 2026-11-10T23:59:00+08:00, ATT-04 waitlisted. A: clock 23:58:59, read details: Waitlisted with a position (no job run). B: clock 23:59:00, read details: `removed` (settled on read). *Kills M24, M23.*
- **11-C** (BE). Manual close (fixture sets `registration_enabled` false). The next read or job removes ATT-04 and ATT-05. ATT-06's join returns 422 MSG-01. Page shows "Registration closed". *Kills manual close ignored.*
- **11-D** (BE). EVT-703 closed with entries removed: ATT-01 withdraws, `availableSpots` 1; Register not shown; ATT-04 and ATT-05 not promoted; no notification. Added: the same withdrawal after the close instant but before any job or read has settled the entries gives the same result. *Kills M19.*
- **11-E** (BE). Blocked: the real reopen belongs to the registration-setup story. The reopen hook calls `settle` before changing the window (unit now): removed entries are not restored; ATT-04 then joins at 1 and ATT-05 at 2. *Kills entries restored on reopen.*

### AC12: Event cancelled (JOIN-WAITLIST-12)

- **12-A** (BE). EVT-706 clone (ATT-04, 05, 06 waiting): COO-01 cancels via the SPM-136 flow. Each has exactly one notification, type `EventCancelled`, text "Gala Waitlist Night has been cancelled. Your waiting list place is cancelled." (MSG-WL-06). The three entries are `cancelled`. **Blocked (SPM-136)** if absent. *Kills M25.*
- **12-B** (BE + FE). After the cancel: ATT-05's details show "Cancelled", no position, no Withdraw, Join or Register. Withdraw returns 409; join returns 422 MSG-01. Status stays. *Kills controls offered and status overwritten.*
- **12-C** (BE). ATT-04 waitlisted; ATT-07 withdrawn from the list (clone). EVT-701: ATT-08 waitlisted. Cancel EVT-706: ATT-07 stays Withdrawn with no notification; ATT-08 unchanged, nothing. *Kills M26.*

### Cross-cutting

- **13-A** (BE). Bulk fixture: 500 waitlisted entries ATT-100 to ATT-599 with ascending join times. ATT-04 joins: 201, position 501, message "... Your position is 501." ATT-01 withdraws: ATT-100 Confirmed, ATT-04 is 500, ATT-101 is 1. No timing assertion. *Kills M28.*
- **14-A** (BE + FE). EVT-706 clone: SPM-63 report for COO-01 and ORG-01 gives total 3, rows ATT-01, 02, 03. The report API, CSV and PDF text contain no name or email of ATT-04 to 06. After ATT-01 withdraws and ATT-04 is promoted: total 3, rows ATT-02, 03, 04. *Kills M27.*
- **15-A** (BE). Body `{ "status": "Confirmed", "position": 1, "attendeeId": "ATT-01", "joinedAt": "2020-01-01T00:00:00Z", "eventId": "EVT-702" }` returns 400 (strict schema, SPM-61 D15); no rows for ATT-01 or EVT-702. `{}` and no body return 201. *Kills M29.*

## Open assumptions (cited, not reproduced)

W1 to W12 are cited in the case rows above. Their full text was not available.

## ASSUMPTION index

- A-ST: API and DB status values are the repo's lowercase/Title-case values (D3).
- A-TXT: "You are on the waiting list" and "Waiting list position: n" are assumed copy (F20).
- A-TIME: Promotion time is `registered_at` (F23, not asserted).

## Appendix: mutant ID mapping (reconstruction, not renumbered)

The Kills lines above name M1 to M31 without defining them. The mutants in `backend/scripts/mutation/spm138.mutants.mjs` keep the reconstructed IDs M1 to M31 (not renumbered). The table lists each ID, what the runner mutates, the Kills line it is tied to, and where the meaning differs. Extra mutants (P-*, CAP-*) and frontend mutants (F1 to F17, `frontend/scripts/testing/mutation/spm138.mutants.mjs`) are not in the spec numbering.

| ID | What the runner mutates | Spec Kills line | Difference from the spec |
|---|---|---|---|
| M1 | Join ignores fullness | 01-C | None known |
| M2 | A waiting row is reported as registered | 03-B | Spec does not define M2; the 03-B text (Confirmed count, still Waitlisted) is the closest reading |
| M3 | Capacity check removed from direct registration | 01-B; 08-D | Spec 01-B describes an implicit waiting entry on direct register; M3 lets a direct register confirm past capacity |
| M4 | Join stores Registered instead of Waitlisted | 01-A; 01-C | None known |
| M5 | Join skips the closed-window check | 01-D | Spec 01-D says "window checked before fullness"; M5 removes the closed check. The ordering meaning is covered by P-D |
| M6 | Join skips the not-yet-open check | 01-D | Same as M5 (opening instant) |
| M7 | Duplicate join accepted (duplicate check and lost-race guard removed) | 01-E | None known |
| M8 | Role check removed from the join | 01-F | None known |
| M9 | Positions run newest first | 07-A | Spec does not define M9 |
| M10 | Position tie-break by row id, not waitlist_seq | 07-B | Spec does not define M10 |
| M11 | Rejoin keeps the old join time and sequence | 07-C | Spec does not define M11 |
| M12 | Position counts withdrawn and removed entries | 06-A | Spec does not define M12 |
| M13 | Join takes no event row lock | 04-C | Killed by a race; 3 of 3 repeats killed |
| M14 | Order follows arrival (waitlist_seq), not joined_at | 07-A | Spec does not define M14 |
| M15 | Promotion step never called after a registered withdrawal | 08-A; 08-D; 08-E | None known |
| M16 | Promotion takes the latest entry first | 08-B | Spec does not define M16 |
| M17 | Promotion ignores capacity | 08-B | None known |
| M18 | Notification written when nothing was promoted | 08-C | Spec does not define M18 |
| M19 | Promotion runs without settling the list first | 11-D | None known |
| M20 | Notification to every remaining waiting entry | 09-B | Spec 09-B mentions a mail transport stub; the backend has none, so M20 is checked on notification rows |
| M21 | Notification text wrong (no event name) | 09-A | None known |
| M22 | Waiting withdrawal flips the earliest confirmed row | 10-D | Spec says "a waitlisted withdrawal changes a confirmed row"; same intent |
| M23 | Close settle never removes entries | 11-A; 11-B | None known |
| M24 | Closing comparison one step late | 11-B | Spec does not define the mechanism; M24 is the SQL comparison |
| M25 | Manual close (registration_enabled false) ignored by settle | 11-C (no ID in spec) | **ID collision.** Spec 12-A says "Kills M25" for a missing per-entry cancel notification (blocked). Recorded for the user; not renumbered |
| M26 | Releaser cancels withdrawn entries | 12-C (blocked) | The releaser is killed by e2e JOIN-WAITLIST-12-C-REL, not the blocked 12-C case |
| M27 | Report lists waiting entries | 14-A | None known |
| M28 | Position capped at 500 | 13-A | Spec does not define M28 |
| M29 | Join ignores its body | 15-A | None known |
| M30 | Withdraw-by-id lookup drops the owner filter | 05-C | Spec 05-C describes an attendee read by id; no GET-by-id route exists (A-05C). The 10-E ownership gap is also covered |
| M31 | Position returned for every entry | 05-B | None known |

### Added cases and mutants from the Test Code Review (TR5, TCR5)

These are not renumbered spec cases. They are added e2e cases in `backend/test/registrations.waitlist.e2e-spec.ts`, and each kills the mutant named beside it (`backend/scripts/mutation/spm138.mutants.mjs`).

| Mutant | Runner meaning | Killed by | Spec relation |
|---|---|---|---|
| L-1 | The attendee event list no longer settles closed waiting lists before it reads statuses | JOIN-WAITLIST-11-A-STATE-LIST | Supports 11-A and the 11-C "next read removes" rule |
| W-1 | A waiting withdrawal after close does not settle the list first | JOIN-WAITLIST-11-D-ERR-WAIT | Supports 11-D (waiting entry withdrawn after close, nothing settled yet) |
| P-B | The close job's due test is strict (<) and misses the closing instant | JOIN-WAITLIST-11-G-BND | Supports 11-B and the exclusive closing rule |
| X-JOB-MANUAL | The close job's due test ignores a manual close (registration_enabled false) | JOIN-WAITLIST-11-C-STATE-LIST | Supports 11-C (manual close) for the attendee list |

Oracle source for the added cases: the spec's 11-A, 11-B, 11-C and 11-D rules (AC11), with the list read included as an attendee view of the same state.

### Added cases and mutants from the Requirement Review (F1, F2, A1)

| Mutant | Runner meaning | Killed by | Spec relation |
|---|---|---|---|
| N-1 | The attendee audience for WaitlistPromoted and EventCancelled is removed (an attendee reads no notices) | JOIN-WAITLIST-09-C | AC9: the promotion notice reaches the attendee; organiser access unchanged |
| R-N | The cancel releaser writes no EventCancelled notice | JOIN-WAITLIST-12-C-REL | AC12: one notice per cancelled entry; 12-A to 12-C stay Blocked (SPM-136) |
| A1-REAL | The lookup reads the status before the lock and the branch uses that pre-lock value (a stale read) | KILLED by JOIN-WAITLIST-10-H-ERR. JOIN-WAITLIST-10-G-INT does not kill it: the re-read after the settle keeps that result correct | A1: a waiting entry promoted by a concurrent withdrawal gets the Registered-path result |
| F18 (frontend) | The attendee notice feed is disabled, so no promotion notice loads | JOIN-WAITLIST-09-C-FE | AC9 frontend notice |

### Round-7 review: equivalent mutants, notice visibility, locked-read settle, and mount

| Mutant | Runner meaning | Result | Reasoning or killer |
|---|---|---|---|
| P-G | The waiting-withdrawal UPDATE drops its status guard | EQUIVALENT | Every writer of `event_registrations.status` runs under the event row lock (inventory in `backend/scripts/mutation/spm138.mutants.mjs`, above P-G). The withdrawal re-reads the status under that lock, so the guard always holds. **SPM-136 must re-run P-G and P-R when it wires the releaser.** |
| P-R | The registered compare-and-set drops its status guard | EQUIVALENT | Same reasoning as P-G. Re-run by SPM-136 when the releaser is wired. |
| X1 | EventCancelled removed from the attendee audience | KILLED by JOIN-WAITLIST-12-C-VIS | AC12 visibility |
| X2 | EventCancelled no longer maps to the attendee audience role | KILLED by JOIN-WAITLIST-12-C-VIS | AC12 visibility |
| X3 | The releaser's dedupe on Waitlisted is dropped (a second release notices again) | KILLED by JOIN-WAITLIST-12-C-REL | One notice per entry |
| X4 | The releaser cancels a closed list instead of removing it | KILLED by JOIN-WAITLIST-12-C-STATE-CLOSED | A closed list removes entries without a notice |
| F6-SKIP | The withdrawal skips the settle after the locked re-read says Waitlisted | KILLED by JOIN-WAITLIST-10-H-ERR | Race: entry becomes Waitlisted and the list closes before the lock |

| W-1 | Same edit as F6-SKIP (kept for the appendix trail) | KILLED by JOIN-WAITLIST-11-D-ERR-WAIT | AC11 after close |
| N-1 | The attendee audience for the waiting list notices is removed | KILLED by JOIN-WAITLIST-09-C | AC9 |
| R-N | The releaser writes no EventCancelled notice | KILLED by JOIN-WAITLIST-12-C-REL | AC12 |
| Y1 (frontend) | Read notices are still shown | KILLED by JOIN-WAITLIST-09-C-FE-STATE-READ | AC9 |
| Y2 (frontend) | Mark As Read does nothing | KILLED by JOIN-WAITLIST-09-C-FE-STATE-MARK | AC9 |
| Y4 (frontend) | The attendee notice is removed from AppShell | KILLED by JOIN-WAITLIST-09-C-FE-MOUNT | AC9 |
| Y5 (frontend, advisory) | A failed load is not announced | KILLED by JOIN-WAITLIST-09-C-FE-ERR-LOAD | Visibility of errors |

### Reads that write (B1)

| Mutant | Runner meaning | Killed by |
|---|---|---|
| B1-ORG | The event read settles for every caller, not only an attendee who may see the event | JOIN-WAITLIST-11-H-ERR-ORG |
| B1-UNAUTH | The event read settles before the visibility check (an unauthorised read locks and writes) | JOIN-WAITLIST-11-H-ERR-LOCK |

The lock-free check `settleIfDue` takes the event lock only for a list that is due. The close job's candidate scan uses the same predicate, so a list that is not due takes no lock.

### Read gates (TCR9)

| Mutant | Runner meaning | Killed by |
|---|---|---|
| B1-NONE | The event read never settles (an attendee's read of a due list leaves it Waitlisted) | JOIN-WAITLIST-11-H-STATE-NONE |
| B1-COORD | The event read also settles for the assigned coordinator | JOIN-WAITLIST-11-H-STATE-COORD |
| PRECHECK | settleIfDue takes the event lock when no entry is due (the early return is removed) | JOIN-WAITLIST-11-H-INT-NODUE |

## Tier map (test-name suffixes)

Boundary, interaction, state and sad-path tests carry a tier suffix in their names, following the guide's suffix set
(`-BND`, `-INT`, `-STATE`, `-ERR`). The case ID is kept as the prefix of the new name, so a search on the old ID still finds
the test. Happy-path, copy, ownership and isolation tests are not tagged. A test named in the mutant mappings and in the
appendix above uses its new name.

| Old name | New name | Tier | What the test covers |
|---|---|---|---|
| `JOIN-WAITLIST-01-B` | `JOIN-WAITLIST-01-B-ERR` | ERR | direct registration on a full event is refused |
| `JOIN-WAITLIST-01-C` | `JOIN-WAITLIST-01-C-BND` | BND | the join is refused while a spot remains and allowed once full |
| `JOIN-WAITLIST-01-E` | `JOIN-WAITLIST-01-E-ERR` | ERR | duplicate joins are refused |
| `JOIN-WAITLIST-01-D-FREE` | `JOIN-WAITLIST-01-D-INT-FREE` | INT | a free place does not turn a closed refusal into MSG-WL-03 |
| `JOIN-WAITLIST-01-D-BOUNDARY` | `JOIN-WAITLIST-01-D-BND-BOUNDARY` | BND | one millisecond before and at the close |
| `JOIN-WAITLIST-02-B` | `JOIN-WAITLIST-02-B-INT` | INT | waitlistAvailable across window and fullness |
| `JOIN-WAITLIST-03-A` | `JOIN-WAITLIST-03-A-STATE` | STATE | status reads waitlisted after joining |
| `JOIN-WAITLIST-03-B` | `JOIN-WAITLIST-03-B-STATE` | STATE | status unchanged after a fresh login |
| `JOIN-WAITLIST-04-C` | `JOIN-WAITLIST-04-C-INT` | INT | five parallel joins |
| `JOIN-WAITLIST-05-B` | `JOIN-WAITLIST-05-B-STATE` | STATE | position is null unless waitlisted |
| `JOIN-WAITLIST-06-A` | `JOIN-WAITLIST-06-A-STATE` | STATE | withdrawal moves those behind forward |
| `JOIN-WAITLIST-06-B` | `JOIN-WAITLIST-06-B-STATE` | STATE | confirmed withdrawal promotes and moves forward |
| `JOIN-WAITLIST-06-C` | `JOIN-WAITLIST-06-C-STATE` | STATE | middle entry withdrawing |
| `JOIN-WAITLIST-06-D` | `JOIN-WAITLIST-06-D-INT` | INT | withdrawals and a join leave positions gap-free |
| `JOIN-WAITLIST-07-B` | `JOIN-WAITLIST-07-B-INT` | INT | equal join times tie-break by waitlist_seq |
| `JOIN-WAITLIST-07-C` | `JOIN-WAITLIST-07-C-STATE` | STATE | rejoin goes to the back |
| `JOIN-WAITLIST-07-D` | `JOIN-WAITLIST-07-D-STATE` | STATE | removed entry joins again |
| `JOIN-WAITLIST-08-A` | `JOIN-WAITLIST-08-A-STATE` | STATE | first entry promoted in the same transaction |
| `JOIN-WAITLIST-08-B` | `JOIN-WAITLIST-08-B-INT` | INT | sequential and parallel withdrawals |
| `JOIN-WAITLIST-08-B-REPEAT` | `JOIN-WAITLIST-08-B-INT-REPEAT` | INT | parallel repeats of one withdrawal |
| `JOIN-WAITLIST-08-C` | `JOIN-WAITLIST-08-C-BND` | BND | a withdrawal with an empty list frees a place |
| `JOIN-WAITLIST-08-D` | `JOIN-WAITLIST-08-D-INT` | INT | direct registration racing a withdrawal |
| `JOIN-WAITLIST-08-E` | `JOIN-WAITLIST-08-E-ERR` | ERR | failure during promotion rolls back |
| `JOIN-WAITLIST-09-A` | `JOIN-WAITLIST-09-A-STATE` | STATE | one unread notification per promotion (promotion) |
| `JOIN-WAITLIST-09-A` | `JOIN-WAITLIST-09-A-INT` | INT | a second promotion after a rejoin (second promotion) |
| `JOIN-WAITLIST-10-A` | `JOIN-WAITLIST-10-A-STATE` | STATE | waitlisted attendee withdraws |
| `JOIN-WAITLIST-10-C` | `JOIN-WAITLIST-10-C-BND` | BND | withdrawal stops at the exclusive start |
| `JOIN-WAITLIST-10-E` | `JOIN-WAITLIST-10-E-ERR` | ERR | ownership and repeated or parallel withdrawal |
| `JOIN-WAITLIST-10-F` | `JOIN-WAITLIST-10-F-ERR` | ERR | cancelled entry answers 409 |
| `JOIN-WAITLIST-10-G` | `JOIN-WAITLIST-10-G-INT` | INT | promotion by a concurrent withdrawal |
| `JOIN-WAITLIST-10-H` | `JOIN-WAITLIST-10-H-ERR` | ERR | entry removed before the lock is refused 409 |
| `JOIN-WAITLIST-11-A` | `JOIN-WAITLIST-11-A-STATE` | STATE | close job removes every entry |
| `JOIN-WAITLIST-11-A-LIST` | `JOIN-WAITLIST-11-A-STATE-LIST` | STATE | attendee list shows a closed entry as removed |
| `JOIN-WAITLIST-11-B` | `JOIN-WAITLIST-11-B-BND` | BND | closing instant is exclusive |
| `JOIN-WAITLIST-11-C` | `JOIN-WAITLIST-11-C-STATE` | STATE | manual close removes entries and refuses joins |
| `JOIN-WAITLIST-11-C-LIST` | `JOIN-WAITLIST-11-C-STATE-LIST` | STATE | manual close shows removed on the first list read |
| `JOIN-WAITLIST-11-D-WAIT` | `JOIN-WAITLIST-11-D-ERR-WAIT` | ERR | waiting entry withdrawn after close |
| `JOIN-WAITLIST-11-F` | `JOIN-WAITLIST-11-F-STATE` | STATE | removed entry registers directly |
| `JOIN-WAITLIST-11-G` | `JOIN-WAITLIST-11-G-BND` | BND | close job at the exact closing instant |
| `JOIN-WAITLIST-11-H-ORG` | `JOIN-WAITLIST-11-H-ERR-ORG` | ERR | organiser GET leaves a waiting row unchanged |
| `JOIN-WAITLIST-11-H-LOCK` | `JOIN-WAITLIST-11-H-ERR-LOCK` | ERR | unauthorised GET takes no lock and writes nothing |
| `JOIN-WAITLIST-11-H-NONE` | `JOIN-WAITLIST-11-H-STATE-NONE` | STATE | viewable attendee GET settles a due list |
| `JOIN-WAITLIST-11-H-COORD` | `JOIN-WAITLIST-11-H-STATE-COORD` | STATE | assigned coordinator GET of a closed list |
| `JOIN-WAITLIST-11-H-NODUE` | `JOIN-WAITLIST-11-H-INT-NODUE` | INT | open-list reads take no lock while held |
| `JOIN-WAITLIST-12-C-CLOSED` | `JOIN-WAITLIST-12-C-STATE-CLOSED` | STATE | closed list releases entries as removed |
| `JOIN-WAITLIST-13-A` | `JOIN-WAITLIST-13-A-BND` | BND | join behind 500 entries is numbered 501 |
| `JOIN-WAITLIST-15-A` | `JOIN-WAITLIST-15-A-ERR` | ERR | unknown keys are refused with 400 |
| `JOIN-WAITLIST-08-C-GUARD` | `JOIN-WAITLIST-08-C-ERR-GUARD` | ERR | missing event promotes nobody (unit) |
| `JOIN-WAITLIST-01-C-UNIT` | `JOIN-WAITLIST-01-C-ERR-UNIT` | ERR | refused with 422 while a place is free (unit) |
| `JOIN-WAITLIST-01-D-UNIT` | `JOIN-WAITLIST-01-D-ERR-UNIT` | ERR | closed event refused (unit) |
| `JOIN-WAITLIST-01-D-UNIT-OPEN` | `JOIN-WAITLIST-01-D-ERR-UNIT-OPEN` | ERR | not-yet-open event refused (unit) |
| `JOIN-WAITLIST-01-E-UNIT` | `JOIN-WAITLIST-01-E-ERR-UNIT` | ERR | waiting attendee gets 409 (unit) |
| `JOIN-WAITLIST-01-E-UNIT-REG` | `JOIN-WAITLIST-01-E-ERR-UNIT-REG` | ERR | confirmed attendee gets 409 (unit) |
| `JOIN-WAITLIST-01-E-UNIT-REGISTER` | `JOIN-WAITLIST-01-E-ERR-UNIT-REGISTER` | ERR | waiting attendee cannot register directly (unit) |
| `JOIN-WAITLIST-01-F-UNIT` | `JOIN-WAITLIST-01-F-ERR-UNIT` | ERR | user without the Attendee role gets 403 (unit) |
| `JOIN-WAITLIST-01-F-UNIT-404` | `JOIN-WAITLIST-01-F-ERR-UNIT-404` | ERR | unknown event gets 404 (unit) |
| `JOIN-WAITLIST-01-A-UNIT-OPEN-ENDED` | `JOIN-WAITLIST-01-A-BND-UNIT-OPEN-ENDED` | BND | open-ended window bounds (unit) |
| `JOIN-WAITLIST-04-C-GUARD` | `JOIN-WAITLIST-04-C-ERR-GUARD` | ERR | lost race on the insert answers 409 (unit) |
| `JOIN-WAITLIST-04-C-LOCK` | `JOIN-WAITLIST-04-C-INT-LOCK` | INT | join takes the event lock first (unit) |
| `JOIN-WAITLIST-04-C-TX` | `JOIN-WAITLIST-04-C-INT-TX` | INT | join runs as one transaction (unit) |
| `JOIN-WAITLIST-10-E-CAS` | `JOIN-WAITLIST-10-E-ERR-CAS` | ERR | waiting withdrawal losing the compare-and-set (unit) |
| `JOIN-WAITLIST-15-A-UNIT` | `JOIN-WAITLIST-15-A-ERR-UNIT` | ERR | body with unknown keys refused (unit) |
| `JOIN-WAITLIST-01-C-STORE` | `JOIN-WAITLIST-01-C-STORE-ERR` | ERR | refused store join raises the server error |
| `JOIN-WAITLIST-01-F-STORE` | `JOIN-WAITLIST-01-F-STORE-ERR` | ERR | non-attendee refused before any request |
| `JOIN-WAITLIST-09-C-FE-READ` | `JOIN-WAITLIST-09-C-FE-STATE-READ` | STATE | read notice not shown |
| `JOIN-WAITLIST-09-C-FE-MARK` | `JOIN-WAITLIST-09-C-FE-STATE-MARK` | STATE | Mark As Read hides the notice |
| `JOIN-WAITLIST-09-C-FE-LOAD` | `JOIN-WAITLIST-09-C-FE-ERR-LOAD` | ERR | failed load shows the alert |
| `JOIN-WAITLIST-09-C-FE-ROLE` | `JOIN-WAITLIST-09-C-FE-ERR-ROLE` | ERR | non-attendee sends no request |
| `JOIN-WAITLIST-01-E-FE-PENDING` | `JOIN-WAITLIST-01-E-FE-STATE-PENDING` | STATE | Join disabled while pending |
| `JOIN-WAITLIST-01-C-FE-ALERT` | `JOIN-WAITLIST-01-C-FE-ERR-ALERT` | ERR | refused join announced in an alert |
| `JOIN-WAITLIST-01-C-FE-REFUSED` | `JOIN-WAITLIST-01-C-FE-ERR-REFUSED` | ERR | refused join shows the server sentence |
| `JOIN-WAITLIST-01-C-FE-GENERIC` | `JOIN-WAITLIST-01-C-FE-ERR-GENERIC` | ERR | failed join with no message |
| `JOIN-WAITLIST-01-E-FE-REFRESH` | `JOIN-WAITLIST-01-E-FE-ERR-REFRESH` | ERR | duplicate join refreshes the entry |
| `JOIN-WAITLIST-01-E-FE-SAMETICK` | `JOIN-WAITLIST-01-E-FE-INT-SAMETICK` | INT | same-batch double click |
| `JOIN-WAITLIST-01-E-FE-DOUBLE` | `JOIN-WAITLIST-01-E-FE-INT-DOUBLE` | INT | double click sends one request |
| `JOIN-WAITLIST-01-C-FE-A` | `JOIN-WAITLIST-01-C-FE-BND-A` | BND | 9 of 10: Register, no Join |
| `JOIN-WAITLIST-01-C-FE-B` | `JOIN-WAITLIST-01-C-FE-BND-B` | BND | 10 of 10: Join, no Register |
| `JOIN-WAITLIST-01-D-FE-A` | `JOIN-WAITLIST-01-D-FE-INT-A` | INT | closed full event |
| `JOIN-WAITLIST-01-D-FE-B` | `JOIN-WAITLIST-01-D-FE-INT-B` | INT | not-yet-open full event |
| `JOIN-WAITLIST-02-B-FE` | `JOIN-WAITLIST-02-B-FE-INT` | INT | free, closed and not-yet-open states (three tests) |
| `JOIN-WAITLIST-03-A-FE` | `JOIN-WAITLIST-03-A-FE-STATE` | STATE | details show the Waitlisted badge |
| `JOIN-WAITLIST-03-A-FE-DASH` | `JOIN-WAITLIST-03-A-FE-STATE-DASH` | STATE | dashboard card shows Waitlisted |
| `JOIN-WAITLIST-04-A-FE` | `JOIN-WAITLIST-04-A-FE-STATE` | STATE | banner shows the position and can be dismissed (panel) |
| `JOIN-WAITLIST-04-A-FE-JOIN` | `JOIN-WAITLIST-04-A-FE-STATE-JOIN` | STATE | successful join shows MSG-WL-01 |
| `JOIN-WAITLIST-04-A-FE-DISMISS` | `JOIN-WAITLIST-04-A-FE-STATE-DISMISS` | STATE | Dismiss removes the banner |
| `JOIN-WAITLIST-05-A-FE` | `JOIN-WAITLIST-05-A-FE-STATE` | STATE | owner sees position 2 |
| `JOIN-WAITLIST-05-B-FE` | `JOIN-WAITLIST-05-B-FE-STATE` | STATE | registered or withdrawn shows no position |
| `JOIN-WAITLIST-06-D-FE` | `JOIN-WAITLIST-06-D-FE-STATE` | STATE | positions read on reload |
| `JOIN-WAITLIST-07-E-FE` | `JOIN-WAITLIST-07-E-FE-STATE` | STATE | withdrawn attendee rejoins |
| `JOIN-WAITLIST-08-C-FE` | `JOIN-WAITLIST-08-C-FE-BND` | BND | freed place with no list |
| `JOIN-WAITLIST-10-B-FE` | `JOIN-WAITLIST-10-B-FE-STATE` | STATE | Cancel keeps the place |
| `JOIN-WAITLIST-10-C-FE-C` | `JOIN-WAITLIST-10-C-FE-BND-C` | BND | no Withdraw control at 18:30 |
| `JOIN-WAITLIST-11-A-FE` | `JOIN-WAITLIST-11-A-FE-STATE` | STATE | removed entry shows Removed |
| `JOIN-WAITLIST-11-A-FE-CLOSEDON` | `JOIN-WAITLIST-11-A-FE-STATE-CLOSEDON` | STATE | Closed on row shows SGT |
| `JOIN-WAITLIST-11-C-FE-FULL` | `JOIN-WAITLIST-11-C-FE-INT-FULL` | INT | registration disabled, full |
| `JOIN-WAITLIST-11-C-FE-NOTFULL` | `JOIN-WAITLIST-11-C-FE-INT-NOTFULL` | INT | registration disabled, not full |
| `JOIN-WAITLIST-11-D-FE` | `JOIN-WAITLIST-11-D-FE-INT` | INT | closed window beats a free place |
| `JOIN-WAITLIST-02-B-UNIT` | `JOIN-WAITLIST-02-B-INT-UNIT` | INT | window and status precedence table |
| `JOIN-WAITLIST-01-E-FE` | `JOIN-WAITLIST-01-E-FE-STATE` | STATE | waiting indicator (section and panel) |
| `JOIN-WAITLIST-03-A-FE-DASH` | `JOIN-WAITLIST-03-A-FE-STATE-DASH` | STATE | dashboard card |
