# General AI usage history

Entries without a single Jira ticket.

## 2026-10-08

- swr - documentation - Add Sprint Planning 3 DoD to requirement review and PR evidence: Transcribed the four-page user-provided PDF into the Requirement Reviewer and pull request template; distinguished pre-PR checks from PO, approval, and merge checks. Verified rendered pages, matching checklist items, and documentation links; no application tests run.
- swr - documentation - Parallelize independent review gates: Kept Test Review first, allowed Requirement and Code Quality Reviews on one stable snapshot, raised Codex subagent capacity to two, and aligned playbooks, adapters, example, and README. Checked workflow references, TOML, and diff; no application tests run.
- swr - documentation - Audit AI guidance and archive routing: Corrected Orchestrator playbook filenames and archive entry instructions, aligned README with the archive index, and linked the shared skills for Claude. Checked Markdown links, metadata, adapters, and skill paths; no application tests run.
- swr - documentation - Clarify test-case comments: Required short documentation comments directly above new tests, with verified Confluence case IDs when applicable; aligned the test-generation skill. When an ID is unavailable, use sourced traceability or a behavior description and report required mapping gaps. Checked existing instructions and test examples; no application tests run.
- swr - documentation - Archive AI usage by ticket: Moved 204 existing entries into 24 SPM files and general.md, with the root log retained as an index.
- swr - documentation - Add repository test skills (Codex/GPT-6): Added on-demand generation and read-only review guidance, routed Implementation and Test Reviewer, and kept the gate contract intact. Checked skill metadata, links, package scripts, CI and diff; skill-creator validator unavailable because PyYAML is absent. No application tests run; Jira/Confluence not accessed.
- swr - documentation - Group frontend pages by feature in module-organization skill: Added an on-demand page-family map and migration checks; inferred owners from current routes and imports. Verified skill metadata, reference path, Claude symlink, and staged diff; no application checks run because code was unchanged.
- swr - documentation - Consolidate AI usage history: Grouped 212 source entries by date, removed ten exact duplicates and shortened each work summary.
- swr - documentation - Consolidate AI issue workflow: Removed duplicate workflow guidance and retained its ticket and GitHub handoff rules in the Implementation playbook.
- swr - documentation - Orchestrator skill evaluation: Added the review-snapshot skill while keeping review decisions in the Orchestrator contract.
- general - documentation - Native development agent workflow: Added Codex and Claude role adapters, shared playbooks and sequential review gates.

## 2026-10-07

- Wei Zhi - fix - Remove DEMO_ORGANISER_ENABLED and the shared demo identity: Removed the demo-organiser flag and shared fallback identity after verifying their use.

## 2026-10-06

- swr - implementation - Show navigation for every granted role: Fixed the sidebar so multi-role accounts combine navigation from every server-granted role, and so parent routes do not remain active on nested pages.

## 2026-10-04

- swr - fix - Repair registration-window TypeScript build: Fixed a TypeScript narrowing error without changing registration behavior.

## 2026-10-03

- general - maintenance - Restore Docker Compose backend build: Widened the status-list lookup to accept the existing `RegistrationWindow.status: string` contract, resolving the TypeScript build error that prevented the backend Docker image from building.

## 2026-09-24

- swr - maintenance - Add local event seed cases: Added four fictional event records covering different workflow states.

## 2026-09-22

