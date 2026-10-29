# General AI usage history

Entries without a single Jira ticket.

## 2026-10-10

- swr - bug fix - refactor/file_structure_and_modularization - Make venue unavailability datetime conversion explicitly use Singapore time and assert UTC instants without host-timezone-dependent getHours(); verify frontend CI unit tests.

## 2026-10-10

- swr - fix - refactor/file_structure_and_modularization - Preserve event-planning integration during conflict resolution: Kept the refactor branch's module and page organization while restoring planning controller registration and planning UI behavior. The focused planning page suite passes (30 tests); backend/frontend builds and linters pass. CI E2E rerun pending.

## 2026-10-09

- swr - documentation - refactor/frontend-shared-modularization - Archive branch AI usage and set PR handoff rule: Preserved the 15 active work entries with their confirmed branch, updated the log format to require a Jira key or branch name, and made an explicit PR-creation request trigger archival before the PR opens.
- swr - documentation - refactor/frontend-shared-modularization - Simplify maintained project docs: Retired redundant component handover and changelog files after moving current setup, migration, and operational guidance into READMEs. Updated agent instructions and stale document references; Git history retains the deleted files. No application behavior or database data changed.
- swr - refactor - refactor/frontend-shared-modularization - Share backend cross-domain primitives and review fixtures: Centralized local-session cookie parsing, authenticated Express request typing, generic database UUID syntax, and active coordinator event statuses while retaining route-specific errors and strict draft UUID validation. Extracted identical approval/rejection test fixtures without deleting or combining individual cases. Backend unit tests, lint, and build passed; database E2E was not run.
- swr - test - refactor/frontend-shared-modularization - Restore separate EventDetailPage review-controls case: Reinstated the original `it(...)` with its richer event fixture and exact assertions after confirming the consolidated decision suite used a simpler fixture. Kept the decision-suite coverage and made no production-code changes.
- swr - refactor - refactor/frontend-shared-modularization - Consolidate event decision tests: Merged approval and rejection component suites into `EventDetailPage.decision.test.tsx` and store action suites into `useAppStore.decisions.test.ts`. Moved the distinct assertions from a duplicate general detail-page test into the combined suite. Retained case IDs and assertions; verification and remaining suite boundaries are in `ai/runtime/frontend-refactor-handoff.md`.
- swr - refactor - refactor/frontend-shared-modularization - Extract shared frontend behavior: Centralized Singapore date parts and calendar-day formatting, reused the API origin helper in auth, shared notification polling and mark-as-read state across three panels, and shared the Lead coordinator picker across assignment and reassignment. Kept feature wording and public routes unchanged. Full verification and next-pass test consolidation notes are in `ai/runtime/frontend-refactor-handoff.md`.
- swr - configuration - refactor/frontend-shared-modularization - Align Codex and Claude agent model complexity: Corrected Codex implementation reasoning effort to `medium`; mapped Luna/Terra/Sol complexity to Claude Haiku/Sonnet/Opus with matching medium/high effort for implementation and review roles. Validated against current Codex and Claude Code agent configuration documentation.
- swr - refactor - refactor/frontend-shared-modularization - Rescan backend module boundaries: Clarified the skill's domain naming and promotion rules with current-tree examples, verified `venues/` is already the entity domain and its creation/availability capabilities share the same controller, service, and repository, and corrected stale coordinator module paths. Kept those Venue capabilities nested and Drafts as its independent `event-drafts/` domain. Tests, lint, and build were not run at the user's request.
- swr - refactor - refactor/frontend-shared-modularization - Align backend module internals with layout: Moved shared auth types, existing auth/clarification/venue repositories and repository tests, registration helpers, venue option data, and the clarifications response DTO into their ownership folders; moved the cross-domain clock to `src/common/`. Updated imports and maintained documentation. Added an explicit per-category scan checklist to the organization skill. Verified relative TypeScript imports resolve and `git diff --check` passes; tests, lint, and build were not run.
- swr - refactor - refactor/frontend-shared-modularization - Promote independently owned event drafts: Updated backend organization guidance to distinguish a top-level domain from a nested capability, then moved the Drafts controller, service, DTOs, and tests into `src/event-drafts/`; public routes and AppModule provider registration remain unchanged. Tests, lint, and build were not run at the user's request.
- swr - refactor - refactor/frontend-shared-modularization - Group backend capabilities consistently: Moved Events drafts and review, Equipment creation and availability, Venue creation and availability, and Registrations registration and withdrawal support into capability folders; retained shared providers and report support at module level. Updated only dependent paths, tooling, and backend documentation. No tests, lint, or build were run at the user's request.
- swr - refactor - refactor/frontend-shared-modularization - Organize backend modules by responsibility: Moved module validation contracts into `dto/`, registration report/export support into `registrations/report/`, integration suites into `backend/test/`, and mutation tooling into `scripts/mutation/`; updated only dependent paths, tooling, and documentation. Git rename inspection found no persistence, API, or service-behavior changes. Tests, lint, and build were intentionally not run at the user's request.
- swr - refactor - refactor/frontend-shared-modularization - Group Lead pages by workflow (Codex): Moved assignment queue and reassignment pages with their colocated tests into `src/features/lead/pages/assignment-queue/` and `reassignment/`; updated app imports and frontend layout documentation. Confirmed all four file contents unchanged and public routes retained. Verified the two page suites plus App and RouteAccess (66 tests), `npm run lint`, `npm run build`, stale-import search, and `git diff --check`; no Jira/Confluence task supplied, browser checks not run for this file-only move.
- swr - refactor - refactor/frontend-shared-modularization - Organize frontend source by feature: Moved feature-owned pages, tests, components, fixtures, APIs, and types from the flat `src/pages` and `components/domain` layout into `src/features/`; moved routing into `src/app/`; preserved public routes and shared infrastructure. Updated path-sensitive coverage, mutation, and maintained frontend documentation. Verified `npx tsc -b --noEmit`, `npm run lint`, `npm test` (728 passed, 1 todo), `npm run build`, mutation-config syntax, the relocated SPM-63 X14 mutation (killed), and stale-path search.
- swr - documentation - refactor/frontend-shared-modularization - Extend module organization guidance to backend: Added the backend layout reference for migrations, fresh database initialization, direct CI commands, mutation artifacts, NestJS modules, and E2E tests; aligned the frontend reference with the approved feature structure.
- swr - documentation - refactor/frontend-shared-modularization - Add workflow-folder guidance to module organization: Defined when a feature should group independently routed or evolving user workflows with their local tests and support files, with Lead assignment and reassignment as an example.

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

