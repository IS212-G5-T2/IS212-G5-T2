# SPM-120 Withdraw Registration (Attendee): test results

**Provenance.** `docs/prompts/test-code-generation-prompt.md` (the Guide), `docs/specs/SPM-120-test-cases.md` and `SPM-120-test-case-notes.md` were not in the repository. The 23 cases were read from the Confluence pages `WITHDRAW-EVENT-REG-01` to `10` and the "Withdraw Registration Matrix" (space SP), and they match the resolved-spec tables in the task prompt. The Guide was replaced by the test conventions in the root `AGENTS.md` plus the task prompt's own rules (oracle tier and named mutant per test). `AGENTS.md` does not cover oracle tiers or mutation checks, so those come from the prompt only. Jira SPM-120 was read directly; its status was In Progress.

**Case numbering.** The case IDs follow the six-AC matrix: the old 06-A/B/C are now 05-C/D/E, the old 07-A/B are 06-A/B, the old 09-A/B are 07-A/B and the old 10-A is 08-A. The old 08-A (capacity freed, a story goal rather than an AC) has no slot in the matrix and is tagged `WITHDRAW-EVENT-REG-CAP-01`. Provenance below still cites the original Confluence numbering (01 to 10).

**Status vocabulary.** The cases say "Confirmed"; the repo says "Registered" (decision Q3a). "Withdrawn" is unchanged. API values are lower-case (`registered`, `withdrawn`), stored values are `Registered` / `Withdrawn`. Oracle tiers: SPEC = AC text or Confluence case, DERIVED = follows from an SPM-61/62 rule or a recorded decision, ASSUMED = neither.

## Run commands

Coverage is diagnostic only; it is not evidence that a behaviour is correct.

- Backend unit: `cd backend && npm test` (688 passed).
- Backend integration (real PostgreSQL, needs `database/postgresql/init` 001 to 007 applied): `cd backend && DATABASE_URL=postgres://spm:spm_dev_password@localhost:5432/spm npx vitest run --config ./vitest.config.e2e.ts src/registrations` (70 passed, 1 todo; the SPM-120 file is 40 of them).
- 05-E time zones: `TZ=UTC|Asia/Singapore|America/Los_Angeles npx vitest run --config ./vitest.config.e2e.ts src/registrations/registrations.withdraw -t "05-E"` (2 passed under each). The frontend date tests (`registration.test.ts`, the withdrawn-card suite, the page test) also pass under all three (72 each).
- Frontend: `cd frontend && npm test` (532 passed, 1 todo), `npx tsc -b --noEmit` (clean), `npm run lint` (2 errors, both pre-existing: `ClarificationThread.tsx:157` and `useAppStore.auth.test.ts:5`), `npm run build` (ok).
- Browser (CAP-01): start a backend and a frontend against a dedicated database, then `cd backend && TEST_DATABASE_URL=<db> PLAYWRIGHT_BASE_URL=<frontend url> node scripts/testing/run-browser.mjs src/pages/EventDetailPage.withdraw.playwright.spec.ts`. Re-run after the card redesign on a throwaway `spm_test` database (init 001 to 007 applied) with a backend on :8081 and Vite on :5174: 1 passed, covering withdraw, the timeline card, reload persistence and Register again. The database was then dropped and the Compose `spm` database was checked untouched. A fresh database lacks the SPM-37 `event_drafts` table, so the harness's own cleanup step errors after the test has passed; dropping the database made that harmless.
- Coverage (diagnostic only; the target is that every REACHABLE branch of the SPM-120 code is covered, and the rest is listed): backend `registrations.service.ts` 97.1% of branch arms (67 of 69, integration and unit runs merged) and `event-start.ts` 100%; frontend `WithdrawnRegistrationStatus.tsx` 100%, `EventView.ts` 100%, `WithdrawalConfirmation.tsx` 96.2%, `RegistrationSection.tsx` 96.0%, `utils/registration.ts` 97.3%. Before the review passes: service 88.4%, dialog 76.9%, status card 90.3%. Every uncovered arm that remains is either unreachable or SPM-61 code: `if (!panel) return` in the dialog (the panel is always mounted while its listener exists), `?? ""` after `find` in `formatSgtDateTime` (Intl always returns the part), the heading `meta` branches for not-yet-open, open and full events with a missing open or close time in `RegistrationSection.tsx` (SPM-61), and the register-race and `requireAttendee` guards in the service (SPM-61).
- Mutation check (committed and re-runnable, guide section 7): `cd backend && DATABASE_URL=<db> node scripts/testing/mutation/run.mjs` (16 mutants, about 35 s) and `cd frontend && node scripts/testing/mutation/run.mjs` (29 mutants, about 10 min; use `--only M14,M30` for a subset, `--list` to list, `--suite <name>` to use one suite only). The runner mutates a scratch COPY of the component, checks every edit applies exactly once, runs a green baseline first, and proves the original files are unchanged. It exits 1 if a non-equivalent mutant survives. Last run: backend 16 killed; frontend 28 killed and 1 equivalent (M15).

## Evidence table

