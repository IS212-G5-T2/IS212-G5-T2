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
