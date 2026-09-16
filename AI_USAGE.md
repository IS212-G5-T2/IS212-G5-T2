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

## 2026-09-16 - Codex (GPT-5) - Restore SPM-30 frontend authentication integration

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Restored the SPM-30 Firebase-derived user model after the manual merge combined it with mock-role code. Removed mock role switching and the unsupported admin role, restored the signed-out placeholder user, forwarded Firebase ID tokens from API calls, and repaired test discovery, build, and lint configuration.
- AI contribution: Merge correction, frontend authorization integration, regression tests, and verification.
- Assumptions: The backend event API remains responsible for verifying the forwarded token and enforcing resource authorization; it is not changed by this frontend-only update.
- Checks run: `npm ci --dry-run`, `npm run test:coverage` (86 tests passed), `npm run build`, and `npm run lint` in `apps/frontend`.
- Follow-up/conflict notes: No files were staged, committed, or pushed. Server-side Firebase enforcement for `/api/events` remains outstanding.

## 2026-09-16 - Codex (GPT-5) - Reconcile merged documentation with implementation

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: repository Markdown documentation and `AI_USAGE.md`
- Summary: Reviewed the staged manual merge against the current implementation and corrected documentation that combined real Firebase authentication with the separate demo-only event API. Repaired stale test-path and CI statements, and restored malformed ledger headings.
- AI contribution: Merge review, documentation reconciliation, and static verification.
- Assumptions: This change documents current behavior and known limitations; it does not repair the frontend or server-side authorization defects identified in the review.
- Checks run: Markdown conflict-marker scan, `git diff --check`, Docker Compose configuration validation, frontend/backend package-lock validation, frontend/backend tests, builds, and lint checks.
- Follow-up/conflict notes: Frontend compilation, lint, and test failures remain unresolved. The event API must be integrated with Firebase identity and RBAC before it can satisfy end-to-end authorization requirements.

## 2026-09-16 - Codex (GPT-5) - Configure Firebase defaults for frontend tests

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test`, `AI_USAGE.md`
- Summary: Added inert Firebase Web SDK environment values to the global Vitest setup so store imports cannot initialize Firebase Auth with an empty CI API key.
- AI contribution: CI failure diagnosis and test-environment configuration.
- Assumptions: Tests mock Firebase network operations; the test-only configuration is never used by the browser build or local Compose runtime.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed); `git diff --check`.
- Follow-up/conflict notes: Existing PR #15 is currently conflicted with overlapping dev event-feature work.

## 2026-09-16 - Codex (GPT-5) - Complete SPM-30 attendee route and registration controls

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Refreshed Jira and aligned the implementation to its current Attendee story: denied attendee direct navigation to venue, booking, and equipment operations; confined registration and withdrawal mutations to the authenticated attendee; added direct-route and registration behavior tests.
- AI contribution: Jira acceptance-criteria refresh, frontend access-control implementation, and tests.
- Assumptions: `/events` and event details are intentionally attendee-accessible for browsing, while operational management routes belong only to their assigned staff roles.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed; scoped SPM-30 coverage gate passed); shell syntax check for the frontend CI entrypoint; `git diff --check`. Frontend build remains blocked by the pre-existing TypeScript 6 `baseUrl` deprecation configuration.
- Follow-up/conflict notes: The frontend currently uses an in-memory event/registration model. Server-side enforcement awaits the future event and registration API.

## 2026-09-16 - Codex (GPT-5) - Close SPM-30 acceptance-path test gaps

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend/test`, `AI_USAGE.md`
- Summary: Corrected login fixtures so every account receives its matching Firebase role claim, added the assigned-coordinator success case, added the frontend CI test entrypoint, and expanded CI E2E checks for organiser claims and seeded PostgreSQL RBAC permissions.
- AI contribution: Acceptance-criteria test-gap analysis and focused test/CI implementation.
- Assumptions: The current in-memory frontend event model is the implemented event-management surface for SPM-30; real event API ownership checks belong to the future resource API.
- Checks run: Frontend Vitest coverage (62 tests passed; 100% statements, branches, functions, and lines for the SPM-30 login, Firebase-role mapping, and access-guard files); backend lint, build, and unit tests (95 passed). Emulator/PostgreSQL E2E remains CI-only by requester preference.
- Follow-up/conflict notes: Jira could not be re-read because the Atlassian OAuth refresh token is invalid; no Jira data was changed.

## 2026-09-16 - Codex (GPT-5) - Remove superseded local Firebase verification helper

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Removed the interactive real-Firebase curl helper and its README/changelog references at the requester's direction. CI Firebase Auth Emulator E2E coverage and the protected backend auth endpoint remain.
- AI contribution: Local helper removal and documentation cleanup.
- Assumptions: GitHub Actions E2E coverage is the desired automated authentication verification path.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No local Compose services were started or stopped.

