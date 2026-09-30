# Unknown Issues Archive

Entries whose Jira issue key was unknown or not supplied, moved at the user’s request on 30-09-2026.

## 30-09-2026 - Codex - Unknown

- Issue/PR: Unknown; user requested an agent workflow documentation cleanup.
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `.ai/agents/implementation.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`.
- Summary: Made Jira the business requirement source and Confluence test matrix/cases the testing specification in root guidance. Moved the Jira/Confluence acquisition, status gate, repository inspection, branch selection, implementation, testing, and initial validation progression into the implementation role contract. Rewrote the GitHub lifecycle doc to focus on branch, review, staging, commit approval, and pull request handoff.
- Assumptions: Detailed implementation progression belongs in the implementation role and shared workflow contract; root guidance should preserve repository policies and link to those sources.
- Checks run: `git diff --check`; reviewed Jira/Confluence source-of-truth wording, role-contract links, and duplicate Jira progression in root guidance.
- Follow-up/conflict notes: Preserved concurrent AI usage archive files. No commit, push, pull request, Jira, or Confluence changes.

## 30-09-2026 - Codex - Unknown

- Issue/PR: Unknown; user requested two opt-in agent helpers.
- Human requester/operator: swr
- Areas touched: `.ai/agents/`, `.ai/workflow/README.md`, `.ai/README.md`, `.codex/`, `.claude/`, `AI_USAGE.md`, `docs/ai-usage-archives/README.md`.
- Summary: Added a GitHub CLI-only pull request helper that generates a title from ticket context and fills the repository template, plus a ticket completion helper that moves one explicitly selected AI_USAGE section to its archive. Registered both for Codex and Claude with explicit invocation descriptions.
- Assumptions: The user's explicit request to archive a named ticket is authorization to move its ledger section; the helper does not change Jira status.
- Checks run: Python `tomllib` parsed Codex config and all role TOMLs; `git diff --check` passed. Static registration/contract references inspected.
- Follow-up/conflict notes: No pull request, commit, push, or Jira action was performed. Existing archive contents were preserved.