- swr - investigation - Analyze backend authentication coverage: Created `codex/fix-authentication-coverage` from the current `dev` baseline, analyzed the authentication-only coverage gaps before any deletion, and added focused coverage tests.
- swr - testing - Repair frontend coverage CI entrypoint: Corrected the frontend CI entrypoint to invoke the configured `test:cov` script and corrected that script to use Vitest's supported `--coverage` flag.
- swr - maintenance - Move application, database, and Compose directories to the repository root: Moved `apps/frontend` to `frontend`, `services/backend` to `backend`, `development/database` to `database`, and `development/local-dev` to `docker-compose`.
- swr - implementation - Wait for final PostgreSQL startup in E2E CI: Corrected the CI readiness gate to wait for the PostgreSQL image's initialization phase to finish before accepting the final server as ready.
- swr - implementation - Serialize shared PostgreSQL E2E suites: Configured Vitest to run PostgreSQL-backed E2E files sequentially because they share one mutable test database and clean up their own fixtures.
- swr - implementation - Guard browser-session restoration against stale auth updates: Completed the auth revision guard so late session-restoration results cannot overwrite a newer login or logout, and added a regression test for a late restore after sign-out.
- kirub - implementation - Wire event and draft services to the shared database pool: Replaced the separate `pg.Pool` instances in `EventsService` and `DraftsService` with injected `DatabaseService` access.
- general - fix - Repair frontend route authentication identity selector: Derived `currentUserId` from the Zustand auth state for the `AppShell` remount key, and imported React Router's `Navigate` used by the root redirect.
- general - maintenance - Consolidate overlapping PostgreSQL initializers: Merged the overlapping status/rejection rules from `006_event_rejection.sql`, `006_remove_under_review_status.sql`, and `007_allow_rejected_event_status.sql` into one final `006_event_rejection.sql`; removed the two superseded files.
- general - maintenance - Fold final event lifecycle into the base initializer: Moved the final `Submitted`/`Approved`/`Rejected` status constraint and the 10–500-character rejected-reason constraint into `002_events.sql`; removed the status-changing logic from `004_clarifications.sql` and deleted the now-redundant `006_event_rejection.sql`.
- general - maintenance - Consolidate local PostgreSQL initialization into schema and seed scripts: Consolidated all extensions, tables, constraints, and indexes into `001_schema.sql`, and all RBAC, local-account, health-check, and fictional-event inserts into `002_seed_data.sql`.
- general - maintenance - Preserve local database initializer history: Added a durable changelog that records the prior event, local-auth/RBAC, clarification, status-retirement, and rejection-schema changes now represented by the two consolidated init scripts.
- general - testing - Configure Vitest V8 coverage reports: Configured V8 coverage reports for frontend and backend tests and CI.
- general - maintenance - Remove combined coverage dashboard automation: Removed obsolete combined coverage dashboard guidance while keeping component reports.

## 2026-09-21

- swr - testing - Complete frontend authentication-client coverage: Expanded PostgreSQL-session authentication client coverage while retaining traceability.
- swr - testing - Complete API helper coverage: Merged duplicate session-header assertions and expanded API-helper coverage for configured/default origins, caller headers, network failure, non-JSON responses, validation errors, attachment-size errors, server errors, and the error type.
- swr - testing - Rebuild PostgreSQL login page tests: Rebuilt `LoginPage.test.tsx` from the current `USER-LOGIN-01/02/03` Confluence cases, retaining separate field-validation, pending-submission, redirect, and recovery checks while replacing Firebase doubles with the local backend-auth client.
- swr - testing - Harden PostgreSQL authentication E2E coverage: Reworked the backend authentication E2E suite to use a real seeded account and cover successful session use, credential normalization and validation, enumeration-safe failures, invalid/missing cookies, logout clearing and revocation, expired sessions, and disabled accounts.
- swr - testing - Restore local-login test traceability: Restored the deleted login-page unit suite as PostgreSQL-session tests and added direct `USER-LOGIN-01/02/03` Confluence test-case comments above each corresponding test.
- swr - implementation - Centralize authentication configuration: Moved session environment parsing from the authentication feature to `src/config/auth.config.ts`; standardized configuration and the default cookie as `AUTH_*` and `connectsphere_session` without a temporary local-auth namespace.
- swr - testing - Expand authentication repository edge coverage: Added failure-path tests that verify each authentication repository operation propagates PostgreSQL failures instead of treating an outage as an authentication result.
- swr - maintenance - Align local development seed password: Aligned authentication test fixtures and local setup guidance with the seeded local account.
- swr - implementation - Minimize authenticated account data: Removed password hashes from the authentication repository SELECT result and account types; PostgreSQL retains credential verification through `crypt()` without returning the hash to application memory.
- swr - testing - Cover authentication repository persistence boundary: Tested credential lookup, session persistence, row mapping and revocation.
- swr - implementation - Reorganize backend authentication source: Grouped local login, session, repository, controller, configuration, middleware, and their unit tests under `src/auth/authentication`, while retaining the module, shared models, and RBAC authorization boundary at their existing feature-level locations.
- swr - implementation - Add PostgreSQL local-login foundation: Added user/session schema and cookie-based login alongside existing Firebase authentication.
- general - investigation - Diagnose Docker failure: Confirmed Docker recovered and three services were healthy; isolated the old gateway mount failure.

