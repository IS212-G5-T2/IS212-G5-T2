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

## 2026-11-06

- chaw678 - test/docs - chore/SPM-197-Align-SPM-58-test-ids - Align SPM-58 test IDs with the Confluence matrix: Claude (implementation agent) retagged mismatched EQUIP-RESERVE tests, registered 34 PRIMARY and 2 SUPPORTING ids (approved by chaw678, 2026-11-06), added the SPM-58 scope, tier matrix, a 40-mutant suite and a 54-row records file, added real-database overlap, queue, confirmed-event and ownership tests, and recorded six spec conflicts that chaw678 decided on 2026-11-06 (keep the code, change the matrix), so G1, G2, G3, G4 and G6 pass. Also recorded chaw678's 2026-11-06 approvals for supporting ids of SPM-133, SPM-129 and SPM-56 and for the SPM-56 primary ids. No production code changed, not committed.