## 30-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.ai/`, `.codex/`, `.claude/`, root agent guidance, `README.md`, `.gitignore`, `AI_USAGE.md`
- Summary: Organized shared role contracts and workflow under `.ai/`, added native Codex TOML role adapters and Claude Markdown agent adapters, and kept per-ticket runtime data ignored. Reviewers return independent reports for the orchestrator to persist, enabling read-only review sandboxes.
- AI contribution: Inspected the repository setup and current Codex configuration reference; adapted the workflow to native role definitions while keeping shared responsibilities platform-neutral.
- Assumptions: The active project trusts the repository configuration. Codex task orchestration still comes from the runtime; the repository provides role registration, not a custom orchestration program.
- Checks run: Codex `debug prompt-input` loaded project context; Python `tomllib` parsed the Codex configuration and all role TOMLs; role registrations and links inspected; `git diff --check` passed.
- Follow-up/conflict notes: No Jira/Confluence content was fetched because this change defines the workflow rather than implements a ticket. No commit, push, or pull request was created.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Created `codex/fix-authentication-coverage` from the current `dev` baseline, analyzed the authentication-only coverage gaps before any deletion, and added focused coverage tests. No production code was deleted or changed.
- AI contribution: Coverage-baseline verification, source/test-path analysis, and unit-test expansion.
- Assumptions: The requested focus is the backend `src/auth/authentication` folder shown in the supplied coverage report.
- Checks run: `npm run test:cov -- src/auth/authentication` in `backend/` (32 passed; every authentication source file is 100% for statements, branches, functions, and lines); `npm run lint`; `npm run build`; focused Prettier check; `git diff --check`.
- Follow-up/conflict notes: Added business-path tests for authenticated-user retrieval, invalid bodies, and cookie-less logout, plus constructor-metadata fallback tests for compiler-generated Nest decorator branches. No files are staged, committed, or pushed.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `frontend/`, `AI_USAGE.md`
- Summary: Corrected the frontend CI entrypoint to invoke the configured `test:cov` script and corrected that script to use Vitest's supported `--coverage` flag. Updated current frontend setup and handover documentation.
- AI contribution: CI failure diagnosis, focused command and documentation repair, and verification.
- Assumptions: `test:cov` is the intended shared coverage-script name, matching the backend component convention.
- Checks run: `npm run test:cov` in `frontend/` (201 passed); `sh -n frontend/scripts/ci/unit-test.sh`; `git diff --check`.
- Follow-up/conflict notes: No frontend lint or build run; the observed CI failure occurred before tests started because the entrypoint referenced a missing npm script.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `frontend/`, `backend/`, `database/`, `docker-compose/`, `.github/workflows/`, root documentation and agent guidance
- Summary: Moved `apps/frontend` to `frontend`, `services/backend` to `backend`, `development/database` to `database`, and `development/local-dev` to `docker-compose`. Updated all operational path references, Compose build and bind-mount paths, CI discovery/cache/working-directory paths, backend path-sensitive helpers, and documentation. Removed the now-empty parent directories and their superseded parent-scoped agent guidance; the local Compose guidance now lives in `docker-compose/AGENTS.md`.
- AI contribution: Repository-wide path-reference audit, tracked and ignored-file inventory comparison, layout migration, configuration/documentation updates, and validation.
- Assumptions: The current `integration/Sprint-1` checkout is the intended migration baseline. Ignored local dependencies, build output, coverage, and `.env` files should move with their directories and remain uncommitted.
- Checks run: `docker compose -f docker-compose/docker-compose.yml config --quiet`; backend `npm test` (434 passed), `npm run lint`, and `npm run build`; frontend `npm test` (201 passed) and `npm run build`; stale operational-path audit and `git diff --check`. Frontend `npm run lint` remains blocked by two pre-existing unused-variable errors in `src/components/domain/ClarificationThread.tsx` and `src/store/useAppStore.auth.test.ts`.
- Follow-up/conflict notes: Full before/after SHA-256 inventories confirm every moved regular file is present (8,788 backend, 20,374 frontend, 7 database, and 8 Compose files) and all 47 symlinks remain. The only content changes are the intended path/documentation updates plus regenerated ignored Vitest cache records and backend build output. The changes were staged for human review; no push has been made.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows`, `AI_USAGE.md`
- Summary: Corrected the CI readiness gate to wait for the PostgreSQL image's initialization phase to finish before accepting the final server as ready.
- AI contribution: PostgreSQL container-log analysis and CI readiness repair.
- Assumptions: The official image retains its documented initialization-complete log message; the final `pg_isready` probe confirms its replacement server is accepting connections.
- Checks run: Reviewed failed CI container logs and shell syntax; GitHub Actions rerun pending.
- Follow-up/conflict notes: The prior readiness check passed against a temporary initialization server that was intentionally shut down seconds later.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Configured Vitest to run PostgreSQL-backed E2E files sequentially because they share one mutable test database and clean up their own fixtures.
- AI contribution: E2E failure diagnosis, test-runner configuration, and isolated-database verification.
- Assumptions: A single disposable PostgreSQL instance is the intended E2E dependency; serial file execution is an acceptable reliability trade-off.
- Checks run: `DATABASE_URL=postgresql://spm:spm_dev_password@127.0.0.1:5432/spm npm run test:e2e` against an isolated temporary PostgreSQL container (32 passed; 11 intentional skips); temporary container removed.
- Follow-up/conflict notes: No commit or push created.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/store`, `AI_USAGE.md`
- Summary: Completed the auth revision guard so late session-restoration results cannot overwrite a newer login or logout, and added a regression test for a late restore after sign-out.
- AI contribution: Merge-conflict diagnosis, state-race hardening, and unit testing.
- Assumptions: Login and logout are newer auth decisions than a pending startup session restoration.
- Checks run: Focused `useAppStore.auth.test.ts` (9 passed). Frontend lint and build remain blocked by pre-existing unrelated merge changes.
- Follow-up/conflict notes: Current build errors include missing `Navigate`, `currentUserId`, and `api` identifiers; lint also reports unrelated unused variables.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/lib`, `AI_USAGE.md`
- Summary: Expanded the PostgreSQL-session authentication client tests without removing traceability comments. Coverage now includes normalized multi-role mapping, unsupported roles, profile fallbacks, successful and failed login, malformed response fallbacks, session restoration states, logout, error construction, and the default API-base fallback.
- AI contribution: Unit-test expansion, boundary analysis, and regression verification.
- Assumptions: Browser authentication remains cookie-based, and `USER-LOGIN-01` identifiers remain the relevant test-case traceability labels.
- Checks run: Focused auth coverage (15 passed; 100% statements, branches, functions, and lines) and frontend `npm test` (153 passed).
- Follow-up/conflict notes: No files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/utils`, `AI_USAGE.md`
- Summary: Merged duplicate session-header assertions and expanded API-helper coverage for configured/default origins, caller headers, network failure, non-JSON responses, validation errors, attachment-size errors, server errors, and the error type.
- AI contribution: Unit-test consolidation, edge-case coverage, and verification.
- Assumptions: Browser session cookies remain the sole authentication mechanism; frontend requests deliberately do not send an `Authorization` header.
- Checks run: Focused API coverage (9 passed; 100% statements, branches, functions, and lines), frontend `npm test` (128 passed), build, and `git diff --check`.
- Follow-up/conflict notes: Frontend lint remains blocked by unrelated existing unused variables in clarification/event-detail files. No files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/pages`, `AI_USAGE.md`
- Summary: Rebuilt `LoginPage.test.tsx` from the current `USER-LOGIN-01/02/03` Confluence cases, retaining separate field-validation, pending-submission, redirect, and recovery checks while replacing Firebase doubles with the local backend-auth client.
- AI contribution: Confluence-backed test migration, coverage expansion, and verification.
- Assumptions: The numbered `@connectsphere.test` names are test fixtures matching the current seed data.
- Checks run: Focused suite (21 passed), focused `LoginPage.tsx` coverage (100% statements, branches, functions, and lines), frontend `npm test` (121 passed), build, and `git diff --check`.
- Follow-up/conflict notes: Frontend lint remains blocked by unrelated existing unused variables in clarification/event-detail files. No files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test`, `development/database/postgresql/init`, `AI_USAGE.md`
- Summary: Reworked the backend authentication E2E suite to use a real seeded account and cover successful session use, credential normalization and validation, enumeration-safe failures, invalid/missing cookies, logout clearing and revocation, expired sessions, and disabled accounts. Corrected malformed local-user seed SQL and its role-assignment email mismatch so CI can initialize the E2E database.
- AI contribution: E2E test analysis, edge-case expansion, test-data repair, and verification.
- Assumptions: `attendee1@connectsphere.test` and `P@55w0rd` are the intended local-only CI fixture; E2E coverage needs the CI PostgreSQL container to produce its final report.
- Checks run: Backend lint passed; focused auth unit suite passed (23 tests). E2E execution could not run locally because Docker Desktop is stopped and this environment blocks listening sockets/database connections.
- Follow-up/conflict notes: Existing authentication migration work was preserved. No commit, push, or pull request was created.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/pages`, `apps/frontend/src/store`, `AI_USAGE.md`
- Summary: Restored the deleted login-page unit suite as PostgreSQL-session tests and added direct `USER-LOGIN-01/02/03` Confluence test-case comments above each corresponding test. Updated unexpected-login-failure handling to use a generic user-safe message.
- AI contribution: Confluence-to-test traceability, Firebase-to-local test migration, and frontend regression testing.
- Assumptions: The numbered `@connectsphere.test` fixture accounts mirror the current schema text; live seed initialization remains blocked by the separately identified SQL consistency issue.
- Checks run: Focused login suite (16 passed), frontend `npm test` (116 passed), build, and `git diff --check`. Lint remains blocked by four pre-existing unused variables in clarification/event-detail files outside this change.
- Follow-up/conflict notes: No files were staged, committed, or pushed. The exact seed-account naming and schema repair still require the requester's direction.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Moved session environment parsing from the authentication feature to `src/config/auth.config.ts`; standardized configuration and the default cookie as `AUTH_*` and `connectsphere_session` without a temporary local-auth namespace.
- AI contribution: NestJS configuration-boundary refactor, environment/documentation updates, and regression checks.
- Assumptions: PostgreSQL session authentication is the sole supported authentication implementation; `AUTH_COOKIE_SECURE=false` remains appropriate only for local HTTP development.
- Checks run: Backend `npm test` (388 passed), lint, build, stale-name scan, and `git diff --check`.
- Follow-up/conflict notes: The separately identified seeded-account email/schema inconsistency remains untouched pending the requester's choice of authoritative accounts; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Added failure-path tests that verify each authentication repository operation propagates PostgreSQL failures instead of treating an outage as an authentication result.
- AI contribution: Unit-test edge-case expansion and coverage verification.
- Assumptions: Repository storage errors intentionally propagate to the service/global Nest error boundary; login remains responsible for mapping only absent account rows to invalid credentials.
- Checks run: Focused repository coverage (10 passed; 100% statements, functions, and lines; 83.33% branches due solely to Nest decorator instrumentation), backend `npm test` (388 passed), lint, build, and `git diff --check`.
- Follow-up/conflict notes: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/database`, `services/backend`, `AI_USAGE.md`
- Summary: Aligned authentication unit/E2E fixtures and local setup documentation with the existing PostgreSQL seed password `P@55w0rd`.
- AI contribution: Development credential consistency update and verification.
- Assumptions: This is a deliberately non-production credential and has already been applied in the committed schema seed.
- Checks run: Repository-wide old-password scan, backend `npm test` (384 passed), and `git diff --check`.
- Follow-up/conflict notes: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth`, `AI_USAGE.md`
- Summary: Removed password hashes from the authentication repository SELECT result and account types; PostgreSQL retains credential verification through `crypt()` without returning the hash to application memory.
- AI contribution: Authentication data-minimization refactor and regression testing.
- Assumptions: A verified account requires only identity and role data after the database predicate succeeds.
- Checks run: Backend `npm test` (384 passed), lint, build, password-hash reference scan, and `git diff --check`.
- Follow-up/conflict notes: Database fixture inserts still set password hashes as required for test-user creation; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Added focused unit coverage for PostgreSQL credential lookup, account/session row mapping, session creation, absent rows, and idempotent session revocation.
- AI contribution: Repository-boundary tests and validation.
- Assumptions: PostgreSQL itself remains covered by migration/E2E checks; these tests verify the repository's query contract and mapping without a database container.
- Checks run: Focused Vitest coverage (6 tests; 100% statements, functions, and lines; remaining decorator-only branch instrumentation), backend `npm test` (384 passed), lint, build, and `git diff --check`.
- Follow-up/conflict notes: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth`, `services/backend/src/app.module.ts`, `AI_USAGE.md`
- Summary: Grouped local login, session, repository, controller, configuration, middleware, and their unit tests under `src/auth/authentication`, while retaining the module, shared models, and RBAC authorization boundary at their existing feature-level locations.
- AI contribution: Non-functional source-tree refactor and import-path correction.
- Assumptions: The requested reorganization applies to the local-session implementation shown and should preserve every public endpoint and provider name.
- Checks run: Backend authentication unit tests (75 passed), build, lint, and `git diff --check`.
- Follow-up/conflict notes: Existing uncommitted authentication and Firebase-removal work was preserved; no files were staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/database`, `development/local-dev`, `services/backend`, `AI_USAGE.md`
- Summary: Replaced the incorrect untracked user SQL with ordered user/session schema and seeded local role accounts; added parallel cookie-based PostgreSQL login endpoints while preserving Firebase authentication.
- AI contribution: Schema, backend authentication/session implementation, tests, and local setup documentation.
- Assumptions: Firebase remains active until a later frontend/API cutover; documented `.test` credentials are development-only; local HTTP uses non-secure cookies.
- Checks run: Backend unit tests (401 passed), build, lint, `git diff --check`, and Docker Compose configuration validation.
- Follow-up/conflict notes: The confirmed untracked `001_user.sql` was replaced and renamed to `001_users.sql`; Docker was unavailable before implementation, so live database verification remains pending.