## 2026-10-14

- tanwz - implementation - chore/Improve-Test-Case-Evaluation-Workflow - Test workflow controls and metrics: Added `ai/docs/test-workflow.md` (rules, gap-to-control map, ID registry, per-test records, tier matrix, gates G1 to G7, metrics report) and dependency-free tooling in `ai/scripts/test-workflow/` (ID, spec and tier, record, determinism, coverage-scope and mutation-reconciliation gates, a cycle runner and the metrics report, with 56 node tests). Added the records for SPM-135 in `docs/test-cases/workflow/` (scope, 70-row ID registry, spec-conflict register, tier matrix, determinism exceptions, coverage line statuses, 198 test records) and wired the doc into AGENTS.md, the contract, the Orchestrator, Test Code Reviewer, Implementation and the two test skills. Baseline cycle 1 for SPM-135: G1, G2, G4, G5, G6, G7 pass; G3 blocks (104 of 198 tests have no registered ID, and the tier, oracle class and explained fields are not filled in); overall RED. Not reviewed by the Requirement or Code Quality reviewers; nothing committed.

## YYYY-MM-DD

- <user or general> - <type> - <Jira ticket or branch name> - <title>: <concise result>
```

Where user is the user's github username.

## 2026-10-14

- tanwz - implementation - chore/Improve-Test-Case-Evaluation-Workflow - Test workflow controls and metrics: Added `ai/docs/test-workflow.md` (rules, gap-to-control map, ID registry, per-test records, tier matrix, gates G1 to G7, metrics report) and dependency-free tooling in `ai/scripts/test-workflow/` (ID, spec and tier, record, determinism, coverage-scope and mutation-reconciliation gates, a cycle runner and the metrics report, with 56 node tests). Added the records for SPM-135 in `docs/test-cases/workflow/` (scope, 70-row ID registry, spec-conflict register, tier matrix, determinism exceptions, coverage line statuses, 198 test records) and wired the doc into AGENTS.md, the contract, the Orchestrator, Test Code Reviewer, Implementation and the two test skills. Baseline cycle 1 for SPM-135: G1, G2, G4, G5, G6, G7 pass; G3 blocks (104 of 198 tests have no registered ID, and the tier, oracle class and explained fields are not filled in); overall RED. Not reviewed by the Requirement or Code Quality reviewers; nothing committed.

## 2026-10-17

- taneishakaur - update - SPM-65 / SPM-64 - Coordinator change request notice: the change request notice is no longer repeated under Assignment Updates; Pending Change Requests moved to the top of the coordinator's events page, with a New tag for requests not yet opened (unread SPM-64 AC3 notice; opening the review marks it read). Backend unchanged (the notice is still stored). Tests: REQ-CHANGE-03-A frontend test revised, REVIEW-CHANGE-01-F added; frontend 1522 passed, TZ matrix passed. Confluence REQ-CHANGE-03 and REVIEW-CHANGE-01 pages and the SPM-65 matrix updated. Nothing committed.

## 2026-10-20

- Wei Zhi - implementation - Sprint 1 test case audit (v3 findings) - Closed test gaps in the working tree without committing: added the EVE-CRE-05-F description-only regression test (verified to fail on the old routing), EVE-DRF-10-A five-file and 50 MB upload-limit tests, EVE-DRF-10-C non-JSON 413 mapping test, EVE-DRF-08-A/B HTTP 401/403 tests for the four draft routes, EVE-DRF-09-A/B service owner-isolation tests, pinned the reject non-assigned-coordinator message, and tagged the non-owner organiser test EVE-REV-04-C. Open: the 403-vs-404 and reject-message wording conflicts need a product decision; the new HTTP and e2e tests were not run against PostgreSQL (Docker was not running).

- Wei Zhi - implementation - Sprint 1 test review follow-up (SPM-30 to SPM-34 AC2, SPM-40 AC4, SPM-83 AC1) - Venue Staff and Technical Support now land on the Events Dashboard after sign-in (new dashboardPathByRole; SPM-124 denied-route fallbacks unchanged). Added a post-login landing test for all five login roles; replaced store-only pending-list checks with a real-list test (EVENT-APPROVE-02-C, EVENT-REJECT-02-C). Mutation checks: venue-staff landing and the default coordinator filter each fail their test. Not committed; e2e and Playwright not run.

## 2026-10-25

- swr - test correction - SPM-150 (branch chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13; Jira keys SPM-36, SPM-37, SPM-38, SPM-39, SPM-40, SPM-61, SPM-83, SPM-94, SPM-144) - Correct SPM-150 evaluation test-case gaps: added Kills lines to the in-scope test files; split EVE-DRF-SUP-21 into EVE-DRF-SUP-54, 55 and 56 (one behaviour each, assertions unchanged); renamed EVENT-DRF- test IDs to EVE-DRF- in the drafts test files; fixed the EventListPage date fixtures with a Date-only fake clock (T0, 2026-10-20 10:00 +08:00); relabelled SPM-36, SPM-37 and SPM-38 matrix rows with their Jira ACs and noted PLAN-STATUS (SPM-148) and LEAD-ASN (SPM-123) ownership. Jira gate exception used: user-approved, documented exception for test-only corrections on stories whose Jira status is Done (SPM-36, 37, 38, 39, 40, 61, 83, 94, 144); reason: the SPM-150 evaluation found test-only gaps on these stories, which must be corrected before the Sprint 1 test cycle can close. Only test files and docs/test-cases/workflow/tier-matrix.md changed; no production code, commit, push, PR or Jira transition. Checks: backend unit specs (10 files, 399 tests) and frontend vitest (15 files, 320 tests) passed; e2e suites not run (need PostgreSQL). Open follow-ups: test-id-registry.md and phase1-security-isolation.md still contain EVENT-DRF- IDs and the new EVE-DRF-SUP-54/55/56 need registry rows; both are outside this exception.

- tanwz - test confirmation - SPM-150 (branch chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13; Jira keys SPM-36, SPM-37, SPM-38, SPM-39, SPM-40, SPM-83, SPM-94, SPM-144) - Merge registry AC confirmation: the user confirmed dev's AC mapping for IDs where dev and this branch differed; a recomputation found 5 such IDs, not 39 (EVE-FAC-03-A, 04-A, 04-B, 06-A, 06-B), corrected to dev's AC in ab0af73; owning-file lists were already identical. G1 and G3 (check-ids, check-records) pass for SPM-36, 37, 38, 39, 40, 83 and 94 after the SPM-94 logout-file titleMatch narrowing in 461bbeb; SPM-54 G3 remains BLOCKED on pre-existing missing and unregistered records. Nothing pushed or transitioned.

- tanwz - test confirmation - SPM-150 (SPM-144 AC mappings) - The user confirmed the five SPM-144 parent AC mappings (EVE-FAC-03-A AC3; EVE-FAC-04-A and 04-B AC4; EVE-FAC-06-A and 06-B AC6) from ab0af73; records/SPM-144.csv ac values for these IDs aligned to the registry; check-records for SPM-144 unchanged at BLOCKED (25 records, 14 passed, 0 failed, 11 not run; pre-existing gaps not addressed here). Nothing pushed or transitioned.

- tanwz - test confirmation - SPM-150 (SPM-54 kill gaps; branch chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13) - Product owner decisions, approved by PO Tan Wei Zhi, 26 Oct 2026: (a) rewrote the search strings of SPM54-BE-INTERVAL-PREDICATE, SPM54-BE-PENDING-REQUEST-CONFLICT, SPM54-BE-ASSIGNED-EVENT-TIME and SPM54-BE-SCHEDULE-CONFLICT to current code, mutant ideas unchanged; (b) added SPM54-BE-ARRANGEMENTS-CANCELLED-HISTORY, SPM54-BE-CHECKLIST-CANCELLED, SPM54-BE-COORDINATOR-BOOKINGS-IDENTITY and SPM54-BE-CANCEL-CONFIRMATION-FALSE, each killed by its named test; (c) approved VEN-BKG-SUP-01 to 04 in the registry; (d) set VEN-BKG-SUP-04 parent AC to AC2 with the test comment updated (comment only). Checks: backend mutation 30/30 killed, frontend 19/19 killed (cycle-21); check-records SPM-54 BLOCKED to PASS (113 records, 113 with kill links); check-ids pendingApproval 4 to 0 (PRIMARY matrix check still UNABLE_TO_VERIFY without a Confluence matrix file); node --test workflow 82/82. Nothing pushed or transitioned.

## 2026-10-26

- swr - test correction - SPM-150 (branch chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13; final-verification test fixes, no push, no Jira change) - Frontend build: type-only cast in App.test.tsx. Backend tsc: type-only fixes in branch-changed venues unit specs and e2e specs (63 to 45 errors; remaining 45 are in unchanged files). Playwright: 3 pass and 12 fail became 14 pass and 1 fail; spec-only updates for the removed Signed in as text, SPM-123 Lead assignment, SPM-48 default filter, Submit For Review label, the withdrawal toast, the venues options response shape, and venue locators. The remaining failure (calendar drag assertion, SPM-51 vs SPM-54 read-only event times) is reported for an owner decision. SPM-54 cycle-23 in scratchpad: G1, G2, G4 scan, G5 and G7 pass; the matrix IDs (37) saved from Confluence; coverage-line-status VenueScheduleCalendar row moved into the parsed table; one VEN-BKG-08-A test added for BookingsPage line 320. G3 remains blocked for the new test pending its record and a mutant.

- Wei Zhi - test - chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13 (SPM-54 residual decisions; no push, no Jira change) - Calendar drag check, mutant, coverage residuals: the VenueScheduleCalendar drag check (title kept) now asserts read-only assigned event times stay unchanged (SPM-51 cross-day drag needs PO confirmation, noted in code); new frontend mutant SPM54-FE-COORDINATOR-DECISION-MIRROR killed by VEN-BKG-08-A (SPM-54 frontend mutants 20/20 killed in cycle-30a); coverage-line-status residuals recorded with owners, only VenueRecordDetailPage line 246 marked UNREACHABLE (guard shown). Cycle-30b (scratchpad): G1, G2, G3, G4 scan and timezone, G5 and G7 pass; G6 not run in cycle-30b; coverage statements 99.33, branches 97.25, functions 99.1, lines 99.68 (100% floor not met). Manual Confluence procedures unchanged.

- swr - test correction - SPM-150 (branch chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13; product owner decisions 1, 2, 3 and 5; no push, no Jira change) - EVE-DRF-SUP-31 and -40 now mount in StrictMode and fail with the guard replaced by a no-op (4 of 4); SPM-51 cross-day drag uses test.fail() (expected failure); REQ-CLAR-SUP-35 gained 2000-accept and 2001-reject cases, the 2000 limit recorded as self-imposed; 105 per-test kill links restored from measured kill files (286 suite-level kept as unmeasured). Checks: DraftWorkflow 45/45, clarification-input 13/13, node workflow tests 82/82, Playwright cross-day spec 3 (2 pass, 1 expected failure); check-records PASS for SPM-37, 38, 39, 40, 54, 83, 94; SPM-95 BLOCKED by held rows as expected.

- Wei Zhi - test - chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13 - SPM-54 coverage residuals: EXCLUDED lines now leave the G5 totals (tooling); StatusLabels absent-equipment tests added (VEN-BKG-08-A); SPM-54 floors still missed (statements 99.9%, branches 99.56%) with open items 803, 500, 544 and UNREACHABLE 246; no push, no Jira change.

- Wei Zhi - test - chore/SPM-150-Close-unit-test-coverage-gaps-SPM-10-SPM-12-SPM-13 - SPM-54 VEN-AVL-SUP-04 traceability: added frontend mutant SPM54-FE-INITIAL-DATE-FALLBACK (killed by VEN-AVL-SUP-04's test); G1 now traces a registered id in a titleMatch-scoped file without a scope workaround (SPM-54 titleMatch restored, 0 orphans); G3 PASS in cycle-76; node test-workflow suite 91 passing. No commit, push or Jira change.
