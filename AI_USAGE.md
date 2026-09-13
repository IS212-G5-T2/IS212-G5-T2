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

## 2026-09-12 - Codex (GPT-5) - Expand Playwright coverage to all SPM-37 AC

- Issue: SPM-37, verified live in Jira as To Do with eight acceptance criteria.
- Areas touched: `tests/frontend/SPM-37/draft-request.playwright.spec.ts`, `AI_USAGE.md`; read-only remote Git/GitHub inspection.
- Summary: Reworked the Playwright suite into eight nested groups using each Jira acceptance criterion verbatim, with one browser test per AC and step-by-step plain-English comments. Tests cover create/save, incomplete drafts, My Requests reopening, repeated updates, refresh/new-session persistence, failure retry, unrelated-organisation denial, and submitted-request lockout.
- Checks: Playwright Chromium 8/8, frontend Vitest 12/12, backend Vitest 13/13, and PostgreSQL API tests 8/8 passed.
- Assumptions: Firebase authentication and SPM-36 submission remain separate unfinished integrations, so browser tests use an isolated in-memory API and explicit test cookies/submitted records. Real persistence and access boundaries remain covered by backend/database tests.
- Follow-up/conflict notes: Fetched all remote refs and searched remote history, branches, pull requests and source. No branch, commit, PR, or implementation attributable to Ei Chaw or SPM-36/create-submit is available; origin/dev only added Wei Rong CI/security/dependency commits. No Ei Chaw work was duplicated or overwritten. Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Use exact Jira AC wording in Playwright grouping

- Issue: SPM-37, verified live in Jira as To Do.
- Areas touched: SPM-37 Playwright suite, root `AGENTS.md`, `AI_USAGE.md`.
- Summary: Retained the Jira key/story title in the outer Playwright suite and added a nested `test.describe` using the exact relevant AC wording: `My draft is saved with 'Draft' status even if required fields are incomplete`. Added the convention for future Playwright acceptance tests.
- Checks: Playwright Chromium 2/2 passed and the reporter displayed the exact Jira acceptance-criterion wording in the suite path. Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Add step-by-step SPM-37 test comments

- Issue: SPM-37.
- Areas touched: every SPM-37 test suite, root `AGENTS.md`, `AI_USAGE.md`.
- Summary: Added plain-English `//` comments inside every test body beside setup, simulated actions, and result checks. Clarified the repository rule so future TypeScript/JavaScript tests use valid `//` comments throughout the test rather than only a summary above its title.
- Checks: Playwright Chromium 2/2, frontend Vitest 12/12, backend Vitest 13/13 and PostgreSQL API tests 8/8 passed after the comment updates.
- Follow-up: Nothing staged, committed or pushed; review preparation remains gated on user approval.

## 2026-09-12 - Codex (GPT-5) - Explain SPM-37 tests in plain English

- Issue: SPM-37.
- Areas touched: all SPM-37 frontend, backend and database test files; `AI_USAGE.md`.
- Summary: Added a concise plain-English scenario and expected-result comment immediately above all 27 SPM-37 test declarations, including Playwright, component, validation and persistence cases.
- Checks: Playwright Chromium 2/2, frontend Vitest 12/12, backend Vitest 13/13 and PostgreSQL API tests 8/8 passed. Verified every SPM-37 `test`, `it`, `test.each`, and `it.each` declaration has an immediately preceding comment.
- Follow-up: Nothing staged, committed or pushed; review preparation remains gated on user approval.

## 2026-09-12 - Codex (GPT-5) - Require plain-English test comments

- Issue: Repository test policy follow-up for SPM-37 and future tickets.
- Areas touched: root `AGENTS.md`, `AI_USAGE.md`.
- Summary: Required a concise plain-English comment immediately above every test case, explaining the scenario, action and expected result for non-developers. Added an example and prohibited comments that only repeat test names or implementation details.
- Checks: Reviewed the Markdown and code-fence formatting and ran `git diff --check`. No application tests required for this documentation-only change.
- Follow-up: Existing tests can be updated to this convention during the next test-content revision. Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Clarify test path placeholders