## 2026-09-16 - Codex (GPT-5) - Verify Firebase authentication through the production route

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added authenticated `GET /auth/me`, corrected the local curl helper to call it, and changed the Firebase emulator E2E test to exercise the production route rather than a test-only controller. The E2E suite also checks Firebase rejects an incorrect password before issuing a token.
- AI contribution: Backend API, test refactor, test helper correction, and documentation.
- Assumptions: The route is a small client-facing session-introspection contract; a verified token may disclose only its UID, optional email, and normalized application roles to that same token holder.
- Checks run: `npm run lint`, `npm run build`, and `npm test` in `services/backend` (95 tests passed); shell syntax check for the local helper; `git diff --check`. Emulator E2E remains CI-only by requester preference.
- Follow-up/conflict notes: No event/request backend API exists yet, so server-side resource ownership enforcement remains future domain work; existing frontend guards cover the current in-memory UI routes.

## 2026-09-16 - Codex (GPT-5) - Add local real-Firebase backend verification helper

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Added an interactive curl-based helper that signs a prompted non-production Firebase user in through the real Firebase REST API and sends its ID token to the local backend's protected root route.
- AI contribution: Local integration test helper and setup documentation.
- Assumptions: The caller has started the local Compose stack and configured a non-production Firebase Web API key in `development/local-dev/.env`; the backend service account is configured for that same Firebase project.
- Checks run: Shell syntax check and static script inspection; no real Firebase credentials, user accounts, token, or local stack were used.
- Follow-up/conflict notes: The helper verifies authentication only. Resource-specific backend role and ownership enforcement awaits corresponding resource endpoints.

## 2026-09-16 - Codex (GPT-5) - Use real Firebase in local Compose

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Removed the local Firebase Auth Emulator service and fake Firebase settings from Compose. Local Compose now receives real non-production Firebase settings from its untracked `.env`; the emulator remains confined to CI E2E tests.
- AI contribution: Compose and documentation reconfiguration, plus CI emulator-config path correction after the Firebase config moved under `development/local-dev/firebase`.
- Assumptions: Local developers supply Web SDK configuration and a same-project Firebase Admin service account in `development/local-dev/.env`, and do not use production Firebase credentials.
- Checks run: Docker Compose configuration validation with `.env.example`; Firebase emulator JSON parsing; `git diff --check`.
- Follow-up/conflict notes: The shared local Compose stack was not started or stopped. No commit or pull request created.

## 2026-09-13 - Antigravity (Gemini 3.7 Flash) - Finalize SPM-36 event request and prepare PR

