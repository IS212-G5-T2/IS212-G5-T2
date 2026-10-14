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

- swr - implementation - SPM-146 - Stabilize draft and venue E2E fixtures: Authenticated draft API requests as a seeded organiser and isolated venue names per run; focused draft/venue E2E suites pass 29/29.
- swr - implementation - SPM-146 - Close unit test coverage gaps: Added traceable tests/mutation harnesses and updated Confluence cases/matrices for SPM-83/111/117/119; all 20 mutants killed. Backend/frontend unit suites, builds, and focused equipment E2E pass; full backend E2E fails against stale shared DB schema. Remaining frontend defensive branches documented in test files and Jira comment 10090.

## 2026-10-15

- swr - implementation correction - SPM-146 - Reconcile equipment locations traceability: Moved the controller/API locations tests and mutants from SPM-111 to Jira-assigned SPM-117 / EQUIP-VIEW-02-C; affected backend/frontend SPM-111 and SPM-117 mutation harnesses pass.
- swr - documentation correction - SPM-146 - Retire stale SPM-111 locations traceability: Removed the obsolete EQUIP-CRE-02-F case and matrix mapping; the verified locations-route coverage remains mapped to SPM-117 EQUIP-VIEW-02-C.
- swr - implementation correction - SPM-146 - Complete matrix and restore frontend test environment: Added EQUIP-CRE-02-D/E to the SPM-111 matrix and restored the lockfile-defined frontend dependencies with npm ci; the full frontend suite passes 76 files, 1,102 tests, 1 todo.
- swr - implementation correction - SPM-146 - Strengthen EQUIP-CRE-02-E: Assert that Escape and outside click preserve a typed location and add two mapped clearing mutants; focused test and SPM-111 mutation harness pass, followed by a full frontend suite pass (76 files, 1,102 tests, 1 todo).
