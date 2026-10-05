# SPM-120 Withdraw Registration (Attendee): test results

**Provenance.** `docs/prompts/test-code-generation-prompt.md` (the Guide), `docs/specs/SPM-120-test-cases.md` and `SPM-120-test-case-notes.md` were not in the repository. The 23 cases were read from the Confluence pages `WITHDRAW-EVENT-REG-01` to `10` and the "Withdraw Registration Matrix" (space SP), and they match the resolved-spec tables in the task prompt. The Guide was replaced by the test conventions in the root `AGENTS.md` plus the task prompt's own rules (oracle tier and named mutant per test). `AGENTS.md` does not cover oracle tiers or mutation checks, so those come from the prompt only. Jira SPM-120 was read directly; its status was In Progress.

**Case numbering.** The case IDs follow the six-AC matrix: the old 06-A/B/C are now 05-C/D/E, the old 07-A/B are 06-A/B, the old 09-A/B are 07-A/B and the old 10-A is 08-A. The old 08-A (capacity freed, a story goal rather than an AC) has no slot in the matrix and is tagged `WITHDRAW-EVENT-REG-CAP-01`. Provenance below still cites the original Confluence numbering (01 to 10).

**Status vocabulary.** The cases say "Confirmed"; the repo says "Registered" (decision Q3a). "Withdrawn" is unchanged. API values are lower-case (`registered`, `withdrawn`), stored values are `Registered` / `Withdrawn`. Oracle tiers: SPEC = AC text or Confluence case, DERIVED = follows from an SPM-61/62 rule or a recorded decision, ASSUMED = neither.

## Run commands

Coverage is diagnostic only; it is not evidence that a behaviour is correct.

- Backend unit: `cd backend && npm test` (582 passed; baseline 579).
- Backend integration (real PostgreSQL, needs `database/postgresql/init` 001 to 007 applied): `cd backend && DATABASE_URL=postgres://spm:spm_dev_password@localhost:5432/spm npx vitest run --config ./vitest.config.e2e.ts src/registrations` (55 passed, 1 todo; baseline 30).
- 05-E time zones: `TZ=UTC|Asia/Singapore|America/Los_Angeles npx vitest run --config ./vitest.config.e2e.ts src/registrations/registrations.withdraw -t "05-E"` (2 passed under each). The frontend date tests (`registration.test.ts`, the withdrawn-card suite, the page test) also pass under all three (67 each).
- Frontend: `cd frontend && npm test` (413 passed, 1 todo; baseline 341 passed, 1 todo), `npx tsc -b --noEmit` (clean), `npm run lint` (2 errors, both pre-existing: `ClarificationThread.tsx:157` and `useAppStore.auth.test.ts:5`), `npm run build` (ok).
- Browser (CAP-01): start a backend and a frontend against a dedicated database, then `cd backend && TEST_DATABASE_URL=<db> PLAYWRIGHT_BASE_URL=<frontend url> node scripts/testing/run-browser.mjs src/pages/EventDetailPage.withdraw.playwright.spec.ts`. Re-run after the card redesign on a throwaway `spm_test` database (init 001 to 007 applied) with a backend on :8081 and Vite on :5174: 1 passed, covering withdraw, the timeline card, reload persistence and Register again. The database was then dropped and the Compose `spm` database was checked untouched. A fresh database lacks the SPM-37 `event_drafts` table, so the harness's own cleanup step errors after the test has passed; dropping the database made that harmless.
- Mutation spot-check driver: kept in the session scratchpad only (not committed).

## Evidence table