- Issue: Repository test policy follow-up for SPM-37 and future tickets.
- Areas touched: root `AGENTS.md`, `AI_USAGE.md`.
- Summary: Defined `technical-layer`, `JIRA-KEY`, and `descriptive-test-name`, including allowed layer values, exact Jira-key formatting, filename conventions, runner suffixes, and concrete examples.
- Checks: Reviewed the rendered Markdown structure and ran `git diff --check`. No application tests required for this documentation-only clarification.
- Follow-up: Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Use Jira-key test folders

- Issue: SPM-37; future-ticket test naming policy requested by the user.
- Areas touched: `tests`, root `AGENTS.md`, frontend/backend test runner configuration and component documentation.
- Summary: Added an `SPM-37` subfolder beneath each applicable technical test layer and renamed files by tested behavior. Updated repository rules so future stories use `tests/<layer>/<JIRA-KEY>/<descriptive-test-name>` without repeating the Jira key in filenames.
- Checks: Playwright Chromium 2/2, frontend Vitest 12/12, backend Vitest 13/13 and PostgreSQL API tests 8/8 passed after relocation. Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Define repository test conventions

- Issue: SPM-37; future-ticket test policy requested by the user.
- Areas touched: root `AGENTS.md`, `AI_USAGE.md`.
- Summary: Established `tests/frontend`, `tests/backend` and `tests/database` as the repository test-source layout. Required Jira-key filenames, Jira key/story behavior in suite titles, acceptance-criterion test names, Playwright for browser-facing criteria and appropriate backend/database runners for non-browser behavior.
- Checks: Reviewed the Markdown changes and verified the guidance preserves component-owned test commands and generic root CI orchestration.
- Follow-up: Existing SPM-37 test files follow the folder and filename convention; individual test names should consistently include numbered AC references as future coverage is expanded. Nothing staged, committed or pushed.

## 2026-09-12 - Codex (GPT-5) - Organize tests by technical layer

- Issue: SPM-37.
- Areas touched: root `tests` structure, frontend/backend test runner configuration and component documentation.
- Summary: Replaced the story-first test layout with exactly three technical folders: `tests/frontend`, `tests/backend` and `tests/database`. Every SPM-37 test filename and suite title contains `SPM-37`; Playwright UI acceptance cases remain in `tests/frontend/SPM-37-tests.spec.ts`.
- Checks: Playwright Chromium 2/2, frontend Vitest 12/12, backend Vitest 13/13 and PostgreSQL API tests 8/8 passed after relocation.
- Follow-up: Nothing staged, committed or pushed; review preparation remains gated on user approval.

## 2026-09-12 - Codex (GPT-5) - Group SPM-37 test assets

- Issue: SPM-37.
- Areas touched: `tests/SPM-37`, frontend/backend test runner configuration and test documentation.
- Summary: Moved all SPM-37 component, Playwright, backend validation, PostgreSQL API and browser-fixture files into the user-created root `tests/SPM-37` folder, separated by frontend/backend file type. Updated imports and runner discovery paths.
- Checks: Frontend Vitest 12/12, backend SPM-37 Vitest 11/11 and PostgreSQL API tests 8/8 passed; Playwright Chromium 2/2 passed from the relocated test file. Runner discovery retains non-SPM component test patterns.
- Follow-up: Nothing staged, committed or pushed; review preparation remains gated on user approval.

## 2026-09-12 - Codex (GPT-6) - Required request fields

- Issue: SPM-37, confirmed To Do; user-requested form validation follow-up.
- Areas touched: frontend draft form, shared form controls, component tests and frontend docs.
- Summary: Marked customer-specified fields with red asterisks; attempted submission identifies missing/whitespace-only fields, focuses the first and exposes associated errors. Draft saving still permits incomplete values. No registration and zero attendance count as filled (presence validation only).
- Checks: 12 frontend component tests, TypeScript and production build passed; ESLint passed. Added two repository-owned Playwright/Chromium tests; both pass and cover 11 required controls, complete missing-field feedback, first-error focus, corrected-field clearing and incomplete draft saving. No backend behavior changed.
- Limitations: Actual submission remains unavailable and complete forms explicitly say so; future submission integration needs server-side validation. Authentication dependency unchanged. Preserved prior work; review preparation and staging remain gated on user approval.

