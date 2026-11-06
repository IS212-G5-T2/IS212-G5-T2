# SPM-155 Request Cancellation of My Event (Organiser): test results

Implementation record for cycle-01 (cycle folder `ai/runtime/test-cycles/SPM-155/cycle-01/`, ignored by Git). Test source: `docs/specs/SPM-155-test-cases.md` v1.0 (30 cases). The Confluence matrix page 35848252 ("Request Cancellation of My Event (Organiser) Matrix", space SP) was fetched read-only on 31 Oct 2026 and its 30 ids saved to `confluence-matrix-ids.txt` for G1. No review gate has run; this is the implementation agent's evidence, not an approval. All runs below are on the final tree, 31 Oct 2026, against the disposable database `spm_spm155` (dropped afterwards) except where a row says otherwise. The 7 supporting ids and conflicts SC-155-001 to 007 were approved by the user on 31 Oct 2026.

## Evidence table

| Check | Command | Result | Evidence file |
|---|---|---|---|
| Backend unit | `cd backend && npx vitest run` | 97 files, 2,201 passed (the dev merges added tests; no backend SPM-155 file changed in this round) | `backend-unit-run.log` |
| Frontend unit | `cd frontend && npx vitest run` | 154 files, 2,316 passed, 1 skipped, 1 todo | `frontend-unit-run-final.log` |
| Scope suites incl. e2e in UTC, Asia/Singapore, America/Los_Angeles | `run-cycle.mjs --steps run` | 354 passed, 0 failed, 0 skipped (G7 PASS; 30 fewer than before because the dots test file left the scope) | `test-run.log`, `tz-runs/`, `run-cycle-stdout-7.log` |
| Backend e2e, new flow | `npx vitest run --config ./vitest.config.e2e.ts test/cancellation-requests.e2e-spec.ts` | 74 passed, 0 failed (rerun on a fresh disposable database; the backend SPM-155 files are unchanged) | `e2e-spm155-final.log` |
| Concurrency 01-F and 03-E, 20 runs in a row | the two tests selected with `-t`, 20 consecutive runs, with the race gate (`fireTogether`) | 20 of 20 runs passed (2 tests each, 40 test passes, 0 failures) | `e2e-concurrency-20x.log` |
| Finished stories (SPM-136 cancel and guard, change requests, change-request review, waitlist) | `vitest run --config ./vitest.config.e2e.ts` on those 5 files | 5 files, 167 passed, 1 skipped (existing skip), 0 failed | `e2e-finished-stories.log` |
| Whole backend e2e suite | `npm run test:e2e` | 41 files: 38 passed, 3 failed; 957 passed, 3 failed, 1 skipped, 1 todo. The 3 failures are not SPM-155: two need a `psql` client that this machine does not have (EVENT-UPDATE-08-SEC-1 and 07-SEC-1, "spawnSync psql ENOENT"), and REQ-CLAR-SUP-58 timed out at 30 s under full-suite load and passed on its own (clarifications file alone: 16 of 16) | `e2e-full.log`, `e2e-clarifications-rerun.log` |
| Backend lint | `cd backend && npm run lint` | 0 warnings or errors in changed files (two existing warnings elsewhere) | `backend-lint.log` |
| Backend type check | `npx tsc --noEmit -p tsconfig.json` | no error in changed source files; the only error in the new e2e file is the `supertest/types` import, which every existing e2e spec has too | `backend-tsc.log` |
| Backend and frontend build | `npm run build` | both pass | `frontend-build.log` |
| Frontend lint | `cd frontend && npm run lint` | 0 errors, 13 warnings, none in changed files | `frontend-lint.log` |
| Changed-code coverage | `run-cycle.mjs --steps coverage` (unit and e2e runs merged) | 100% statements, branches, functions and lines over the 10 scope source files; the controller's 6 route lines are covered by the e2e run (COVERED-BY-E2E). Shared edited files (`cancel-event.service.ts`, `CancelEventDialog.tsx`, `EventCard.tsx`, `EventListPage.tsx`) are 100% in the full unit runs | `gates/G5.json`, `backend-cov.log`, `frontend-cov.log` |
| Workflow gates | `run-cycle.mjs` (steps ids, spec, determinism, run, coverage), then `reconcile-mutation.mjs`, `check-records.mjs`, `report.mjs` | G1 PASS (Confluence matrix 35848252: 30 ids, all in the registry; 40 registry ids, 0 invented, 0 orphans, 0 pending approvals); G2 PASS (10 conflicts decided); G3 PASS (196 records, 196 passed, 0 failed, 196 with kill links); G4 PASS; G5 PASS (100% on the 11 scope source files, which now include `CancellationRequestDetails.tsx` and no longer `ConfirmedArrangementsPanel.tsx`); G6 PASS (170 killed, 1 equivalent argued, 0 survived, of 171); G7 PASS (354). Overall GREEN | `gates/`, `metrics.md`, `gap-list.md` |