| Test ID | AC | Level | Oracle source | Mutant it kills |
|---|---|---|---|---|
| 01-A | AC1 | FE component | SPEC 01-A (button "Withdraw", enabled, no unavailable text) | button absent/disabled for a future registered event; wrong label |
| 01-B | AC1 | FE component | SPEC 01-B + D6/D11 (the "Event has occurred" badge bullet was removed) | control active for a past event |
| 02-A | AC2 | FE component | SPEC 02-A test data (title, two consequences, two buttons); added: no request on open | event name wrong; request on first click; consequence missing |
| 02-B | AC2 | FE a11y (jsdom) | SPEC 02-B Subtest C subset; initial focus changed to Cancel (D10 B) | M12 trap removed; Escape ignored; focus not moved; unlabeled dialog |
| 03-A | AC3 | BE integration + FE | SPEC 03-A (F1 count 3 to 2; F2 clock T0) | 200 without state change; two requests per click; wrong id; count not released; M4, M10; FE: timeline timestamps swapped (M14) |
| 03-B | AC3 | FE component | SPEC 03-B; backdrop ignored is ASSUMED (F12) | M9a/M9b Cancel or backdrop sends a request |
| 04-A | AC4 | FE component | SPEC 04-A + D11; boundary case DERIVED from A7 | past-event control opens the prompt; boundary read from the end |
| 04-B | AC4 | BE integration | SPEC 04-B + D6/D7 | M5 server-side check missing; status written before the check |
| 04-C | AC4 | BE integration + BE unit + FE unit | SPEC 04-C; Subtest C added (F8) | M1 `>=` to `>`; `>=` to `===`; comparison swapped |
| 05-A | AC5 | FE component | SPEC AC5 literal; Subtest B added | wording differs; generic text; 422 swallowed |
| 05-B | AC5 | BE integration | SPEC AC5 + D6/D7; whole-body equality | different wording; message varies with distance; internals leaked |
| 05-C | AC5 | BE integration + FE page + unit | SPEC 05-C; Subtest C added (SPM-61 D15) | M4 hard delete; wrong value; withdrawn_at from the client; stale client state |
| 05-D | AC5 | BE integration (real DB) | SPEC 05-D; Subtests B and C added | M3 no state guard; check-then-update race; second call overwrites withdrawn_at |
| 05-E | AC5 | BE integration + FE | SPEC 05-E (T0 per F2/F14) | M11 local-time text; M8 UTC day or hour (`formatSgtDateTime`, now the timeline's formatter); M21 "Sept" month; recalculated timestamp |
| 06-A | AC6 | FE component | SPEC 06-A + D9/D13; Subtest B added | M7 success before response; auto-dismiss; dialog lingers |
| 06-B | AC6 | FE component (table) | SPEC 06-B + D9 + F15 (banner has no timestamp) | hard-coded name; wrong name; banner echoes the server message |
| 07-A | cross-cutting | BE integration | SPEC 07-A + D16 (404, never 403); Subtest D and organiser case added | M2 scoping removed; M6 403 instead of 404 |
| 07-B | cross-cutting | BE integration + FE | SPEC 07-B + D16 ("Missing session"); FE case added | bypassing the 401 handling (M13); success after a 401 |
| 08-A | cross-cutting | BE integration (real DB) | SPEC 08-A (B); A is 05-D A | race, deadlock as 500, double release |
| CAP-01 | story goal | BE integration + FE page + Playwright | SPEC CAP-01; display per D17 (the repo's "Available N spot(s)") | spot not released; stale cache; no refetch |
| CARD-01 to 09 | redesign | FE component | Redesign brief (state matrix, timeline, disclosure); boundaries DERIVED from `registrationState` / `hasEventStarted`; CARD-09 regression | badge or entry missing; timestamps swapped (M14); blocked state still shows the button; footer disagrees with `registrationState`; withdrawn card shown for a registered attendee |
| CARD-04 (day count) + `daysUntilLabel` | redesign | FE component + unit | DERIVED: SGT calendar-day difference, as in the SPM-61 heading | hours / 24 instead of calendar days; UTC day instead of SGT day; "0 days" instead of "today" |
| CARD-10 to 12 | redesign | FE component | Redesign brief + backend 05-C derived (the same row is reactivated) | prefill from the account (M16) or no contact prefill (M17); first-time wording on re-register (M18); footer under the open form (M19); card left on the stale prop (M20); optimistic flip on a refused re-registration |

## Results

| Test Case ID | Subtest | file :: test name | Layer | Result | Notes |
|---|---|---|---|---|---|
| 01-A | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-01-A ...` | FE component | Pass | Styling prominence (visual) and the "GET availability flag" step: Not Automated (no flag exists, D11; GET is covered by 03-A and 05-C) |
| 01-B | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-01-B ...` | FE component | Pass | The "Event has occurred" badge bullet was removed (no such badge in this app) |
| 02-A | | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-02-A ...` | FE component | Pass | Modal dimming and "background" bullet: visual, Not Automated |
| 02-B | C subset (jsdom) | `WithdrawalConfirmation.a11y.test.tsx :: WITHDRAW-EVENT-REG-02-B ...` (5 tests) | FE a11y | Pass | Semantics, focus on Cancel, Tab/Shift+Tab trap, Escape + focus return, axe (colour-contrast off) |
| 02-B | A: 375 px layout, truncation | | | Not Automated | Needs a real browser at 375 px (Playwright viewport check) |
| 02-B | B: 200% zoom, 44x44 px targets, 4.5:1 contrast | | | Not Automated | Needs a real browser and a contrast tool |
| 02-B | C: screen-reader announcements | | | Not Automated | Needs NVDA/JAWS/VoiceOver. Visible-focus styling also needs a browser |
| 03-A | backend | `registrations.withdraw.e2e-spec.ts :: WITHDRAW-EVENT-REG-03-A ...` (no body, `{}`) | BE integration | Pass | 200, body, DB row, fresh read, count 3 to 2 |
| 03-A | frontend | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-03-A (frontend)` | FE component | Pass | One POST to `/registrations/REG-9001/withdraw`; timeline Registered 3 Oct 2026, 12:00 and Withdrawn 4 Oct 2026, 12:00, each asserted inside its own entry |
| 03-B | | `WithdrawalConfirmation.test.tsx :: WITHDRAW-EVENT-REG-03-B` (2 tests) | FE component | Pass | The GET / DB / capacity bullets follow from "zero requests" and are covered by that assertion |
| 04-A | | `RegistrationSection.test.tsx :: WITHDRAW-EVENT-REG-04-A` (2 tests) | FE component | Pass | Includes an in-progress boundary case |
| 04-B | | `registrations.withdraw.e2e-spec.ts :: WITHDRAW-EVENT-REG-04-B ...` (2) | BE integration | Pass | 422, state and count unchanged |
| 04-C | A, B, C | `registrations.withdraw.e2e-spec.ts :: ...04-C` (3); `event-start.spec.ts` (3); `registration.test.ts :: ...04-C` (3) | BE integration, BE unit, FE unit | Pass | C added (F8) |
| 05-A | A | `RegistrationSection.test.tsx :: ...05-A (A)` | FE component | Pass | Exact "Event has already occurred" |
| 05-A | B (added) | `RegistrationSection.test.tsx :: ...05-A (B, added)` | FE component | Pass | 422 on confirm |
| 05-B | | `registrations.withdraw.e2e-spec.ts :: ...05-B` (2) | BE integration | Pass | Whole body equality |
| 05-C | A | `registrations.withdraw.e2e-spec.ts :: ...05-C` | BE integration | Pass | Row kept, details intact, others untouched |
| 05-C | C (added) | same file | BE integration | Pass | 400 for server-controlled fields |
| 05-C | frontend | `EventDetailPage.withdraw.test.tsx :: ...05-C / 05-E (frontend)` | FE page | Pass | Written after the implementation (not RED-first); proven by mutation |
| 05-C | reactivation (derived) | `registrations.withdraw.e2e-spec.ts :: ...05-C (derived)` | BE integration | Pass | Re-registering clears `withdrawn_at` |
| 05-D | A | `registrations.withdraw.e2e-spec.ts :: ...05-D ... A` | BE integration (real DB) | Pass | Also 08-A (A) |
| 05-D | B, C (added) | same file | BE integration | Pass | C holds the row lock so the race is deterministic (added after M3 survived) |
| 05-D | frontend (added) | `RegistrationSection.test.tsx :: ...05-D (frontend, added)` | FE component | Pass | Already-withdrawn conflict reloads the registration |
| 05-E | A, B | `registrations.withdraw.e2e-spec.ts :: ...05-E` (2) | BE integration | Pass | |
| 05-E | C: three time zones | same two tests under `TZ=UTC`, `Asia/Singapore`, `America/Los_Angeles` | BE integration | Pass | Identical results |
| 05-E | UI | `registration.test.ts :: ...05-E` (3 day-crossing rows + 12 month rows, for `formatSgtDateTime`); page test | FE unit + page | Pass | The old `formatWithdrawnAt` ("Withdrawn today at") was removed with the redesign; the timeline shows absolute SGT times. The API and DB are exact |
| 06-A | A | `WithdrawalConfirmation.test.tsx :: ...06-A (A)` | FE component | Pass | Fake timers: closed within 500 ms, still visible after 10 s |
| 06-A | B (added) | same file (2 rows) | FE component | Pass | 503 and network failure |
| 06-B | | `WithdrawalConfirmation.test.tsx :: ...06-B` (3 rows) | FE component | Pass | Banner has no timestamp (F15); the status area shows 14:30 |
| 07-A | A, C, D (+ organiser) | `registrations.withdraw.e2e-spec.ts :: ...07-A` (5 tests) | BE integration | Pass | B is 07-B, run once |
| 07-B | backend | `registrations.withdraw.e2e-spec.ts :: ...07-B (= 07-A B)` | BE integration | Pass | 401 "Missing session" |
| 07-B | frontend (added) | `EventDetailPage.withdraw.test.tsx :: ...07-B (frontend)` (2) | FE page | Pass | 401 signs out and redirects; a 500 does not |
| 08-A | A | = 05-D A | | Pass | |
| 08-A | B | `registrations.withdraw.e2e-spec.ts :: ...08-A` | BE integration (real DB) | Pass | 100 parallel: one 200, 99 422, zero 5xx |
| 08-A | response times (2 s, 5 s), k6 / Artillery | | | Not Automated | Not repeatable; no load tool added (D24) |
| CAP-01 | backend | `registrations.withdraw.e2e-spec.ts :: ...CAP-01` | BE integration | Pass | Uses `availableRegistrationSpots` 0 to 1 (D17); no `confirmedCount` was added |
| CAP-01 | frontend | `EventDetailPage.withdraw.test.tsx :: ...CAP-01 (frontend)` | FE page | Pass | |
| CAP-01 | browser | `EventDetailPage.withdraw.playwright.spec.ts` | Playwright | Pass | Re-run after the redesign on a throwaway `spm_test` (see commands); also covers Register again |
| CAP-01 | Register-button, event-list badge, dashboard card, attendee list | | | Not Automated | The Register button is covered; the badge, card and list do not exist in the app (D19). The attendee list is deliberately never built (privacy, F7) |
| CARD-01 to 09 | | `WithdrawnRegistrationStatus.test.tsx` (15 tests); CARD-09 in `RegistrationSection.test.tsx` | FE component | Pass | Written after the implementation (not RED-first); proven by mutation (M14) |
| CARD-10 to 12 | | `RegistrationSection.test.tsx :: ...CARD-10 / 11 / 12` (4 tests) | FE component | Pass | Prefill, re-register flip and a refused re-registration; mutants M16 to M20 |
| `daysUntilLabel` | | `registration.test.ts :: SPM-120 redesign: daysUntilLabel` (7) | FE unit | Pass | The design example is 158 days |

## Review checklist

- [x] Every automated test names its case ID, oracle tier and a mutant it kills.
- [x] Oracles are literals; no production message constant is imported into a test.
- [x] Every sad-path test also asserts that nothing changed.
- [x] Time comes from the injected clock (backend) or a frozen Date (frontend); no real waiting.
- [x] Real PostgreSQL for the backend integration cases; only the HTTP boundary is mocked on the frontend.
- [ ] No `.only`, no skipped assertion, no `if`/loops inside a test: **not fully met**. Two `expectedStatus` ternaries sit in 04-C, and `for` loops over assertions sit in backend 05-C, 05-D (A) and 08-A (B). Not changed in this pass.
- [ ] RED before GREEN for every slice: **not met for the page-level frontend tests** (`EventDetailPage.withdraw.test.tsx`, the Playwright spec) or for the card-redesign tests CARD-01 to 12. They were written after the implementation and checked by mutation instead. The `formatSgtDateTime` month tests and the `daysUntilLabel` tests were written first (the month rows failed on "Sept" before the fix).
- [x] Mutation spot-check run, all mutants restored byte-identical.

## Mutation spot-check

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
| M15 | Look the registration up by id (the original code) instead of event + attendee | **Survives, by design** | The backend reactivates the same row on re-registration (same id), so both lookups behave identically. The pair lookup is harmless but not required |
| M16 | Prefill the name from the account, not the withdrawn record | Killed | CARD-10, 11, 12 |
| M17 | Contact number not prefilled | Killed | CARD-10, 11 |
| M18 | First-time confirmation wording on re-register | Killed | CARD-11 |
| M19 | Footer left visible under the open form | Killed | CARD-10 |
| M20 | Card follows the stale prop, not the store | Killed | CARD-11, 05-D (frontend) |
| M21 | Month names taken from `Intl` ("Sept") | Killed | 05-E month rows (RED before the fix; a real defect in `formatSgtDateTime`) |

## Gap list

- ACs with mostly a happy path: AC2 (the dialog's visual layout), AC6 (banner styling is a `data-variant` attribute, not a real colour check). The story's ACs are AC1 to AC6; the waiting-list AC was removed from the story.
- Check order (D15) is only exercised one violation at a time; the combined ordering is untested.
- D14: another non-withdrawable status cannot exist (the table allows only `Registered` and `Withdrawn`), so that branch has no test and no code beyond the shared 422.
- Coordinator and organiser attempts: an organiser is tested (404); coordinator, venue and tech roles take the same path and are not separately tested.
- 02-B: Subtests A, B and screen-reader checks (need a browser or assistive technology).
- No load tooling (D24); event-list badge and dashboard card do not exist (D19).
- Re-registration after a withdrawal is now covered in the component tests (CARD-10 to 12) and in the browser spec. Real keyboard activation of the details disclosure (Enter and Space) is not automated: jsdom does not simulate it, so the unit test clicks and checks focus.
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

## Amendments for Jira and Confluence (to apply after review)

- **Numbering.** Renumber the Confluence cases and matrix to the six-AC IDs above, and add `CAP-01` if the capacity case is kept. 05-A and 05-B assert the "Event has already occurred" message, which the story lists under AC4; the code labels them AC4.
- **Status wording.** Find and replace the registration status "Confirmed" with "Registered" across the SPM-120 pages ("Withdrawn" stays).
- **01-B.** Delete the "Event has occurred" badge bullet. **04-A, 04-B, 05-A, 05-B:** the single blocked wording is "Event has already occurred" (no "Cannot withdraw - ..." variants); 05-A's "MSG-10" is a mislabel.
- **07-A Subtest B / 07-B.** Expected text "Missing session" (401), replacing "Authentication required" / "Please log in". 07-A A: 404 only, text "Registration not found.".
- **02-B Subtest C.** Focus lands on Cancel; Tab cycles Cancel, Confirm, Cancel; Escape cancels. Replace "Jest" and "jest-axe" with "Vitest" and "vitest-axe". Subtests A, B and screen reader stay manual.
- **05-C / 03-A / 05-E.** Date 4 Oct 2026 (not 29 Sep); count 3 to 2; remove "success message should include timestamp"; compare the UI to the same minute, and the API and DB within 1 second; the reload step asserts `withdrawn_at` unchanged. The UI shows a withdrawn card whose timeline lists Registered and Withdrawn with absolute Singapore times ("D Mon YYYY, HH:mm"); there is no relative "Withdrawn today at" line.
- **06-B.** Remove the timestamp checks from the banner; the template wording is the chosen text "Your withdrawal from {eventName} has been processed." (record it in Jira and Confluence as chosen wording, it is not from the AC).
- **08-A.** 3-parallel is 05-D A, run once. The fixture has no waiting registration (the case's capacity 3 with 1 waiting predates the removal of the waiting list); the test uses the default capacity of 50 and does not assert capacity; response-time limits and the load file are not automated.
