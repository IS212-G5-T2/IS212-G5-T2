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

## 22-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Created `codex/fix-authentication-coverage` from the current `dev` baseline, analyzed the authentication-only coverage gaps before any deletion, and added focused coverage tests. No production code was deleted or changed.
- AI contribution: Coverage-baseline verification, source/test-path analysis, and unit-test expansion.
- Assumptions: The requested focus is the backend `src/auth/authentication` folder shown in the supplied coverage report.
- Checks run: `npm run test:cov -- src/auth/authentication` in `backend/` (32 passed; every authentication source file is 100% for statements, branches, functions, and lines); `npm run lint`; `npm run build`; focused Prettier check; `git diff --check`.
- Follow-up/conflict notes: Added business-path tests for authenticated-user retrieval, invalid bodies, and cookie-less logout, plus constructor-metadata fallback tests for compiler-generated Nest decorator branches. No files are staged, committed, or pushed.

## 21-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/lib`, `AI_USAGE.md`
- Summary: Expanded the PostgreSQL-session authentication client tests without removing traceability comments. Coverage now includes normalized multi-role mapping, unsupported roles, profile fallbacks, successful and failed login, malformed response fallbacks, session restoration states, logout, error construction, and the default API-base fallback.
- AI contribution: Unit-test expansion, boundary analysis, and regression verification.
- Assumptions: Browser authentication remains cookie-based, and `USER-LOGIN-01` identifiers remain the relevant test-case traceability labels.
- Checks run: Focused auth coverage (15 passed; 100% statements, branches, functions, and lines) and frontend `npm test` (153 passed).
- Follow-up/conflict notes: No files were staged, committed, or pushed.

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

## 13-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `firebase.json`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
- AI contribution: E2E implementation, CI workflow, and emulator integration.
- Assumptions: `demo-is212` is used as a safe emulator-only project ID; PostgreSQL can be started from `development/database/postgresql` in GitHub Actions.
- Checks run: `npm run lint`; `npm run build`; Ruby YAML/JSON config validation; `git diff --check`. Emulator-backed E2E execution was not run because the local Auth Emulator was unavailable.
- Follow-up/conflict notes: Local Docker/emulator execution was not run in this environment; no commit or pull request created.

## 12-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
- AI contribution: Parameterized unit-test design and coverage verification.
- Assumptions: CRUD bit strings represent `create`, `read`, `update`, and `delete` in that order; absent seeded role/resource rows are represented as `0000`.
- Checks run: Targeted Vitest coverage (50 role/resource cases and 200 permission checks passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No separate unintended-behavior section remains; the uncovered branch is framework-generated NestJS decorator metadata.

## 14-09-2026 - Codex (GPT-5) - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
- AI contribution: Secret-handling remediation and CI configuration.
- Assumptions: The repository’s GitHub secret is named `SEED_PASSWORD`; local test runs must export the variable themselves.
- Checks run: Source search for the removed literal and `git diff --check`; frontend tests require `SEED_PASSWORD` and dependencies to be available.
- Follow-up/conflict notes: The exposed password should be rotated; existing untracked Firebase service-account material was preserved and not staged.

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

## 07-09-2026 - Codex - Unknown

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so agents stage completed changes for human review and wait for explicit approval before committing, pushing, or creating a pull request. Added an explicit no-auto-merge rule.
- AI contribution: Documentation and process guidance updates.
- Assumptions: Staging changes is acceptable for review, but committing and pull request creation require explicit human approval to proceed with the commit.
- Checks run: Reviewed updated Markdown content.
- Follow-up/conflict notes: Pending human review before commit.

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

## 21-09-2026 - Codex (GPT-6) - Unknown

- Context: User requested runtime diagnosis; no issue supplied. Areas changed: AI_USAGE.md only.
- Findings: Docker Desktop failed at 14:12 SGT because Windows could not access/rename sailor-ingest.sock; its log records successful socket listening at 14:21. Engine now responds; frontend, backend and PostgreSQL healthy, frontend HTTP 200 and backend health status ok. Old gateway container remains exited with a file/directory bind-mount mismatch for gateway/nginx.conf. Existing containers reference former compose.yaml; current checkout uses docker-compose.yml.
- Checks: docker version, compose ls, container status/state, Docker host logs, HTTP readiness and current Compose service names. No application tests needed for diagnosis.
- Follow-up/conflicts: Preserved existing ledger changes; no runtime or source changes, deletions, commit or push. Old gateway failure is separate from recovered Docker Desktop startup failure.
