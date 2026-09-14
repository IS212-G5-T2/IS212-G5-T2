# AI Usage Log

Use this file to record meaningful AI-assisted work in this repository. The goal is coordination: if Codex, Claude, another AI tool, or a teammate changes the repo, future contributors should be able to see what was touched, why, and what assumptions were made.

Keep entries concise. Do not paste long prompts, private conversations, credentials, tokens, secrets, personal data, or production data.

## Entry Template

```md
## YYYY-MM-DD - <AI tool/model> - <short task title>

- Issue/PR: <GitHub issue, pull request, Jira ticket, or Unknown>
- Human requester/operator: <name or Unknown>
- Areas touched: <apps/...>, <services/...>, <platform/...>, <docs/...>, or <repo-wide>
- Summary: <what changed and why>
- AI contribution: <analysis, code, tests, docs, review, migration, etc.>
- Assumptions: <important assumptions made, or None>
- Checks run: <commands/workflows run, or Not run with reason>
- Follow-up/conflict notes: <known overlap with other AI/human work, pending review, or None>
```

## Entries

## 2026-09-15 - Codex (GPT-5) - Document Firebase role assignment script

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/scripts/set-firebase-roles.mjs`, `AI_USAGE.md`
- Summary: Added JSDoc for role-assignment data, validation inputs and failures, and the Firebase custom-claim update operation.
- AI contribution: Script documentation and syntax verification.
- Assumptions: The existing email-to-role mappings and Firebase update behavior must remain unchanged.
- Checks run: `node --check services/backend/scripts/set-firebase-roles.mjs`; `git diff --check` (an unrelated existing trailing-whitespace warning remains in `apps/frontend/package.json`).
- Follow-up/conflict notes: The role-assignment script was already staged; no Firebase users were modified, and no commit or pull request was created.

## 2026-09-15 - Codex (GPT-5) - Load local backend environment configuration

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/config`, `services/backend/src/main.ts`, `AI_USAGE.md`
- Summary: Load `services/backend/.env` before creating Nest providers so Firebase Admin uses the configured local service account instead of unrelated application-default credentials.
- AI contribution: Root-cause analysis, implementation, and regression test.
- Assumptions: The backend is launched with `services/backend` as its working directory, as its npm scripts do.
- Checks run: Targeted Vitest tests (19 passed); `npm run build`; `npm run lint`; `git diff --check`; isolated configuration check confirmed the configured service account targets `spm-is212-g5-t2-ecd8b`.
- Follow-up/conflict notes: Existing unrelated working-tree changes were preserved; no commit or pull request created.

## 2026-09-13 - Codex - Add Firebase emulator E2E workflow

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `firebase.json`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
- AI contribution: E2E implementation, CI workflow, and emulator integration.
- Assumptions: `demo-is212` is used as a safe emulator-only project ID; PostgreSQL can be started from `development/database/postgresql` in GitHub Actions.
- Checks run: `npm run lint`; `npm run build`; Ruby YAML/JSON config validation; `git diff --check`. Emulator-backed E2E execution was not run because the local Auth Emulator was unavailable.
- Follow-up/conflict notes: Local Docker/emulator execution was not run in this environment; no commit or pull request created.

