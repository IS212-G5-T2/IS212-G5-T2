# AI Usage Log

Record current AI-assisted work in this file. Archive entries under
[`docs/archived/`](docs/archived/README.md) when the user explicitly requests
archival or asks the agent to create a pull request.

Add entries under one date per day, using this format:

```md
## YYYY-MM-DD

- <user or general> - <type> - <Jira ticket or branch name> - <title>: <concise result>
```
Where user is the user's github username.

## 2026-10-13

- swr - implementation - SPM-50 - Remove operating schedule data: Dropped operating days/start/end fields from the venue API, database, types, and displays; added the upgrade migration and regression coverage.

## 2026-10-14


- tanwz - test - SPM-135 - Test case evaluation gaps (branch chore/Improve-Test-Case-Evaluation-Workflow): Settled the 422 vs 409 question for CONFIRM-EVENT-06 (the Confluence expected result of 422 is the oracle; the "HTTP 409" in the Confluence notes is the already-Confirmed case, recorded in the results doc and not yet corrected in Confluence), documented why the lock-wait race test polls (bounded, asserts the wait), and mapped the internal ID families to the acceptance criteria they support. Added `backend/test/events-checklist-actions.e2e-spec.ts` (10 tests) with mutants CHA1 to CHA7, an e2e coverage config and `npm run test:cov:e2e` so `status.service.ts` is measured (97.43% lines from the real-database suites), and frontend tests for the page refresh, load failure, confirm callback, re-request and feedback untick paths (SPM-135 frontend files now 100% on lines and functions; `PlanningInformationPage.tsx` branches 90.08%). Corrected the mutation evidence: M11 is equivalent (the earlier "killed" claim could not be reproduced), full backend run 89 mutants: 82 killed, 7 equivalent, 0 survived. Checks: frontend 1017 passed, backend unit 1231, backend events e2e 129, full e2e 357 passed and 11 failed in dev's `drafts.e2e-spec.ts` (fails the same on dev). Not verified in a browser; Test Code Review not re-run. Nothing committed.

- tanwz - implementation - chore/Improve-Test-Case-Evaluation-Workflow - Test workflow controls and metrics: Added `ai/docs/test-workflow.md` (rules, gap-to-control map, ID registry, per-test records, tier matrix, gates G1 to G7, metrics report) and dependency-free tooling in `ai/scripts/test-workflow/` (ID, spec and tier, record, determinism, coverage-scope and mutation-reconciliation gates, a cycle runner and the metrics report, with 56 node tests). Added the records for SPM-135 in `docs/test-cases/workflow/` (scope, 70-row ID registry, spec-conflict register, tier matrix, determinism exceptions, coverage line statuses, 198 test records) and wired the doc into AGENTS.md, the contract, the Orchestrator, Test Code Reviewer, Implementation and the two test skills. Baseline cycle 1 for SPM-135: G1, G2, G4, G5, G6, G7 pass; G3 blocks (104 of 198 tests have no registered ID, and the tier, oracle class and explained fields are not filled in); overall RED. Not reviewed by the Requirement or Code Quality reviewers; nothing committed.

## 2026-10-15

- kishorek888 - implementation - SPM-118 - Update Equipment Records: Added Technical Support editing with transactional audit history, migration/init updates, and traceable UI/service/HTTP tests; iteration 3 added precise backend persistence, validation, authorization, and rollback evidence. Iteration 4 verified the newly created Confluence matrix and procedures, aligned all 34 repository IDs to exact PRIMARY matrix entries, added targeted frontend mutants for quantity boundaries, API validation rendering, selection/load failures, navigation, save failure, and confirmation dismissal, and directly mapped the AC3 backend umbrella case. Scoped cycle 11: G1–G7 pass; 38/38 mutants killed; 122 tests pass across three time zones; isolated PostgreSQL HTTP suite passed. Overall AMBER remains for three SPM-119 OPEN coverage lines and the resulting missed 100% coverage floor. Confluence's execution table remains Not Executed; the repository cycle is separate evidence.

- kishorek888 - implementation - SPM-118 - Align test IDs to new Confluence matrix (cycle 13): Confluence matrix 27295823 was restructured into 14 PRIMARY cases EQUIP-UPDATE-01..06-{A|B|C} backed by six individual case pages (27230285, 27525142, 27525158, 27492357, 27492373, 27230301). Renamed every leading SPM118-* token in the seven scoped test files and both mutant definition files to the owning EQUIP-UPDATE id (75 replacements), using each case page's "Automation mapping" Remarks as the authoritative source. Rewrote the SPM-118 section of the ID registry (14 PRIMARY rows), the tier matrix, the records CSV (preserving every tier/oracle/explained/assumption judgment field under file::title), and the scope note; moved scope titleMatch from "SPM118-" to "EQUIP-UPDATE-". No application code, migration, build config, or CI changed. Cycle 13 against the fresh spm118_review_c13 PostgreSQL database: G1–G7 all PASS; 122/122 tests in UTC / Asia/Singapore / America/Los_Angeles; 38/38 mutants killed (backend 22, frontend 16); overall AMBER for the same three SPM-119 availability lines (service.ts 230, 237, 258) and resulting floor miss accepted in cycle 12. Confluence actual-result tables on all six case pages were updated to cite cycle 13 evidence. CQ118-01 (runtime role check hard-coded while the migration grants Equipment:update RBAC) is carried over as a non-blocking advisory. Nothing committed, pushed, or transitioned in Jira.
