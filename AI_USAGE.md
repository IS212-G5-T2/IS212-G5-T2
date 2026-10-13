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

- swr - implementation - SPM-51 - Add images to seeded venues and normalize event names: Seed 24 unique venue SVG images, remove the visible SPM-51 prefix from five seeded event names, and verify with the focused E2E suite (10/10).
- swr - verification - SPM-51 - Run the full backend E2E suite: Compose PostgreSQL-backed `npm run test:e2e` passed (270 passed, 11 skipped, 1 todo); backend lint and `git diff --check` passed for the seed change.
- swr - fix - SPM-51 - Make booking range formatting timezone-independent: Parse SGT wall-time form values consistently with venue ISO instants; UTC frontend suite passed (1,011 passed, 1 todo), lint and production build passed with warnings.
- swr - testing - SPM-51 - Add direct VEN-AVL coverage for schedule state changes: Add VEN-AVL-05-B venue-switch schedule assertions and backend cases for VEN-AVL-02-C and VEN-AVL-07-C; tests not run. The database supports `rejected`, not a `cancelled` booking status, so 02-C asserts the supported rejected state and active pending holds remain tentative.