## 13-09-2026 - Antigravity (Gemini 3.7 Flash) - Unknown

- Issue/PR: Second user story key not supplied.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend`, `services/backend/src/events`, `development/database/postgresql/init/002_events.sql`, `AI_USAGE.md`.
- Summary: Added optional supporting-file upload on EventCreatePage step 2, persisted attachment metadata/data URLs through the backend event contract, displayed attached files with view/download links on EventDetailPage, and added a top-right mock profile switcher for Coordinator, Organiser, Venue Staff, Tech Support, and Admin roles.
- AI contribution: Frontend/backend implementation, local schema update, unit/component tests, build/lint verification.
- Assumptions: This is preparatory work for a second Jira story and should remain separate from the first story's eventual push. The mock profile switcher is temporary local RBAC support until real authentication is merged.
- Checks run: Backend focused tests passed: `npm test -- --run src/events/event-input.spec.ts src/events/events.service.spec.ts`; frontend focused tests passed: `npm test -- --run src/pages/EventCreatePage.test.tsx src/pages/EventListPage.test.tsx src/pages/EventDetailPage.test.tsx src/components/layout/TopNav.test.tsx`; frontend/backend build and lint passed.
- Follow-up/conflict notes: No Jira key was supplied for the second story. Coordinator assignment log and cross-coordinator access restrictions are not completed in this prep pass.

## 11-09-2026 - Codex (GPT-6) - fix/backend-dependency-lock

- Issue/PR: Unknown; no Jira key supplied.
- Areas touched: `services/backend/package-lock.json`, `AI_USAGE.md`.
- Summary: Added the missing nested TypeScript 5.9.3 peer dependency required by tsconfck under vite-tsconfig-paths, preserving the backend TypeScript 6 dependency and existing lock metadata.
- AI contribution: Diagnosis, lock-file repair, Docker build verification.
- Assumptions: Fix the reported npm ci failure without upgrading dependencies.
- Checks run: Regenerated using node:22-alpine/npm 10.9.8; backend Compose image build passed, including npm ci, Nest build, and production pruning; final formatting preserves the verified JSON data.
- Follow-up/conflict notes: npm reported four high-severity audit findings during install and three after production pruning; not addressed in this focused fix. Stack not started. Changes staged on fix/backend-dependency-lock; no commit or push.

## 16-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev/firebase`, `AI_USAGE.md`
- Summary: Updated the Firebase emulator image to copy its configuration from the path within Compose's repository-root build context.
- AI contribution: Docker build-context diagnosis and targeted configuration correction.
- Assumptions: The Firebase service will continue using the repository root as its Compose build context.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`.
- Follow-up/conflict notes: Existing unrelated frontend and ledger changes were preserved; no commit or pull request created.

## 15-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/scripts/set-firebase-roles.mjs`, `AI_USAGE.md`
- Summary: Added JSDoc for role-assignment data, validation inputs and failures, and the Firebase custom-claim update operation.
- AI contribution: Script documentation and syntax verification.
- Assumptions: The existing email-to-role mappings and Firebase update behavior must remain unchanged.
- Checks run: `node --check services/backend/scripts/set-firebase-roles.mjs`; `git diff --check` (an unrelated existing trailing-whitespace warning remains in `apps/frontend/package.json`).
- Follow-up/conflict notes: The role-assignment script was already staged; no Firebase users were modified, and no commit or pull request was created.