## 2026-09-20

- general - investigation - Diagnose blank frontend and login setup: Traced the blank page to missing Firebase config; after local config and restart, login rendered.

## 2026-09-16

- swr - maintenance - Correct Firebase emulator Docker build source path: Updated the Firebase emulator image to copy its configuration from the path within Compose's repository-root build context.

## 2026-09-15

- swr - documentation - Document Firebase role assignment script: Added JSDoc for role-assignment data, validation inputs and failures, and the Firebase custom-claim update operation.
- swr - implementation - Load local backend environment configuration: Load `services/backend/.env` before creating Nest providers so Firebase Admin uses the configured local service account instead of unrelated application-default credentials.
- swr - testing - Firebase test-role assignment helper: Added a manually run Firebase Admin script for assigning the five supported backend RBAC roles to local test users by email.
- swr - maintenance - Simplify local Compose to three tiers: Reduced the local stack to frontend, backend, and PostgreSQL; removed the gateway, GCS, Pub/Sub, initialization, and Adminer services.
- swr - fix - Restore frontend clean-install compatibility: Pinned frontend TypeScript to 6.0.3 so the ESLint TypeScript packages can satisfy their supported peer range and Docker's `npm ci` can install dependencies cleanly.

## 2026-09-14

- swr - testing - Remove hard-coded authentication test password: Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
- swr - testing - Use fake credentials for mocked login tests: Replaced the real-looking test password with an explicitly fake password and removed unnecessary environment-secret wiring because Firebase authentication is mocked.
- swr - implementation - Local frontend-to-backend RBAC integration check: Added the authenticated `/integration-check` frontend page and protected `GET /integration/permissions` backend endpoint to verify a Firebase ID token and test its custom roles claim against the seeded RBAC permissions.
- swr - fix - Restore Tailwind CSS 3 PostCSS compatibility: Pinned Tailwind CSS to 3.4.19, restoring compatibility with the frontend's existing Tailwind 3 PostCSS configuration and CSS directives.

## 2026-09-13

- general - implementation - Additional event workflow preparation: Added supporting-file upload and detail links plus a mock role switcher.
- swr - documentation - Add Firebase emulator E2E workflow: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
- swr - testing - Recheck authentication E2E coverage: Rechecked the authentication E2E test against the current AuthModule and middleware wiring after removing AuthorizationService; no test changes were required.
- swr - testing - Organize database service tests: Grouped successful database and transaction behavior separately from configuration and failure behavior, matching the RBAC test organization.
- swr - documentation - Document RBAC predicate return value: Expanded the `buildPermissionPredicate()` comment with its SQL return value and execution behavior.
- swr - fix - Remove redundant authorization service: Removed the separate `AuthorizationService` and its tests; updated auth wiring and backend documentation to use composable RBAC predicates inside resource queries.
- swr - testing - Organize RBAC predicate behavior tests: Grouped valid predicate generation under intended behavior and arbitrary/injected actions under unintended behavior.
- swr - testing - Add RBAC predicate injection denial test: Added unintended-behavior coverage proving arbitrary or injected permission column names are rejected.
- swr - implementation - Make RBAC SQL placeholders explicit: Replaced internal placeholder variables with explicit `$1` and `$2` positions in the composable RBAC predicate.
- swr - implementation - Harden RBAC SQL predicate construction: Standardized the composable RBAC predicate on fixed `$1` and `$2` placeholders, eliminating interpolated placeholder text.
- swr - implementation - Add composable RBAC permission predicate: Added SQL EXISTS permission checks that resource queries can use directly.
- swr - testing - Add RBAC denial edge cases: Tested missing permissions, explicit denial and non-boolean database values.
- swr - testing - Expand database service coverage: Added deterministic coverage for unreachable database URLs, query delegation, successful and failed transactions, client release, and pool shutdown.
- swr - maintenance - Fix PR #6 CI dependency installation: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.

