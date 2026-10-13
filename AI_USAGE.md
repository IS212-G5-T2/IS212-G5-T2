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

## 2026-10-12

- swr - implementation - SPM-140 - Fix event planning E2E schema path: Corrected the relative path to the repository PostgreSQL schema initialization file.

- tanwz - implementation - SPM-135 - Confirm an Event (Coordinator): Coordinator confirm from Planning with fail-closed readiness, one transaction (status, history, EventConfirmed notification), organiser confirmed-arrangements view and coordinator confirm panel. Iteration 2 (Test Review TR-01 to TR-09 remediation): 39 real-DB e2e, 23 readiness unit, 1167 backend unit, 952 frontend tests (page-level confirm tests added); committed mutation runner `backend/scripts/mutation/spm135.mutants.mjs`, 37 mutants: 32 killed, 5 equivalent, 0 survived. Test Code Review, Requirement Review and Code Quality Review not re-run; see docs/specs/SPM-135-test-results.md.