| Test ID | AC | Level | Oracle source | Mutant it kills |
|---|---|---|---|---|
| 01-A | AC1 | FE component | SPEC 01-A (button "Withdraw", enabled, no unavailable text) | button absent/disabled for a future registered event; wrong label |
| 01-B | AC1 | FE component | SPEC 01-B + D6/D11 (the "Event has occurred" badge bullet was removed) | control active for a past event |
| 02-A | AC2 | FE component | SPEC 02-A test data (title, two consequences, two buttons); added: no request on open | event name wrong; request on first click; consequence missing |
| 02-B | AC2 | FE a11y (jsdom) | SPEC 02-B Subtest C subset; initial focus changed to Cancel (D10 B) | M12 trap removed; Escape ignored; focus not moved; unlabeled dialog; the focus-left-dialog branch (M26); the no-focusable-buttons branch while pending (M27); Escape cancelling while the request is pending (M39) |
| 03-A | AC3 | BE integration + FE | SPEC 03-A (F1 count 3 to 2; F2 clock T0) | 200 without state change; two requests per click; wrong id; count not released; M4, M10; FE: timeline timestamps swapped (M14); a double activation of Confirm sending two requests (M40); the success write not being exactly one guarded UPDATE with the injected clock (03-STATE-1) |
| 03-B | AC3 | FE component | SPEC 03-B; backdrop ignored is ASSUMED (F12) | M9a/M9b Cancel or backdrop sends a request |
| 04-A | AC4 | FE component | SPEC 04-A + D11; boundary case DERIVED from A7 | past-event control opens the prompt; boundary read from the end |
| 04-B | AC4 | BE integration | SPEC 04-B + D6/D7 | M5 server-side check missing. NOT killed here: a write issued before the check (M34), because the transaction rolls it back; that is killed by 04-STATE-1 (unit, recording client) |
| 04-C | AC4 | BE integration + BE unit + FE unit | SPEC 04-C; Subtest C added (F8) | M1 `>=` to `>`; `>=` to `===`; comparison swapped |
| 04-D | AC4 | BE integration + FE component | ASSUMED A8 (the status label never decides; Confirmed is the SPEC baseline) | M35 a status filter in the lookup; M37 Withdraw hidden for a cancelled event |
| 05-A | AC5 | FE component | SPEC AC5 literal; Subtest B added | wording differs; generic text; 422 swallowed |
| 05-B | AC5 | BE integration | SPEC AC5 + D6/D7; whole-body equality | different wording; message varies with distance; internals leaked |
| 05-C | AC5 | BE integration + FE page + unit | SPEC 05-C; Subtest C added (SPM-61 D15) | M4 hard delete; wrong value; withdrawn_at from the client; stale client state; body shapes: an array body accepted (M24), unknown keys ignored (M25); a legacy row answering null names (M43, ASSUMED A10) |
| 05-D | AC5 | BE integration (real DB) | SPEC 05-D; Subtests B and C added | M3 no state guard; check-then-update race; second call overwrites withdrawn_at |
| 05-E | AC5 | BE integration + FE | SPEC 05-E (T0 per F2/F14) | M11 local-time text; M8 UTC day or hour (`formatSgtDateTime`, now the timeline's formatter); M21 "Sept" month; recalculated timestamp |
| 05-F | AC5 | BE integration | DERIVED, SPM-61 A5 (the same row is reactivated) | a re-registered attendee still showing the old withdrawal time |
| 06-A | AC6 | FE component | SPEC 06-A + D9/D13; Subtest B added | M7 success before response; auto-dismiss; dialog lingers; failures that are not an ApiError (M41, M42, ASSUMED A11) |
| 06-B | AC6 | FE component (table) | SPEC 06-B + D9 + F15 (banner has no timestamp) | hard-coded name; wrong name; banner echoes the server message |
| 07-A | cross-cutting | BE integration | SPEC 07-A + D16 (404, never 403); Subtest D added; every other role (ORGANISER, COORDINATOR, VENUE_STAFF, TECH_SUPPORT) | M2 scoping removed; M6 403 instead of 404; M36 a role guard answering 403 |
| 07-B | cross-cutting | BE integration + FE | SPEC 07-B + D16 ("Missing session"); FE case added | bypassing the 401 handling (M13); success after a 401 |
| 07-INT-1 to 5 | cross-cutting | BE integration | DERIVED from the documented rule order (authentication, body, ownership, state, event start) | M22 state check after the event-start check; M23 body checked after ownership; authentication after body; ownership after state or event start |
| 08-A | cross-cutting | BE integration (real DB) | SPEC 08-A (B); A is 05-D A | race, deadlock as 500, double release |
| 03-STATE-1, 04-STATE-1, 05-STATE-1, 05-STATE-2, 07-STATE-1, 07-STATE-2 | AC3 to AC5, cross-cutting | BE unit (recording client) | The SPEC outcomes (status, code, message) plus the recorded SQL | M34 the UPDATE issued before the event-start check; a write before the state, ownership or body check; M1 to M6, M10, M23, M24 also die here. M44 (wrong column) does NOT: it needs the real database (04-C B) |
| CAP-01 | story goal | BE integration + FE page + Playwright | SPEC CAP-01; display per D17 (the repo's "Available N spot(s)") | spot not released; stale cache; no refetch |
| CARD-01 to 09 (incl. legacy row, no close time, cancelled event) | redesign | FE component | Redesign brief (state matrix, timeline, disclosure); boundaries DERIVED from `registrationState` / `hasEventStarted`; CARD-09 regression | badge or entry missing; timestamps swapped (M14); blocked state still shows the button; footer disagrees with `registrationState`; withdrawn card shown for a registered attendee; closed-on shown with a future date (M30); "Closes" printed with no close time (M28); Withdrawn entry invented for a legacy row (M29) |
| CARD-04 (day count) + `daysUntilLabel` | redesign | FE component + unit | DERIVED: SGT calendar-day difference, as in the SPM-61 heading | hours / 24 instead of calendar days; UTC day instead of SGT day; "0 days" instead of "today" |
| CARD-10 to 13 | redesign | FE component | Redesign brief + backend 05-F derived (the same row is reactivated) | prefill from the account (M16) or no contact prefill (M17); first-time wording on re-register (M18); footer under the open form (M19); card left on the stale prop (M20); optimistic flip on a refused re-registration; 409 not reloading the registration (M31); form left flagged open after a 409 and reappearing after the next withdrawal (M32) |

## Test ID map

The test IDs follow the six-AC matrix. The Confluence pages still carry the former IDs until the numbering amendment (see Amendments) is applied. Cases 01-A to 05-B are unchanged.

| Former Confluence ID | Current ID | Behaviour |
|---|---|---|
| 06-A | 05-C | the withdrawn status is persisted |
| 06-B | 05-D | a registration can only be withdrawn once (concurrency) |
| 06-C | 05-E | `withdrawn_at` stored as UTC |
| 07-A | 06-A | pending state, then a persistent dismissible success banner |
| 07-B | 06-B | the success message names the right event |
| 08-A | CAP-01 | the freed spot is available |
| 09-A | 07-A | ownership (404, never 403) |
| 09-B | 07-B | authentication (401) |
| 10-A | 08-A | concurrent withdrawals are safe |
| (new) | 05-F | re-registering after a withdrawal reactivates the same row |
| (new) | 04-D | the status label never blocks a withdrawal (A8) |
| (new) | 03-STATE-1, 04-STATE-1, 05-STATE-1, 05-STATE-2, 07-STATE-1, 07-STATE-2 | no write is issued on a refusal (recording-client unit spec) |
| (new) | 07-INT-1 to 5 | rule order: authentication, body, ownership, state, event start |

## Tests without an AC

These trace to something other than an acceptance criterion, so they sit outside the `<PREFIX>-<AC#>-<suffix>` pattern on purpose.

| IDs | Traces to | Source of the oracle |
|---|---|---|
| CAP-01 | the story goal (the freed spot is available) | Confluence capacity case |
| CARD-01 to CARD-13 | the withdrawn-card redesign (badge, timeline, disclosure, footer, Register again) | the redesign brief given with the task; it is not in the repository, so the behaviours are restated in the test comments |
| `daysUntilLabel`, `formatSgtDateTime` unit tests | supporting rules the card relies on | DERIVED from the SPM-61 calendar-day heading and the app's one date format |

## Decision and assumption IDs

The tests cite these IDs. They came from the Phase 0 notes, which are not in the repository, so each line restates what the tests assert. IDs written "SPM-61 ..." belong to that story.

| ID | Statement | Tier |
|---|---|---|
| A5 | Re-registering after a withdrawal reactivates the same row (same id) and clears `withdrawn_at` (SPM-61) | DERIVED |
| A7 | The cut-off is the event start instant, exclusive: at or after the start a withdrawal is refused | ASSUMED, pending the Product Owner |
| A8 | Only the event's start instant decides; its status label (Cancelled, or Completed on a future start) never blocks a withdrawal or hides the Withdraw control | ASSUMED, pending the Product Owner |
| A9 | If the reload after a 409 on re-register fails, the failure is swallowed: the form stays open and the card stays withdrawn | ASSUMED (SPM-61 behaviour) |
| A10 | A registration older than migration 004 (no stored details) answers empty strings for name and email and omits contact and special requirements | ASSUMED |
| A11 | A withdrawal failure that is not an ApiError shows its own message; a rejection that is not an Error shows "We couldn't process your withdrawal. Please try again." | ASSUMED |
| D6, D7 | The only blocked-withdrawal message is "Event has already occurred", returned as a 422 with code `event_already_occurred` | SPEC |
| D8 | The blocked message has no full stop | SPEC |
| D9 | The success banner is built by the UI from the event name, never echoed from the server's message | SPEC |
| D10 (B) | Initial focus in the dialog is on Cancel (amends the Confluence case) | DECISION |
| D11 | No Withdraw control for a past event; there is no availability flag | DERIVED |
| D13 | The banner stays until dismissed (no timer); the dialog closes within 500 ms of the 200 | SPEC |
| D14 | One compare-and-set UPDATE decides concurrent withdrawals; the loser gets 422 "already been withdrawn" | DERIVED |
| D15 | The withdraw route accepts no body or `{}`; any other body is a 400 | DERIVED (SPM-61 D15) |
| D16 | Another attendee's, unknown, malformed and non-attendee requests all get the same 404 "Registration not found." (never 403) | DERIVED |
| D19 | The event-list badge and dashboard card named in the case do not exist in this app, so they are not asserted | DECISION |
| F12 | A click on the dialog backdrop is ignored | ASSUMED |
| F15 | The banner carries no timestamp; the time is in the withdrawn card's timeline | SPEC |
| ORDER | Rule order: authentication, body, ownership, state, event start, update (documented on `RegistrationsService.withdraw`) | DERIVED |


## Open questions for the Product Owner

Each is a behaviour the code has and the tests pin, but no acceptance criterion states. They are tagged `ASSUMPTION` in the tests and listed in each file's assumption index.

| ID | Question |
|---|---|
| A7 | Is the cut-off the event start instant, exclusive (a withdrawal at the start is refused)? |
| A8 | May an attendee withdraw from a Cancelled event that has not started? (Today: yes.) |
| A9 | If registering again hits "already registered" and the reload then fails, is leaving the form open acceptable? |
| A10 | For registrations created before details were captured, is an empty name and email in the response acceptable? |
| A11 | Is the generic wording for an unexpected withdrawal failure acceptable? |

## Results

| Test Case ID | Subtest | file :: test name | Layer | Result | Notes |
|---|---|---|---|---|---|
| 01-A | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-01-A ...` | FE component | Pass | Styling prominence (visual) and the "GET availability flag" step: Not Automated (no flag exists, D11; GET is covered by 03-A and 05-C) |
| 01-B | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-01-B ...` | FE component | Pass | The "Event has occurred" badge bullet was removed (no such badge in this app) |
| 02-A | | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-02-A ...` | FE component | Pass | Modal dimming and "background" bullet: visual, Not Automated |
| 02-B | C subset (jsdom) | `WithdrawalConfirmation.a11y.test.tsx :: WITHDRAW-EVENT-REG-02-B ...` (8 tests) | FE a11y | Pass | Semantics, focus on Cancel, Tab/Shift+Tab trap, focus pulled back from outside the dialog, focus held on the dialog while pending, Escape ignored while pending, Escape + focus return, axe (colour-contrast off) |
| 02-B | A: 375 px layout, truncation | | | Not Automated | Needs a real browser at 375 px (Playwright viewport check) |
| 02-B | B: 200% zoom, 44x44 px targets, 4.5:1 contrast | | | Not Automated | Needs a real browser and a contrast tool |
| 02-B | C: screen-reader announcements | | | Not Automated | Needs NVDA/JAWS/VoiceOver. Visible-focus styling also needs a browser |
| 03-A | backend | `registrations.withdraw.e2e-spec.ts :: WITHDRAW-EVENT-REG-03-A ...` (no body, `{}`) | BE integration | Pass | 200, body, DB row, fresh read, count 3 to 2 |
| 03-A | frontend | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-03-A (frontend)` | FE component | Pass | One POST to `/registrations/REG-9001/withdraw`; timeline Registered 3 Oct 2026, 12:00 and Withdrawn 4 Oct 2026, 12:00, each asserted inside its own entry; a double activation of Confirm sends one POST |
| 03-B | | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-03-B` (2 tests) | FE component | Pass | The GET / DB / capacity bullets follow from "zero requests" and are covered by that assertion |
| 04-A | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-04-A` (2 tests) | FE component | Pass | Includes an in-progress boundary case |
| 04-B | | `registrations.withdraw.e2e-spec.ts :: WITHDRAW-EVENT-REG-04-B ...` (2) | BE integration | Pass | 422, row and count unchanged. This proves no COMMITTED change only; that no UPDATE is issued is 04-STATE-1 |
| 04-C | A, B, C | `registrations.withdraw.e2e-spec.ts :: ...04-C` (3); `event-start.spec.ts` (3); `registration.test.ts :: ...04-C` (3) | BE integration, BE unit, FE unit | Pass | C added (F8) |
| 04-D | A8 | `registrations.withdraw.e2e-spec.ts :: ...04-D` (3); `RegistrationSection.test.tsx :: ...04-D` (3) | BE integration + FE component | Pass | Confirmed, Cancelled and Completed events that have not started: 200 and Withdrawn; Withdraw shown. ASSUMED A8 |
| 05-A | A | `RegistrationSection.test.tsx :: ...05-A (A)` | FE component | Pass | Exact "Event has already occurred" |
| 05-A | B (added) | `RegistrationSection.test.tsx :: ...05-A (B, added)` | FE component | Pass | 422 on confirm |
| 05-B | | `registrations.withdraw.e2e-spec.ts :: ...05-B` (2) | BE integration | Pass | Whole body equality |
| 05-C | A | `registrations.withdraw.e2e-spec.ts :: ...05-C` | BE integration | Pass | Row kept, details intact, others untouched |
| 05-C | C (added) | same file | BE integration | Pass | 400 for server-controlled fields |
| 05-C | body shapes (added) | same file | BE integration | Pass | An empty array, a non-empty array and an unknown key: 400 with the exact error shape, nothing changes (M24, M25) |
| 05-C | legacy row (added) | same file | BE integration | Pass | A registration with no stored details withdraws with empty strings, not null (M43, ASSUMED A10) |
| 05-C | frontend | `EventDetailPage.withdraw.test.tsx :: ...05-C / 05-E (frontend)` | FE page | Pass | Written after the implementation (not RED-first); proven by mutation |
| 05-F | | `registrations.withdraw.e2e-spec.ts :: ...05-F (derived)` | BE integration | Pass | Re-registering clears `withdrawn_at` (was labelled 05-C (derived), a duplicate ID) |
| 05-D | A | `registrations.withdraw.e2e-spec.ts :: ...05-D ... A` | BE integration (real DB) | Pass | Also 08-A (A) |
| 05-D | B, C (added) | same file | BE integration | Pass | C holds the row lock so the race is deterministic (added after M3 survived) |
| 05-D | frontend (added) | `RegistrationSection.test.tsx :: ...05-D (frontend, added)` | FE component | Pass | Already-withdrawn conflict reloads the registration |
| 05-E | A, B | `registrations.withdraw.e2e-spec.ts :: ...05-E` (2) | BE integration | Pass | |
| 05-E | C: three time zones | same two tests under `TZ=UTC`, `Asia/Singapore`, `America/Los_Angeles` | BE integration | Pass | Identical results |
| 05-E | UI | `registration.test.ts :: ...05-E` (3 day-crossing rows + 12 month rows, for `formatSgtDateTime`); page test | FE unit + page | Pass | The old `formatWithdrawnAt` ("Withdrawn today at") was removed with the redesign; the timeline shows absolute SGT times. The API and DB are exact |
| 06-A | A | `WithdrawalConfirmation.test.tsx :: ...06-A (A)` | FE component | Pass | Fake timers: closed within 500 ms, still visible after 10 s |
| 06-A | B (added) | same file (4 rows) | FE component | Pass | 503 and network failure; a plain Error and a rejection with no value (M41, M42, ASSUMED A11) |
| 06-B | | `WithdrawalConfirmation.test.tsx :: ...06-B` (3 rows) | FE component | Pass | Banner has no timestamp (F15); the status area shows 14:30 |
| 07-A | A, C, D (+ every other role) | `registrations.withdraw.e2e-spec.ts :: ...07-A` (8 tests) | BE integration | Pass | B is 07-B, run once; ORGANISER, COORDINATOR, VENUE_STAFF and TECH_SUPPORT each get the 404 |
| 07-B | backend | `registrations.withdraw.e2e-spec.ts :: ...07-B (= 07-A B)` | BE integration | Pass | 401 "Missing session" |
| 07-B | frontend (added) | `EventDetailPage.withdraw.test.tsx :: ...07-B (frontend)` (2) | FE page | Pass | 401 signs out and redirects; a 500 does not |
| 07-INT-1 to 5 | | `registrations.withdraw.e2e-spec.ts :: ...07-INT` (5 tests) | BE integration | Pass | Each breaks two adjacent rules at once. Added after M22, M23 and an array-body mutant survived the earlier suite |
| 08-A | A | = 05-D A | | Pass | |
| 08-A | B | `registrations.withdraw.e2e-spec.ts :: ...08-A` | BE integration (real DB) | Pass | 5 parallel (the case says 100; see Deviations 11): one 200, four 422, zero 5xx |
| 08-A | response times (2 s, 5 s), k6 / Artillery | | | Not Automated | Not repeatable; no load tool added (D24) |
| 03-STATE-1 to 07-STATE-2 | | `registrations.withdraw.spec.ts` (10 tests) | BE unit | Pass | A recording client proves no UPDATE is issued on a refusal and exactly one guarded UPDATE, with the injected clock, on success (M34) |
| CAP-01 | backend | `registrations.withdraw.e2e-spec.ts :: ...CAP-01` | BE integration | Pass | Uses `availableRegistrationSpots` 0 to 1 (D17); no `confirmedCount` was added |
| CAP-01 | frontend | `EventDetailPage.withdraw.test.tsx :: ...CAP-01 (frontend)` | FE page | Pass | |
| CAP-01 | browser | `EventDetailPage.withdraw.playwright.spec.ts` | Playwright | Pass | Re-run after the redesign on a throwaway `spm_test` (see commands); also covers Register again |
| CAP-01 | Register-button, event-list badge, dashboard card, attendee list | | | Not Automated | The Register button is covered; the badge, card and list do not exist in the app (D19). The attendee list is deliberately never built (privacy, F7) |
| CARD-01 to 09 | | `WithdrawnRegistrationStatus.test.tsx` (20 tests, including the legacy row, the no-close-time footer, the cancelled-event footer and the capacity fallback); CARD-09 in `RegistrationSection.test.tsx` | FE component | Pass | Written after the implementation (not RED-first); proven by mutation (M14) |
| CARD-10 to 13 | | `RegistrationSection.test.tsx :: ...CARD-10 / 11 / 12 / 13` (6 tests) | FE component | Pass | Prefill, re-register flip, a refused re-registration and a 409 that reloads the registration; mutants M16 to M20, M31, M32 |
| `daysUntilLabel` | | `registration.test.ts :: SPM-120 redesign: daysUntilLabel` (7) | FE unit | Pass | The design example is 158 days |

## Review checklist

- [x] Every automated test names its case ID, oracle tier and a mutant it kills.
- [x] Oracles are literals; no production message constant is imported into a test.
- [x] Sad-path "no side effect" claims are real. The integration tests assert the row is unchanged, but `withdraw()` runs in a transaction that rolls back on any throw, so a refusal leaves the row unchanged even if the service wrote first (M34 survived all 33 integration tests then). `registrations.withdraw.spec.ts` records the SQL and proves no UPDATE is issued (04-STATE-1, 05-STATE-1, 05-STATE-2, 07-STATE-1, 07-STATE-2); the 04-B claim that it killed "status written before the check" was wrong and is corrected.
- [x] Time comes from the injected clock (backend) or a frozen Date (frontend); no real waiting.
- [x] Real PostgreSQL for the backend integration cases; only the HTTP boundary is mocked on the frontend.
- [x] No `.only`, no skipped assertion, no loop or `if` that computes an expected value. The 04-C ternaries moved into the table rows; the three `for` loops only iterate over literal assertions; the mock routers in the page tests route requests and compute nothing. The 100-request concurrency test is now 5 (Deviations 11).
- [ ] RED before GREEN for every slice: **not met for the page-level frontend tests** (`EventDetailPage.withdraw.test.tsx`, the Playwright spec) or for the card-redesign tests CARD-01 to 12. They were written after the implementation and checked by mutation instead. The `formatSgtDateTime` month tests and the `daysUntilLabel` tests were written first (the month rows failed on "Sept" before the fix). The rule-order, body-shape, focus-trap, footer-variant and 409 tests of the later review pass were also written against existing behaviour and proven by mutants M22 to M33; only the cancelled-event footer test (CARD-06) was RED first.
- [x] The mutation check is committed and re-runnable (see Run commands): every mutant is killed except M15, which is equivalent by design. Original files are hashed before and after each run.

## Mutation spot-check

The check is reproducible: `backend/scripts/testing/mutation` and `frontend/scripts/testing/mutation` hold the mutant lists (`spm120.mutants.mjs`) and the runner (`run.mjs`). IDs below match the lists; M1 exists in both components (M1, M1-fe) and M8 is the frontend formatter's time zone (M8-fe). M11 (local wall-clock text written to the column) is not reproduced by the harness because it needs a TZ-specific run of 05-E, which is in Run commands. Mutants listed as survived or not killed by a suite say which suite; `--suite` reproduces that.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M1 | `>=` to `>` in `hasEventStarted` (backend and frontend) | Killed | 04-C B (unit, integration, frontend unit) |
| M2 | Ownership scoping removed from the withdraw lookup | Killed | 07-A A, D |
| M3 | Status condition removed from the UPDATE | **Survived on the first run, then killed** | The 3-parallel case could not hit the race window (later requests read `Withdrawn` first). Added 05-D (C), which holds the row lock; it now fails under M3 |
| M4 | UPDATE replaced by a DELETE | Killed | 03-A |
| M5 | Server-side time check removed | Killed | 04-B |
| M6 | 403 instead of 404 for non-owners | Killed | 07-A A, D |
| M7 | Success banner shown before the response | Killed | 06-A A |
| M8 | UTC day instead of SGT day for "today" | Killed | formatter unit rows 2 and 3 |
| M9 | Cancel / backdrop triggers the request | Killed | 03-B (both variants) |
| M10 | `withdrawn_at` from SQL `now()` | Killed | 03-A |
| M11 | Local wall-clock text written to the column (PostgreSQL version of the MySQL mutant; run under `TZ=Asia/Singapore`) | Killed | 05-E A, B |
| M12 | Dialog focus trap removed | Killed | 02-B trap |
| M13 | 401 sign-out bypassed | Killed | 07-B frontend |
| M14 | Swap the Registered and Withdrawn timestamps in the timeline | **Survived on the first run, then killed** | The tests only looked for the time strings anywhere in the card. Added `timelineEntry()` and scoped CARD-01, CARD-08, 03-A, 05-C and 06-B to each entry; 7 tests now fail under M14 |
| M15 | Look the registration up by id (the original code) instead of event + attendee | **Equivalent (the one survivor, flagged `equivalent` in the list)** | The backend reactivates the same row on re-registration (same id), so both lookups behave identically. The pair lookup is harmless but not required |
| M16 | Prefill the name from the account, not the withdrawn record | Killed | CARD-10, 11, 12 |
| M17 | Contact number not prefilled | Killed | CARD-10, 11 |
| M18 | First-time confirmation wording on re-register | Killed | CARD-11 |
| M19 | Footer left visible under the open form | Killed | CARD-10 |
| M20 | Card follows the stale prop, not the store | Killed | CARD-11, 05-D (frontend) |
| M21 | Month names taken from `Intl` ("Sept") | Killed | 05-E month rows (RED before the fix; a real defect in `formatSgtDateTime`) |
| M22 | The event-start check runs before the already-withdrawn check | **Survived the earlier suite, now killed** | 07-INT-5 (the owner of a withdrawn registration on a past event must get "already been withdrawn") |
| M23 | The body is validated after the ownership lookup | **Survived the earlier suite, now killed** | 07-INT-2 |
| M24 | An array body treated like `{}` | **Survived the earlier suite, now killed** | 05-C body shapes (empty and non-empty array) |
| M25 | Unknown keys ignored (every bad body gets the form-level error) | Killed | 05-C (Added C, body shapes), 07-INT-2 |
| M26 | Dialog: the "focus left the dialog" branch removed | Killed | 02-B outside-focus test. No test executed that branch before (coverage), so it could not have failed |
| M27 | Dialog: the "no focusable buttons" branch removed | Killed | 02-B pending-focus test. Same: unexecuted before |
| M28 | The footer prints "Closes ..." even with no close time | Killed | CARD-04 (no close time) |
| M29 | The timeline always renders a Withdrawn entry | Killed | CARD-01 (legacy row) |
| M30 | The footer-state fix reverted: a cancelled event's future close shown as "closed on" | Killed | CARD-06 (cancelled). This test found a real defect, now fixed (see Deviations) |
| M31 | A 409 on re-register does not reload the registration | Killed | CARD-13 and the SPM-61 409 test |
| M32 | A 409 leaves the form flagged open | **Survived the first CARD-13, then killed** | CARD-13 (b): the form reappears under the withdrawn card after the next withdrawal |
| M33 | The footer's expected-attendance fallback removed | Killed | CARD-04 (fallback) |
| M34 | The UPDATE is issued before the event-start check (inside the transaction) | **Survived the integration suite alone (33 of 33 passed), killed by the unit spec** | 04-STATE-1. The transaction rolls the write back, so no database assertion can see it; only a recording client can. `run.mjs --suite e2e --only M34` reproduces the survivor |
| M35 | A status filter added to the lookup (a Cancelled event can no longer be withdrawn from) | Killed | 04-D (Cancelled row) |
| M36 | A role guard added (403 for non-attendees) | Killed | 07-A, every role row |
| M37 | Withdraw hidden for a cancelled event (the status label decides) | Killed | 04-D (frontend) |
| M38 | The swallowed reload failure after a 409 removed | Killed | CARD-13 (c) (an unhandled rejection) |
| M39 | Escape cancels the dialog while the request is pending | Killed | 02-B (Escape while pending) |
| M40 | The in-flight guard removed (a double activation sends two requests) | Killed | 03-A (double activation) |
| M41 | A rejection that is not an Error is read as one | Killed | 06-A (B), the no-value row |
| M42 | Every failure assumed to be an ApiError | Killed | 06-A (B), the plain Error and no-value rows |
| M43 | Null name, email and contact not coerced | Killed | 05-C (legacy row) |
| M44 | The lookup reads the event end column as its start | Killed by the integration suite only | 04-C B. The unit spec's fake rows cannot see a wrong column, so the unit and integration layers of 04-C are not duplicates (M34 is the reverse case) |

## Gap list

- ACs with mostly a happy path: AC2 (the dialog's visual layout), AC6 (banner styling is a `data-variant` attribute, not a real colour check). The story's ACs are AC1 to AC6; the waiting-list AC was removed from the story.
- Rule order is now covered for every adjacent pair (07-INT-1 to 5). Scalar bodies (a string, a number, `null`) are not tested: the JSON parser may reject them before the service, which has not been checked. The "no write" proof is the recording-client unit spec; no database state can show it.
- Event status values and roles are now covered (04-D, 07-A); the Cancelled-event rule is ASSUMED A8 and listed for the Product Owner. A multi-role account that is also an attendee is not specified or tested.
- D14: another non-withdrawable status cannot exist (the table allows only `Registered` and `Withdrawn`), so that branch has no test and no code beyond the shared 422.
- 02-B: Subtests A, B and screen-reader checks (need a browser or assistive technology).
- No load tooling (D24); event-list badge and dashboard card do not exist (D19).
- Re-registration after a withdrawal is now covered in the component tests (CARD-10 to 13) and in the browser spec. Real keyboard activation of the details disclosure (Enter and Space) is not automated: jsdom does not simulate it, so the unit test clicks and checks focus.
- The in-memory `withdrawRegistration(eventId)` stub in `useAppStore.ts` is now dead code. It was left because an SPM-61 page test (`EventDetailPage.registration.test.tsx:246`) still calls it, and the brief allowed editing no further existing tests.
- Added subtests beyond the Confluence cases: 02-A no request on open; 03-B backdrop; 04-C C; 04-A boundary; 05-A B; 05-C C and reactivation; 05-D B, C and frontend; 06-A B; 07-A D and organiser; 07-B frontend (2).

## Document-defect resolutions (F1 to F22) as applied

F1 count 3 to 2. F2/F14 T0 = 2026-10-04 12:00 SGT. F3/F4 the single blocked message is "Event has already occurred". F5 one past-event fixture, each ID asserts its own focus. F6 status mapping above. F7 attendee list, dashboard card and event-list badge not built. F8 04-C C added. F9 404, never 403. F10 label "Withdraw", no availability flag, styling Not Automated. F11 `withdrawn_at` from the injected clock. F12 backdrop ignored (ASSUMED). F13 422 with the 05-D wording. F15 the banner is exactly the MSG-11 sentence, the timestamp is in the status area. F16 API `withdrawnAt`, column `withdrawn_at`. F17/F18 dialog copy per 02-A; focus on Cancel. F20 07-B run once, tagged for both.

## Deviations from the brief and open items

1. **Response shape.** The 200 body is the registration fields at the top level plus `message` (as 03-A's oracle is written), not `{ registration, message}` as SPM-61's register route returns. Say if you want them aligned.
2. **Capacity field.** No `confirmedCount` was added; the existing `availableRegistrationSpots` is used.
3. **No 403 for other roles.** Non-attendee roles take the ownership 404 path (D16: never 403 on this route). My Phase 0 note suggested keeping SPM-61's 403 for them; this follows the brief instead.
4. **Uniqueness.** The `UNIQUE (event_id, attendee_id)` constraint was kept and a withdrawn row is reactivated, so there is never more than one withdrawn row. The "allow multiple withdrawn rows" condition is therefore not needed here; if re-registration ever creates new rows, revisit it.
5. **Two existing tests edited** (the brief allowed one): `registrations.e2e-spec.ts:301` (`/me` now returns the withdrawn registration; requirement-driven, from 05-C reload persistence). The D6 edit was not needed (that string is not in the repo).
6. **Test paths** follow `AGENTS.md` (beside the module), not the matrix's `tests/` directories.
7. **Harness change.** `backend/scripts/testing/run-browser.mjs` now seeds and removes the SPM-120 fixture and passes CLI arguments through to Playwright.
8. **New dependency.** `vitest-axe` (dev). Its own matcher typing targets an older Vitest, so the test asserts on `results.violations`.
9. **Not done by me (outward-facing).** No Jira or Confluence page was edited, no commit, push or PR was made.
10. **Footer defect found and fixed by the review pass.** Testing the footer's closed branch (CARD-06) showed that a cancelled event with a future scheduled close displayed "Registration closed on <future date>.". `withdrawnCardFooterState` (`EventView.ts`) now reports a close time only once it has passed, the rule the main card already follows. A user-visible change, recorded in `frontend/CHANGELOG.md`.
11. **08-A (B) runs 5 parallel requests, not 100.** The case asks for 100; the test guide rejects 100-iteration loops. The mutant that needs real contention (M3) survived the 100-request run and is killed by the row-lock test (05-D C), so 5 loses no kill. Response times and load stay Not Automated (D24).
12. **04-C is asserted at three layers on purpose.** The backend unit spec pins the predicate, the integration test pins its wiring to the database column and the injected clock (M44 dies only there), and the frontend unit test pins a separate implementation of the same rule. M34 is the mirror case: only the recording-client unit spec kills it.
13. **Mutation tooling.** The harness is two small scripts (one per component, identical `run.mjs`) rather than Stryker, so it adds no dependency. The frontend run takes about 10 minutes because each mutant re-runs the SPM-120 suites.

## Amendments for Jira and Confluence (to apply after review)

- **Numbering.** Renumber the Confluence cases and matrix to the six-AC IDs above, and add `CAP-01` if the capacity case is kept. 05-A and 05-B assert the "Event has already occurred" message, which the story lists under AC4; the code labels them AC4.
- **Status wording.** Find and replace the registration status "Confirmed" with "Registered" across the SPM-120 pages ("Withdrawn" stays).
- **01-B.** Delete the "Event has occurred" badge bullet. **04-A, 04-B, 05-A, 05-B:** the single blocked wording is "Event has already occurred" (no "Cannot withdraw - ..." variants); 05-A's "MSG-10" is a mislabel.
- **07-A Subtest B / 07-B.** Expected text "Missing session" (401), replacing "Authentication required" / "Please log in". 07-A A: 404 only, text "Registration not found.".
- **02-B Subtest C.** Focus lands on Cancel; Tab cycles Cancel, Confirm, Cancel; Escape cancels. Replace "Jest" and "jest-axe" with "Vitest" and "vitest-axe". Subtests A, B and screen reader stay manual.
- **05-C / 03-A / 05-E.** Date 4 Oct 2026 (not 29 Sep); count 3 to 2; remove "success message should include timestamp"; compare the UI to the same minute, and the API and DB within 1 second; the reload step asserts `withdrawn_at` unchanged. The UI shows a withdrawn card whose timeline lists Registered and Withdrawn with absolute Singapore times ("D Mon YYYY, HH:mm"); there is no relative "Withdrawn today at" line.
- **06-B.** Remove the timestamp checks from the banner; the template wording is the chosen text "Your withdrawal from {eventName} has been processed." (record it in Jira and Confluence as chosen wording, it is not from the AC).
- **08-A.** 3-parallel is 05-D A, run once. The fixture has no waiting registration (the case's capacity 3 with 1 waiting predates the removal of the waiting list); the test uses the default capacity of 50 and does not assert capacity; response-time limits and the load file are not automated.