## 2026-09-12

- swr - testing - Expand RBAC permission matrix coverage: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
- swr - testing - Add explicit RBAC denial coverage: Tested permission rows that explicitly deny an action.
- swr - testing - Organize RBAC repository tests: Organized RBAC repository tests into intended and unintended behavior sections consistent with the Firebase authentication specs, preserving the existing parameterized permission query.
- swr - testing - Fix authentication middleware assertion: Updated verified-user email assertions and covered Firebase verification failures.
- swr - testing - Review Firebase token service test coverage: Reviewed Firebase token service tests against implementation behavior and verified targeted Vitest coverage.
- general - fix - Restore local app connectivity: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.

## 2026-09-11

- general - maintenance - Repair backend Docker dependency install: Added the missing nested TypeScript 5.9.3 peer dependency required by tsconfck under vite-tsconfig-paths, preserving the backend TypeScript 6 dependency and existing lock metadata.
- swr - documentation - Switch shared branch guidance to dev: Updated branch workflow guidance and GitHub Actions filters so normal work starts from and targets `dev`, with branch flow `work branch -> dev -> main`.
- kirub - investigation - Verify connections and retrieve assigned stories: Confirmed origin points to IS212-G5-T2/IS212-G5-T2 and remote dev is reachable through Git.

## 2026-09-09

- kirub - investigation - Inspect live Jira automation: Verified Jira rules for branch creation, PR creation, merge and decline status changes.
- kirub - review - Verify dev checkout and review repository flow: Fast-forwarded local `dev` only to `origin/dev` at `e4a9450` and reviewed repository guidance, application structure, local integration configuration, and CI.
- swr - implementation - Add frontend and database local-dev layout: Added a frontend service to the local Docker Compose stack, separated PostgreSQL into a buildable local image under `development/database/postgresql`, baked local-only PostgreSQL defaults into that image, and updated repository/local development documentation for the frontend/backend/database layout.
- swr - documentation - Update Jira branch naming convention: Updated branch naming guidance to include ticket ID and title.
- swr - maintenance - Scaffold NestJS backend: Removed the generic service template and scaffolded a real NestJS backend at `services/backend` with npm, strict TypeScript, Vitest, oxlint, Dockerfile support, service docs, and a monorepo CI unit-test entrypoint.
- swr - documentation - Remove deployment workflow assumptions: Removed the remaining deployment, Terraform, Kubernetes, and previous multi-branch workflow assumptions after `platform/` was removed.

## 2026-09-07

- swr - documentation - Human-reviewed commit gate: Required human review of staged AI changes before commit, push or PR.
- swr - documentation - Resolve security workflow annotations: Fixed security workflow annotations by updating GitHub workflow checkout steps to `actions/checkout@v7`, correcting the Trivy action pin to `aquasecurity/trivy-action@v0.36.0`, and replacing the licensed Gitleaks Action wrapper with the pinned Gitleaks CLI Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1`.
- swr - maintenance - Branch promotion CI guard: Added a GitHub Actions check for the earlier multi-branch promotion model.
- swr - documentation - Jira and GitHub authority rules: Defined Jira as requirements authority and GitHub as development artifact authority.
- swr - documentation - AI workflow and branch progression guidance: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo.
- swr - maintenance - GitLab to GitHub migration cleanup: Migrated CI and review metadata from GitLab to GitHub and removed obsolete GitLab material.
