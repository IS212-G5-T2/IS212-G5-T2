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

- swr - documentation - SPM-51 - Correct VEN-AVL procedures and matrix: Revised all 27 Confluence test cases for reproducible fixtures and current UI behavior, corrected AC mapping and evidence citations, and reconciled blocked backend E2E/manual evidence in the matrix.
- swr - verification - SPM-51 - Run VEN-AVL E2E against local PostgreSQL: Using the configured DATABASE_URL, `test/venues-booking-requests.e2e-spec.ts` passed 12/12, including VEN-AVL-02-C and VEN-AVL-07-C.
- swr - testing - SPM-51 - Trace backend tests to booking-request mutants: Name DTO parameter rows, map B06–B14 to exact test locations, replace wall-clock expiry fixtures with PostgreSQL-clock values, and document the rejected-versus-cancelled schema limit. Focused unit tests passed (19); full backend coverage tests passed (1,176); database E2E (25) and nine database mutants were skipped because DATABASE_URL was unavailable.
- swr - implementation - SPM-51 - Add images to seeded venues and normalize event names: Seed 24 unique venue SVG images, remove the visible SPM-51 prefix from five seeded event names, and verify with the focused E2E suite (10/10).
- swr - verification - SPM-51 - Run the full backend E2E suite: Compose PostgreSQL-backed `npm run test:e2e` passed (270 passed, 11 skipped, 1 todo); backend lint and `git diff --check` passed for the seed change.
- swr - fix - SPM-51 - Make booking range formatting timezone-independent: Parse SGT wall-time form values consistently with venue ISO instants; UTC frontend suite passed (1,011 passed, 1 todo), lint and production build passed with warnings.
- swr - testing - SPM-51 - Add direct VEN-AVL coverage for schedule state changes: Add VEN-AVL-05-B venue-switch schedule assertions and backend cases for VEN-AVL-02-C and VEN-AVL-07-C; after adding the missing coordinator fixture, frontend passed (70 files, 1,012 passed, 1 todo). Backend E2E skipped (12 tests) without `DATABASE_URL`. The DB supports `rejected`, not `cancelled`, so 02-C asserts rejected is omitted and active pending holds remain tentative.