- Issue/PR: SPM-36 (https://is212-g5-t2.atlassian.net/browse/SPM-36)
- Human requester/operator: Ei Chaw Zin
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `AI_USAGE.md`.
- Summary: Reverified all 7 Acceptance Criteria for SPM-36, cleaned and consolidated test files into component directories (`apps/frontend/src/` and `services/backend/src/`), removed the legacy root `tests/` directory, verified all 36 backend tests and 12 frontend tests pass cleanly, and prepared the branch and commit for pull request into `dev`.
- AI contribution: Code review, test consolidation, build/lint verification, Jira MCP integration, AI_USAGE tracking.
- Assumptions: Local demo organiser is used pending auth module merge.
- Checks run: `npm test -- --run` in `services/backend` (36 tests passed); `npm test -- --run` in `apps/frontend` (12 tests passed); frontend/backend build and lint passed with 0 errors.
- Follow-up/conflict notes: Prepared `feature/SPM-36-create-and-submit-an-event-request` branch for PR into `dev`.

## 2026-09-13 - Antigravity (Gemini 3.7 Flash) - Additional event workflow preparation

- Issue/PR: Second user story key not supplied.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend`, `services/backend/src/events`, `development/database/postgresql/init/002_events.sql`, `AI_USAGE.md`.
- Summary: Added optional supporting-file upload on EventCreatePage step 2, persisted attachment metadata/data URLs through the backend event contract, displayed attached files with view/download links on EventDetailPage, and added a top-right mock profile switcher for Coordinator, Organiser, Venue Staff, Tech Support, and Admin roles.
- AI contribution: Frontend/backend implementation, local schema update, unit/component tests, build/lint verification.
- Assumptions: This is preparatory work for a second Jira story and should remain separate from the first story's eventual push. The mock profile switcher is temporary local RBAC support until real authentication is merged.
- Checks run: Backend focused tests passed: `npm test -- --run src/events/event-input.spec.ts src/events/events.service.spec.ts`; frontend focused tests passed: `npm test -- --run src/pages/EventCreatePage.test.tsx src/pages/EventListPage.test.tsx src/pages/EventDetailPage.test.tsx src/components/layout/TopNav.test.tsx`; frontend/backend build and lint passed.
- Follow-up/conflict notes: No Jira key was supplied for the second story. Coordinator assignment log and cross-coordinator access restrictions are not completed in this prep pass.

## 2026-09-13 - Codex (GPT-5) - Rebuild SPM-36 tests one file at a time

- Issue/PR: SPM-36.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/pages/EventListPage.test.tsx`, `services/backend/src/events/event-input.spec.ts`, `services/backend/src/events/events.service.spec.ts`, `services/backend/src/events/event-input.ts`, `tests/backend/SPM-36`, `AI_USAGE.md`.
- Summary: Rebuilt the backend validation/service tests beside their source files and cleaned the EventCreatePage/EventListPage page tests beside their React pages, using `SPM-36 Test Case ...` comments directly above each test case or grouped test case.
- AI contribution: Test restructuring, frontend test cleanup, backend validation fix, beginner-oriented explanation.
- Assumptions: User wants each SPM-36 test file reviewed and explained before moving to the next file.
- Checks run: `cd services/backend && npm test -- --run src/events/event-input.spec.ts` passed; `cd services/backend && npm test -- --run src/events/events.service.spec.ts` passed; `cd apps/frontend && npm test -- --run src/pages/EventCreatePage.test.tsx` passed; `cd apps/frontend && npm test -- --run src/pages/EventListPage.test.tsx` passed. Frontend tests emitted React Router non-failing future-flag warnings.
- Follow-up/conflict notes: Existing broader AI_USAGE entry and remaining database SPM-36 test were preserved for later cleanup/review.

## 2026-09-13 - Codex (GPT-5) - Complete SPM-36 automated test coverage

- Issue/PR: SPM-36 — Jira verified as In Progress, Medium priority, with no comments; no PR.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend`, `services/backend/src/events`, `tests/backend/SPM-36`, `tests/database/SPM-36`, `AI_USAGE.md`.
- Summary: Added page-level React tests beside Event Create/List, expanded backend validation/service and database integration coverage for every supplied SPM-36 test case, and fixed defects exposed by the tests: description/layout were not required and same-day past start times were accepted.
- AI contribution: Repository/test-framework review, Jira verification through Atlassian Rovo, React interaction tests, NestJS TestingModule service tests, integration assertions, narrow validation fixes, documentation, and verification.
- Assumptions: The existing fixed local demo organiser is the authenticated-organiser precondition until login is merged. The requester explicitly made preferred room layout, accessibility needs, and required facilities the option terminology source of truth.
- Checks run: Frontend `npm test` (2 files, 8 tests), lint, and build passed; backend `npm test` (3 files, 34 tests), lint, and build passed; rebuilt the local backend and ran the database/API SPM-36 integration test successfully.
- Follow-up/conflict notes: No Cypress configuration or local login flow exists, so no browser E2E/login test was added. React Router emitted non-failing v7 future-flag warnings. Docker production pruning reported 3 existing high-severity dependency findings, outside this test scope. Existing unrelated staged/unstaged work on `fix/backend-dependency-lock` was preserved; no commit, push, or PR was performed.

## 2026-09-12 - Codex (GPT-6) - SPM-36 event request submission

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-36 — fetched full story, six AC, comments (none), Medium priority, Sprint 1, In Progress.
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `development/local-dev`.
- Summary: Added a light-mode three-step form, required/invalid field errors, calendar validation that blocks past start dates and non-logical date ranges, PostgreSQL Submitted persistence with duplicate retry protection, confirmation, and API-backed My Events/detail reloads. Added idempotent schema and fictional seed; removed the sign-in display.
- AI contribution: UI/API/SQL implementation, component and integration tests, ticket-based test reorganization under `tests/<technical-layer>/SPM-36`, setup and ownership documentation.
- Assumptions: User explicitly deferred branches, Save Draft, email delivery, and user accounts. Uses a fixed local demo organiser behind an explicit local configuration switch; no account implementation or real email. AC6 confirmation is implemented; its email requirement remains deferred by user instruction.
- Checks run: Frontend build/lint and 7 component interaction tests passed from `tests/frontend/SPM-36`; backend build/lint, 29 unit tests from `services/backend/src` and `tests/backend/SPM-36`, and 2 HTTP tests passed (HTTP tests required local port permission). Docker backend build passed. Live API/PostgreSQL integration passed required-field/invalid-value rejection, Submitted persistence, complete details/list retrieval, retry deduplication, and server-owned status/organiser checks; run-owned records removed. Schema and fictional seed applied to existing local database without reset. Browser-facing gateway returned the saved sample through /api/events. Browser tool reported no available browser, so visual browser QA remains unverified.
- Follow-up/conflict notes: Latest origin/dev and origin/main inspected: neither has working login. No matching local/remote-tracking SPM-36 branch; PR lookup unavailable (no gh/GitHub connector). No branch/commit/push/PR actions for this ticket; existing staged dependency repair preserved, including nested TypeScript entry required by Docker npm 10. Backend rebuilt/restarted; shared stack left running. Docker npm audit reported 4 high findings during install and 3 after production pruning; not addressed in this scope. Integrate teammate's server-authenticated organiser identity later; local demo is not multi-user access control.

## 2026-09-11 - Codex (GPT-6) - Repair backend Docker dependency install

- Issue/PR: Unknown; no Jira key supplied.
- Areas touched: `services/backend/package-lock.json`, `AI_USAGE.md`.
- Summary: Added the missing nested TypeScript 5.9.3 peer dependency required by tsconfck under vite-tsconfig-paths, preserving the backend TypeScript 6 dependency and existing lock metadata.
- AI contribution: Diagnosis, lock-file repair, Docker build verification.
- Assumptions: Fix the reported npm ci failure without upgrading dependencies.
- Checks run: Regenerated using node:22-alpine/npm 10.9.8; backend Compose image build passed, including npm ci, Nest build, and production pruning; final formatting preserves the verified JSON data.
- Follow-up/conflict notes: npm reported four high-severity audit findings during install and three after production pruning; not addressed in this focused fix. Stack not started. Changes staged on fix/backend-dependency-lock; no commit or push.
## 2026-09-16 - Codex (GPT-5) - Correct Firebase emulator Docker build source path

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev/firebase`, `AI_USAGE.md`
- Summary: Updated the Firebase emulator image to copy its configuration from the path within Compose's repository-root build context.
- AI contribution: Docker build-context diagnosis and targeted configuration correction.
- Assumptions: The Firebase service will continue using the repository root as its Compose build context.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`.
- Follow-up/conflict notes: Existing unrelated frontend and ledger changes were preserved; no commit or pull request created.

## 2026-09-15 - Codex (GPT-5) - Enforce role-aware organiser routes for SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Read Firebase custom role claims after sign-in, restrict organiser event creation and ownership-bound edits, restrict event-change reviews to the assigned coordinator, organise guarded routes with nested React Router `Outlet`s, and document the new guard and test-helper contracts.
- AI contribution: Acceptance-criteria review, frontend authorization implementation, JSDoc, and happy-path/negative direct-navigation tests guided by Week 4 slides 26–33.
- Assumptions: Jira's current explicit acceptance criterion naming an Event Organiser governs the conflicting attendee story title; Firebase custom claims use the existing uppercase RBAC role names.
- Checks run: `npm --prefix apps/frontend test` (5 files, 50 tests passed); `git diff --check`.
- Follow-up/conflict notes: The frontend's in-memory data store has no backend resource API yet, so server-side RBAC and ownership enforcement remains a required future security boundary. No commit or pull request created.

## 2026-09-15 - Codex (GPT-5) - Share local Firebase Auth Emulator between frontend and backend

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added opt-in frontend Auth Emulator connection, a shared Compose Auth Emulator service, and backend emulator initialization using the same `demo-is212` project without service-account credentials.
- AI contribution: Cross-service configuration, focused frontend/backend tests, and local setup documentation.
- Assumptions: `demo-is212` is emulator-only; real Firebase remains the default whenever `VITE_USE_FIREBASE_AUTH_EMULATOR` is not `true`.
- Checks run: Frontend Vitest (32 passed); targeted frontend Firebase-module coverage (8 passed; 100% statements, branches, functions, and lines); backend Vitest (93 passed); targeted Firebase token-service coverage (19 passed; 100% statements, branches, functions, and lines); backend build and lint; Docker Compose configuration validation; `git diff --check`. Frontend build is blocked by the pre-existing TypeScript 6 `baseUrl` deprecation, and frontend lint is blocked because ESLint 10 has no `eslint.config.*` file.
- Follow-up/conflict notes: The shared Compose stack was not started, preserving any existing local integration environment. No commit or pull request created.

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
## 2026-09-12 - Codex (GPT-6) - Restore local app connectivity

- Issue/PR: None supplied.
- Areas touched: Local Docker runtime; `AI_USAGE.md`.
- Summary: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.
- Assumptions: Gateway timeout after backend recreation indicated a stale upstream address; restarting restored connectivity.
- Checks run: Frontend `/planning` HTTP 200, gateway `/healthz` returned status ok, `/api/events` HTTP 200.
- Follow-up/conflict notes: Existing repository changes preserved; services left running and database retained. Dependency install reported 5 moderate and 1 high audit findings; dependency upgrades were outside this runtime repair.
