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

## 2026-11-05

- chaw678 - implementation - SPM-187 - E2E per-test reset fixture and fixture builders (stage 1 of 3): added frontend/e2e/fixtures.ts (auto reset plus db builders) and backend/scripts/testing/browser-fixtures.mjs (builders and presets replacing run-browser.mjs once-per-run seeding); migrated the withdraw, audit-trail and hold-expiry specs, and deleted init/028_spm120_withdrawal_browser_test.sql. storageState, clock helper, device project and selector work remain for stages 2 and 3.
- chaw678 - implementation - SPM-187 - E2E fixture correction cycle: fixed stale reset/seed docs (database README, reset-test-database.mjs, tests.yml), added a readable error formatter and timeouts to browser-fixtures.mjs/fixtures.ts, added tsconfig.e2e.json plus a typecheck:e2e script and CI step, added a node smoke test for the 30/15-minute venue plus Approved event scene, and recorded the fixture boundary in the frontend and backend AGENTS.md.
- chaw678 - implementation - test/SPM-187-e2e-foundation (no Jira key yet) - My Drafts crashed on a draft with no name: `MyRequestsPage` called `.trim()` on `fields.name`, which a jsonb draft can lack, so one malformed row threw during render and React unmounted the whole list - the reason a freshly saved draft looked lost and the SPM-37 browser spec failed. Guarded the read (matching `EventListPage`), corrected `init/036`'s seeded draft from `eventName` to `name`, and added a regression test that fails with `TypeError: Cannot read properties of undefined (reading 'trim')` without the guard. Touches SPM-37 and SPM-149; needs a defect ticket (Jira writes were blocked this session).
- chaw678 - implementation - test/SPM-187-e2e-foundation (no Jira key) - Demo seed gaps: `database/postgresql/demo/demo_seed.sql` now seeds two organiser drafts (jsonb key `name`, matching `DraftFields`), five `event_flagged_changes` rows of all three kinds (a pending `booking_conflict` on Community Health Fair tied to its blocked Community Hall period, a `change_request` row derived from the approved change request, two `direct_update` rows, one applied `booking_conflict`) and three tiny `venue_images` PNGs with `byte_size` computed from the decoded payload; added an explicit `TRUNCATE event_drafts`. Data only, no schema change. Verified by running the seed three times with `ON_ERROR_STOP=1` against the disposable test database, then restoring it. Found that `event_drafts` was already cleared by the cascade through `event_id`, and that `event_audit_log` is the table that is never cleared.

## 2026-11-06
- chaw678 - implementation - test/SPM-187-e2e-foundation (no Jira key yet) - Compose initialises with the demo dataset: mounted `demo_seed.sql` as `/docker-entrypoint-initdb.d/900_demo_seed.sql` so a fresh local volume comes up on the campus data instead of `init/`'s test fixtures, while the disposable test database keeps `init/`'s `@connectsphere.test` accounts (690 references across 31 files depend on them). Verified on a throwaway container: init ran 001-003 then 900 with no errors, 13 `@connectsphere.sg` users, 0 `.test`, 48 events, 10 venues, and the reference catalogues intact. Documented in both READMEs.

- chaw678 - implementation - refactor/consolidate-init-schema - Fold 44 incremental init SQL files into 001_schema.sql, 002_seed_data.sql and 003_functions_triggers.sql (no Jira ticket; authorised directly): final-state schema written without ALTERs, seed data folded with current option values, all functions and triggers created after the seed so loading it fires none. Fresh-database `pg_dump` schema is identical to the previous build except `venues_owner_user_id_required` now validated; data differs only in five seed events' option values and `event_audit_log` (91 to 80 rows); row counts, including the Playwright reset's expected 7/11/31/20/21, are unchanged. Updated the five-plus tests that read deleted init files, re-anchored the SPM-135/136 trigger mutants, and rewrote the stale README and CHANGELOG sections. Used Claude Code (Sonnet 5.5 sub-agent, high effort).

- chaw678 - implementation - test/SPM-187-stage2-auth - E2E authentication via storageState (stage 2 of 3): added a `setup` Playwright project (`frontend/e2e/auth.setup.ts`) that generates a random session token per seeded account, writes gitignored storageState files and asserts each authenticates as its own account through `/api/auth/me`; because the per-test reset truncates `auth_sessions`, `browser-fixtures.mjs reset <sessions.json>` re-inserts a sha256-hashed session row per account straight after truncating (rather than preserving the table). Specs declare `test.use({ as: "<role or account>" })` and use a `pageAs()` fixture for a second user; migrated the nine UI logins, kept one UI login as the new `LoginPage.playwright.spec.ts`, added node tests for the session restore, and updated the frontend and database docs. Stage 3 (clock, device project, selectors) is untouched. Used Claude Code (Sonnet 5.5 sub-agent, medium effort).