## Results table (30 matrix cases)

Result is Pass when every automated test of the case passed on the final tree (unit, frontend and e2e).

| Test case | AC | Automated at | Result | Not automated |
|---|---|---|---|---|
| CANCEL-REQUEST-01-A | AC1 | backend unit, backend e2e, frontend | Pass | Steps 1 to 2 (sign-in and opening the page in a browser): the page wiring is a component test, no Playwright run |
| CANCEL-REQUEST-01-B | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-01-C | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-01-D | AC1 | backend unit, backend e2e | Pass | None |
| CANCEL-REQUEST-01-E | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-01-F | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-01-G | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-01-H | AC1 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-02-A | AC2 | backend unit, backend e2e, frontend | Pass | Step 2 (a browser view of the list): covered by the EventListPage component test and the API |
| CANCEL-REQUEST-02-B | AC2 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-02-C | AC2 | backend e2e | Pass | None |
| CANCEL-REQUEST-02-D | AC2 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-02-E | AC2 | backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-02-F | AC2 | backend e2e, frontend | Pass | Step 3 (new tab, logout and login): covered by a fresh login in the e2e test and a remount in the component test |
| CANCEL-REQUEST-03-A | AC3 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-03-B | AC3 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-03-C | AC3 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-03-D | AC3 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-03-E | AC3 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-03-F | AC3 | backend unit, backend e2e, frontend | Pass | Step 1 (SPM-153 marks the event Completed): no such route exists, the state is written with SQL (SC-155-007) |
| CANCEL-REQUEST-03-G | AC3 | backend e2e | Pass | None |
| CANCEL-REQUEST-04-A | AC4 | backend e2e, frontend | Pass | The planning page view: not asserted; the organiser list, the coordinator queue and the event read are |
| CANCEL-REQUEST-04-B | AC4 | backend e2e | Pass | None |
| CANCEL-REQUEST-04-C | AC4 | backend unit, backend e2e, frontend | Pass | None |
| CANCEL-REQUEST-04-D | AC4 | backend e2e | Pass | None |
| CANCEL-REQUEST-04-E | AC4 | backend unit, backend e2e | Pass | None |
| CANCEL-REQUEST-05-A | AC5 | backend unit, backend e2e | Pass | None |
| CANCEL-REQUEST-05-B | AC5 | backend e2e | Pass | None |
| CANCEL-REQUEST-05-C | AC5 | backend e2e | Pass | None |
| CANCEL-REQUEST-05-D | AC5 | backend e2e | Pass | None |

Fail: 0. Blocked: 0. Not Automated: no whole case; the partial gaps are in the last column. Supporting ids (not matrix rows). Approved by the user 31 Oct 2026: 01-SUP-BODY, 01-SUP-ORDER, 02-SUP-CLOSED, 03-SUP-INPUT, 03-SUP-ORDER, 04-SUP-ENTRY, 04-SUP-DIALOG. Added with the UI commit 02e56aa3 and approved by the user on 1 Nov 2026: 02-SUP-LAYOUT, 03-SUP-LAYOUT, 04-SUP-TIMELINE (oracle DERIVED from the commit message; SC-155-010). The former 04-SUP-DOTS is withdrawn: the arrangement dots are a UI-only edit of the arrangements panel (SPM-135 area), not an SPM-155 acceptance criterion.

## Gap list

