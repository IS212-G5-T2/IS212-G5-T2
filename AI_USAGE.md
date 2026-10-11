# AI Usage Log

Record current AI-assisted work in this file. Archive entries under
[`docs/archived/`](docs/archived/README.md) when the user explicitly requests
archival or asks the agent to create a pull request.

Add entries under one date per day, using this format:

```md
## YYYY-MM-DD

- <user or general> - <type> - <Jira ticket or branch name> - <title>: <concise result>
```

## 2026-10-10

- user - bug fix - refactor/file_structure_and_modularization - Make venue unavailability datetime conversion explicitly use Singapore time and assert UTC instants without host-timezone-dependent getHours(); verify frontend CI unit tests.

## 2026-10-11

- user - test - SPM-142 - Close unit test coverage gaps in Event information management: tests only (27 supporting case IDs in docs/test-cases/SPM-49_SPM-85_SPM-97_Test-Cases.md, added to the three story matrices and to Confluence case pages; the six EVENT-UPDATE-04 cases still to be pasted because that page refused API edits); planning files at 100% lines/branches except unreachable branches with written reasons; event-planning.e2e-spec.ts moved to backend/test/ so test:e2e and CI run it. Test, Requirement and Code Quality reviews passed (Test after one correction round). Local checks: backend unit 1116, e2e 256, frontend 883 pass; lint and builds clean.