## 2026-09-12 - Codex (GPT-6) - Continue SPM-37 and verify acceptance criteria

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37; no matching GitHub PR found.
- Areas touched: `apps/frontend`, `services/backend` documentation, `AI_USAGE.md`.
- Summary: Re-read root/scoped guidance and live Jira story (To Do, Medium, Sprint 1, eight AC, no comments); reused existing branch and implementation. Fixed stale asynchronous draft/list responses, added route regression coverage, made frontend CI script locate its component directory, and documented migration/API/authentication contracts and ownership.
- Checks run: Node 24: frontend 9 tests, backend 13 unit tests and 10 API tests (8 against shared PostgreSQL), both builds and linters passed; git diff --check passed. Playwright exercised incomplete save, refresh, repeated save, failed-save retry, My Requests reopen, test-session logout/login, unrelated organisation list/direct URL denial and submitted lockout. Desktop 1440x1000 and mobile 390x844 screenshots inspected; no runtime errors, Vite overlay or mobile overflow. Browser plugin not available; used bundled Playwright.
- Acceptance review: AC1-4 and AC6-8 verified using trusted test sessions and PostgreSQL; AC5 storage/session persistence verified, but real Firebase login/logout and the production identity path remain unverified. Default backend has no authentication middleware and returns 401; do not call the story fully integrated until authentication is connected and re-tested.
- Assumptions: Authentication, submission and Event Change Requests remain separate story integrations; no identity bypass added. Existing same-organisation collaboration contract retained.
- Follow-up/conflict notes: Preserved prior local work. Browser fixture stopped and its rows cleaned; shared PostgreSQL left running, frontend dev server started on 127.0.0.1:5174 and left running. Changes remain unstaged for the previously requested testing-report review; set frontend CI script executable mode when staging is approved. No commit, push or Jira status mutation.

## 2026-09-12 - Codex (GPT-6) - Pull latest dev