1. No browser (Playwright) run: sign-in and page navigation steps of 01-A, 02-A and 02-F are covered by component tests and the API only. Layout, contrast and zoom are manual checks (frontend `AGENTS.md`).
2. Two failures in the whole-suite e2e run belong to other stories and this machine: the missing `psql` client (EVENT-UPDATE-07-SEC-1 and 08-SEC-1) and a one-off 30 s timeout of REQ-CLAR-SUP-58 that passed on rerun.
3. 03-F and 03-G set the Completed state with SQL because SPM-153 has no route (SC-155-007, approved until SPM-153 lands).
4. The Confluence matrix page's "Related Code Module" column named planned paths that do not exist in the repository; on 31 Oct 2026, by the user's decision, it was rewritten with the real paths (the page's edit log records it). The five per-AC pages (CANCEL-REQUEST-01 to 05) have no such column, only a "Test file(s)" row with planned test paths, and were not changed.

## Document-defect resolutions

| Case | Defect in the document | Resolution |
|---|---|---|
| 01-B A, 04-D A | Uses EVT-1102 (Under Review); Under Review is retired and the `events` table cannot hold it | A Submitted clone assigned to COO-01 replaces it (derived from Gate-1 D5, SC-155-001). Under Review is refused 409 MSG-CR-02, proved on a faked row in the service unit spec |
| 01-D A | Expects a Rejected event to accept a request (AC literal wording) | 409 `EVENT_NOT_CANCELLABLE` (D5, SC-155-002); the AC wording differs and the Jira text needs updating |
| 01-D B | Draft refused with 409 or 404 | The caller's own Draft (in `event_drafts`) is 409; another user's draft id and an unknown id are 404 (SC-155-005) |
| 01-E, 02-D | 403 or 404 for a non-owner | 403 `FORBIDDEN` after the 404 existence check on create and read (SC-155-006) |
| 01-H C | 400 or 422 for a reason over 500 | 422 `INVALID_REASON`, approved by the user (SC-155-008) |
| 03-C | Prompt: an unknown request id is 404 | 403 `FORBIDDEN`, identical to another user's real request, so ids cannot be probed (user decision 31 Oct 2026, SC-155-009) |
| 03-F, 03-G | Final status of the pending request left unstated (S10, S11); SPM-153 route absent | Stored `pending`, shown `closed` with "The event is already completed." or "The event is already cancelled." (D4, SC-155-004); Completed is written with SQL (SC-155-007) |
| 04-B | Waitlisted ATT-04 expected to read like the others | The waiting-list entry is Cancelled with no reason and its notice carries the SPM-138 suffix "Your waitlist place is cancelled."; the fixture opens the waiting list as the SPM-136 e2e does |
| 03-E, 05-C | Notification counts imply six recipients | Six recipients (ORG-01, COO-01, ATT-01 to ATT-04) only on acceptance; none on creation or decline |
| All | MSG-CR-xx are placeholders | MSG-CR-01 to 06 use the document text; INVALID_REASON, INVALID_DECISION, INVALID_REQUEST, and EVENT_NOT_FOUND wording is ASSUMED |

## Mutation results

Runner: `node scripts/mutation/run.mjs --mutants spm155.mutants.mjs` (backend, with `DATABASE_URL` so the e2e mappings run) and `node scripts/testing/mutation/run.mjs --mutants spm155.mutants.mjs` (frontend). Each mutates a scratch copy, runs the unmutated baselines first (green) and proves the original files untouched. The backend runner gained one additive capability for this story: a mutant may also edit further files (`also`), used to remove a migration index together with the service guards. The e2e file rebuilds `event_cancellation_requests` from the migration under test only when `SPM155_REAPPLY_MIGRATION=1` (set by the mutation suite), so a normal run never drops anything.

| Component | Defined | Killed | Survived | Misapplied | Not run | Evidence |
|---|---|---|---|---|---|---|
| Backend (unit and e2e) | 81 | 81 | 0 | 0 | 0 | `mutation/backend-cancellation-requests.log` |
| Frontend | 90 | 89 | 0 | 0 | 0 (1 equivalent, FM95) | `mutation/frontend-cancellation-requests.log` |

G6 reconciliation: 170 killed, 1 equivalent (FM95), 0 survived, score 100 (171 mutants: backend 81, frontend 90). Per-test kills are measured, not assumed: `--measure-kills` ran every test of both suites against every mutant (`mutation/*.kills.json`), every mutant's `testMappings` names only tests observed failing under it, every one of the 196 tests has at least one measured killer, and the `// Kills:` comment above each test lists exactly the mutants that failed it.

SPM-197 correction (6 Nov 2026): FM95 was removed because its edit is identical to FM107 and the line-226 test (`a status history reply that is not a list leaves only the Cancelled step`) kills it, so it was never equivalent. FM56 to FM58 were re-anchored on the refactored timeline code. Frontend now: 92 mutants, 92 killed, 0 equivalent, 0 survived, 0 misapplied.

Concurrency guards (correction round 1). Several layers guard each race, so a mutant that removes one layer leaves the race test green and is killed elsewhere:

| Mutant | What is removed | Observed |
|---|---|---|
| M4d | uniqueness of the `pending_key` index (migration, database rebuilt from it) | the parallel create test stays green (the event lock and the pending check serialise); killed by "the database itself refuses a second pending row" |
| M4e | the index, the event lock on create and the pending check | killed by the parallel create test 01-F (five requests) |
| M4h | the event lock on create and the mapping of the unique violation | killed by the parallel create test 01-F (race losers answer 500); it first survived while the race depended on timing, which is why the test now uses the race gate |
| M4f, M4g | the event lock on create (and the pending check) | the parallel test stays green (the index and its 409 mapping catch the race); killed by the unit test "create locks the event row, then checks for a pending request, then inserts" |
| M7d | the event lock, the request lock and the compare-and-set on a decision | killed by the parallel decision test 03-E (3 accepts, 3 declines) |
| M7e, M7f | the event lock or the request lock, with the compare-and-set | the parallel test stays green (the other row lock serialises); killed by the unit test "decide locks the event, then the request, inside one transaction" |
| M7a, M7b | the compare-and-set alone, or its zero-row check | the parallel test stays green (both locks hold); killed by the unit test "a lost compare-and-set is refused" |

M4h, M7d and M4e were run five more times each on the scratch copy: killed every time.

The race gate (`fireTogether` in the e2e file, DX-SPM155-02 and 03): a second connection holds an ACCESS EXCLUSIVE lock on the requests table, the five or six HTTP requests are started, and the test waits (bounded poll of `pg_locks`) until every one is blocked, then releases them together, so every request is inside its transaction when the race starts.

## Run commands

```
cd backend && npx vitest run src/events/cancellation-requests src/events/cancel
cd backend && DATABASE_URL=... TEST_DATABASE_URL=... npm run test:e2e -- test/cancellation-requests.e2e-spec.ts
cd backend && DATABASE_URL=... TEST_DATABASE_URL=... node scripts/mutation/run.mjs --mutants spm155.mutants.mjs
cd frontend && npx vitest run src/features/events
cd frontend && node scripts/testing/mutation/run.mjs --mutants spm155.mutants.mjs
node ai/scripts/test-workflow/run-cycle.mjs --scope docs/test-cases/workflow/scopes/SPM-155.json --cycle ai/runtime/test-cycles/SPM-155/cycle-01
```

## Refresh for commit 02e56aa3 (UI layout, timeline, Coordinator list label, dots)

- The commit changed the event page layout and panels, the Coordinator list label, the status timeline rule (only the stages reached; a cancelled event shows the stages up to the one it was cancelled from, read from its status history, then Cancelled) and added colour dots to the confirmed arrangements. Dev was merged twice before it.
- New SPM-155 tests (all DERIVED from the commit message, SC-155-010): `EventDetailPage.cancellationLayout.test.tsx` (timeline reached-only and cancelled-from rules, the history row choice, a failed history read, a read only for cancelled events, the timeline after accepting, the panels' place at the end of the page), `CancellationPanels.layout.test.tsx` (red bottom-right button, box only when there is something to show, collapsed Earlier Requests dropdown, Reason label in both panels) and `ConfirmedArrangementsPanel.dots.test.tsx` (the dot tone of Venue, Equipment and Safety Officer Approval). The two Coordinator list cases the commit added to `EventListPage.cancellationRequest.test.tsx` (02-A and 02-B) are registered with kill links.
- Three tests of other stories were edited by the commit to the new timeline rule (SPM-94 TRACK-EVENT-STATUS-01-B in `EventDetailPage.status.test.tsx`, SPM-135 CONFIRM-EVENT-04-A in `EventDetailPage.confirm.test.tsx`, SPM-136 CANCEL-EVENT-03-C timeline in `EventDetailPage.cancel.test.tsx`). Their ids belong to those stories' registries, so they cannot be SPM-155 records; each now carries a `// Kills (SPM-155 mutants ...)` line from the measurement (FM56 and FM57 for the first two, FM59 and FM63 for the third, FM55 for the last two), and the new SPM-155 timeline tests cover the same rule with their own ids.
- 37 new frontend mutants (FM56 to FM93: timeline stages and cancelled-from path, history row choice and refresh, Coordinator list label and filter, Reason label, button colour, alignment and place, empty box, dropdown, titles, panel positions, dot tones, worst-of rule, trim and case, titles, aria-hidden). Four older mutants (FM18, FM18b, FM35, FM40, FM42, FM44) were re-aimed because the commit moved or reshaped their code; FM33 and FM35 now replace the element with `null` (an empty expression is a syntax error).
- Measured: 94 of 94 frontend mutants killed (`mutation/frontend-cancellation-requests.kills.json`), no survivors; every new test has a measured killer; every mapping was proven failing. Backend 81 of 81 killed on a fresh disposable database; SPM-155 e2e 74 passed; 01-F and 03-E 20 of 20; finished-story e2e 167 passed (1 existing skip).
- Scope: `ConfirmedArrangementsPanel.tsx` joined the scope sources (with its SPM-135 test file in the scope so its loading and error branches are measured); `EventDetailPage.tsx` stays out because the whole file belongs to many stories, so the `timelineStages` and status-history lines are covered by the new tests and measured by the mutants, not by the G5 percentage.

### Correction round after the three re-reviews

- Equipment dots: `requested` and `checking` are now yellow (with `reserved`, `pending`, `awaiting check`, `changes requested`); `released` and `unavailable` stay red. Dots tests gained Requested, Checking, mixed and Unavailable cases; new mutants FM96 (requested red), FM97 (checking red), FM98 (unavailable yellow), and FM87 re-aimed.
- Timeline origin: `cancelledFrom` is cleared at the top of the effect, so a previous event's origin never shows while the next event's history loads or when it cannot be read. New test "moving to another cancelled event shows only cancelled until its own history arrives"; new mutant FM94 (no reset). FM65 (the catch handler setting null) was retired: with the reset at the top it is redundant, and the catch is now a plain no-op.
- History reply guard: `Array.isArray(entries)` before `entries.find`. A reply that is not a list is a new case in the no-usable-history test and falls back to the bare Cancelled step. Mutant FM95 (guard removed) is argued equivalent: without the guard the TypeError is raised inside the `then`, the `catch` swallows it and the origin stays at the value cleared at the top, so no screen or request differs. It is the only equivalent mutant; it has no killing test (measured), and G6 accepts it as equivalent.
- Left as they are, as instructed: the timeline shows only "Cancelled" while the history loads or for a user who cannot read it (a deliberate consequence of the reached-only rule); a Completed event keeps the pre-existing Cancelled stage handling; the status history is fetched twice when the planning history panel is also shown; the status badge shows `reserved` in green while the dots show it yellow (the user's request).
- Measured again after the fixes: 98 frontend mutants, 97 killed, 1 equivalent, 0 survived, 0 misapplied, 0 suite errors (measuring run and verdict run; two verdict rows, FM78 and FM95, first reported "no test selected" under load and were rerun alone: FM78 killed, FM95 equivalent). Backend 81 of 81 killed; SPM-155 e2e 74 passed; 01-F and 03-E 20 of 20; finished-story e2e 167 passed (1 existing skip); backend unit 97 files and 2,192 passed.

### Low-priority review items 1 to 6 and the dots decision (1 Nov 2026)

- Dots are not SPM-155 (user decision of 1 Nov 2026). The arrangement dots are a UI-only check of the arrangements panel (SPM-135 area), not an SPM-155 acceptance criterion. Removed from SPM-155: the 04-SUP-DOTS record and registry row, the dot mutants (FM84 to FM93, FM96 to FM98, plus the ones written for items 2 and 3 in this round: FM99, FM100, FM101, FM107), and `ConfirmedArrangementsPanel.tsx` with its two test files from the scope. `ConfirmedArrangementsPanel.dots.test.tsx` stays in the frontend suite as a plain UI test with no SPM-155 id, oracle tier or `// Kills:` line, outside the SPM-155 matrix (SC-155-010 says so). It still verifies items 2 and 3 below.
- Item 1, vertical gaps: the request panel and the decision panel `<section>` carry `mt-6 mb-6`. Two tests assert both classes (`CancellationPanels.layout.test.tsx`, 02-SUP-LAYOUT and 03-SUP-LAYOUT); mutants FM102 and FM104 remove the top gap, FM103 and FM105 the bottom gap.
- Item 2, an empty Venue or Equipment group reads "None requested" under its heading and its dot stays red; its dot title reads "None requested" too (dots test file, not an SPM-155 test).
- Item 3, the red dot is titled with the item's own status word (Released, Unavailable, Rejected, an unknown word as written); the title starts with a capital letter and keeps the rest of the server text ("released" gives "Released"). An empty group, or a blank safety state, is titled "None requested", the same words the empty group shows under its heading. Green and yellow titles are unchanged (dots test file, not an SPM-155 test).
- Item 4, `CancellationRequestDetails.tsx` (same folder) now holds the details block (requested, closed note, decided, reason) that both panels showed; the Coordinator panel passes `showRequester`. No behaviour change: the existing panel tests pass unchanged. The mis-indented JSX in `CancellationRequestPanel` is fixed. Because the block moved, nine existing mutants (FM18, FM18b, FM19, FM23, FM23b, FM26, FM71, FM72, FM73) are re-pointed at the shared file and keep their Organiser or Coordinator side through `showRequester`; no new mutant.
- Item 5, `timelineStages` no longer adds a second Cancelled step when the history row's origin is Cancelled: the flow is returned up to, not including, a second Cancelled. New test "a cancellation row whose origin is Cancelled shows Cancelled once" (04-SUP-TIMELINE); mutant FM106 (`Math.min(reached + 1, cancelledAt)` replaced by `reached + 1`); FM58 and FM59 re-aimed at the new expression.
- Item 6, recorded and not changed: a viewer of a cancelled event who is not the owning Organiser or the assigned Coordinator sees only the "Cancelled" step in the timeline. The timeline reads the origin from `GET /api/events/:id/status-history`, which only the assigned Coordinator and the owning Organiser may read (SPM-148 access rule, `status.controller.ts`); for everyone else the call is refused and the timeline falls back to the bare Cancelled step. This follows from the history endpoint's access rule and is the intended fallback.

Verification of this round (1 Nov 2026). Frontend mutation, two runs on the tree of that moment: a measuring run (`mutation/frontend-cancellation-requests.measure.log`, `--measure-kills`) and the verdict run that proves every mapped test fails under its mutant (`mutation/frontend-cancellation-requests.log`): 90 defined, 89 killed, 1 equivalent (FM95), 0 survived, 0 misapplied, 0 suite errors in both. The per-test lists of the measuring run were not used on their own. `// Kills:` lines and records use the mappings the verdict run proved, plus the previously established pairs that the measuring run (or, for the nine re-pointed mutants and FM58 and FM59, a targeted measuring run of those 11 mutants) confirmed again; the result is `mutation/frontend-cancellation-requests.kills.json`. Backend mutation was rerun by the cycle on a fresh disposable database: 81 of 81 killed. Frontend lint: 0 errors, 13 warnings (none in changed files). Frontend and backend builds pass. No review gate ran.

### Decisions of 1 Nov 2026 and last fixes

- Confirmed by the user and recorded in SC-155-010: (a) the visible change to the arrangements panel ("None requested" for an empty Venue or Equipment group, red dot titles showing the item's own status) is intended; (b) a cancelled event shows only the Cancelled step to a viewer who cannot read its status history (item 6 above) is acceptable. SC-155-004 (the closed-note lines) and SC-155-006 (the new error wording) are confirmed again by the user on 1 Nov 2026. SC-155-007 (Completed set with SQL until SPM-153 lands) stays open as it was.
- Dot wording: the empty-group dot title is "None requested" (it was "Not requested"); a red dot is titled with the item's own status, first letter capitalised and the rest of the server text unchanged. The dots test file covers it. The dots have no mutants in the SPM-155 set (user decision); the new wording was checked once with seven throwaway mutants, outside the SPM-155 set (no capital, lower-casing of the rest, "Not requested" title, generic red title, empty title for a blank state, no text for an empty Venue group, none for an empty Equipment group): 7 of 7 killed (`mutation/dots-ui-throwaway.log`).
- Odd history data: when a history row's origin is Cancelled, `timelineStages` returns the flow up to the Cancelled step and no stage after it (test "a cancellation row whose origin is Cancelled shows Cancelled once", mutant FM106); an origin that is not on the timeline (Rejected, Completed, anything else) gives Cancelled alone.
- FM95 is equivalent and not a killer: its mapping stays only because the runner requires one for every mutant, the mapped test is not counted as a killer, and FM95 no longer appears in the kills field of the "%s shows only cancelled" record or in any `// Kills:` line.
- Stale comment about the dots removed from the mutants file header. Registry row 02-SUP-LAYOUT corrected: the request panel follows Clarification & Amendments and only the decision panel is last.
- The raw measuring file `frontend-cancellation-requests.kills.raw.json` was deleted; nothing here relies on it.
