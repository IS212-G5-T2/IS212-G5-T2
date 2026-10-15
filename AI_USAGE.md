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

- Wei Zhi - Story - SPM-138 - Join Waiting List When Event Is at Capacity: Waiting list entries are event_registrations rows (new Waitlisted and Removed statuses; backend migration 011 and init 017); join, derived position, first-in promotion inside the withdrawal transaction, settle at close and on read, event availability fields, and the attendee waiting UI. Implemented with the spec's 46 cases (backend e2e and unit, frontend Vitest; Blocked as explicit skips: 09-A frontend, 11-E, 12-A, 12-B, 12-C); backend mutation check 42/42 killed and frontend 17/17 killed (incl. parallel-withdrawal overlap mutants and the withdrawn-card rejoin); SPM-120 regression 16/16 killed. Not committed.
  Approved deviations (user decisions, SPM-138): (c) a Removed or Cancelled registration answers 409 registration_not_withdrawable (it was 422 already-withdrawn for any non-Registered row); the copy is assumed. (d) the registered badge reads "Confirmed" and a full, open event reads "Event full" (existing tests updated). (i) withdrawal reads the registration before taking the event lock and re-checks status in the compare-and-set. A withdrawn attendee may rejoin the list of a full, open event from the withdrawn card (TR-3). Mutant IDs M1-M31 are a reconstruction, mapped in docs/specs/SPM-138-test-cases.md (appendix).

- tanwz - test - SPM-135 - Test case evaluation gaps (branch chore/Improve-Test-Case-Evaluation-Workflow): Settled the 422 vs 409 question for CONFIRM-EVENT-06 (the Confluence expected result of 422 is the oracle; the "HTTP 409" in the Confluence notes is the already-Confirmed case, recorded in the results doc and not yet corrected in Confluence), documented why the lock-wait race test polls (bounded, asserts the wait), and mapped the internal ID families to the acceptance criteria they support. Added `backend/test/events-checklist-actions.e2e-spec.ts` (10 tests) with mutants CHA1 to CHA7, an e2e coverage config and `npm run test:cov:e2e` so `status.service.ts` is measured (97.43% lines from the real-database suites), and frontend tests for the page refresh, load failure, confirm callback, re-request and feedback untick paths (SPM-135 frontend files now 100% on lines and functions; `PlanningInformationPage.tsx` branches 90.08%). Corrected the mutation evidence: M11 is equivalent (the earlier "killed" claim could not be reproduced), full backend run 89 mutants: 82 killed, 7 equivalent, 0 survived. Checks: frontend 1017 passed, backend unit 1231, backend events e2e 129, full e2e 357 passed and 11 failed in dev's `drafts.e2e-spec.ts` (fails the same on dev). Not verified in a browser; Test Code Review not re-run. Nothing committed.

- tanwz - implementation - chore/Improve-Test-Case-Evaluation-Workflow - Test workflow controls and metrics: Added `ai/docs/test-workflow.md` (rules, gap-to-control map, ID registry, per-test records, tier matrix, gates G1 to G7, metrics report) and dependency-free tooling in `ai/scripts/test-workflow/` (ID, spec and tier, record, determinism, coverage-scope and mutation-reconciliation gates, a cycle runner and the metrics report, with 56 node tests). Added the records for SPM-135 in `docs/test-cases/workflow/` (scope, 70-row ID registry, spec-conflict register, tier matrix, determinism exceptions, coverage line statuses, 198 test records) and wired the doc into AGENTS.md, the contract, the Orchestrator, Test Code Reviewer, Implementation and the two test skills. Baseline cycle 1 for SPM-135: G1, G2, G4, G5, G6, G7 pass; G3 blocks (104 of 198 tests have no registered ID, and the tier, oracle class and explained fields are not filled in); overall RED. Not reviewed by the Requirement or Code Quality reviewers; nothing committed.