## 15-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/config`, `services/backend/src/main.ts`, `AI_USAGE.md`
- Summary: Load `services/backend/.env` before creating Nest providers so Firebase Admin uses the configured local service account instead of unrelated application-default credentials.
- AI contribution: Root-cause analysis, implementation, and regression test.
- Assumptions: The backend is launched with `services/backend` as its working directory, as its npm scripts do.
- Checks run: Targeted Vitest tests (19 passed); `npm run build`; `npm run lint`; `git diff --check`; isolated configuration check confirmed the configured service account targets `spm-is212-g5-t2-ecd8b`.
- Follow-up/conflict notes: Existing unrelated working-tree changes were preserved; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `firebase.json`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
- AI contribution: E2E implementation, CI workflow, and emulator integration.
- Assumptions: `demo-is212` is used as a safe emulator-only project ID; PostgreSQL can be started from `development/database/postgresql` in GitHub Actions.
- Checks run: `npm run lint`; `npm run build`; Ruby YAML/JSON config validation; `git diff --check`. Emulator-backed E2E execution was not run because the local Auth Emulator was unavailable.
- Follow-up/conflict notes: Local Docker/emulator execution was not run in this environment; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `AI_USAGE.md`
- Summary: Rechecked the authentication E2E test against the current AuthModule and middleware wiring after removing AuthorizationService; no test changes were required.
- AI contribution: Test review and execution.
- Assumptions: The file is intended to cover Firebase authentication middleware, not resource-level RBAC enforcement.
- Checks run: `npm run test:e2e -- test/auth.e2e-spec.ts` outside the sandbox (3 tests passed); the full E2E command was sandbox-blocked because local server binding is restricted.
- Follow-up/conflict notes: No commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Grouped successful database and transaction behavior separately from configuration and failure behavior, matching the RBAC test organization.
- AI contribution: Test organization and verification.
- Assumptions: Missing configuration, connection failures, rollbacks, and unconfigured shutdown are unintended behavior cases.
- Checks run: `npm test -- src/database/database.service.spec.ts` (8 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing database service tests were preserved; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Expanded the `buildPermissionPredicate()` comment with its SQL return value and execution behavior.
- AI contribution: Documentation update.
- Assumptions: None.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth`, `services/backend/README.md`, `services/backend/HANDOVER.md`, `services/backend/CHANGELOG.md`, `AI_USAGE.md`
- Summary: Removed the separate `AuthorizationService` and its tests; updated auth wiring and backend documentation to use composable RBAC predicates inside resource queries.
- AI contribution: Architecture refactor, cleanup, and verification.
- Assumptions: Resource repositories will enforce RBAC and ownership in the same SQL operation and will not perform a preceding authorization query.
- Checks run: `npm test` (90 tests passed); `npm run lint`; `npm run build`; `git diff --check`; searched for remaining `AuthorizationService` references.
- Follow-up/conflict notes: Existing Firebase authentication and `RbacRepository` work was preserved; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Grouped valid predicate generation under intended behavior and arbitrary/injected actions under unintended behavior.
- AI contribution: Test organization and type-safe test correction.
- Assumptions: Runtime-invalid actions must be rejected even though the method accepts the `PermissionAction` TypeScript union.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `npm run build`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added unintended-behavior coverage proving arbitrary or injected permission column names are rejected.
- AI contribution: Security-focused unit-test design and verification.
- Assumptions: Runtime action values must be limited to the four supported CRUD actions even when TypeScript typing is bypassed.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Replaced internal placeholder variables with explicit `$1` and `$2` positions in the composable RBAC predicate.
- AI contribution: Code clarity improvement and verification.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Standardized the composable RBAC predicate on fixed `$1` and `$2` placeholders, eliminating interpolated placeholder text.
- AI contribution: Security review, implementation, and unit tests.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name, with operation-specific parameters beginning at `$3`.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Permission columns remain selected only from the fixed `PermissionAction` mapping; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a composable SQL `EXISTS` predicate that resource repositories can embed in their data operation to enforce RBAC without a separate network request.
- AI contribution: Repository API design, unit tests, and verification.
- Assumptions: Calling repositories will pass a PostgreSQL text-array parameter containing the authenticated user's roles and a parameter containing the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: `hasPermission()` remains available for standalone checks; no commit or pull request created.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added focused negative tests for missing permission rows, explicit denials, and truthy non-boolean database values.
- AI contribution: Unit-test design and verification.
- Assumptions: Only an explicit boolean `true` should grant permission; missing or malformed rows should deny access.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (53 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created; existing working-tree changes were preserved.

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Added deterministic coverage for unreachable database URLs, query delegation, successful and failed transactions, client release, and pool shutdown.
- AI contribution: Unit-test design and coverage expansion.
- Assumptions: A configured URL can still be invalid or unreachable; connection failures should be propagated by the database service for callers to handle.
- Checks run: Targeted Vitest coverage (8 tests passed; 100% statements, branches, functions, and lines); `npm --prefix services/backend run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing working-tree changes were preserved; no commit or pull request created.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
- AI contribution: Parameterized unit-test design and coverage verification.
- Assumptions: CRUD bit strings represent `create`, `read`, `update`, and `delete` in that order; absent seeded role/resource rows are represented as `0000`.
- Checks run: Targeted Vitest coverage (50 role/resource cases and 200 permission checks passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No separate unintended-behavior section remains; the uncovered branch is framework-generated NestJS decorator metadata.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a negative test for permission rows that explicitly deny an action.
- AI contribution: Unit-test addition and coverage verification.
- Assumptions: The repository should return `false` for an existing permission row with `allowed: false`.
- Checks run: Targeted coverage (3 tests passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: The remaining branch is emitted for NestJS decorator metadata rather than repository authorization logic.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Organized RBAC repository tests into intended and unintended behavior sections consistent with the Firebase authentication specs, preserving the existing parameterized permission query.
- AI contribution: Test-structure refactor and verification.
- Assumptions: The current `CASE`-based `hasPermission()` implementation is existing work and should remain unchanged.
- Checks run: Targeted RBAC repository tests (2 passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: None.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication/firebase-authentication.middleware.spec.ts`, `AI_USAGE.md`
- Summary: Updated the middleware test expectation to include the verified user's email field and added coverage for Firebase verification failures.
- AI contribution: Test correction, negative-path test, and targeted coverage verification.
- Assumptions: The middleware should attach the complete verified Firebase user object to the request.
- Checks run: Targeted Vitest coverage and `git diff --check`; 5 tests passed; 100% statements/functions/lines and 90% branches.
- Follow-up/conflict notes: The remaining branch gap is reported on the injectable decorator line and does not represent an untested middleware behavior.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Reviewed Firebase token service tests against implementation behavior and verified targeted Vitest coverage.
- AI contribution: Test coverage and negative-case review; no production code changes.
- Assumptions: The question concerns unit-test completeness, including behavioral edge cases beyond line coverage.
- Checks run: `npm --prefix services/backend run test -- src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (17 passed; 100% statements/branches/functions/lines).
- Follow-up/conflict notes: Coverage is complete at the instrumentation level, but additional edge-case assertions are recommended for stronger behavioral confidence.

## 14-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
- AI contribution: Secret-handling remediation and CI configuration.
- Assumptions: The repository’s GitHub secret is named `SEED_PASSWORD`; local test runs must export the variable themselves.
- Checks run: Source search for the removed literal and `git diff --check`; frontend tests require `SEED_PASSWORD` and dependencies to be available.
- Follow-up/conflict notes: The exposed password should be rotated; existing untracked Firebase service-account material was preserved and not staged.

## 14-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the real-looking test password with an explicitly fake password and removed unnecessary environment-secret wiring because Firebase authentication is mocked.
- AI contribution: Test-fixture security remediation and documentation.
- Assumptions: Login unit tests should validate UI behavior with deterministic mock data, not real Firebase accounts.
- Checks run: Source search for the removed credential and `git diff --check`; frontend tests remain unavailable locally because Vitest is not installed.
- Follow-up/conflict notes: Existing untracked Firebase service-account material was preserved and not staged.

## 11-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/`, `.github/`, `apps/frontend/README.md`, `services/backend/README.md`, `AI_USAGE.md`
- Summary: Updated branch workflow guidance and GitHub Actions filters so normal work starts from and targets `dev`, with branch flow `work branch -> dev -> main`.
- AI contribution: Documentation, workflow configuration, and AI usage logging.
- Assumptions: There should be no active dependency on any intermediate shared branch between work branches and `dev`.
- Checks run: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/security.yml .github/workflows/tests.yml`; searched repo docs and workflows for stale branch references.
- Follow-up/conflict notes: Supersedes earlier AI usage entries that documented previous branch-flow assumptions.

## 09-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `development/database`, `apps/frontend`, `README.md`, `AGENTS.md`, `AI_USAGE.md`
- Summary: Added a frontend service to the local Docker Compose stack, separated PostgreSQL into a buildable local image under `development/database/postgresql`, baked local-only PostgreSQL defaults into that image, and updated repository/local development documentation for the frontend/backend/database layout.
- AI contribution: Local integration configuration, Dockerfile support, README updates, documentation, and AI usage logging.
- Assumptions: The existing NestJS backend remains the backend service, the existing React/Vite app should run as the frontend service, and database ownership should be separated under `development/database/postgresql` while Compose orchestration remains under `development/local-dev`.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `npm ci`; `npm run build`; searched README and scoped docs for stale local-dev/frontend/backend/database wording; `docker compose -f development/local-dev/compose.yaml build frontend` and `docker build -t spm-postgresql development/database/postgresql` could not complete because the local Docker daemon was unavailable.
- Follow-up/conflict notes: None.

## 09-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `README.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated branch naming guidance to use `<type>/<ticket_id>-<ticket_name>` instead of `<issue>-<short-name>` so connected Jira and GitHub work displays the ticket id and Jira ticket name.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: The ticket name should be slugged with hyphens for branch compatibility while preserving the Jira ticket id exactly.
- Checks run: Searched repository docs for stale branch-name examples.
- Follow-up/conflict notes: None.

## 09-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/`, `development/local-dev/`, `.github/workflows/`, `README.md`, `AI_USAGE.md`
- Summary: Removed the generic service template and scaffolded a real NestJS backend at `services/backend` with npm, strict TypeScript, Vitest, oxlint, Dockerfile support, service docs, and a monorepo CI unit-test entrypoint. Updated local Docker Compose and the gateway to build and route to the backend service.
- AI contribution: Official-docs lookup, Nest CLI scaffold, backend wiring, tests, and documentation updates.
- Assumptions: The backend service should be named `backend`; NestJS is the default backend framework; deployment-related Nest/Mau scripts should be removed to match the no-deployment repository direction.
- Checks run: `npm ci`; `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox after the sandbox blocked local server binding; `services/backend/scripts/ci/unit-test.sh`; `docker compose -f development/local-dev/compose.yaml config --quiet`; searched for stale `services/template`, `sample-service`, and deployment references.
- Follow-up/conflict notes: The Nest CLI generated current NestJS 12 ESM/Vitest/oxlint defaults.

## 09-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `development/`, `docs/`
- Summary: Removed the remaining deployment, Terraform, Kubernetes, and previous multi-branch workflow assumptions after `platform/` was removed. This entry recorded the then-current shared branch guidance, which was superseded on 2026-09-11 by the `dev` branch flow.
- AI contribution: Repository scan, workflow cleanup, documentation updates, and AI usage logging.
- Assumptions: The repository no longer needs deployment automation or promotion branches; local Docker Compose emulators remain useful for development and are not deployment infrastructure.
- Checks run: Parsed GitHub Actions YAML with Ruby YAML; searched the repo for deployment/platform/branch-flow references and deployment-related filenames.
- Follow-up/conflict notes: Existing `platform/` deletions were already present before this work and were preserved.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so agents stage completed changes for human review and wait for explicit approval before committing, pushing, or creating a pull request. Added an explicit no-auto-merge rule.
- AI contribution: Documentation and process guidance updates.
- Assumptions: Staging changes is acceptable for review, but committing and pull request creation require explicit human approval to proceed with the commit.
- Checks run: Reviewed updated Markdown content.
- Follow-up/conflict notes: Pending human review before commit.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/security.yml`, `.github/workflows/tests.yml`, `.github/workflows/terraform.yml`, `AI_USAGE.md`
- Summary: Fixed security workflow annotations by updating GitHub workflow checkout steps to `actions/checkout@v7`, correcting the Trivy action pin to `aquasecurity/trivy-action@v0.36.0`, and replacing the licensed Gitleaks Action wrapper with the pinned Gitleaks CLI Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1`.
- AI contribution: CI workflow repair and validation.
- Assumptions: The repository should keep a free secret scan that works for an organization-owned GitHub repository without requiring `GITLEAKS_LICENSE`.
- Checks run: Verified available Trivy, checkout, and Gitleaks tags with `git ls-remote`; parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/branch-flow.yml`, `AGENTS.md`, `docs/ci-cd-process.md`, `AI_USAGE.md`
- Summary: Added a GitHub Actions check for the earlier multi-branch promotion model. This entry is historical only; the promotion workflow was later removed, and current branch guidance is `work branch -> dev -> main`.
- AI contribution: CI workflow and documentation updates.
- Assumptions: GitHub branch protection will be configured to require the `Validate Promotion Source` check where enforcement is needed.
- Checks run: Parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so Jira is the authoritative requirements source and GitHub is the authoritative development artifact source. Added status gating, existing branch/PR reuse, Jira-key branch/commit/PR requirements, acceptance-criteria recheck, and Jira automation ownership rules.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: Jira statuses `To Do` and `In Progress` are the only statuses where implementation should proceed; Jira automation handles status transitions for branch creation, pull request creation, and pull request merge.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future AI agents should not duplicate the Jira story into GitHub Issues or manually mark Jira work items `Done`.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
- AI contribution: Documentation structure, workflow guidance updates, and coordination rules for multiple AI agents.
- Assumptions: Earlier multi-branch assumptions were recorded here for historical context only. Current branch guidance is `work branch -> dev -> main`.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future Codex, Claude, or other AI work should add a new entry here before pull request handoff.

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `platform/`, `development/`, `docs/`
- Summary: Copied working files from the GitLab export into the GitHub repository without copying nested `.git` directories, converted GitLab CI/review metadata to GitHub Actions and pull request metadata, removed stale project-info/GitLab-only material, simplified the service template, and documented the Codex issue workflow and monorepo CI/CD process.
- AI contribution: Migration cleanup, workflow restructuring, documentation updates, repo boundary guidance, and local verification sweeps.
- Assumptions: The GitHub repository should be the single source repo; `services/template` is a scaffold rather than an implemented service; GitHub pull requests replace GitLab merge requests.
- Checks run: Verified only one `.git` directory exists; validated GitHub Actions YAML with Ruby YAML parsing; searched for stale GitLab/project-info references; checked for copied `.DS_Store`, `.terraform`, `.env`, and empty-directory leftovers.
- Follow-up/conflict notes: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, and other tools.

## 14-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`
- Summary: Added the authenticated `/integration-check` frontend page and protected `GET /integration/permissions` backend endpoint to verify a Firebase ID token and test its custom roles claim against the seeded RBAC permissions. Added local browser CORS support and frontend API URL documentation.
- Assumptions: This diagnostic route is useful for local integration verification before merging to `dev`; Firebase users being tested have a supported uppercase custom roles claim such as `roles: ["ATTENDEE"]`.
- Checks run: `services/backend`: `npm test` (93 passed), `npm run lint` (passed). `apps/frontend`: TypeScript project check passed before the pre-existing Tailwind/PostCSS build failure. Full frontend tests are blocked by a missing `@testing-library/jest-dom` installation; its production build is blocked by the existing Tailwind 4/PostCSS adapter mismatch. Backend Nest build is blocked by the existing TypeScript 7.0/Nest CLI incompatibility.
- Follow-up/conflict notes: A live check still requires a Firebase user with a supported custom roles claim and Firebase Admin credentials in the backend. The existing frontend application role remains hardcoded to `attendee`; the integration endpoint reports the role(s) actually present in the verified Firebase token.

## 15-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Added a manually run Firebase Admin script for assigning the five supported backend RBAC roles to local test users by email.
- Assumptions: The operator will replace placeholder emails, supply their own local service-account JSON path, and run the script intentionally against the selected Firebase project.
- Checks run: Script reviewed for supported role values, preserved non-role claims, and no embedded credentials.
- Follow-up/conflict notes: The script performs external account mutations when executed; users must refresh their Firebase session afterwards.

## 14-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned Tailwind CSS to 3.4.19, restoring compatibility with the frontend's existing Tailwind 3 PostCSS configuration and CSS directives.
- AI contribution: Dependency downgrade, lockfile refresh, and verification.
- Assumptions: The existing `tailwind.config.js`, `postcss.config.js`, and `src/index.css` are intentionally Tailwind 3 configuration and should not be migrated to Tailwind 4.
- Checks run: `npm ls tailwindcss --depth=0` (3.4.19); `npm run build` reached TypeScript compilation but is blocked by the existing TypeScript 7 removal of `baseUrl`; `git diff --check` found pre-existing trailing whitespace in `apps/frontend/package.json`.
- Follow-up/conflict notes: The separate pending TypeScript 7 update conflicts with the ESLint TypeScript peer range and prevents a clean build until it is reconciled; it was not changed in this scoped dependency fix.

## 15-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `development/AGENTS.md`, `development/local-dev`, `AI_USAGE.md`
- Summary: Reduced the local stack to frontend, backend, and PostgreSQL; removed the gateway, GCS, Pub/Sub, initialization, and Adminer services. The backend now runs and is published directly on `localhost:3000`, which is the frontend's default API URL.
- AI contribution: Compose/environment/documentation update and configuration validation.
- Assumptions: GCS, Pub/Sub, and the reverse proxy are not required by currently implemented local application behavior and should not be started by default. Keeping the backend on port 3000 inside and outside Compose is clearer for local development.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --no-interpolate`; searched local-dev configuration and documentation for stale emulator/gateway references; `git diff --check` on changed local-dev files.
- Follow-up/conflict notes: The requester deleted the now-unneeded `gateway/` and emulator `scripts/` folders after the Compose simplification; documentation was reconciled with the resulting layout.

## 15-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned frontend TypeScript to 6.0.3 so the ESLint TypeScript packages can satisfy their supported peer range and Docker's `npm ci` can install dependencies cleanly.
- AI contribution: Dependency diagnosis, manifest/lockfile update, and clean-install verification.
- Assumptions: The existing ESLint TypeScript packages remain the intended toolchain; TypeScript 6 is the compatible interim version.
- Checks run: `npm ci --ignore-scripts --no-audit --no-fund` (passed); `npm ls typescript --depth=0` (6.0.3); `npm run build` reached TypeScript compilation but is blocked by the existing `baseUrl` deprecation requiring either migration or `ignoreDeprecations: "6.0"`.
- Follow-up/conflict notes: No Docker image was built; the Dockerfile's dependency-install command was verified directly.

## 12-09-2026 - Codex (GPT-6) - Unknown

- Issue/PR: None supplied.
- Areas touched: Local Docker runtime; `AI_USAGE.md`.
- Summary: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.
- Assumptions: Gateway timeout after backend recreation indicated a stale upstream address; restarting restored connectivity.
- Checks run: Frontend `/planning` HTTP 200, gateway `/healthz` returned status ok, `/api/events` HTTP 200.
- Follow-up/conflict notes: Existing repository changes preserved; services left running and database retained. Dependency install reported 5 moderate and 1 high audit findings; dependency upgrades were outside this runtime repair.

## 20-09-2026 - Codex (GPT-6) - Unknown

- Issue/PR: None supplied; runtime diagnosis requested by user.
- Areas touched: AI_USAGE.md only; inspected frontend, backend and local Compose runtime.
- Findings: Chromium reproduced an empty page and Firebase auth/invalid-api-key during module initialization. All six VITE_FIREBASE configuration values are empty in the frontend container; local development/local-dev/.env has no matching Firebase entries. Backend FIREBASE_SERVICE_ACCOUNT_JSON is also empty. Required team Firebase configuration must be supplied locally before real sign-in can be verified.
- Checks: Compose frontend/backend/PostgreSQL healthy; backend /healthz returned status ok; frontend source HTTP 200; Playwright captured missing-config warning and uncaught Firebase error. In-app browser timed out, so used installed Playwright for diagnosis. No application tests rerun because no implementation changed.
- Follow-up/conflicts: Existing services and data preserved; no credentials printed, configuration invented, commits or pushes. Await team local Firebase configuration, then recreate frontend/backend and verify sign-in.

- Runtime follow-up: User supplied Firebase values and requested stack restart. Recreated Compose services preserving volumes. Browser now renders /login without page errors. Corrected local untracked .env PORT and VITE_API_BASE_URL from 8080 to Compose's published 3000; restarted services. Real account sign-in remains untested.

## 20-09-2026 - Codex (GPT-6) - Unknown

- Issue/PR: No new Jira key supplied; user requested a small follow-up to the existing My Requests UI on the current feature branch.
- Areas: apps/frontend/src/pages/MyRequestsPage.tsx, frontend README, AI_USAGE.md.
- Summary: Removed the + Create event request link above the request list. Existing request links and creation routes remain available.
- Checks: EventCreatePage and DraftWorkflow component suites passed (59 tests); git diff --check passed. Signed-in browser view not re-tested.
- Follow-up/conflicts: Preserved earlier runtime ledger entries; staged for human review, no commit or push.
- Runtime verification follow-up: Vite was serving stale transformed MyRequestsPage code despite the updated bind-mounted source. Restarted only the frontend container; HTTP verification now confirms the served module retains My Requests and no longer contains the removed creation link. Database and backend left untouched.
- Label follow-up: Renamed My Requests to My drafts in page heading, navigation, form links/help, related tests and frontend README. Kept existing list behavior and routes. Both affected suites passed (59 tests); restarted frontend and verified served heading/navigation contain My drafts; whitespace check passed. Staged without commit.
- Submission visibility follow-up: My drafts now filters the requests response to Draft status only, with updated description/loading/empty-state wording. Existing submission creates an event and My Events loads /events; its submitted-event test passes. Updated mixed-status regression and added submitted-only empty-state test. Three frontend suites passed (62 tests); whitespace check passed; restarted frontend and verified served filter. API records retained; no backend changes, commit or push.
- Missing submitted events follow-up: Backend /api/events returns two persisted submitted events under its local demo organiser. My Events incorrectly filtered this organiser ID against the Firebase UID. Removed redundant client organiser filtering, relying on existing backend organiser scoping; documented local identity limitation. Added Firebase-UID mismatch/reload regression. All three affected suites passed (63 tests); whitespace check passed; restarted frontend and confirmed old filter absent from served module. No data changes or backend authentication changes; signed-in browser verification remains with user.

## 21-09-2026 - Codex (GPT-6) - Unknown

- Context: User requested runtime diagnosis; no issue supplied. Areas changed: AI_USAGE.md only.
- Findings: Docker Desktop failed at 14:12 SGT because Windows could not access/rename sailor-ingest.sock; its log records successful socket listening at 14:21. Engine now responds; frontend, backend and PostgreSQL healthy, frontend HTTP 200 and backend health status ok. Old gateway container remains exited with a file/directory bind-mount mismatch for gateway/nginx.conf. Existing containers reference former compose.yaml; current checkout uses docker-compose.yml.
- Checks: docker version, compose ls, container status/state, Docker host logs, HTTP readiness and current Compose service names. No application tests needed for diagnosis.
- Follow-up/conflicts: Preserved existing ledger changes; no runtime or source changes, deletions, commit or push. Old gateway failure is separate from recovered Docker Desktop startup failure.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User-reported frontend compile error; no Jira issue supplied.
- Areas touched: `apps/frontend/src/App.tsx`, `AI_USAGE.md`.
- Summary: Derived `currentUserId` from the Zustand auth state for the `AppShell` remount key, and imported React Router's `Navigate` used by the root redirect.
- Assumptions: The shell should remount when `currentUser.id` changes after a login, logout, or session restoration.
- Checks: `npm run build` in `apps/frontend` passed.
- Follow-up/conflict notes: No commit, push, or pull request was created.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User-requested scan and merge of overlapping local PostgreSQL initialization files; no Jira issue supplied.
- Areas touched: `development/database/postgresql/init`, database and backend setup documentation, `AI_USAGE.md`.
- Summary: Merged the overlapping status/rejection rules from `006_event_rejection.sql`, `006_remove_under_review_status.sql`, and `007_allow_rejected_event_status.sql` into one final `006_event_rejection.sql`; removed the two superseded files. The consolidated initializer normalizes legacy `Under_Review` rows to `Submitted`, allows `Submitted`/`Approved`/`Rejected`, and requires a 10–500-character reason for rejections.
- Assumptions: Docker init scripts define fresh-volume state; existing volumes retain the backend-owned `003_event_rejection.sql` then `004_allow_rejected_event_status.sql` migration sequence.
- Checks: Reviewed filename-order execution and all references; `git diff --check` passed. Docker engine is available but its required `postgres:16-alpine` image is not present, so a fresh-container SQL execution was not run.
- Follow-up/conflict notes: The complementary `001_schema.sql`, `001_rbac.sql`, and `001_users.sql` were retained. No local volume, container, commit, push, or pull request was changed.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User requested consolidating the fresh-volume event lifecycle instead of retaining a dedicated rejection initializer; no Jira issue supplied.
- Areas touched: `development/database/postgresql/init`, database and backend setup documentation, `AI_USAGE.md`.
- Summary: Moved the final `Submitted`/`Approved`/`Rejected` status constraint and the 10–500-character rejected-reason constraint into `002_events.sql`; removed the status-changing logic from `004_clarifications.sql` and deleted the now-redundant `006_event_rejection.sql`.
- Assumptions: `002_events.sql` is the source of truth for fresh event-table creation, while existing persistent volumes continue to use backend migrations `003_event_rejection.sql` and `004_allow_rejected_event_status.sql`.
- Checks: Built a temporary `postgres:16-alpine`-based image and initialized an isolated PostgreSQL 16 database. All init scripts succeeded; `events_status_check`, `events_rejection_reason_check`, and `events.rejection_reason` were verified. Removed the temporary container and image afterward. `git diff --check` passed.
- Follow-up/conflict notes: No shared Compose container, volume, data, commit, push, or pull request was changed.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User requested exactly two SQL files under `development/database/postgresql/init`: one schema and one seed-data script; no Jira issue supplied.
- Areas touched: local PostgreSQL initialization, backend draft E2E fixture reference, migration comments, database/backend/local-dev documentation, `AI_USAGE.md`.
- Summary: Consolidated all extensions, tables, constraints, and indexes into `001_schema.sql`, and all RBAC, local-account, health-check, and fictional-event inserts into `002_seed_data.sql`. Removed the seven superseded initializer files and updated references.
- Assumptions: These scripts define fresh Docker-volume state only. Existing persistent volumes must keep using backend-owned additive migrations, not the rewritten initializer.
- Checks: Fresh isolated PostgreSQL 16 container initialization passed with only `001_schema.sql` and `002_seed_data.sql`; verified 5 roles, 10 resources, 27 permissions, 16 users, one sample event, and the auth/clarification/notification tables. `npm run build` in `services/backend` and `git diff --check` passed. Temporary container and image were removed; shared Compose resources were untouched.
- Follow-up/conflict notes: No commit, push, pull request, or local-volume reset was performed.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User requested retained history after consolidating the PostgreSQL initializer; no Jira issue supplied.
- Areas touched: `development/database/CHANGELOG.md`, database README, `AI_USAGE.md`.
- Summary: Added a durable changelog that records the prior event, local-auth/RBAC, clarification, status-retirement, and rejection-schema changes now represented by the two consolidated init scripts.
- Assumptions: Git history remains the complete implementation-level audit trail; the changelog is a concise operational guide, not a migration sequence.
- Checks: Confirmed historical commits touching the initializer and linked the changelog from the database README.
- Follow-up/conflict notes: No SQL files, containers, volumes, commits, pushes, or pull requests were changed by this documentation update.

## 22-09-2026 - Codex (GPT-5) - Unknown

- Context: User requested `@vitest/coverage-v8` for both frontend and backend; no Jira issue supplied.
- Areas touched: frontend/backend Vitest configuration, backend CI test entrypoint and README, `AI_USAGE.md`.
- Summary: The package was already installed and locked in both components. Added explicit V8 coverage/report configuration to their standard Vitest configs and changed backend CI to run its existing coverage command, matching the frontend's coverage-enabled CI entrypoint.
- Assumptions: Coverage reporting should not enforce a project-wide threshold; the existing SPM-37 focused coverage configurations retain their strict thresholds.
- Checks: `npm run test:coverage` in `apps/frontend` — 201/201 passed; V8 summary: 87.61% statements, 80.66% branches, 80.95% functions, 89.60% lines. `npm run test:cov` in `services/backend` — 434/434 passed; V8 summary: 95.41% statements, 94.16% branches, 92.17% functions, 96.20% lines.
- Follow-up/conflict notes: No commit, push, or pull request was created.

## 30-09-2026 - Codex - Unknown

- Issue/PR: Unknown; scoped agent guidance update
- Human requester/operator: swr
- Areas touched: `backend/AGENTS.md`, `database/AGENTS.md`, `frontend/AGENTS.md`, `AI_USAGE.md`.
- Summary: Aligned backend, database, and frontend guidance with the shared Jira/Confluence multi-agent workflow and runtime artifacts. Clarified backend DTO, model, repository, and helper responsibilities and documented feature-oriented frontend organization as the target for new/substantially changed work, leaving broad migration for a dedicated refactor.
- Assumptions: Existing flat backend feature files and frontend global folders remain until deliberately reorganized; new work should use the clarified responsibility boundaries.
- Checks run: `git diff --check`; inspected scoped folder layouts, backend package scripts, database initializer/migration ownership, and frontend component/test conventions.
- Follow-up/conflict notes: Documentation-only change. No application tests or code changes; no commit, push, or pull request.
