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

## 2026-09-13 - Antigravity (Gemini 3.7 Flash) - Finalize SPM-36 event request and prepare PR

- Issue/PR: SPM-36 (https://is212-g5-t2.atlassian.net/browse/SPM-36)
- Human requester/operator: Ei Chaw Zin
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `AI_USAGE.md`.
- Summary: Reverified all 7 Acceptance Criteria for SPM-36, cleaned and consolidated test files into component directories (`apps/frontend/src/` and `services/backend/src/`), removed the legacy root `tests/` directory, verified all 36 backend tests and 12 frontend tests pass cleanly, and prepared the branch and commit for pull request into `dev`.
- AI contribution: Code review, test consolidation, build/lint verification, Jira MCP integration, AI_USAGE tracking.
- Assumptions: Local demo organiser is used pending auth module merge.
- Checks run: `npm test -- --run` in `services/backend` (36 tests passed); `npm test -- --run` in `apps/frontend` (12 tests passed); frontend/backend build and lint passed with 0 errors.
- Follow-up/conflict notes: Prepared `feature/SPM-36-create-and-submit-an-event-request` branch for PR into `dev`.

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
## 2026-09-11 - Codex - Refresh GitHub Actions branch flow

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows`, `docs/`, `README.md`, `AI_USAGE.md`
- Summary: Updated GitHub Actions triggers and workflow documentation for the current `work branch -> dev -> main` flow, removing stale staging/integration assumptions.
- AI contribution: CI workflow configuration and documentation.
- Assumptions: Security checks should run for all PRs/pushes targeting `dev` or `main`; component unit tests should also run when local development assets or CI process docs change.
- Checks run: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/security.yml .github/workflows/tests.yml`; `git diff --check`; searched `.github`, `docs`, `README.md`, and `AGENTS.md` for stale staging/integration branch wording.
- Follow-up/conflict notes: Moved from the SPM-103 feature branch onto `dev` at the human request.

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
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `npm ci`; `npm run build`; searched README and scoped docs for stale local-dev/frontend/backend/database wording; `docker compose -f development/local-dev/compose.yaml build frontend` and `docker build -t spm-postgresql development/database/postgresql` could not complete because the local Docker daemon socket was unavailable.
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
- AI contribution: Documentation and process guidance updates.
- Assumptions: Jira statuses `To Do` and `In Progress` are the only statuses where implementation should proceed; Jira automation handles status transitions for branch creation, pull request creation, and pull request merge.
- Checks run: Reviewed updated Markdown content.
- Follow-up/conflict notes: Future AI agents should not duplicate Jira stories into GitHub Issues or manually mark Jira work items `Done`.

## 2026-09-07 - Codex - AI workflow and branch progression guidance

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
- AI contribution: Documentation structure, branch-flow guidance, pull request template updates, and coordination rules for multiple AI agents.
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
- Follow-up/conflict notes: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, or other tools.

## 2026-09-12 - Codex (GPT-6) - Restore local app connectivity

- Issue/PR: None supplied.
- Areas touched: Local Docker runtime; `AI_USAGE.md`.
- Summary: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.
- Assumptions: Gateway timeout after backend recreation indicated a stale upstream address; restarting restored connectivity.
- Checks run: Frontend `/planning` HTTP 200, gateway `/healthz` returned status ok, `/api/events` HTTP 200.
- Follow-up/conflict notes: Existing repository changes preserved; services left running and database retained. Dependency install reported 5 moderate and 1 high audit findings; dependency upgrades were outside this runtime repair.
