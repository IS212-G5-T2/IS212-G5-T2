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

## 2026-10-15

- kishorek888 - CI correction - chore/SPM-37-drafts-e2e-ci - Run authenticated drafts E2E coverage in CI: Added TEST_DATABASE_URL to the backend E2E job and removed the obsolete drafts-suite 401 skip rationale.