- Issue/PR: None; repository update requested directly.
- Areas touched: Current feature branch and `AI_USAGE.md`.
- Summary: Fast-forwarded current SPM-37 branch from df9a0b1 to origin/dev at bff9783; preserved all local implementation changes.
- Assumptions: Latest shared version means origin/dev per repository guidance.
- Checks run: Git fetch, fast-forward pull, HEAD comparison, and conflict-marker check. No application tests needed for this sync.
- Follow-up/conflict notes: Resolved ledger overlap by retaining both upstream and local entries. No commit or push.


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
## 2026-09-11 - Codex (GPT-6) - SPM-37 implementation and testing checkpoint

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`; shared local PostgreSQL started for integration tests.
- Summary: Implemented PostgreSQL-backed draft create/read/list/update, incomplete fields, repeated saves with retry identity and version conflict handling, My Requests and editable form, save feedback, organisation isolation, and server-side rejection of non-draft writes. Same-organisation draft access follows SPM-94. Week 4's 20 core functions remain release scope.
- Assumptions: Authentication must populate a verified `request.user` containing userId, organisationId, and roles. Default app denies unauthenticated calls; no production auth bypass added. Frontend token-provider hook is an integration seam. Firebase/login/RBAC and submission/change-request workflows remain separate dependencies; request requirement fields are draft text pending catalogue integration.
- Checks run: Node 24 backend build, 13 unit tests, 10 e2e tests including 8 real-PostgreSQL draft tests; frontend TypeScript/Vite build, 8 component tests, frontend ESLint and backend oxlint. Chromium browser checks covered all eight AC scenarios with test-only sessions, loss/retry, blank draft, all-field reopening, organisation isolation, legacy edit URL, and desktop/mobile screenshots. No page runtime errors; expected failure responses were exercised. Real Firebase sign-in/sign-out remains unverified.
- Follow-up/conflict notes: User requires a testing report and explicit 'ok' before preparing review. Nothing staged/committed/pushed; review documentation and handoff deferred. Existing AI_USAGE edits preserved. Test fixture stopped and its five remaining records removed; shared PostgreSQL and normal frontend/backend left running (frontend 127.0.0.1:5174, backend 3000). Default Node 23 fails existing Nest tooling; Node 24 passes. Existing frontend Vite/router dependency audit findings remain; newly added Vitest upgraded to 4.1.11. CI still targets staging and frontend shell executable mode must be set when staging is authorised. Browser plugin skill absent; bundled Playwright used for browser checks.

## 2026-09-11 - Codex (GPT-6) - Prepare SPM-37 feature branch

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: Local Git branch; `AI_USAGE.md`; read-only frontend, backend, and database inspection.
- Summary: Pulled dev with fast-forward-only; local dev and origin/dev match df9a0b1ecff768865526ba723755574ea68be0be. Created feature/SPM-37-save-event-request-as-a-draft after finding no matching local/remote branch or PR. Read ticket description, all four acceptance criteria, status, priority, sprint, and comments (none), plus scoped agent guidance.
- AI contribution: Branch preparation and implementation planning; no feature code changed.
- Planning refresh: Re-read all seven repository AGENTS.md files and local integration/CI guidance; confirmed Jira now contains all eight discussed criteria and remains To Do. Week 4's 20 core functions define release scope. Plan covers persistent drafts, form/list integration, server-enforced ownership and draft status, failure feedback, and AC-traceable tests. Authentication is still absent; coordinate its contract before security/sign-in acceptance testing. Existing tests workflow targets staging, so dev PR automation needs alignment or a manual run.
- Assumptions: User-requested dev base overrides stale staging references in docs/ai-issue-workflow.md. Draft persistence requires backend work; current frontend identity is a placeholder and authentication integration needs coordination.
- Checks run: git pull --ff-only origin dev; HEAD/origin-dev comparison; branch searches; gh pr list (successful, empty); source and ownership review.
- Follow-up/conflict notes: Preserved pre-existing AI_USAGE.md edits. Frontend creation is a placeholder, edits use memory-only state, and backend/database have no event model. GitHub PR lookup succeeded on this attempt, superseding the earlier API lookup failure for this operation. No commit or push.

## 2026-09-11 - Codex (GPT-6) - Verify connections and retrieve assigned stories

- Issue/PR: SPM Project assignment lookup; no implementation requested.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only GitHub and Jira inspection.
- Summary: Confirmed origin points to IS212-G5-T2/IS212-G5-T2 and remote dev is reachable through Git. Retrieved all assigned Jira issues through the legacy connector authenticated as the requester; all three are stories.
- AI contribution: Connection verification and assignment retrieval.
- Assumptions: Used the legacy connector identity matching the requester; the other Atlassian connector uses a different account.
- Checks run: Git remote/status, gh auth status, gh repo view, git ls-remote, Jira identity and paginated JQL search (last page confirmed).
- Follow-up/conflict notes: GitHub CLI account kishorek2024-bot cannot resolve the repository through the API; write access was not tested. Preserved existing AI_USAGE.md changes. No implementation, commit, push, or Jira mutation.

## 2026-09-09 - Codex (GPT-6) - Inspect live Jira automation

- Issue/PR: SPM project automation; no implementation ticket.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only Jira browser inspection.
- Summary: Verified four enabled SPM rules: Branch created with status To Do -> In Progress; Pull request created with status In Progress -> In Review; Pull request merged with status In Review -> Done; Pull request declined with status In Review -> In Review.
- AI contribution: Jira automation inspection, workflow analysis, and AI usage logging.
- Assumptions: Configuration inspection establishes rule intent, not evidence of successful executions. No Jira settings were changed.
- Checks run: Read all four rule canvases and the branch trigger condition in the authenticated Jira UI. Connector discovery did not expose automation rules.
- Follow-up/conflict notes: The decline rule, named 'Copy of Transition to In Review', does not implement the user's desired return to In Progress. This live inspection supersedes the earlier unverified automation assumptions below.

## 2026-09-09 - Codex (GPT-6) - Verify dev checkout and review repository flow

- Issue/PR: None; repository review requested directly.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: Local Git checkout; `AI_USAGE.md`.
- Summary: Fast-forwarded local `dev` only to `origin/dev` at `e4a9450` and reviewed repository guidance, application structure, local integration configuration, and CI. No other branch was merged, and no commit, push, or PR was created.
- AI contribution: Repository inspection and workflow analysis.
- Assumptions: The user's current instruction overrides older guidance: always create new work branches from latest `dev`, name them `<type>/<ticket_id>-<ticket_name>`, merge work into `dev`, then promote `dev` into `main` (source of truth). User-described Jira transitions are branch created -> In Progress, PR created -> In Review, PR merged -> Done, PR rejected -> In Progress; live automation settings and the exact rejection trigger were not verified.
- Checks run: Git fetch, fast-forward-only update, HEAD/origin-dev equality, clean diff against origin/dev before this ledger entry, and source/configuration searches. Application tests were not run for this inspection.
- Follow-up/conflict notes: AGENTS, workflow docs, component READMEs, PR template, and CI retain staging-based guidance; documented merge transition remains Testing. Root README partially reflects dev but omits promotion to main. These files and remote settings were not changed as part of the review.

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
## 2026-09-12 - Codex (GPT-6) - Add structured SPM-37 requirement grids

- Issue: SPM-37; SPM-50 was inspected only as a future dependency and was not implemented because it remains in the backlog.
- Areas touched: SPM-37 draft form, reusable requirement grid, frontend component and Playwright tests, frontend README/HANDOVER/CHANGELOG, `AI_USAGE.md`.
- Summary: Replaced venue and equipment free-text areas with addable row-and-column grids. Existing API compatibility is retained by serializing rows into the current string fields, and older text-only drafts reopen in the first grid column. Added browser coverage for adding, saving, refreshing, and restoring grid rows.
- Assumption: SPM-50 will define the maintained venue-record source and its API. Its later implementation should map or replace the temporary serialized venue requirement representation rather than coupling SPM-37 to records that do not exist yet.
- Checks: Frontend Vitest 13/13, Playwright Chromium 9/9, backend Vitest 13/13, and PostgreSQL API tests 8/8 passed. TypeScript, ESLint, and the Vite production build passed. The running create-event page was visually checked at a narrow viewport and displayed both responsive grids with add-row controls and the requested headers.
- Follow-up: Await the user's explicit “ok” before preparing the review. Nothing staged, committed, pushed, or prepared for review.
## 2026-09-12 - Codex (GPT-6) - Clarify the SPM-37 registration label

- Issue: SPM-37.
- Areas touched: draft-request form label, frontend component and Playwright assertions, frontend changelog, `AI_USAGE.md`.
- Summary: Changed `Attendee registration needed` to the user-requested wording `attendees register for event through the system` while preserving the existing Yes/No value and API field.
- Checks: Frontend Vitest 13/13, Playwright Chromium 9/9, and TypeScript compilation passed. Nothing staged, committed, pushed, or prepared for review.
## 2026-09-12 - Codex (GPT-6) - Correct the SPM-37 post-save route

- Issue: SPM-37.
- Areas touched: draft save navigation, My Requests confirmation and links, reopened-draft state, API network-error copy, frontend component and Playwright tests, frontend changelog, `AI_USAGE.md`.
- Summary: Successful saves now redirect to My Requests, where the request is marked Draft and an explicit message says it has not been submitted. Selecting the request reopens the saved form with values pre-filled and a saved confirmation. Network failures now explain that the event-request backend must be running.
- Environment finding: The reported failure occurred because port 3000 and the local gateway on port 8080 were not listening, while Docker Desktop reported that it could not start. The frontend alone cannot persist drafts.
- Checks: Frontend Vitest 13/13, TypeScript compilation, and Playwright Chromium 9/9 passed. The first parallel Playwright run had one Chromium-start timeout before application interaction; the complete serial rerun passed. Nothing staged, committed, pushed, or prepared for review.

## 2026-09-13 - Codex (GPT-6) - Sync latest dev into SPM-37 feature branch

- Issue: SPM-37 (branch synchronization only; no Jira implementation work).
- Areas touched: feature branch Git state, frontend/backend package manifests and lockfiles, `AI_USAGE.md`; incoming dev commits also update CI workflows.
- Summary: Fetched origin/dev and fast-forwarded feature/SPM-37-save-event-request-as-a-draft from bff9783 to 9c7b49a (four commits). Restored existing uncommitted work, resolving four package-file conflicts by keeping dev dependency upgrades plus local feature dependencies and scripts.
- Checks: HEAD matches origin/dev; no unresolved conflicts; git diff --check passed; both lockfile root dependency maps match manifests; all upstream dependency versions retained; other tracked local edits and all 26 untracked files verified unchanged. Regenerated backend lockfile with npm 10 and frontend lockfile with npm 11 after npm 10 encountered an internal edgesOut error.
- Assumptions/follow-up: Existing work remains unstaged and uncommitted; no push. Backup retained in the stash named `codex backup before dev sync 2026-09-13`. Application tests were not run for this synchronization; installed node_modules were not updated, and Node 23.3.0 does not meet some incoming dependencies' engine requirements.

## 2026-09-13 - Codex (GPT-6) - Colocate tests and prefer dev conflict files

- Issue: SPM-37; user-requested test organization and conflict-resolution follow-up, no acceptance behavior changes.
- Areas: root/component AGENTS, frontend/backend test files and runner configs, package manifests/locks, README/HANDOVER/CHANGELOG.
- Summary: Removed root tests/<layer>/<Jira-key> tree by relocating all five suites beside their owning source modules and the browser harness to backend scripts/testing. Updated imports, migration paths, Vitest/Playwright discovery and documentation. Later stories extend existing module suites. User clarified to replace only conflicted files, so both component package.json/package-lock.json pairs exactly match origin/dev, with unrelated feature files preserved. Recorded this conflict policy in AGENTS.
- Checks: Frontend Vitest 13/13; backend unit 13/13; Playwright Chromium 9/9 (AC1-AC8 and requirement grids); integration runner smoke tests 2/2, PostgreSQL cases 8 skipped because TEST_DATABASE_URL was unset. Frontend TypeScript passed. Package pairs verified identical to origin/dev, no unmerged entries, old tests directory absent, git diff --check passed.
- Limitations: Checks used existing node_modules, not a clean install of dev dependencies. Dev manifests omit frontend testing dependencies/scripts and backend pg/@types/pg/db:migrate; retained exact dev files as requested. Backend npm run build failed in the installed Nest CLI with ERR_REQUIRE_CYCLE_MODULE under Node 23.3.0. No commits or pushes; work remains unstaged. Original pre-sync stash retained.
- Additional check: backend TypeScript compilation passed directly with tsc --project tsconfig.build.json --noEmit; the build failure is in the Nest CLI invocation.

## 2026-09-13 - Codex (GPT-6) - Enable anonymous draft saving

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; verified live as To Do, Medium, Sprint 1, eight AC, no comments. Reused existing feature branch and preserved unrelated work.
- Areas: frontend draft API/browser tests; backend draft controller, workspace, module, service/repository types, database tests and harness; backend dependency manifests; component guidance and docs.
- Summary: Per explicit user request, removed the draft auth guard and frontend token provider. List/read/create/update now use a shared anonymous workspace without cookies, tokens or identity headers. Retained field validation, operation-id retries, revision/concurrency checks and submitted-request lockout. Restored pg and @types/pg explicitly after reporting that the dev conflict resolution had removed them.
- Checks: Backend unit 13/13; frontend unit 13/13; real PostgreSQL/API 9/9 including smoke tests; browser regression 8/8; real API browser 1/1 verifies cookie/token-free creation, reload, update and a fresh browser context. Backend TypeScript build, frontend TypeScript and Vite production build passed using existing installed tools. No full clean dependency install was performed. git diff --check passed.
- Acceptance: AC1-4, AC6 and AC8 verified. AC5 anonymous persistence verified, real sign-in remains deferred. AC7 organisation isolation is intentionally deferred by the user's updated scope; no claim that SPM-37 is fully integrated. Anonymous drafts are shared by visitors to this instance; later auth integration must replace the workspace and decide how ownership transfers.
- Local runtime: Docker engine returned HTTP 500. Started a separate persistent PostgreSQL instance using embedded-postgres under C:/Users/kirub/AppData/Local/SPM-Draft-Postgres (start.mjs; data/), bound to 127.0.0.1:5432. Applied the migration to local spm; used separate spm_test for validation. Backend :3000 and frontend :5173 remain running. Test backend harness :3001 stopped after validation. No shared Docker volumes changed. Launcher reference: https://github.com/leinelissen/embedded-postgres.
- Follow-up: Frontend test tooling remains absent from dev's package manifest as previously documented. Existing installed tooling was used. Work remains unstaged per the earlier review hold; no commit, push, PR or Jira status change.