## 2026-09-13 - Codex - Recheck authentication E2E coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `AI_USAGE.md`
- Summary: Rechecked the authentication E2E test against the current AuthModule and middleware wiring after removing AuthorizationService; no test changes were required.
- AI contribution: Test review and execution.
- Assumptions: The file is intended to cover Firebase authentication middleware, not resource-level RBAC enforcement.
- Checks run: `npm run test:e2e -- test/auth.e2e-spec.ts` outside the sandbox (3 tests passed); the full E2E command was sandbox-blocked because local server binding is restricted.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Organize database service tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Grouped successful database and transaction behavior separately from configuration and failure behavior, matching the RBAC test organization.
- AI contribution: Test organization and verification.
- Assumptions: Missing configuration, connection failures, rollbacks, and unconfigured shutdown are unintended behavior cases.
- Checks run: `npm test -- src/database/database.service.spec.ts` (8 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing database service tests were preserved; no commit or pull request created.

## 2026-09-13 - Codex - Document RBAC predicate return value

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Expanded the `buildPermissionPredicate()` comment with its SQL return value and execution behavior.
- AI contribution: Documentation update.
- Assumptions: None.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Remove redundant authorization service

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth`, `services/backend/README.md`, `services/backend/HANDOVER.md`, `services/backend/CHANGELOG.md`, `AI_USAGE.md`
- Summary: Removed the separate `AuthorizationService` and its tests; updated auth wiring and backend documentation to use composable RBAC predicates inside resource queries.
- AI contribution: Architecture refactor, cleanup, and verification.
- Assumptions: Resource repositories will enforce RBAC and ownership in the same SQL operation and will not perform a preceding authorization query.
- Checks run: `npm test` (90 tests passed); `npm run lint`; `npm run build`; `git diff --check`; searched for remaining `AuthorizationService` references.
- Follow-up/conflict notes: Existing Firebase authentication and `RbacRepository` work was preserved; no commit or pull request created.

## 2026-09-13 - Codex - Organize RBAC predicate behavior tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Grouped valid predicate generation under intended behavior and arbitrary/injected actions under unintended behavior.
- AI contribution: Test organization and type-safe test correction.
- Assumptions: Runtime-invalid actions must be rejected even though the method accepts the `PermissionAction` TypeScript union.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `npm run build`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Add RBAC predicate injection denial test

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added unintended-behavior coverage proving arbitrary or injected permission column names are rejected.
- AI contribution: Security-focused unit-test design and verification.
- Assumptions: Runtime action values must be limited to the four supported CRUD actions even when TypeScript typing is bypassed.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Make RBAC SQL placeholders explicit

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Replaced internal placeholder variables with explicit `$1` and `$2` positions in the composable RBAC predicate.
- AI contribution: Code clarity improvement and verification.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Harden RBAC SQL predicate construction

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Standardized the composable RBAC predicate on fixed `$1` and `$2` placeholders, eliminating interpolated placeholder text.
- AI contribution: Security review, implementation, and unit tests.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name, with operation-specific parameters beginning at `$3`.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Permission columns remain selected only from the fixed `PermissionAction` mapping; no commit or pull request created.

## 2026-09-13 - Codex - Add composable RBAC permission predicate

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a composable SQL `EXISTS` predicate that resource repositories can embed in their data operation to enforce RBAC without a separate network request.
- AI contribution: Repository API design, unit tests, and verification.
- Assumptions: Calling repositories will pass a PostgreSQL text-array parameter containing the authenticated user's roles and a parameter containing the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: `hasPermission()` remains available for standalone checks; no commit or pull request created.

## 2026-09-13 - Codex - Add RBAC denial edge cases

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added focused negative tests for missing permission rows, explicit denials, and truthy non-boolean database values.
- AI contribution: Unit-test design and verification.
- Assumptions: Only an explicit boolean `true` should grant permission; missing or malformed rows should deny access.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (53 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created; existing working-tree changes were preserved.

## 2026-09-13 - Codex - Expand database service coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Added deterministic coverage for unreachable database URLs, query delegation, successful and failed transactions, client release, and pool shutdown.
- AI contribution: Unit-test design and coverage expansion.
- Assumptions: A configured URL can still be invalid or unreachable; connection failures should be propagated by the database service for callers to handle.
- Checks run: Targeted Vitest coverage (8 tests passed; 100% statements, branches, functions, and lines); `npm --prefix services/backend run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing working-tree changes were preserved; no commit or pull request created.

## 2026-09-12 - Codex - Expand RBAC permission matrix coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
- AI contribution: Parameterized unit-test design and coverage verification.
- Assumptions: CRUD bit strings represent `create`, `read`, `update`, and `delete` in that order; absent seeded role/resource rows are represented as `0000`.
- Checks run: Targeted Vitest coverage (50 role/resource cases and 200 permission checks passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No separate unintended-behavior section remains; the uncovered branch is framework-generated NestJS decorator metadata.

## 2026-09-12 - Codex - Add explicit RBAC denial coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a negative test for permission rows that explicitly deny an action.
- AI contribution: Unit-test addition and coverage verification.
- Assumptions: The repository should return `false` for an existing permission row with `allowed: false`.
- Checks run: Targeted coverage (3 tests passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: The remaining branch is emitted for NestJS decorator metadata rather than repository authorization logic.

## 2026-09-12 - Codex - Organize RBAC repository tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Organized RBAC repository tests into intended and unintended behavior sections consistent with the Firebase authentication specs, preserving the existing parameterized permission query.
- AI contribution: Test-structure refactor and verification.
- Assumptions: The current `CASE`-based `hasPermission()` implementation is existing work and should remain unchanged.
- Checks run: Targeted RBAC repository tests (2 passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: None.

## 2026-09-12 - Codex - Fix authentication middleware assertion

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication/firebase-authentication.middleware.spec.ts`, `AI_USAGE.md`
- Summary: Updated the middleware test expectation to include the verified user's email field and added coverage for Firebase verification failures.
- AI contribution: Test correction, negative-path test, and targeted coverage verification.
- Assumptions: The middleware should attach the complete verified Firebase user object to the request.
- Checks run: Targeted Vitest coverage and `git diff --check`; 5 tests passed; 100% statements/functions/lines and 90% branches.
- Follow-up/conflict notes: The remaining branch gap is reported on the injectable decorator line and does not represent an untested middleware behavior.

## 2026-09-12 - Codex - Review Firebase token service test coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Reviewed Firebase token service tests against implementation behavior and verified targeted Vitest coverage.
- AI contribution: Test coverage and negative-case review; no production code changes.
- Assumptions: The question concerns unit-test completeness, including behavioral edge cases beyond line coverage.
- Checks run: `npm --prefix services/backend run test -- src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (17 passed; 100% statements/branches/functions/lines).
- Follow-up/conflict notes: Coverage is complete at the instrumentation level, but additional edge-case assertions are recommended for stronger behavioral confidence.

## 2026-09-12 - Codex - Harden Firebase bearer-token parsing

- Issue/PR: SPM-106
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Replaced delimiter-based Authorization header parsing with a strict Bearer-token regular expression and added malformed-header coverage.
- AI contribution: Middleware implementation and unit test update.
- Assumptions: Bearer schemes are case-insensitive and Firebase ID tokens contain no whitespace.
- Checks run: `npx vitest run src/auth/authentication/firebase-authentication.middleware.spec.ts`; `npm run lint`.
- Follow-up/conflict notes: Middleware files already contained other staged/comment changes; those changes were preserved.

## 2026-09-12 - Codex - Set up JWT verification and authorization

- Issue/PR: SPM-106
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Added a NestJS auth module with Firebase ID-token middleware that attaches verified uid/roles claims to requests, centralized PostgreSQL access through `DatabaseService`, and RBAC services that check role permissions against the existing PostgreSQL tables and support ownership checks.
- AI contribution: Jira review, backend auth/RBAC code, unit/e2e tests, dependency updates, and backend documentation.
- Assumptions: Firebase custom `roles` claims will use the existing RBAC seed role names (`ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, `ATTENDEE`); product endpoints or future route-specific middleware will call `AuthorizationService` when resource/action context exists.
- Checks run: `npx vitest run src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (100% statements/branches/functions/lines for `firebase-token.service.ts`); `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox because Supertest needs to bind a local test server.
- Follow-up/conflict notes: Work was created on `feature/SPM-106-set-up-jwt-verification-and-authorization` from `feature/spm-30-attendee-login`; npm reported 6 vulnerabilities after adding Firebase Admin/PostgreSQL dependencies and they were not auto-fixed to avoid unrequested dependency churn.

## 2026-09-14 - Codex (GPT-5) - Remove hard-coded authentication test password

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
- AI contribution: Secret-handling remediation and CI configuration.
- Assumptions: The repository’s GitHub secret is named `SEED_PASSWORD`; local test runs must export the variable themselves.
- Checks run: Source search for the removed literal and `git diff --check`; frontend tests require `SEED_PASSWORD` and dependencies to be available.
- Follow-up/conflict notes: The exposed password should be rotated; existing untracked Firebase service-account material was preserved and not staged.

## 2026-09-14 - Codex (GPT-5) - Use fake credentials for mocked login tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the real-looking test password with an explicitly fake password and removed unnecessary environment-secret wiring because Firebase authentication is mocked.
- AI contribution: Test-fixture security remediation and documentation.
- Assumptions: Login unit tests should validate UI behavior with deterministic mock data, not real Firebase accounts.
- Checks run: Source search for the removed credential and `git diff --check`; frontend tests remain unavailable locally because Vitest is not installed.
- Follow-up/conflict notes: Existing untracked Firebase service-account material was preserved and not staged.

## 2026-09-13 - Codex - Fix PR #6 CI dependency installation

- Issue/PR: PR #6
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.
- AI contribution: Dependency/configuration fix, CI cleanup, lockfile regeneration, tests, commit, and push.
- Assumptions: The current Vite version's native `resolve.tsconfigPaths` support is the intended replacement.
- Checks run: `npm install --package-lock-only`; `npm ci --ignore-scripts`; `npm test`; workflow YAML validation; `git diff --check`.
- Follow-up/conflict notes: No secret files were included or modified.

## 2026-09-11 - Codex - Set up RBAC database seed

- Issue/PR: SPM-103
- Human requester/operator: swr
- Areas touched: `development/database`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added local PostgreSQL RBAC tables and seed data in a separate init SQL file, documented standalone PostgreSQL build/run/smoke-check usage, and removed baked PostgreSQL credentials from the database image.
- AI contribution: Jira review, database SQL, local development documentation, and validation.
- Assumptions: RBAC belongs in a separate local database init file from base/user-auth schema; backend relationship-level authorization will be implemented separately from this seed data.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`; `rg -n "POSTGRES_PASSWORD|POSTGRES_USER|POSTGRES_DB" -g 'Dockerfile' development services apps`; `rg -n "can_create|can_read|can_update|can_delete" development/database`; Ruby validation that `002_rbac.sql` matches Jira's 5 roles, 10 resources, 27 permission rows, and plain quoted permission columns. Docker SQL execution was not run because the local Docker daemon socket was unavailable and no local PostgreSQL server binary was present.
- Follow-up/conflict notes: No existing local or remote branch/PR for SPM-103 was found before starting `feature/SPM-103-set-up-database-for-rbac`.

## 2026-09-11 - Codex - Switch shared branch guidance to dev

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/`, `.github/`, `apps/frontend/README.md`, `services/backend/README.md`, `AI_USAGE.md`
- Summary: Updated branch workflow guidance and GitHub Actions filters so normal work starts from and targets `dev`, with branch flow `work branch -> dev -> main`.
- AI contribution: Documentation, workflow configuration, and AI usage logging.
- Assumptions: There should be no active dependency on any intermediate shared branch between work branches and `dev`.
- Checks run: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/security.yml .github/workflows/tests.yml`; searched repo docs and workflows for stale branch references.
- Follow-up/conflict notes: Supersedes earlier AI usage entries that documented previous branch-flow assumptions.

## 2026-09-09 - Codex - Add frontend and database local-dev layout

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `development/database`, `apps/frontend`, `README.md`, `AGENTS.md`, `AI_USAGE.md`
- Summary: Added a frontend service to the local Docker Compose stack, separated PostgreSQL into a buildable local image under `development/database/postgresql`, baked local-only PostgreSQL defaults into that image, and updated repository/local development documentation for the frontend/backend/database layout.
- AI contribution: Local integration configuration, Dockerfile support, README updates, documentation, and AI usage logging.
- Assumptions: The existing NestJS backend remains the backend service, the existing React/Vite app should run as the frontend service, and database ownership should be separated under `development/database/postgresql` while Compose orchestration remains under `development/local-dev`.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `npm ci`; `npm run build`; searched README and scoped docs for stale local-dev/frontend/backend/database wording; `docker compose -f development/local-dev/compose.yaml build frontend` and `docker build -t spm-postgresql development/database/postgresql` could not complete because the local Docker daemon was unavailable.
- Follow-up/conflict notes: None.

## 2026-09-09 - Codex - Update Jira branch naming convention

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `README.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated branch naming guidance to use `<type>/<ticket_id>-<ticket_name>` instead of `<issue>-<short-name>` so connected Jira and GitHub work displays the ticket id and Jira ticket name.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: The ticket name should be slugged with hyphens for branch compatibility while preserving the Jira ticket id exactly.
- Checks run: Searched repository docs for stale branch-name examples.
- Follow-up/conflict notes: None.

## 2026-09-09 - Codex - Scaffold NestJS backend

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/`, `development/local-dev/`, `.github/workflows/`, `README.md`, `AI_USAGE.md`
- Summary: Removed the generic service template and scaffolded a real NestJS backend at `services/backend` with npm, strict TypeScript, Vitest, oxlint, Dockerfile support, service docs, and a monorepo CI unit-test entrypoint. Updated local Docker Compose and the gateway to build and route to the backend service.
- AI contribution: Official-docs lookup, Nest CLI scaffold, backend wiring, tests, and documentation updates.
- Assumptions: The backend service should be named `backend`; NestJS is the default backend framework; deployment-related Nest/Mau scripts should be removed to match the no-deployment repository direction.
- Checks run: `npm ci`; `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox after the sandbox blocked local server binding; `services/backend/scripts/ci/unit-test.sh`; `docker compose -f development/local-dev/compose.yaml config --quiet`; searched for stale `services/template`, `sample-service`, and deployment references.
- Follow-up/conflict notes: The Nest CLI generated current NestJS 12 ESM/Vitest/oxlint defaults.

## 2026-09-09 - Codex - Remove deployment workflow assumptions

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `development/`, `docs/`
- Summary: Removed the remaining deployment, Terraform, Kubernetes, and previous multi-branch workflow assumptions after `platform/` was removed. This entry recorded the then-current shared branch guidance, which was superseded on 2026-09-11 by the `dev` branch flow.
- AI contribution: Repository scan, workflow cleanup, documentation updates, and AI usage logging.
- Assumptions: The repository no longer needs deployment automation or promotion branches; local Docker Compose emulators remain useful for development and are not deployment infrastructure.
- Checks run: Parsed GitHub Actions YAML with Ruby YAML; searched the repo for deployment/platform/branch-flow references and deployment-related filenames.
- Follow-up/conflict notes: Existing `platform/` deletions were already present before this work and were preserved.

## 2026-09-07 - Codex - Human-reviewed commit gate

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so agents stage completed changes for human review and wait for explicit approval before committing, pushing, or creating a pull request. Added an explicit no-auto-merge rule.
- AI contribution: Documentation and process guidance updates.
- Assumptions: Staging changes is acceptable for review, but committing and pull request creation require explicit human approval to proceed with the commit.
- Checks run: Reviewed updated Markdown content.
- Follow-up/conflict notes: Pending human review before commit.

## 2026-09-07 - Codex - Resolve security workflow annotations

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/security.yml`, `.github/workflows/tests.yml`, `.github/workflows/terraform.yml`, `AI_USAGE.md`
- Summary: Fixed security workflow annotations by updating GitHub workflow checkout steps to `actions/checkout@v7`, correcting the Trivy action pin to `aquasecurity/trivy-action@v0.36.0`, and replacing the licensed Gitleaks Action wrapper with the pinned Gitleaks CLI Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1`.
- AI contribution: CI workflow repair and validation.
- Assumptions: The repository should keep a free secret scan that works for an organization-owned GitHub repository without requiring `GITLEAKS_LICENSE`.
- Checks run: Verified available Trivy, checkout, and Gitleaks tags with `git ls-remote`; parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 2026-09-07 - Codex - Branch promotion CI guard

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/branch-flow.yml`, `AGENTS.md`, `docs/ci-cd-process.md`, `AI_USAGE.md`
- Summary: Added a GitHub Actions check for the earlier multi-branch promotion model. This entry is historical only; the promotion workflow was later removed, and current branch guidance is `work branch -> dev -> main`.
- AI contribution: CI workflow and documentation updates.
- Assumptions: GitHub branch protection will be configured to require the `Validate Promotion Source` check where enforcement is needed.
- Checks run: Parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 2026-09-07 - Codex - Jira and GitHub authority rules

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so Jira is the authoritative requirements source and GitHub is the authoritative development artifact source. Added status gating, existing branch/PR reuse, Jira-key branch/commit/PR requirements, acceptance-criteria recheck, and Jira automation ownership rules.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: Jira statuses `To Do` and `In Progress` are the only statuses where implementation should proceed; Jira automation handles status transitions for branch creation, pull request creation, and pull request merge.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future AI agents should not duplicate the Jira story into GitHub Issues or manually mark Jira work items `Done`.

## 2026-09-07 - Codex - AI workflow and branch progression guidance

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
- AI contribution: Documentation structure, workflow guidance updates, and coordination rules for multiple AI agents.
- Assumptions: Earlier multi-branch assumptions were recorded here for historical context only. Current branch guidance is `work branch -> dev -> main`.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future Codex, Claude, or other AI work should add a new entry here before pull request handoff.

## 2026-09-07 - Codex - GitLab to GitHub migration cleanup

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `platform/`, `development/`, `docs/`
- Summary: Copied working files from the GitLab export into the GitHub repository without copying nested `.git` directories, converted GitLab CI/review metadata to GitHub Actions and pull request metadata, removed stale project-info/GitLab-only material, simplified the service template, and documented the Codex issue workflow and monorepo CI/CD process.
- AI contribution: Migration cleanup, workflow restructuring, documentation updates, repo boundary guidance, and local verification sweeps.
- Assumptions: The GitHub repository should be the single source repo; `services/template` is a scaffold rather than an implemented service; GitHub pull requests replace GitLab merge requests.
- Checks run: Verified only one `.git` directory exists; validated GitHub Actions YAML with Ruby YAML parsing; searched for stale GitLab/project-info references; checked for copied `.DS_Store`, `.terraform`, `.env`, and empty-directory leftovers.
- Follow-up/conflict notes: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, and other tools.

## 2026-09-12 - Claude (Sonnet) - Login page with Firebase Authentication

- Issue/PR: SPM-104 (inferred from branch name `feature/spm-104-set-up-frontend-login-page`; Jira itself was not accessible in this session)
- Human requester/operator: Unknown (chat user; name not provided)
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Added a `/login` page (`src/pages/LoginPage.tsx`) using Firebase Authentication (Email/Password provider) via the `firebase` JS SDK: `src/lib/firebase.ts` (SDK init + error-message mapping), `.env.example` for `VITE_FIREBASE_*` config, `src/vite-env.d.ts` typings, an `onAuthStateChanged` subscription in `App.tsx` for session persistence, `authLoading`/`isAuthenticated` state plus a shared `AuthLoadingScreen`, a `RequireAuth` route guard applied to all other routes, and a "Log out" control in `TopNav`. Updated `README.md`/`HANDOVER.md`/`CHANGELOG.md`.
- AI contribution: Dependency addition, frontend code (Firebase integration, store, routing, UI), documentation updates, local build verification.
- Assumptions: Signed-in Firebase users are mapped to app role `attendee` since there is no backend role lookup yet. `.env` is expected to hold a real Firebase project's config; no live Firebase project was reachable from this session to test end-to-end.
- Checks run: `npm run build` (tsc + vite build) in `apps/frontend` — passed. `npm install firebase` completed cleanly. Not run: end-to-end sign-in against a real Firebase project; `npm run lint` (pre-existing missing ESLint config, unrelated to this change).
- Follow-up/conflict notes: Role-aware sign-in (vs. hardcoded `attendee`), password reset/self-registration flows, and reconciling any doc staleness elsewhere in this directory are left as follow-up work.

## 2026-09-14 - Codex (GPT-5) - Local frontend-to-backend RBAC integration check

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`
- Summary: Added the authenticated `/integration-check` frontend page and protected `GET /integration/permissions` backend endpoint to verify a Firebase ID token and test its custom roles claim against the seeded RBAC permissions. Added local browser CORS support and frontend API URL documentation.
- Assumptions: This diagnostic route is useful for local integration verification before merging to `dev`; Firebase users being tested have a supported uppercase custom roles claim such as `roles: ["ATTENDEE"]`.
- Checks run: `services/backend`: `npm test` (93 passed), `npm run lint` (passed). `apps/frontend`: TypeScript project check passed before the pre-existing Tailwind/PostCSS build failure. Full frontend tests are blocked by a missing `@testing-library/jest-dom` installation; its production build is blocked by the existing Tailwind 4/PostCSS adapter mismatch. Backend Nest build is blocked by the existing TypeScript 7.0/Nest CLI incompatibility.
- Follow-up/conflict notes: A live check still requires a Firebase user with a supported custom roles claim and Firebase Admin credentials in the backend. The existing frontend application role remains hardcoded to `attendee`; the integration endpoint reports the role(s) actually present in the verified Firebase token.

## 2026-09-15 - Codex (GPT-5) - Firebase test-role assignment helper

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Added a manually run Firebase Admin script for assigning the five supported backend RBAC roles to local test users by email.
- Assumptions: The operator will replace placeholder emails, supply their own local service-account JSON path, and run the script intentionally against the selected Firebase project.
- Checks run: Script reviewed for supported role values, preserved non-role claims, and no embedded credentials.
- Follow-up/conflict notes: The script performs external account mutations when executed; users must refresh their Firebase session afterwards.

## 2026-09-14 - Codex (GPT-5) - Restore Tailwind CSS 3 PostCSS compatibility

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned Tailwind CSS to 3.4.19, restoring compatibility with the frontend's existing Tailwind 3 PostCSS configuration and CSS directives.
- AI contribution: Dependency downgrade, lockfile refresh, and verification.
- Assumptions: The existing `tailwind.config.js`, `postcss.config.js`, and `src/index.css` are intentionally Tailwind 3 configuration and should not be migrated to Tailwind 4.
- Checks run: `npm ls tailwindcss --depth=0` (3.4.19); `npm run build` reached TypeScript compilation but is blocked by the existing TypeScript 7 removal of `baseUrl`; `git diff --check` found pre-existing trailing whitespace in `apps/frontend/package.json`.
- Follow-up/conflict notes: The separate pending TypeScript 7 update conflicts with the ESLint TypeScript peer range and prevents a clean build until it is reconciled; it was not changed in this scoped dependency fix.

## 2026-09-15 - Codex (GPT-5) - Simplify local Compose to three tiers

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `development/AGENTS.md`, `development/local-dev`, `AI_USAGE.md`
- Summary: Reduced the local stack to frontend, backend, and PostgreSQL; removed the gateway, GCS, Pub/Sub, initialization, and Adminer services. The backend now runs and is published directly on `localhost:3000`, which is the frontend's default API URL.
- AI contribution: Compose/environment/documentation update and configuration validation.
- Assumptions: GCS, Pub/Sub, and the reverse proxy are not required by currently implemented local application behavior and should not be started by default. Keeping the backend on port 3000 inside and outside Compose is clearer for local development.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --no-interpolate`; searched local-dev configuration and documentation for stale emulator/gateway references; `git diff --check` on changed local-dev files.
- Follow-up/conflict notes: The requester deleted the now-unneeded `gateway/` and emulator `scripts/` folders after the Compose simplification; documentation was reconciled with the resulting layout.

## 2026-09-15 - Codex (GPT-5) - Restore frontend clean-install compatibility

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned frontend TypeScript to 6.0.3 so the ESLint TypeScript packages can satisfy their supported peer range and Docker's `npm ci` can install dependencies cleanly.
- AI contribution: Dependency diagnosis, manifest/lockfile update, and clean-install verification.
- Assumptions: The existing ESLint TypeScript packages remain the intended toolchain; TypeScript 6 is the compatible interim version.
- Checks run: `npm ci --ignore-scripts --no-audit --no-fund` (passed); `npm ls typescript --depth=0` (6.0.3); `npm run build` reached TypeScript compilation but is blocked by the existing `baseUrl` deprecation requiring either migration or `ignoreDeprecations: "6.0"`.
- Follow-up/conflict notes: No Docker image was built; the Dockerfile's dependency-install command was verified directly.
