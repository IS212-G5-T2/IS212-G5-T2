# SPM-155 Request Cancellation of My Event (Organiser): test results

Implementation record for cycle-01 (cycle folder `ai/runtime/test-cycles/SPM-155/cycle-01/`, ignored by Git). Test source: `docs/specs/SPM-155-test-cases.md` v1.0 (30 cases). The Confluence matrix page 35848252 ("Request Cancellation of My Event (Organiser) Matrix", space SP) was fetched read-only on 31 Oct 2026 and its 30 ids saved to `confluence-matrix-ids.txt` for G1. No review gate has run; this is the implementation agent's evidence, not an approval. All runs below are on the final tree, 31 Oct 2026, against the disposable database `spm_spm155` (dropped afterwards) except where a row says otherwise. The 7 supporting ids and conflicts SC-155-001 to 007 were approved by the user on 31 Oct 2026.

## Evidence table

| Check | Command | Result | Evidence file |
|---|---|---|---|
| Backend unit | `cd backend && npx vitest run` | 94 files, 2,116 passed (baseline 91 files / 1,987) | `backend-unit-run.log` |
| Frontend unit | `cd frontend && npx vitest run` | 141 files, 2,110 passed, 1 skipped, 1 todo (baseline 132 files / 2,011) | `frontend-unit-run-final.log` |
| Scope suites incl. e2e in UTC, Asia/Singapore, America/Los_Angeles | `run-cycle.mjs --steps run` | 322 passed, 0 failed, 0 skipped (G7 PASS) | `test-run.log`, `tz-runs/`, `run-cycle-stdout-5.log` |
| Backend e2e, new flow | `npx vitest run --config ./vitest.config.e2e.ts test/cancellation-requests.e2e-spec.ts` | 74 passed, 0 failed | `e2e-spm155-final.log` |
| Concurrency 01-F and 03-E, 20 runs in a row | the two tests selected with `-t`, 20 consecutive runs, with the race gate (`fireTogether`) | 20 of 20 runs passed (2 tests each, 40 test passes, 0 failures) | `e2e-concurrency-20x.log` |
| Finished stories (SPM-136 cancel and guard, change requests, change-request review, waitlist) | `vitest run --config ./vitest.config.e2e.ts` on those 5 files | 5 files, 167 passed, 1 skipped (existing skip), 0 failed | `e2e-finished-stories.log` |
| Whole backend e2e suite | `npm run test:e2e` | 41 files: 38 passed, 3 failed; 957 passed, 3 failed, 1 skipped, 1 todo. The 3 failures are not SPM-155: two need a `psql` client that this machine does not have (EVENT-UPDATE-08-SEC-1 and 07-SEC-1, "spawnSync psql ENOENT"), and REQ-CLAR-SUP-58 timed out at 30 s under full-suite load and passed on its own (clarifications file alone: 16 of 16) | `e2e-full.log`, `e2e-clarifications-rerun.log` |
| Backend lint | `cd backend && npm run lint` | 0 warnings or errors in changed files (two existing warnings elsewhere) | `backend-lint.log` |
| Backend type check | `npx tsc --noEmit -p tsconfig.json` | no error in changed source files; the only error in the new e2e file is the `supertest/types` import, which every existing e2e spec has too | `backend-tsc.log` |
| Backend and frontend build | `npm run build` | both pass | `frontend-build.log` |
| Frontend lint | `cd frontend && npm run lint` | 0 errors, 13 warnings, none in changed files | `frontend-lint.log` |
| Changed-code coverage | `run-cycle.mjs --steps coverage` (unit and e2e runs merged) | 100% statements, branches, functions and lines over the 10 scope source files; the controller's 6 route lines are covered by the e2e run (COVERED-BY-E2E). Shared edited files (`cancel-event.service.ts`, `CancelEventDialog.tsx`, `EventCard.tsx`, `EventListPage.tsx`) are 100% in the full unit runs | `gates/G5.json`, `backend-cov.log`, `frontend-cov.log` |
| Workflow gates | `run-cycle.mjs` | G1 PASS (Confluence matrix 35848252: 30 ids, all in the registry; 37 registry ids, 0 invented, 0 orphans, 0 pending approvals); G2 PASS (9 conflicts decided); G3 PASS (174 records, 174 passed, 0 failed, 174 with kill links); G4 PASS; G5 PASS; G6 PASS (138 of 138 mutants killed); G7 PASS. Overall GREEN | `gates/`, `metrics.md`, `gap-list.md` |

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

Fail: 0. Blocked: 0. Not Automated: no whole case; the partial gaps are in the last column. Supporting ids (not matrix rows, approved by the user 31 Oct 2026): 01-SUP-BODY, 01-SUP-ORDER, 02-SUP-CLOSED, 03-SUP-INPUT, 03-SUP-ORDER, 04-SUP-ENTRY, 04-SUP-DIALOG.

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
| Frontend | 57 | 57 | 0 | 0 | 0 | `mutation/frontend-cancellation-requests.log` |

G6 reconciliation: 138 of 138 killed, score 100, 0 equivalent. Per-test kills are measured, not assumed: `--measure-kills` ran every test of both suites against every mutant (`mutation/*.kills.json`), every mutant's `testMappings` names only tests observed failing under it, every one of the 174 tests has at least one measured killer, and the `// Kills:` comment above each test lists exactly the mutants that failed it.

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
