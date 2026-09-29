# AI Usage Log

Find the existing `## YYYY-MM-DD - Agent` heading and append a bullet for each new task under that date and agent. Create a heading only if that pair is absent; keep newest dates first. Use the tool name (for example, Codex or Claude) as `Agent`, not a separate heading for each model or task.

Each task bullet should state the issue/area, what changed and why. Add indented scope, assumptions, checks, and follow-up only when useful. Keep distinct tasks distinguishable; do not collapse their evidence into a vague daily summary. Preserve meaningful earlier details during merges. Never include private Jira/Confluence content or URLs, credentials, secrets, production data, or long transcripts.

## 2026-09-30 - Codex

- **Resolve PR #32 ledger conflict and clarify the format**: Merged current `dev` into `refactor/agent_files` for conflict resolution. Regrouped the prior detailed ledger and newer `dev` entries by date and agent, preserving distinct task summaries, checks, assumptions, and follow-ups; made the append-to-existing-heading rule explicit here and in `AGENTS.md`.
  - Scope: `AI_USAGE.md`, `AGENTS.md`; the merge also brings in `dev` application changes unchanged.
  - Checks: Verified date-and-agent heading uniqueness, retained source task count, no conflict markers, and `git diff --check`.
  - Follow-up: PR #32 requires the resolved merge to be committed and pushed before GitHub can recheck mergeability.

- **Add ticket closeout role and private chat registry**: Added user-triggered `11-ticket-closeout` guidance and a private conversation registry schema. Closure checks ticket/branch/PR completion, archives only confirmed idle related chats, and records pending or unsupported archives privately.
  - Scope: `.ai/agents/`, `.ai/schemas/`, `.ai/workflows/`, vendor adapters, `AGENTS.md`.
  - Checks: Verified agent/adaptor parity, schema validity, and `.ai/runtime/` ignore protection.

- **Tighten active instructions without weakening boundaries**: Shortened 17 active instruction files from 5,170 to 3,539 words (32%) while retaining Jira/Confluence authority, role isolation, review gates, privacy, and test responsibilities.
  - Scope: root/scoped instructions and `.ai/` role/workflow guidance.
  - Checks: Compared required boundaries and verified links, schemas, and `git diff --check`; application and CI behavior were unchanged.

- **Require language-appropriate implementation documentation** (GPT-5): Required language- and component-conventional docstrings/API documentation for public interfaces and non-obvious domain, business-rule, integration, lifecycle, or security logic. Added implementation, quality-review, and final-review enforcement points.
  - Scope: `AGENTS.md`, `.ai/agents/02-implementer.md`, `.ai/agents/07-code-quality-reviewer.md`, `.ai/agents/09-change-reviewer.md`, `AI_USAGE.md`
  - Assumptions: TypeScript components use their existing JSDoc/TSDoc style unless a more specific scoped instruction states otherwise; trivial private helpers should not receive redundant commentary.
  - Checks: Confirmed the requirement is present in repository-wide guidance and all three relevant agent stages; `git diff --check` passed.
  - Follow-up: No application behavior, CI behavior, runtime data, commit, push, or pull request changed.

- **Make agent execution order visible in filenames** (GPT-5): Renamed canonical role files and thin vendor adapters with visible execution prefixes: `00` is the orchestrator, `01`–`10` are the normal sequential ticket stages, and `99` is the separate recovery path. Added canonical filenames to the workflow table.
  - Scope: `.ai/agents/`, `.claude/agents/`, `.codex/agents/`, `.ai/workflows/jira-ticket.md`, `AGENTS.md`, `README.md`, `AI_USAGE.md`
  - Assumptions: A `99` prefix communicates that Recovery is intentionally not the next normal stage after Git Committer.
  - Checks: Confirmed the 12 canonical filenames sort in the intended order; verified exact filename parity and valid links for all Claude and Codex adapters; confirmed no stale unnumbered agent-path references remain; `git diff --check` passed.
  - Follow-up: No implementation, CI, runtime data, commit, push, or pull request changed.

- **Split quality review into isolated subagents** (GPT-5): Replaced the combined quality/accountability reviewer with independent requirements-traceability, architecture, and code-quality reviewers, followed by an Accountability Reviewer that alone reconciles their reports. Removed duplicate agent-process documents from `docs/`; `.ai/` is the canonical workflow source.
  - Scope: `.ai/agents/`, `.ai/workflows/`, `.claude/agents/`, `.codex/agents/`, `AGENTS.md`, `README.md`, `docs/`, `AI_USAGE.md`
  - Assumptions: `docs/ci-process.md` and the existing concise human-facing issue-workflow pointer remain useful durable documentation; new duplicate agent-process documents are unnecessary.
  - Checks: Confirmed 12 canonical role files and 12 matching adapters for each vendor; verified the removed duplicate `docs/` files are absent while CI and issue-workflow documentation remains; validated both runtime schemas as JSON; confirmed all four reviewer reports are Git-ignored under `.ai/runtime/`; `git diff --check` passed.
  - Follow-up: All specialist reports remain private under `.ai/runtime/`; no application or CI behavior changed.

- **Add Definition of Done to pull-request template** (GPT-5): Added the supplied Definition of Done checks for passing user-story test cases, passing unit tests, peer approval, applicable UI standards, and Product Owner acceptance, while preserving private ticket-data protections.
  - Scope: `.github/pull_request_template.md`, `AI_USAGE.md`
  - Assumptions: UI-guideline confirmation applies only to changes that affect the user interface; Product Owner acceptance is recorded when available and is not replaced by an AI assertion.
  - Checks: Verified every supplied Definition of Done criterion appears in the pull-request template; `git diff --check`; confirmed no workflow YAML changed.
  - Follow-up: No CI workflow, application code, or GitHub state changed.

- **Add quality and accountability review stage** (GPT-5): Added a sequential Quality and Accountability Reviewer that evaluates Jira traceability, searchable test indexing, Context7-backed framework guidance, code quality, system design, decisions, trade-offs, and risks before final change review. No application behavior changed.
  - Scope: `.ai/agents/`, `.ai/workflows/`, `.claude/agents/`, `.codex/agents/`, `AGENTS.md`, `README.md`, `docs/`, `AI_USAGE.md`
  - Assumptions: One reviewer with explicit independent passes is sufficient for the current workflow; additional specialist reviews can be introduced later if evidence shows a recurring gap.
  - Checks: Rendered and visually inspected the supplied rubric pages; resolved and queried the official NestJS Context7 documentation; parsed schemas; verified canonical/adaptor role parity, workflow references, searchable test-tag conventions, private quality-review ignore protection, and `git diff --check`.
  - Follow-up: The restricted assignment document and all ticket-specific evidence remain outside version control and private runtime context.

- **Align CI and pull-request documentation** (GPT-5): Documented the actual CI triggers, coverage entrypoints, and backend E2E job; linked private test-case design guidance without changing CI execution. Updated the pull-request template to avoid private Jira/Confluence content and to match Semgrep, npm audit, and Gitleaks security checks.
  - Scope: `docs/ci-process.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
  - Assumptions: Jira keys are safe repository references, while Jira and Confluence URLs and contents remain private unless explicitly approved for disclosure.
  - Checks: Inspected the current GitHub Actions workflows and component CI scripts; verified workflow-trigger wording, security-tool names, private-context protections, and `git diff --check`.
  - Follow-up: No GitHub Actions YAML, application code, or CI behavior changed.

- **Standardize future backend E2E test placement** (GPT-5): Updated backend structure guidance so new database/API E2E suites live under `backend/test/`, while unit tests remain beside source behavior. Documented the existing `src/events/drafts.e2e-spec.ts` as a supported legacy exception; no test file moved.
  - Scope: `backend/AGENTS.md`, `AI_USAGE.md`
  - Assumptions: A single `backend/test/` E2E location is clearer for future contributors and matches most current E2E suites.
  - Checks: E2E configuration and location scan; verified the new placement rule and the runner's recursive discovery pattern; `git diff --check`.
  - Follow-up: No application source, test, CI, or runtime configuration changed.

- **Require Confluence and AC test-case coverage mapping** (GPT-5): Strengthened test-case guidance so every applicable Confluence case receives an automated, manual-only, or gap disposition, while an independent AC analysis identifies omitted happy, negative, boundary, cross-cutting, and variation coverage. Clarified that test-case coverage and code coverage are distinct.
  - Scope: `.ai/agents/`, `.ai/workflows/`, `docs/`, `AI_USAGE.md`
  - Assumptions: “100% coverage” means complete disposition of applicable Confluence cases and meaningful AC-derived behaviors, not an unsupported claim that every possible combination is tested.
  - Checks: Verified Confluence-case disposition, implicit-boundary, and test-case-versus-code-coverage rules; verified the new private matrix path is ignored; `git diff --check`.
  - Follow-up: The coverage matrix is private runtime context and is never staged or committed.

- **Document backend service structure** (GPT-5): Replaced event-only backend guidance with a current source-area map and a scalable feature-module layout for controllers, services, repositories, DTOs, models, helpers, and tests. Corrected stale Firebase guidance to the existing PostgreSQL-session architecture. No source files were moved or behavior changed.
  - Scope: `backend/AGENTS.md`, `AI_USAGE.md`
  - Assumptions: Existing small features should remain flat; subdirectories are introduced only when their distinct responsibilities are needed.
  - Checks: Source-tree, module, route, package-script, and authentication-boundary scans; backend-structure and stale-Firebase wording scans; `git diff --check`; confirmed no backend implementation paths changed.
  - Follow-up: No production code, migrations, dependencies, or CI configuration changed.

- **Add acceptance-criteria test-case generation standard** (GPT-5): Added a canonical AC-to-test-case generation workflow based on the supplied team Markdown guidance, including confidence and assumption gates, prioritized coverage tiers, reproducible case format, runtime privacy, and automated-test quality principles. No application behavior changed.
  - Scope: `.ai/agents/`, `.ai/workflows/`, `docs/`, `AGENTS.md`, `AI_USAGE.md`
  - Assumptions: The supplied Markdown guidance takes precedence over the attached lecture slides; the slides remain supporting instructional sources.
  - Checks: Reviewed the supplied Markdown guidance and supporting lecture slides; parsed shared schemas; verified required coverage tiers and private generated-case path; verified runtime ignore protection; `git diff --check`; confirmed no application source, dependency, database, deployment, or CI files changed.
  - Follow-up: Generated test cases remain private runtime artifacts and are not published to Confluence or a test-management system without explicit authorization.

- **Refactor AI instruction hierarchy** (GPT-5): Reduced root instructions to stable repository-wide rules; made the shared Jira workflow canonical; retained component-specific test layout in scoped guidance; and documented AI usage tracking as a durable process document. No application, dependency, database, deployment, or CI behavior changed.
  - Scope: `AGENTS.md`, `.ai/`, `docs/`, `frontend/AGENTS.md`, `backend/AGENTS.md`, `AI_USAGE.md`
  - Assumptions: The existing frontend and backend scoped files are the appropriate homes for framework-specific test naming and layout rules.
  - Checks: Read root, scoped, and process instructions; verified the canonical adapters and runtime ignore rule; `git diff --check`; instruction-hierarchy and duplicate-workflow scans.
  - Follow-up: Existing staged multi-agent scaffold is being refined on `refactor/agent_files`; no commit or push is authorized.

- **Scaffold shared multi-agent architecture** (GPT-5): Added vendor-neutral shared agent roles, a sequential Jira-ticket workflow, private-runtime JSON schemas, thin Codex/Claude adapters, and Git ignore protection for ticket runtime context. The Context Loader now discovers Confluence test cases through each epic's `unit-test` area, matching SPM-ticket folder, and Matrix page. No application behavior was changed.
  - Scope: repository root, `.ai/`, `.claude/`, `.codex/`, `AI_USAGE.md`
  - Assumptions: Jira and Confluence content must remain private runtime data; adapter files should remain minimal pointers to canonical shared definitions.
  - Checks: Parsed both JSON schemas with Node.js; verified all eight canonical roles and both sets of eight thin adapters; verified per-ticket runtime content is ignored while `.gitkeep` remains trackable; `git diff --check`.
  - Follow-up: Created on `refactor/agent_files`; no files will be committed or pushed without explicit human approval.

## 2026-09-27 - Codex

- **Address PR #31 review-thread wording updates** — PR #31 review thread `#pullrequestreview-5326720172`.: Updated stale RED/TDD preambles and helper comments to describe implemented SPM-40 approval behavior as regression coverage, matching current production code.
  - Scope: `backend/src/events/events.approve.spec.ts`, `frontend/src/pages/EventDetailPage.approve.test.tsx`, `frontend/src/store/useAppStore.approve.test.ts`, and `AI_USAGE.md`.
  - Assumptions: "Improved relevant comments for RED/TDD" means only rewriting outdated TDD wording identified in that review thread.
  - Checks: backend targeted test `npm test -- src/events/events.approve.spec.ts` — 11/11 passed; frontend targeted tests `npm test -- src/pages/EventDetailPage.approve.test.tsx src/store/useAppStore.approve.test.ts` — 9/9 passed.
  - Follow-up: No functional behavior changes were made.

- **Refine SPM-40 regression-test headers** — SPM-40 / PR #31.: Refined the three approval-test headers so they identify the implemented behavior and traceability references directly, without stale TDD framing or ambiguous endpoint terminology.
  - Scope: `backend/src/events/events.approve.spec.ts`, `frontend/src/pages/EventDetailPage.approve.test.tsx`, `frontend/src/store/useAppStore.approve.test.ts`, and `AI_USAGE.md`.
  - Assumptions: The requested local changes are a follow-up refinement to the already-committed review-thread fix; no production or test behavior should change.
  - Checks: `git diff --check`; no test run because only comments and the AI usage ledger changed.
  - Follow-up: Changes are local and uncommitted for human review.

## 2026-09-26 - Codex

- **Align SPM-99 automated cases with revised Confluence IDs** (GPT-6) — SPM-99 / existing feature branch `feature/SPM-99-View-Event-information`: Reassigned stale EVENT-VIEW references to the revised 01–06 cases. Kept supplementary not-found, security, refresh and lifecycle checks without reusing Confluence case IDs. Added an AC3 display assertion for both registration timestamps, used the seeded event values for AC1, and split the real PostgreSQL availability check into 02-A through 02-D scenarios.
  - Scope: frontend event-view tests, backend event service test comments, PostgreSQL availability integration tests, `AI_USAGE.md`.
  - Assumptions: The earlier 100% coverage claim applies to `frontend/src/pages/EventView.ts`; repository-wide coverage is not 100%. The requester excluded location from the test scope, while Jira AC1 still lists it.
  - Checks: Focused frontend tests 33/33 passed; `EventView.ts` coverage 100% statements (20/20), branches (26/26), functions (3/3), lines (15/15). PostgreSQL availability integration tests 4/4 passed against the local database with unique fixture IDs and cleanup. Frontend build, targeted frontend ESLint, backend lint and `git diff --check` passed.
  - Follow-up: No production behavior changed. Confluence cases remain marked Not Executed as manual cases; the automated evidence is recorded here. Jira AC1 location wording still differs from the agreed test scope. Changes staged for human review only; no commit, push or PR created.

- **Complete SPM-99 attendee-view test evidence** (GPT-5) — SPM-99: Compared the staged SPM-99 tests with Jira acceptance criteria, Confluence EVENT-VIEW-01 through EVENT-VIEW-06, and the supplied IS212 testing/CI slides. Added missing UI and unit evidence for core attendee details, exact registration-close behaviour, pre-open, cancelled, completed, full, and no-window-hidden states, lifecycle mapping, refresh consistency, nonexistent-event safety, restricted-event non-disclosure, request-error/stale-data handling, and missing optional detail fallbacks. Replaced brittle SQL-text assertions with a PostgreSQL integration test for the registration-limit calculation rule.
  - Scope: `frontend/src/pages`, `backend/src/events`, `backend/test`, `AI_USAGE.md`
  - Assumptions: The implemented policy is that registration is open through the exact configured closing instant and closes strictly after it; the attendee registration panel is displayed only when website registration is disabled (to explain that state) or both registration timestamps are configured.
  - Checks: Focused frontend tests (29 passed); `vitest` coverage scoped to `src/pages/EventView.ts` (100% statements, branches, functions, lines); full frontend `npm test` (218 passed before the final supplemental cases) and `npm run build`; backend focused `events.service.spec.ts` (34 passed), new PostgreSQL availability integration test (1 passed), `npm run lint`, and `npm run build`; `git diff --check`.
  - Follow-up: Frontend `npm run lint` remains blocked by two unrelated pre-existing unused variables in `ClarificationThread.tsx` and `useAppStore.auth.test.ts`. Repository-wide coverage is not 100%; the 100% claim is intentionally scoped to the new lifecycle decision unit, consistent with the course slides’ guidance that coverage is diagnostic rather than proof of correctness.

- **Repair fresh SPM-99 database initialization** (GPT-5) — SPM-99: Updated the base local event-status constraint so `002_seed_data.sql` can insert its Confirmed seed events, allowing the subsequent SPM-99 initializer to create attendee registration storage on a fresh database. Moved the attendee available-spots calculation into the PostgreSQL query, with the backend returning that database result directly.
  - Scope: `backend/src/events`, `database/postgresql/init`, `AI_USAGE.md`
  - Assumptions: The statuses supported by the SPM-99 attendee event view are valid statuses for new local databases, as already specified by its additive initializer.
  - Checks: Built and initialized an isolated PostgreSQL 16 container; confirmed logs ran `001_schema.sql`, `002_seed_data.sql`, and `003_spm99_attendee_event_view.sql` in sequence; verified `event_registrations` exists and five seed events were inserted. Backend `npm test -- --run src/events/events.service.spec.ts` (32 passed), `npm run lint`, `npm run build`, and `git diff --check`.
  - Follow-up: The currently running Compose database was left unchanged; it was initialized before this repair and still needs the previously provided one-time SQL application or a reset after rebuilding.

- **Implement SPM-40 approval workflow** — SPM-40 / no pull request.: Added assigned-coordinator approval for Submitted requests, a transactional `Submitted → Approved` backend transition, persistent organiser approval notifications, frontend decision submission, pending-list removal through the existing Submitted filter, and forward-only state guards.
  - Scope: `frontend/src/pages`, `frontend/src/store`, `frontend/src/components/domain`, `backend/src/events`, component documentation, and `AI_USAGE.md`.
  - Assumptions: Approval requires no reason; the existing request-decision controller and organiser notification feed are shared with SPM-83 while preserving rejection behavior.
  - Checks: Backend `npm test` — 454/454 passed; frontend `npm test` — 211/211 passed; backend direct oxlint and production build passed; targeted frontend ESLint for all SPM-40-touched files and production build passed; `git diff --check` passed.
  - Follow-up: Reused and completed the three pre-existing untracked SPM-40 TDD test files. Full frontend lint remains blocked by two pre-existing unused-variable errors in `ClarificationThread.tsx` and `useAppStore.auth.test.ts`, both untouched. The Windows backend npm lint wrapper mis-parses its root-relative executable, so the underlying oxlint command was run directly. No commit, push, pull request, or Jira status change performed.

- **Add SPM-40 approval functional tests** — SPM-40 / no pull request.: Added Playwright functional coverage for the SPM-40 approval workflow: coordinator default Submitted queue, approval action, pending-list removal, approved filter visibility, organiser approval notification, and UI immutability once approved.
  - Scope: `frontend/src/pages`, `backend/scripts/testing`, and `AI_USAGE.md`.
  - Assumptions: The user's "SPM-40-reject request" wording refers to SPM-40 approve request, since Jira SPM-40 is "Approve a Request" and rejection belongs to SPM-83.
  - Checks: `npx playwright test src/pages/EventDetailPage.approve.playwright.spec.ts` in `frontend/` — 2/2 passed; backend `npm test` — 454/454 passed; frontend `npm test` — 211/211 passed.
  - Follow-up: Uses local seeded accounts and the existing browser-test harness. The direct Playwright run created two local SPM-40 test events and approval notifications; they were removed from the local PostgreSQL database by exact `SPM-40 approval functional %` test-name cleanup. No commit, push, pull request, or Jira status change performed.

- **Add SPM-40 approval integration tests** — SPM-40 / no pull request.: Added backend integration coverage for the approval endpoint using the real Nest HTTP pipeline, PostgreSQL-backed session cookies, persisted event status changes, organiser approval notification retrieval/read state, assigned-coordinator authorization, organiser role rejection, unassigned request rejection, invalid/unknown IDs, unauthenticated access, and non-Submitted conflict guards.
  - Scope: `backend/test` and `AI_USAGE.md`.
  - Assumptions: Integration testing should target the backend API/database boundary; Playwright functional coverage remains the browser-level check.
  - Checks: Focused backend e2e `npx vitest run --config ./vitest.config.e2e.ts test/events-approve.e2e-spec.ts` with local `DATABASE_URL` — 8/8 passed; full backend `npm run test:e2e` — 41 passed / 11 skipped across 6 files; backend `npm test` — 454/454 passed; frontend `npm test` — 211/211 passed.
  - Follow-up: The first focused e2e attempt failed before exercising code because `DATABASE_URL` was not set in the shell; reran with the local Compose host URL `postgres://spm:spm_dev_password@localhost:5432/spm`. No commit, push, pull request, or Jira status change performed.

## 2026-09-24 - Codex

- **Implement attendee event information view** (GPT-5) — SPM-99: Implemented attendee-safe event listing/detail access and attendee-facing registration information: configured opening/closing times, remaining registration spots, registration notices, and derived Upcoming/In Progress/Completed/Cancelled labels. Added an additive local PostgreSQL schema update for registration settings, registration records, and attendee-view lifecycle states.
  - Scope: `frontend/src/pages`, `frontend/src/types`, `backend/src/events`, `database/postgresql/init`, `AI_USAGE.md`
  - Assumptions: The registration opening instant is inclusive; closing occurs strictly after the configured closing timestamp; existing `expected_attendance` is the default registration limit until a separate organiser registration-limit UI exists.
  - Checks: Frontend `npm test` (213 passed), `npm run build`, focused `eventView` coverage (100% statements/branches/functions/lines); backend `npm test` (444 passed), `npm run lint`, `npm run build`; `git diff --check`. Frontend `npm run lint` remains blocked by unrelated existing unused variables in `ClarificationThread.tsx` and `useAppStore.auth.test.ts`.
  - Follow-up: Preserved the pre-existing uncommitted SPM-99 local seed-data changes in `002_seed_data.sql`. The new schema has not been applied to a live local PostgreSQL volume because no database service was running during this work.

- **Add local event seed cases** (GPT-5): Added four fictional event records to the local PostgreSQL seed data, retaining the existing demo event. The added records cover submitted, approved, and rejected workflows, plus registration-enabled and accessibility variants.
  - Scope: `database/postgresql/init`, `AI_USAGE.md`
  - Assumptions: “Test cases” means local development seed records for exercising event workflows, not automated test files.
  - Checks: `git diff --check`; confirmed all four new IDs and their Submitted/Approved/Rejected states. Full PostgreSQL execution was not run because `postgres:16-alpine` is not cached locally.
  - Follow-up: No existing records, schemas, migrations, or application code were changed; no commit or push was created.

## 2026-09-22 - Codex

- **Analyze backend authentication coverage** (GPT-5): Created `codex/fix-authentication-coverage` from the current `dev` baseline, analyzed the authentication-only coverage gaps before any deletion, and added focused coverage tests. No production code was deleted or changed.
  - Scope: `backend/src/auth/authentication`, `AI_USAGE.md`
  - Assumptions: The requested focus is the backend `src/auth/authentication` folder shown in the supplied coverage report.
  - Checks: `npm run test:cov -- src/auth/authentication` in `backend/` (32 passed; every authentication source file is 100% for statements, branches, functions, and lines); `npm run lint`; `npm run build`; focused Prettier check; `git diff --check`.
  - Follow-up: Added business-path tests for authenticated-user retrieval, invalid bodies, and cookie-less logout, plus constructor-metadata fallback tests for compiler-generated Nest decorator branches. No files are staged, committed, or pushed.

- **Repair frontend coverage CI entrypoint** (GPT-5): Corrected the frontend CI entrypoint to invoke the configured `test:cov` script and corrected that script to use Vitest's supported `--coverage` flag. Updated current frontend setup and handover documentation.
  - Scope: `frontend/`, `AI_USAGE.md`
  - Assumptions: `test:cov` is the intended shared coverage-script name, matching the backend component convention.
  - Checks: `npm run test:cov` in `frontend/` (201 passed); `sh -n frontend/scripts/ci/unit-test.sh`; `git diff --check`.
  - Follow-up: No frontend lint or build run; the observed CI failure occurred before tests started because the entrypoint referenced a missing npm script.

- **Move application, database, and Compose directories to the repository root** (GPT-5): Moved `apps/frontend` to `frontend`, `services/backend` to `backend`, `development/database` to `database`, and `development/local-dev` to `docker-compose`. Updated all operational path references, Compose build and bind-mount paths, CI discovery/cache/working-directory paths, backend path-sensitive helpers, and documentation. Removed the now-empty parent directories and their superseded parent-scoped agent guidance; the local Compose guidance now lives in `docker-compose/AGENTS.md`.
  - Scope: `frontend/`, `backend/`, `database/`, `docker-compose/`, `.github/workflows/`, root documentation and agent guidance
  - Assumptions: The current `integration/Sprint-1` checkout is the intended migration baseline. Ignored local dependencies, build output, coverage, and `.env` files should move with their directories and remain uncommitted.
  - Checks: `docker compose -f docker-compose/docker-compose.yml config --quiet`; backend `npm test` (434 passed), `npm run lint`, and `npm run build`; frontend `npm test` (201 passed) and `npm run build`; stale operational-path audit and `git diff --check`. Frontend `npm run lint` remains blocked by two pre-existing unused-variable errors in `src/components/domain/ClarificationThread.tsx` and `src/store/useAppStore.auth.test.ts`.
  - Follow-up: Full before/after SHA-256 inventories confirm every moved regular file is present (8,788 backend, 20,374 frontend, 7 database, and 8 Compose files) and all 47 symlinks remain. The only content changes are the intended path/documentation updates plus regenerated ignored Vitest cache records and backend build output. The changes were staged for human review; no push has been made.

- **Correct event-assignment E2E seed parameter mapping** (GPT-5) — SPM-30: Restored the event seed query's placeholders so organiser, coordinator, attachments, and status values align with the supplied PostgreSQL parameter array.
  - Scope: `services/backend/test`, `AI_USAGE.md`
  - Assumptions: `$6` represents the status value because it is the sixth query parameter; the explicit INSERT column list determines where that value is stored.
  - Checks: Focused `events-assign.e2e-spec.ts` execution attempted; blocked because no PostgreSQL service is listening on local port 5432.
  - Follow-up: The correction is folded into the existing SPM-30 test commit; no remote push was made.

- **Convert event-assignment E2E authentication to PostgreSQL sessions** (GPT-5) — SPM-37: Replaced the obsolete Firebase-token mock in the event-assignment E2E suite with temporary PostgreSQL users and real login cookies, including cleanup of test users and events.
  - Scope: `services/backend/test`, `AI_USAGE.md`
  - Assumptions: Event route authentication is intentionally backed by the local PostgreSQL session middleware; temporary users are safe to delete after their test events.
  - Checks: Backend lint and build passed; PostgreSQL E2E rerun pending because Docker Desktop is unavailable.
  - Follow-up: No commit or push created.

- **Wait for final PostgreSQL startup in E2E CI** (GPT-5): Corrected the CI readiness gate to wait for the PostgreSQL image's initialization phase to finish before accepting the final server as ready.
  - Scope: `.github/workflows`, `AI_USAGE.md`
  - Assumptions: The official image retains its documented initialization-complete log message; the final `pg_isready` probe confirms its replacement server is accepting connections.
  - Checks: Reviewed failed CI container logs and shell syntax; GitHub Actions rerun pending.
  - Follow-up: The prior readiness check passed against a temporary initialization server that was intentionally shut down seconds later.

- **Restore event-assignment API import** (GPT-5) — SPM-37: Restored the `api` helper import removed during merge resolution so coordinator assignments can persist after their optimistic state update.
  - Scope: `apps/frontend/src/store`, `AI_USAGE.md`
  - Assumptions: The existing `/events/:id/assign` API call is the intended assignment persistence contract.
  - Checks: Focused `useAppStore.events.test.ts` (5 passed); `git diff --check`.
  - Follow-up: The change is uncommitted and unpushed.

- **Serialize shared PostgreSQL E2E suites** (GPT-5): Configured Vitest to run PostgreSQL-backed E2E files sequentially because they share one mutable test database and clean up their own fixtures.
  - Scope: `services/backend`, `AI_USAGE.md`
  - Assumptions: A single disposable PostgreSQL instance is the intended E2E dependency; serial file execution is an acceptable reliability trade-off.
  - Checks: `DATABASE_URL=postgresql://spm:spm_dev_password@127.0.0.1:5432/spm npm run test:e2e` against an isolated temporary PostgreSQL container (32 passed; 11 intentional skips); temporary container removed.
  - Follow-up: No commit or push created.

- **Guard browser-session restoration against stale auth updates** (GPT-5): Completed the auth revision guard so late session-restoration results cannot overwrite a newer login or logout, and added a regression test for a late restore after sign-out.
  - Scope: `apps/frontend/src/store`, `AI_USAGE.md`
  - Assumptions: Login and logout are newer auth decisions than a pending startup session restoration.
  - Checks: Focused `useAppStore.auth.test.ts` (9 passed). Frontend lint and build remain blocked by pre-existing unrelated merge changes.
  - Follow-up: Current build errors include missing `Navigate`, `currentUserId`, and `api` identifiers; lint also reports unrelated unused variables.

- **Repair PostgreSQL E2E clarification session fixture** (GPT-5) — SPM-39: Updated the clarification E2E fixture to consume the configured PostgreSQL session cookie name, kept the expired-session fixture valid under the session timestamp constraint, and added PostgreSQL container-log output when E2E CI fails.
  - Scope: `services/backend/test`, `.github/workflows`, `AI_USAGE.md`
  - Assumptions: `connectsphere_session` remains the backend default cookie name; CI container logs are safe diagnostic output because the database contains local-only fixture data.
  - Checks: `DATABASE_URL=postgresql://spm:spm_dev_password@127.0.0.1:5432/spm npm run test:e2e` against an isolated temporary PostgreSQL container (27 passed; 11 intentional skips); final container removed.
  - Follow-up: The earlier CI database termination needs the newly captured PostgreSQL logs if it recurs.

- **Reconcile SPM-83 rejection flow after dev rebase** (GPT-5) — SPM-83 / branch `feature/SPM-83-reject-a-request` (Jira connector unavailable; used the user-supplied acceptance criteria).: Restored the SPM-83 API and UI integration displaced by the required dev-wins rebase, while preserving SPM-38's verified Firebase ownership, round-robin assignment, and removal of `Under_Review`. Only an assigned coordinator can reject a Submitted request. Rejection records a validated 10–500-character, three-word, letter-containing reason, persists an organiser notification atomically, and follows the `draft → submitted → rejected` timeline. Coordinators open on Submitted pending requests and can find decisions through the Rejected filter.
  - Scope: `apps/frontend/src/pages`, `apps/frontend/src/store`, `services/backend/src/events`, `services/backend/src/app.module.ts`, backend/local database migrations, component documentation, `AI_USAGE.md`.
  - Assumptions: The user explicitly authorized deletion of the local PostgreSQL volume. The fresh database retains the repository's one built-in fictional sample event. Rejection remains in-app notification only; email is outside the supplied story.
  - Checks: `npm test` in `services/backend` — 427/427 passed; `npm test` in `apps/frontend` — 200/200 passed; production builds passed in both components; backend lint passed. Frontend lint remains blocked by pre-existing unused `hasReplies` in `apps/frontend/src/components/domain/ClarificationThread.tsx`, outside this work. Docker rebuilt/recreated all services; frontend, backend, and PostgreSQL are healthy; `/healthz` returned `status: ok`; database constraints verified for `Submitted`, `Approved`, `Rejected` and a 10–500-character rejected reason.
  - Follow-up: No commit, push, or pull request was created. The SPM-83 implementation now deliberately supersedes stale documentation/tests that mentioned `Under_Review` or a 1–2000-character reason.

- **Wire event and draft services to the shared database pool** (GPT-5) — Unknown (user-requested maintenance; branch `feature/SPM-83-reject-a-request`): Replaced the separate `pg.Pool` instances in `EventsService` and `DraftsService` with injected `DatabaseService` access. Single statements now use `query()` and multi-step operations use the shared `transaction()` helper, preserving atomic draft submission and rejection workflows. Registered `DatabaseModule` with `AppModule`.
  - Scope: `services/backend/src/app.module.ts`, `services/backend/src/events`, backend documentation, `AI_USAGE.md`
  - Assumptions: This request refers to the outstanding shared PostgreSQL-pool migration described in the backend README and handover notes.
  - Checks: `npm test` in `services/backend` — 427/427 passed; `npm run build` passed; `git diff --check` passed.
  - Follow-up: Changes are staged for human review only; no commit, push, pull request, or database schema migration was run.

- **Repair frontend route authentication identity selector** (GPT-5): Derived `currentUserId` from the Zustand auth state for the `AppShell` remount key, and imported React Router's `Navigate` used by the root redirect.
  - Context: User-reported frontend compile error; no Jira issue supplied.
  - Scope: `apps/frontend/src/App.tsx`, `AI_USAGE.md`.
  - Assumptions: The shell should remount when `currentUser.id` changes after a login, logout, or session restoration.
  - Checks: `npm run build` in `apps/frontend` passed.
  - Follow-up: No commit, push, or pull request was created.

- **Consolidate overlapping PostgreSQL initializers** (GPT-5): Merged the overlapping status/rejection rules from `006_event_rejection.sql`, `006_remove_under_review_status.sql`, and `007_allow_rejected_event_status.sql` into one final `006_event_rejection.sql`; removed the two superseded files. The consolidated initializer normalizes legacy `Under_Review` rows to `Submitted`, allows `Submitted`/`Approved`/`Rejected`, and requires a 10–500-character reason for rejections.
  - Context: User-requested scan and merge of overlapping local PostgreSQL initialization files; no Jira issue supplied.
  - Scope: `development/database/postgresql/init`, database and backend setup documentation, `AI_USAGE.md`.
  - Assumptions: Docker init scripts define fresh-volume state; existing volumes retain the backend-owned `003_event_rejection.sql` then `004_allow_rejected_event_status.sql` migration sequence.
  - Checks: Reviewed filename-order execution and all references; `git diff --check` passed. Docker engine is available but its required `postgres:16-alpine` image is not present, so a fresh-container SQL execution was not run.
  - Follow-up: The complementary `001_schema.sql`, `001_rbac.sql`, and `001_users.sql` were retained. No local volume, container, commit, push, or pull request was changed.

- **Fold final event lifecycle into the base initializer** (GPT-5): Moved the final `Submitted`/`Approved`/`Rejected` status constraint and the 10–500-character rejected-reason constraint into `002_events.sql`; removed the status-changing logic from `004_clarifications.sql` and deleted the now-redundant `006_event_rejection.sql`.
  - Context: User requested consolidating the fresh-volume event lifecycle instead of retaining a dedicated rejection initializer; no Jira issue supplied.
  - Scope: `development/database/postgresql/init`, database and backend setup documentation, `AI_USAGE.md`.
  - Assumptions: `002_events.sql` is the source of truth for fresh event-table creation, while existing persistent volumes continue to use backend migrations `003_event_rejection.sql` and `004_allow_rejected_event_status.sql`.
  - Checks: Built a temporary `postgres:16-alpine`-based image and initialized an isolated PostgreSQL 16 database. All init scripts succeeded; `events_status_check`, `events_rejection_reason_check`, and `events.rejection_reason` were verified. Removed the temporary container and image afterward. `git diff --check` passed.
  - Follow-up: No shared Compose container, volume, data, commit, push, or pull request was changed.

- **Consolidate local PostgreSQL initialization into schema and seed scripts** (GPT-5): Consolidated all extensions, tables, constraints, and indexes into `001_schema.sql`, and all RBAC, local-account, health-check, and fictional-event inserts into `002_seed_data.sql`. Removed the seven superseded initializer files and updated references.
  - Context: User requested exactly two SQL files under `development/database/postgresql/init`: one schema and one seed-data script; no Jira issue supplied.
  - Scope: local PostgreSQL initialization, backend draft E2E fixture reference, migration comments, database/backend/local-dev documentation, `AI_USAGE.md`.
  - Assumptions: These scripts define fresh Docker-volume state only. Existing persistent volumes must keep using backend-owned additive migrations, not the rewritten initializer.
  - Checks: Fresh isolated PostgreSQL 16 container initialization passed with only `001_schema.sql` and `002_seed_data.sql`; verified 5 roles, 10 resources, 27 permissions, 16 users, one sample event, and the auth/clarification/notification tables. `npm run build` in `services/backend` and `git diff --check` passed. Temporary container and image were removed; shared Compose resources were untouched.
  - Follow-up: No commit, push, pull request, or local-volume reset was performed.

- **Preserve local database initializer history** (GPT-5): Added a durable changelog that records the prior event, local-auth/RBAC, clarification, status-retirement, and rejection-schema changes now represented by the two consolidated init scripts.
  - Context: User requested retained history after consolidating the PostgreSQL initializer; no Jira issue supplied.
  - Scope: `development/database/CHANGELOG.md`, database README, `AI_USAGE.md`.
  - Assumptions: Git history remains the complete implementation-level audit trail; the changelog is a concise operational guide, not a migration sequence.
  - Checks: Confirmed historical commits touching the initializer and linked the changelog from the database README.
  - Follow-up: No SQL files, containers, volumes, commits, pushes, or pull requests were changed by this documentation update.

- **Configure Vitest V8 coverage reports** (GPT-5): The package was already installed and locked in both components. Added explicit V8 coverage/report configuration to their standard Vitest configs and changed backend CI to run its existing coverage command, matching the frontend's coverage-enabled CI entrypoint.
  - Context: User requested `@vitest/coverage-v8` for both frontend and backend; no Jira issue supplied.
  - Scope: frontend/backend Vitest configuration, backend CI test entrypoint and README, `AI_USAGE.md`.
  - Assumptions: Coverage reporting should not enforce a project-wide threshold; the existing SPM-37 focused coverage configurations retain their strict thresholds.
  - Checks: `npm run test:coverage` in `apps/frontend` — 201/201 passed; V8 summary: 87.61% statements, 80.66% branches, 80.95% functions, 89.60% lines. `npm run test:cov` in `services/backend` — 434/434 passed; V8 summary: 95.41% statements, 94.16% branches, 92.17% functions, 96.20% lines.
  - Follow-up: No commit, push, or pull request was created.

- **Remove combined coverage dashboard automation** (GPT-5): Removed the obsolete root dashboard documentation. The already-removed aggregation scripts and CI dashboard upload are not restored; frontend and backend retain their independent V8 coverage configuration and commands.
  - Context: User no longer wanted frontend and backend coverage aggregated into one folder; the V8 package and per-component reports remain required.
  - Scope: root coverage-dashboard documentation and `AI_USAGE.md`.
  - Assumptions: Per-component `coverage/` reports are sufficient for local coverage use.
  - Checks: Confirmed the combined dashboard scripts and CI steps are absent while both component coverage configurations remain present.
  - Follow-up: No dependency, commit, push, or pull request was removed or created.

- **Prepare SPM-40 accept-request branch** (GPT-5) — SPM-40 / no pull request; Jira could not be accessed from the available tools.: Created `feature/SPM-40-accept-a-request` from the latest `dev` as requested. An older local branch, `feature/SPM-40-approve-a-request`, was inspected and found to have no commits beyond `dev`, so it contained no development work to reuse.
  - Scope: branch setup and `AI_USAGE.md` only.
  - Assumptions: The user-supplied ticket name, "Accept a request," is used for the branch slug. No feature requirements or acceptance criteria were inferred.
  - Checks: Fetched `origin/dev`, verified local `dev` matches it, checked local/remote SPM-40 branches and GitHub pull requests, and verified the new branch starts at the same commit as `dev`.
  - Follow-up: Jira summary, description, acceptance criteria, comments, priority, sprint, and status remain unverified. No implementation, commit, push, pull request, or Jira status change was performed.

## 2026-09-22 - Claude

- **Replace hardcoded coordinator roster with a live Postgres query** (Sonnet 5) — SPM-38 follow-up / branch `dev` (working directly on `dev` at the user's local checkout; not yet committed): Since this SPM-38 work merged into `dev`, two other branches (SPM-30, SPM-83) also merged in and made two things obsolete: (1) SPM-30 replaced Firebase Auth entirely with local Postgres-session auth (`AuthenticatedUser.uid` is now a `users.id` UUID, not a Firebase UID), which silently broke round-robin — `coordinator-roster.ts`'s hardcoded Firebase UIDs no longer matched any real account under the new auth system; (2) SPM-30 also seeded a real, queryable coordinator directory (`users`/`user_roles`/`roles`, in `development/database/postgresql/init/001_users.sql`) that didn't exist when the hardcoded roster was originally written (the roster's own comment explicitly said "there is no backend-queryable coordinator directory in this system" — that was true at the time, no longer true now). At the user's request, rewrote `coordinator-roster.ts` to query `users JOIN user_roles JOIN roles WHERE roles.name = 'COORDINATOR' AND users.is_active = true` live instead of using a hardcoded array; `pickNextCoordinator` is now async and takes a `pg.Pool | pg.PoolClient` to query with (reuses the caller's transaction). `EventsService.autoAssignCoordinator` awaits it and now leaves an event unassigned (rather than throwing) if no active coordinator account exists. Ordered the roster by `users.email`, not `created_at` — seed accounts are inserted in one batch `INSERT`, so they all share an identical `now()`-derived `created_at`, which made the original `ORDER BY created_at, id` ordering effectively random (sorting by the UUID tiebreaker). Also fixed two unrelated pre-existing runtime bugs found while getting the local stack running again: `apps/frontend/src/App.tsx` referenced an undefined `currentUserId` (should read it from the store, mirroring `RootRedirect`'s pattern two lines below) and used `Navigate` without importing it from `react-router-dom` — both introduced by a different commit (`7b8b8d3d`, unrelated to this work) and both crashed the entire app on load.
  - Scope: `services/backend/src/events/coordinator-roster.ts` (+ spec), `services/backend/src/events/events.service.ts` (+ spec), `development/local-dev/README.md`, `apps/frontend/src/App.tsx`, `AI_USAGE.md`
  - Assumptions: Ordering the roster by `email` (rather than e.g. a dedicated `display_order` column) is a reasonable stand-in for "roster order" given the current schema has nothing more purpose-built; flagged in the code comment so a future reader knows why `created_at` was rejected. Deactivating a coordinator (`users.is_active = false`) is assumed to be the intended way to remove someone from the rotation, matching the partial index `users_active_email_idx` already built for exactly that filter.
  - Checks: `npm test` in `services/backend` — 434/434 passed (18 suites). `oxlint` clean. `npx tsc --noEmit` clean aside from pre-existing, unrelated errors in `clarifications.e2e-spec.ts`/`events-assign.e2e-spec.ts` (a `set-cookie` header typing issue from the SPM-30 session-auth e2e tests, not touched here). Verified live: reapplied all current Postgres init scripts to the local dev volume (it predated the SPM-30 migration and was missing `users`/`user_roles`/`auth_sessions` entirely), confirmed the roster query returns the 4 real seeded coordinators in the expected `coordinator1 → coordinator2 → coordinator3 → organiser_coordinator` order, and confirmed the assigned-coordinator count in the live `events` table lines up with which coordinator round-robin would pick next. Backend container rebuilt and redeployed; healthy.
  - Follow-up: This work was done directly on `dev` (per the session's current checkout) and is **not yet committed** — staged for the user's review per AGENTS.md Rule 11. The local Postgres volume needed a full re-application of every init script (not just the new ones) to reach parity with a fresh volume; anyone else's stale local volume will hit the same issue and need the same fix. `clarifications.e2e-spec.ts` still refers internally to Firebase-emulator-era patterns in places — not audited end-to-end for SPM-30 compatibility here, out of scope for this change.

- **Final negative/boundary/edge-case audit for SPM-38** (Sonnet 5) — SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet): Audited every existing automated test against SPM-38's 5 ACs and found real coverage gaps, then closed them: (1) backend AC4 had no test for a dual-role account (both ORGANISER and COORDINATOR — relevant since `coor_tech@connectsphere.sg` genuinely holds both roles in this system) being able to view an event via either match; (2) no test that an unassigned event (`coordinator_id IS NULL`) is hidden from every coordinator, not just non-matching ones; (3) `get()` had no explicit test for a role that is neither organiser nor coordinator (only `list()` had one); (4) frontend had no test for the empty-attachments UI state ("None specified", no View/Download controls); (5) the `openAttachmentPreview` Blob-conversion fix had no test for its MIME-type fallback branch (when the `data:` URL header has no extractable MIME type); (6) `EventCard`'s truncation/overflow fix was only tested for the coordinator-email case, not other long values (added a long-venue-name case and its "Not booked" fallback). Added 3 new backend tests (EVE-REV-04-G/H/I), 2 new frontend attachment tests (EVE-REV-03-C/D), and 2 new EventCard tests. Also brought the Confluence documentation current: corrected two pages that had drifted from actual behavior since they were written (EVE-REV-02-A's test data still said `Under_Review`; EVE-REV-05-A/B's expected results still claimed status "advances to Under_Review", both now stale after the later Under-Review-removal work), added the 5 new test case entries to their respective pages, marked every now-passing case's Actual Result/Pass-Fail/Executed By/Date of Execution fields (several were still "Not executed" from initial creation despite the suite passing), and updated the Matrix's ID ranges (`EVE-REV-03-A to -D`, `EVE-REV-04-A to -I`).
  - Scope: `services/backend/src/events/events.service.spec.ts`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/components/domain/EventCard.test.tsx`, Confluence (EVE-REV-01 through EVE-REV-05 pages, plus the Matrix), `AI_USAGE.md`
  - Assumptions: Two findings were surfaced as documented limitations rather than fixed, since they're architectural trade-offs rather than missing test coverage of implemented behavior: (a) `pickNextCoordinator`/`autoAssignCoordinator` has no protection against a concurrent-submission race — two simultaneous submissions could both read the same assigned-coordinator count and land on the same roster entry, since there's no row lock or atomic increment; low risk at current traffic levels, worth a follow-up ticket if submission volume grows. (b) `pickNextCoordinator` would divide by zero (`array[NaN]` → `undefined`) if `COORDINATOR_ROSTER` were ever edited down to empty; not guarded since the array is a fixed local constant, not runtime input, matching this repo's "don't validate what can't happen" convention — worth revisiting if the roster ever becomes dynamically loaded.
  - Checks: `npm test` in `services/backend` — 409/409 passed (15 suites). `npm test` in `apps/frontend` — 182/182 passed (18 suites). Both suites re-verified green after all additions.
  - Follow-up: The two limitations noted above (round-robin concurrency race, empty-roster guard) are flagged for the user's awareness but intentionally left unaddressed — they're product/architecture decisions, not bugs in delivered scope. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

- **Retire the "Under Review" event status entirely** (Sonnet 5) — SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet): In a prior session-turn today, "Under Review" was made to no longer auto-trigger on coordinator assignment (since assignment is now automatic and instant). The user then decided to remove "Under Review" as a status entirely, including retiring the AC that triggered it on a clarification request (SPM-39's `REQ-CLAR-01-A`, until now: "status changes to Under Review"). Removed every code path that could set the status: `ClarificationsService.createClarification` no longer calls `updateEventStatus` (which was deleted from `ClarificationsRepository` as dead code); `CLARIFIABLE_STATUSES` in both `ClarificationsService` and `EventDetailPage.tsx` dropped `'Under_Review'`/`"under_review"`. Removed `"under_review"` from the frontend's `EventStatus` type, `StatusBadge`'s style/label maps, `EventListPage`'s status filter, and `EventDetailPage`'s `STATUS_FLOW` stepper and "Review Event" button gate. Added migration `006_remove_under_review_status.sql`, which backfills any existing `Under_Review` rows to `Submitted` and tightens `events_status_check` to `('Submitted', 'Approved')` only (previously `('Submitted', 'Under_Review', 'Approved')`, set by `004_clarifications.sql`, which is left untouched as historical record per this project's additive-migration convention). Applied that migration directly to the running local Postgres and rebuilt/redeployed the backend container. The remaining lifecycle: an organiser submits a request, it's immediately auto-assigned a coordinator via round-robin (staying `Submitted`), and it advances only when a future approve/reject decision is implemented — clarification requests are now a side conversation that never changes status.
  - Scope: `services/backend/src/events/events.service.ts` (+ spec), `services/backend/src/clarifications/clarifications.service.ts` (+ spec), `services/backend/src/clarifications/clarifications.repository.ts`, `services/backend/test/events-assign.e2e-spec.ts`, `services/backend/test/clarifications.e2e-spec.ts`, `services/backend/README.md`, `services/backend/HANDOVER.md`, new `development/database/postgresql/init/006_remove_under_review_status.sql`, `development/local-dev/seed-clarification-test.sql`, `apps/frontend/src/types/index.ts`, `apps/frontend/src/components/ui/StatusBadge.tsx`, `apps/frontend/src/pages/EventListPage.tsx`, `apps/frontend/src/pages/EventDetailPage.tsx` (+ clarifications test), `apps/frontend/src/components/domain/EventCard.test.tsx`, `apps/frontend/src/store/useAppStore.ts` (+ events test), `AI_USAGE.md`
  - Assumptions: "The AC whereby that stage is triggered to under review when a clarification is sent will be removed" was read as "clarification requests no longer change event status at all" (not "change it to some other status") — the clarification thread itself (comments, notifications, reply/resolve) is otherwise fully intact and unaffected. `004_clarifications.sql` is treated as an immutable historical record (per this repo's established pattern of additive, sequentially-numbered init scripts, e.g. `005_clarification_resolution.sql` never edited `004`); the constraint change is a new, separate migration rather than an edit to `004`.
  - Checks: `npm test` in `services/backend` — 406/406 passed (15 suites). `npm test` in `apps/frontend` — 178/178 passed (18 suites). `npx eslint`/`oxlint` clean on all changed files. `npx tsc --noEmit` in `services/backend` clean aside from the same pre-existing, unrelated errors noted in the 2026-09-21 entry below. Migration applied directly to the running local Postgres via `docker compose exec postgres psql ... -f -`; confirmed via `\d events` that `events_status_check` now reads `CHECK (status = ANY (ARRAY['Submitted'::text, 'Approved'::text]))` and that the 2 pre-existing `Under_Review` rows were backfilled to `Submitted`. Backend container rebuilt and redeployed (`docker compose up -d --build backend`); confirmed healthy via `/healthz`.
  - Follow-up: `services/backend/HANDOVER.md`'s "Known gaps" section (coordinator assignment, demo-identity auth) still has other stale claims beyond what this entry fixed — not addressed here, out of scope for this specific change. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

- **SPM-38 local verification, DB reset, and coordinator-edit removal** (Sonnet 5) — SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet): The user tested the 2026-09-21 SPM-38 implementation live and reported round-robin/access-scoping as not working. Root cause: the local Docker `spm-local-backend` container was still running code built before this session's changes (confirmed via `docker exec` inspection of the compiled `dist/` — no `coordinator-roster.js`, still used the old `identity()`/`DEMO_ORGANISER_ENABLED` scheme). Rebuilt and redeployed it (`docker compose up -d --build backend`); Postgres data (named volume) survived. Explained to the user that ~20 pre-existing event rows (owned by the old fixed demo identity, no coordinator) are legacy-owned and stay invisible under real-identity scoping by design (`services/backend/AGENTS.md`'s "never automatic assignment" policy) — not a new bug. At the user's request, cleared `events`, `event_drafts`, `event_comments`, and `notifications` (`TRUNCATE ... RESTART IDENTITY CASCADE`) for a clean re-test, leaving `roles`/`role_permissions`/`resources`/`app_health_checks` untouched. Fixed `development/local-dev/README.md`'s stale claim that `/api/events` doesn't require a Firebase token. Separately, the user found (a) a text-overflow bug where a long coordinator email in `EventCard`'s 4-column grid could overflow the card (no `min-w-0`/`truncate` on grid cells), and (b) confirmed the coordinator's post-submission "Edit" button — previously flagged as calling a client-only, non-persisting `updateEvent` store action — should be removed entirely for this sprint rather than fixed, since a separate Jira card ("Edit Event Details" under "Event Information Management") owns building real persistence later. Fixed the overflow (`min-w-0` + `truncate` + `title` tooltip on `EventCard`'s grid cells and `EventDetailPage`'s People card, using `break-words` there instead of `truncate` since it's a single-column sidebar). Removed the coordinator's inline Edit button, `editMode` state, and the local `EventEditForm` usage from `EventDetailPage.tsx` entirely (left the organiser's separate pre-submission draft-edit page/route untouched — out of scope, not discussed with the user).
  - Scope: `development/local-dev/` (backend container rebuild, Postgres data reset), `development/local-dev/README.md`, `apps/frontend/src/pages/EventDetailPage.tsx`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/components/domain/EventCard.tsx`, new `apps/frontend/src/components/domain/EventCard.test.tsx`, `AI_USAGE.md`
  - Assumptions: "Remove the edit feature" was scoped to the coordinator's post-submission inline edit on `EventDetailPage.tsx` (the button shown in the user's screenshot), not the organiser's separate draft-edit page at `/events/:id/edit` (which the user did not show or mention, and which — unlike the coordinator's button — was not confirmed broken in this conversation).
  - Checks: `npm test` in `apps/frontend` — 178/178 passed (18 suites, includes new `EventCard.test.tsx` and a new EventDetailPage regression test asserting no Edit button renders for the assigned coordinator). `npx eslint` clean on all changed files. Backend container health-checked healthy post-rebuild; `curl /healthz` returned 200; verified via `docker exec` that the rebuilt image's `dist/events/events.service.js` contains `pickNextCoordinator`/`requireOrganiser` (not the old `identity()`/`DEMO_ORGANISER_ENABLED` code).
  - Follow-up: Postgres application data was intentionally cleared at the user's explicit request (not an automated test-teardown action, per `development/AGENTS.md`'s lifecycle rules). The organiser's draft-edit page (`EventEditPage.tsx`) still calls the same non-persisting `updateEvent` store action and is likely affected by the same root issue as the removed coordinator button, but was left untouched pending the "Edit Event Details" card's scope. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-21 - Codex

- **Complete frontend authentication-client coverage** (GPT-5): Expanded the PostgreSQL-session authentication client tests without removing traceability comments. Coverage now includes normalized multi-role mapping, unsupported roles, profile fallbacks, successful and failed login, malformed response fallbacks, session restoration states, logout, error construction, and the default API-base fallback.
  - Scope: `apps/frontend/src/lib`, `AI_USAGE.md`
  - Assumptions: Browser authentication remains cookie-based, and `USER-LOGIN-01` identifiers remain the relevant test-case traceability labels.
  - Checks: Focused auth coverage (15 passed; 100% statements, branches, functions, and lines) and frontend `npm test` (153 passed).
  - Follow-up: No files were staged, committed, or pushed.

- **Complete API helper coverage** (GPT-5): Merged duplicate session-header assertions and expanded API-helper coverage for configured/default origins, caller headers, network failure, non-JSON responses, validation errors, attachment-size errors, server errors, and the error type.
  - Scope: `apps/frontend/src/utils`, `AI_USAGE.md`
  - Assumptions: Browser session cookies remain the sole authentication mechanism; frontend requests deliberately do not send an `Authorization` header.
  - Checks: Focused API coverage (9 passed; 100% statements, branches, functions, and lines), frontend `npm test` (128 passed), build, and `git diff --check`.
  - Follow-up: Frontend lint remains blocked by unrelated existing unused variables in clarification/event-detail files. No files were staged, committed, or pushed.

- **Rebuild PostgreSQL login page tests** (GPT-5): Rebuilt `LoginPage.test.tsx` from the current `USER-LOGIN-01/02/03` Confluence cases, retaining separate field-validation, pending-submission, redirect, and recovery checks while replacing Firebase doubles with the local backend-auth client.
  - Scope: `apps/frontend/src/pages`, `AI_USAGE.md`
  - Assumptions: The numbered `@connectsphere.test` names are test fixtures matching the current seed data.
  - Checks: Focused suite (21 passed), focused `LoginPage.tsx` coverage (100% statements, branches, functions, and lines), frontend `npm test` (121 passed), build, and `git diff --check`.
  - Follow-up: Frontend lint remains blocked by unrelated existing unused variables in clarification/event-detail files. No files were staged, committed, or pushed.

- **Harden PostgreSQL authentication E2E coverage** (GPT-5): Reworked the backend authentication E2E suite to use a real seeded account and cover successful session use, credential normalization and validation, enumeration-safe failures, invalid/missing cookies, logout clearing and revocation, expired sessions, and disabled accounts. Corrected malformed local-user seed SQL and its role-assignment email mismatch so CI can initialize the E2E database.
  - Scope: `services/backend/test`, `development/database/postgresql/init`, `AI_USAGE.md`
  - Assumptions: `attendee1@connectsphere.test` and `P@55w0rd` are the intended local-only CI fixture; E2E coverage needs the CI PostgreSQL container to produce its final report.
  - Checks: Backend lint passed; focused auth unit suite passed (23 tests). E2E execution could not run locally because Docker Desktop is stopped and this environment blocks listening sockets/database connections.
  - Follow-up: Existing authentication migration work was preserved. No commit, push, or pull request was created.

- **Restore local-login test traceability** (GPT-5): Restored the deleted login-page unit suite as PostgreSQL-session tests and added direct `USER-LOGIN-01/02/03` Confluence test-case comments above each corresponding test. Updated unexpected-login-failure handling to use a generic user-safe message.
  - Scope: `apps/frontend/src/pages`, `apps/frontend/src/store`, `AI_USAGE.md`
  - Assumptions: The numbered `@connectsphere.test` fixture accounts mirror the current schema text; live seed initialization remains blocked by the separately identified SQL consistency issue.
  - Checks: Focused login suite (16 passed), frontend `npm test` (116 passed), build, and `git diff --check`. Lint remains blocked by four pre-existing unused variables in clarification/event-detail files outside this change.
  - Follow-up: No files were staged, committed, or pushed. The exact seed-account naming and schema repair still require the requester's direction.

- **Centralize authentication configuration** (GPT-5): Moved session environment parsing from the authentication feature to `src/config/auth.config.ts`; standardized configuration and the default cookie as `AUTH_*` and `connectsphere_session` without a temporary local-auth namespace.
  - Scope: `services/backend`, `development/local-dev`, `AI_USAGE.md`
  - Assumptions: PostgreSQL session authentication is the sole supported authentication implementation; `AUTH_COOKIE_SECURE=false` remains appropriate only for local HTTP development.
  - Checks: Backend `npm test` (388 passed), lint, build, stale-name scan, and `git diff --check`.
  - Follow-up: The separately identified seeded-account email/schema inconsistency remains untouched pending the requester's choice of authoritative accounts; no files were staged, committed, or pushed.

- **Expand authentication repository edge coverage** (GPT-5): Added failure-path tests that verify each authentication repository operation propagates PostgreSQL failures instead of treating an outage as an authentication result.
  - Scope: `services/backend/src/auth/authentication`, `AI_USAGE.md`
  - Assumptions: Repository storage errors intentionally propagate to the service/global Nest error boundary; login remains responsible for mapping only absent account rows to invalid credentials.
  - Checks: Focused repository coverage (10 passed; 100% statements, functions, and lines; 83.33% branches due solely to Nest decorator instrumentation), backend `npm test` (388 passed), lint, build, and `git diff --check`.
  - Follow-up: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

- **Align local development seed password** (GPT-5): Aligned authentication unit/E2E fixtures and local setup documentation with the existing PostgreSQL seed password `P@55w0rd`.
  - Scope: `development/database`, `services/backend`, `AI_USAGE.md`
  - Assumptions: This is a deliberately non-production credential and has already been applied in the committed schema seed.
  - Checks: Repository-wide old-password scan, backend `npm test` (384 passed), and `git diff --check`.
  - Follow-up: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

- **Minimize authenticated account data** (GPT-5): Removed password hashes from the authentication repository SELECT result and account types; PostgreSQL retains credential verification through `crypt()` without returning the hash to application memory.
  - Scope: `services/backend/src/auth`, `AI_USAGE.md`
  - Assumptions: A verified account requires only identity and role data after the database predicate succeeds.
  - Checks: Backend `npm test` (384 passed), lint, build, password-hash reference scan, and `git diff --check`.
  - Follow-up: Database fixture inserts still set password hashes as required for test-user creation; no files were staged, committed, or pushed.

- **Cover authentication repository persistence boundary** (GPT-5): Added focused unit coverage for PostgreSQL credential lookup, account/session row mapping, session creation, absent rows, and idempotent session revocation.
  - Scope: `services/backend/src/auth/authentication`, `AI_USAGE.md`
  - Assumptions: PostgreSQL itself remains covered by migration/E2E checks; these tests verify the repository's query contract and mapping without a database container.
  - Checks: Focused Vitest coverage (6 tests; 100% statements, functions, and lines; remaining decorator-only branch instrumentation), backend `npm test` (384 passed), lint, build, and `git diff --check`.
  - Follow-up: Existing uncommitted authentication migration work was preserved; no files were staged, committed, or pushed.

- **Reorganize backend authentication source** (GPT-5): Grouped local login, session, repository, controller, configuration, middleware, and their unit tests under `src/auth/authentication`, while retaining the module, shared models, and RBAC authorization boundary at their existing feature-level locations.
  - Scope: `services/backend/src/auth`, `services/backend/src/app.module.ts`, `AI_USAGE.md`
  - Assumptions: The requested reorganization applies to the local-session implementation shown and should preserve every public endpoint and provider name.
  - Checks: Backend authentication unit tests (75 passed), build, lint, and `git diff --check`.
  - Follow-up: Existing uncommitted authentication and Firebase-removal work was preserved; no files were staged, committed, or pushed.

- **Add PostgreSQL local-login foundation** (GPT-5): Replaced the incorrect untracked user SQL with ordered user/session schema and seeded local role accounts; added parallel cookie-based PostgreSQL login endpoints while preserving Firebase authentication.
  - Scope: `development/database`, `development/local-dev`, `services/backend`, `AI_USAGE.md`
  - Assumptions: Firebase remains active until a later frontend/API cutover; documented `.test` credentials are development-only; local HTTP uses non-secure cookies.
  - Checks: Backend unit tests (401 passed), build, lint, `git diff --check`, and Docker Compose configuration validation.
  - Follow-up: The confirmed untracked `001_user.sql` was replaced and renamed to `001_users.sql`; Docker was unavailable before implementation, so live database verification remains pending.

- **Verify My Drafts frontend changes and close test gaps** (GPT-5) — SPM-37 / current `fix/SPM-37-Update-Draft-request-workflow` working tree: Reviewed the latest My Requests-to-My Drafts rename and submitted-request filtering. Removed unreachable submitted-row rendering branches, added regressions for the organiser navigation label and submitted-only draft empty state, and expanded form coverage for registration selection and accumulated attachment uploads.
  - Scope: `apps/frontend/src/components/layout/`, `apps/frontend/src/pages/`, `AI_USAGE.md`
  - Assumptions: Submitted requests are intentionally surfaced only under My Events; `/requests` may still return submitted records and the frontend must filter them defensively.
  - Checks: `npm run test:cov:spm37` (174/174, 100% statements/branches/functions/lines for configured files); `npm test` (174/174); `npm run build` passed; targeted ESLint for all changed frontend files passed; `git diff --check` passed. Full `npm run lint` remains blocked by pre-existing unused variables in `ClarificationThread.tsx:157` and `EventDetailPage.clarifications.test.tsx:8`.
  - Follow-up: Preserved the latest Claude Code changes and added coverage around them. No commit, push, pull request, Jira transition, or runtime/database mutation performed.

- **Rebase SPM-37 fix branch onto dev** (GPT-6) — SPM-37; user requested branch maintenance.: Rebased fix/SPM-37-Update-Draft-request-workflow from e7a73c6 onto latest origin/dev 90e8a60; resulting HEAD 1f0e67e. Preserved original history at backup/SPM-37-fix-before-rebase-20260921. Initial working tree was clean.
  - Conflict resolution: Applied root AGENTS.md dev-wins rule to entire conflicted files: frontend EventListPage.tsx, DraftWorkflow.test.tsx, EventCreatePage.tsx, EventCreatePage.test.tsx, EventDetailPage.tsx, EventListPage.test.tsx; backend README.md, src/app.module.ts, and events drafts.e2e-spec.ts, drafts.service.spec.ts, drafts.service.ts, events.controller.ts, events.service.spec.ts, events.service.ts. Nonconflicting patches replayed normally. No scripts or dependency manifests/lockfiles were lost or changed relative to the backup.
  - Checks: Rebase completed, origin/dev is an ancestor, no unresolved index entries, git diff --check passed. Backend unit tests: 385 passed, 1 failed (draft controller/service contract mismatch). Frontend: 151 passed, 11 failed across DraftWorkflow, EventDetailPage and registration suites, plus comments.filter runtime error in a test. Browser/database/build checks not run.
  - Follow-up: Rebase is complete but the combined branch is not merge-ready. Dev conflict replacements remove branch-specific authorization/registration behavior while some nonconflicting callers/tests still expect it; reconcile in follow-up implementation work. User subsequently authorized committing this entry and syncing the remote fix branch. Verified remote still equals the pre-rebase backup e7a73c6; publish using an explicit force-with-lease to preserve any concurrent remote updates.

- **Attempt local container startup** (GPT-6)
  - Context: SPM-37 branch; user requested all local stack containers start.
  - Areas: Docker Desktop runtime; AI_USAGE.md. Read development guidance and local Compose configuration.
  - Checks/result: docker desktop start attempted; docker compose up -d --build could not connect to the Linux engine. Docker host log reports backend startup crash while opening/renaming sailor-ingest.sock (file cannot be accessed by the system). Frontend, backend and PostgreSQL startup could not proceed.
  - Follow-up: Repair/restart Docker Desktop before retrying Compose. No containers, volumes or database data removed; no source edits, commit or push. Ledger left unstaged.

- **Diagnose Docker failure** (GPT-6)
  - Context: User requested runtime diagnosis; no issue supplied. Areas changed: AI_USAGE.md only.
  - Findings: Docker Desktop failed at 14:12 SGT because Windows could not access/rename sailor-ingest.sock; its log records successful socket listening at 14:21. Engine now responds; frontend, backend and PostgreSQL healthy, frontend HTTP 200 and backend health status ok. Old gateway container remains exited with a file/directory bind-mount mismatch for gateway/nginx.conf. Existing containers reference former compose.yaml; current checkout uses docker-compose.yml.
  - Checks: docker version, compose ls, container status/state, Docker host logs, HTTP readiness and current Compose service names. No application tests needed for diagnosis.
  - Follow-up/conflicts: Preserved existing ledger changes; no runtime or source changes, deletions, commit or push. Old gateway failure is separate from recovered Docker Desktop startup failure.

- **Restore manual coordinator assignment** (GPT-6): Reverted the store's automatic coordinator assignment and assignment notifications to the implementation before 05da9db. Current page already contains Assign Myself as Coordinator and no access-restricted popup. Added submission/unassigned and explicit-click regression coverage; corrected the assigned-coordinator test's comment API mock.
  - Context: User requested the pre-auto-assignment workflow on the existing SPM-37 fix branch; no new Jira key or acceptance criteria supplied. Reused existing branch work. GitHub PR lookup failed because gh could not resolve the configured repository.
  - Areas: frontend store, EventDetailPage tests, frontend README, AI_USAGE.md.
  - Checks: Two focused regression tests passed; targeted ESLint and production build passed. Full detail suite has four existing rebase-related failures (popup expectation, missing Change Requests control, venue/technical access expectations). Playwright on localhost:5173 at 1440x1000 verified Unassigned -> Assign Myself as Coordinator -> Review Event, with mocked API/auth state, no page errors or Vite overlay, and before/after screenshots outside the repo. Browser plugin unavailable; used installed Playwright. Served store confirmed free of automatic assignment.
  - Limits/follow-up: Preserved earlier browser-memory-only assignment behavior; database persistence and real authenticated API flow were not implemented or verified. Existing runtime/backend state untouched. Prior ledger edits preserved. Changes staged for human review; no commit or push.

- **Remove event approval/rejection outside SPM-37** (GPT-6) — SPM-37; fetched full story, all seven AC, comments (none), Medium priority and In Progress status. User explicitly requested removing approval/rejection and limiting fixes to draft-story scope.: Removed Review Event entrypoint, decision modal/state/handler, and the reviewEvent store action that changed status and sent approval/rejection notifications. Git history traces the UI to 3f46e16 Frontend Skeleton. Preserved the separately requested manual assignment and unrelated existing features.
  - Areas: frontend EventDetailPage, store, page regression tests, README, AI_USAGE.md; reused existing fix branch and staged work. Earlier GitHub PR lookup remains unavailable.
  - Checks: Three focused tests passed (submission stays unassigned, explicit manual assignment, no approval/rejection controls for assigned coordinator); production build passed. Playwright at localhost:5173 (1440x1000, mocked auth/API) verified manual assignment with no review/decision controls, page errors or framework overlay. Served source matches. ESLint reports two pre-existing unused constants in EventDetailPage (AVAILABLE_FACILITIES and AVAILABLE_ACCESSIBILITY); left unchanged. Earlier unrelated page-suite failures remain; no full-story pass claimed.
  - AC review: All seven SPM-37 criteria concern draft save/status/reopen/update/persistence/feedback/submitted-edit restrictions; approval/rejection is outside that scope. This removal does not change draft APIs or forms. Real authenticated backend flow and full AC regression were not rerun for this removal.
  - Follow-up/conflicts: Changes staged without commit/push. Previous staged changes preserved. Supersedes the prior check that expected Review Event after manual assignment; that action is intentionally absent now.
  - Lint follow-up: At the user's request, removed the two unused EventDetailPage constants. ESLint now passes for EventDetailPage.tsx, EventDetailPage.test.tsx and useAppStore.ts. No behavior change; no additional tests required. Staged without commit or push.

- **Diagnose comments error after manual assignment** (GPT-6)
  - Context: User reported Cannot GET /api/events/:id/comments after assignment; scope remains SPM-37.
  - Findings: Assignment changes frontend state and triggers the existing SPM-39 comment fetch. Current source registers ClarificationsModule and GET events/:id/comments, but the running backend image has no compiled clarification module and startup logs show no comments route. Frontend/backend runtime versions are mismatched.
  - Checks: Read controller/module wiring and frontend effect; inspected compiled module existence and backend route logs without printing credentials. No code or runtime changes; prior mocked browser test did not validate live route availability.
  - Follow-up: Align backend runtime with reviewed source before live clarification testing. Current rebased backend has previously documented authentication/contract differences, so blindly rebuilding it is broader than this SPM-37 diagnosis. Ledger staged; no commit/push.

- **Implement SPM-83 rejection workflow** (GPT-6) — SPM-83; Reject a request, In Progress, Medium, no comments. All seven Jira AC match the supplied story. Reused feature/SPM-83-reject-a-request; GitHub PR search returned none.: Default coordinator pending view to Submitted; require a trimmed 1–2000 character reason; block blank confirmation; persist Rejected/reason and recipient notification atomically with row locking. Return only successful server state to the UI; organiser sees the notification and recorded reason and can persist read state. Existing event, draft, and coordinator-assignment behavior remains unchanged.
  - Areas: frontend request list/detail/store and rejection notifications panel; isolated backend rejection/notification controller and service methods; backend migration and local database initialization; component documentation.
  - AC review: 1 Submitted default filter; 2 detail rejection dialog; 3/4 required field plus UI/store/server blank validation; 5 persisted status/reason; 6 recipient-scoped persistent in-app notification and detail reason; 7 rejected records excluded from Submitted list. Under_Review is intentionally outside this story's rejection eligibility.
  - Checks: Frontend/backend production builds and targeted source lint passed. Independent temporary PostgreSQL verification in a uniquely named schema passed repeatable migration, role isolation, required reason, concurrent decision (one success/one 409), exactly one persisted notification, recipient read-state persistence and complete rollback on notification insertion failure. Verification schema removed; shared records preserved. Playwright with fictional API/auth state verified pending list, blank/whitespace blocking, successful rejection/reason, pending-list removal, organiser notification and its detail link; visually inspected organiser screenshot outside repository. git diff --check passed.
  - User constraint: Existing testing code was not read, edited, used as implementation guidance, or executed; user-owned untracked files remain untouched and unstaged. Verification used production builds and temporary independent runtime checks, not the existing unit suites.
  - Limits/follow-up: Browser API/auth were mocked; real Firebase cross-account flow not executed. Shared backend container was not redeployed and shared database migration was not applied. Apply migrations/003_event_rejection.sql after clarification schema before using the updated backend. Existing local demo ownership is preserved. In-app delivery only, no email. Changes staged for human review; no commit, push, PR, or Jira status change.
  - Workspace recovery: During final handoff, an external operation stashed SPM-83 and switched the shared checkout. Restored the implementation and the user's three untracked test files unchanged, then moved `feature/SPM-83-reject-a-request` into the shared workspace. The test files remain unstaged and were not read.

## 2026-09-21 - Claude

- **SPM-38 coordinator review access, round-robin assignment, and tests** (Sonnet 5) — SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet): Implemented SPM-38 ("Review a submitted request details") ACs 1-5, with AC4's "unless I have admin privileges" clause dropped per explicit instruction (no admin role exists in this system). Wired real Firebase-authenticated identity (`AuthenticatedUser`) through `EventsController`/`DraftsController` into `EventsService`/`DraftsService` (previously events/drafts ran on a single hardcoded demo identity gated by `DEMO_ORGANISER_ENABLED`, per `services/backend/AGENTS.md`'s events-boundary policy). `EventsService.list`/`get` now scope strictly by the caller's verified UID and role: an organiser sees their own requests, a coordinator sees only requests assigned to them, and a coordinator the event isn't assigned to gets the same `NotFoundException` as a bad ID (AC4, never leaking existence). Added stateless round-robin auto-assignment (`coordinator-roster.ts`, a small hardcoded roster of the two given real Firebase coordinator accounts, since no coordinator directory exists in Postgres) that assigns a coordinator at submission time and advances status to `Under_Review` (AC5); an event that already has a coordinator is never reassigned. Removed the now-obsolete "Assign Myself as Coordinator" manual-claim UI from `EventDetailPage.tsx` since every submitted request is auto-assigned. Also fixed a real AC3 bug found via manual verification: the "View" attachment action used `<a href="data:...">` with `target="_blank"`, which Chrome/Firefox silently block for top-level navigation (a phishing-hardening measure) — the file appeared to do nothing when clicked. Fixed by converting the attachment to a Blob object URL (`openAttachmentPreview` in `EventDetailPage.tsx`) before opening it.
  - Scope: `services/backend/src/app.module.ts`, `services/backend/src/events/` (events/drafts controllers, services, specs, new `coordinator-roster.ts` + spec), `services/backend/test/events-assign.e2e-spec.ts`, `apps/frontend/src/pages/EventDetailPage.tsx`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/pages/EventListPage.tsx`, `AI_USAGE.md`
  - Assumptions: The two supplied accounts (`coordinator@connectsphere.sg`, `coor_tech@connectsphere.sg`) are the complete coordinator roster for now; their real Firebase UIDs are hardcoded in `coordinator-roster.ts` (non-secret identifiers, not credentials). `POST /api/events/:id/assign` (manual override, kept for reassignment edge cases) now also requires a valid Firebase Bearer token as an incidental consequence of wiring auth onto all of `EventsController`'s routes, but does not itself check the caller's role — flagging as a possible follow-up if manual reassignment should be restricted further.
  - Checks: `npm test` in `services/backend` — 407/407 passed (15 suites, includes 3 new/rewritten spec files). `npm test` in `apps/frontend` — 175/175 passed (17 suites). `npx eslint`/`oxlint` clean on all changed files. `npx tsc --noEmit` in `services/backend` clean aside from pre-existing, unrelated errors (`supertest/types` resolution in `.e2e-spec.ts` files, `vitest.spm37.config.ts`'s `./vitest.config` import). `npx tsc -b` in `apps/frontend` blocked by a pre-existing, unrelated `tsconfig.json` `ignoreDeprecations: "6.0"` vs installed TypeScript 5.9.3 mismatch (no diff on `tsconfig.json`; not introduced by this work). `services/backend/test/events-assign.e2e-spec.ts` was updated to override `FirebaseTokenService` with a fixed token->identity map (no live Firebase Auth Emulator available in this session) and to add an Authorization header to `/assign` calls (now also auth-gated), but could **not** be executed here: this machine has a native Postgres process already bound to `127.0.0.1:5432`/`[::1]:5432`, which intercepts connections meant for the Docker Postgres container (`role "spm" does not exist`). Needs `npm run test:e2e` verification in an environment without that port conflict.
  - Follow-up: The 2026-09-20 entry below (Gemini 3.8 / Claude Sonnet 4.6, branch `fix_request_view_logic`) describes coordinator auto-assignment and per-coordinator access-restriction work that was **not present** in this branch's `events.service.ts` before this session (it had no role-based scoping, no roster, no round-robin) — that other branch's work does not appear to have been merged into `dev`/this feature branch. Treat this session's implementation as the first working version of AC4/AC5 here, and reconcile with `fix_request_view_logic` if/when it merges. Created Confluence documentation under the existing "Review Submitted Event Request Details" folder (space SP, folder id 11207103), mirroring the SPM-36 format: repurposed the empty placeholder live_doc into "Review Submitted Event Request Details Matrix" (page id 12353538) and created five new test case pages — EVE-REV-01 (id 12550145, AC1), EVE-REV-02 (id 12353557, AC2), EVE-REV-03 (id 12386307, AC3, two sub-cases including the View-bug fix), EVE-REV-04 (id 12353573, AC4, six sub-cases across backend/frontend/e2e), EVE-REV-05 (id 12550161, AC5, five sub-cases). Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-20 - Gemini and Claude

- **Role-based request & event access control, coordinator boundaries, and venue/tech support role separation** (3.8 / Claude Sonnet 4.6) — SPM-37 / fix_request_view_logic: Implemented complete role-based request and event viewing logic across backend and frontend: 1. **Event Organiser & Multi-Role Users (e.g. `org_venue`)**: Full save draft and submission workflow enabled. After submission, events immediately appear under "My Events" (`/events`). Pre-submission drafts are directly editable. Post-submission direct editing is strictly restricted to `name` and `description` ("Save Name/Description Only"); date/time, attendance, venue, and equipment changes must go through coordinator Change Requests. Fixed SQL syntax error in `EventsService.insert` and enhanced `EventsService.list` and `get` to use capability-based `identity.roles.includes(...)` rather than assuming a single primary role. 2. **Event Coordinator**: The ONLY role with access to the "All Events" oversight page (`/events`) and initial submitted requests (`submitted`, `under_review`) from event organisers. Unassigned events are automatically assigned by the system to an available coordinator (manual self-assignment removed). Assigned coordinator has full operational authority (`Review Event`, `Change Requests`, `Search Venues`). Non-assigned coordinators opening an event receive an immediate pop-up error modal: `"This event has not been assigned to you."` with `[Back to Events]`. 3. **Venue Staff & Technical Support**: Strictly restricted from the "All Events" page (`/events` or `/`). Venue staff are routed to Venue Catalogue (`/venues`), and Technical Support staff are routed to Equipment Requests (`/equipment/requests`). Route guards (`RootRedirect`, `RequireRole`, and page-level guards) ensure they cannot view or browse raw submitted requests from organisers. Only the assigned coordinator submits formal venue booking requests to Venue Staff and equipment/tech support requests to Technical Support Staff. 4. **Attendee**: Strictly blocked from unconfirmed requests. Views confirmed events on `/events`. If `registrationEnabled === true` and the attendee has not signed up, prompted to *"Please sign up through the website first to attend this event."* with the `Register` button. If `registrationEnabled === false`, explicitly displays *"Registration through the website is not enabled for this event."* and suppresses registration actions. 5. **"Register through website"**: Checkbox on Step 0 of `EventCreatePage`, validated in backend `event-input.ts`, and persisted in the PostgreSQL `registration_enabled` column.
  - Scope: `services/backend/src/events/`, `services/backend/migrations/`, `development/database/postgresql/init/`, `apps/frontend/src/`, `AI_USAGE.md`
  - Assumptions: Firebase auth middleware attaches `request.currentUser`. Non-organisers cannot access draft endpoints (403 Forbidden). Venue staff and tech support do not have access to the All Events overview.
  - Checks:  - Backend unit tests (`npm test` in `services/backend`): 364/364 passed across all 12 test suites. - Backend production build (`npm run build` in `services/backend`): completed successfully with zero errors. - Docker Compose backend rebuild and frontend restart: running healthy. - Frontend production build (`npm run build` in `apps/frontend`): `tsc -b && vite build` completed cleanly with zero errors. - Frontend unit tests (`npx vitest run` in `apps/frontend`): 158/158 passed across all 13 test suites.
  - Follow-up: None. Staged for human review. No commit or push performed per AGENTS.md Rule 11.

## 2026-09-20 - Codex

- **Diagnose blank frontend and login setup** (GPT-6) — None supplied; runtime diagnosis requested by user.
  - Scope: AI_USAGE.md only; inspected frontend, backend and local Compose runtime.
  - Findings: Chromium reproduced an empty page and Firebase auth/invalid-api-key during module initialization. All six VITE_FIREBASE configuration values are empty in the frontend container; local development/local-dev/.env has no matching Firebase entries. Backend FIREBASE_SERVICE_ACCOUNT_JSON is also empty. Required team Firebase configuration must be supplied locally before real sign-in can be verified.
  - Checks: Compose frontend/backend/PostgreSQL healthy; backend /healthz returned status ok; frontend source HTTP 200; Playwright captured missing-config warning and uncaught Firebase error. In-app browser timed out, so used installed Playwright for diagnosis. No application tests rerun because no implementation changed.
  - Follow-up/conflicts: Existing services and data preserved; no credentials printed, configuration invented, commits or pushes. Await team local Firebase configuration, then recreate frontend/backend and verify sign-in.
  - Runtime follow-up: User supplied Firebase values and requested stack restart. Recreated Compose services preserving volumes. Browser now renders /login without page errors. Corrected local untracked .env PORT and VITE_API_BASE_URL from 8080 to Compose's published 3000; restarted services. Real account sign-in remains untested.

- **Remove My Requests creation link** (GPT-6) — No new Jira key supplied; user requested a small follow-up to the existing My Requests UI on the current feature branch.: Removed the + Create event request link above the request list. Existing request links and creation routes remain available.
  - Areas: apps/frontend/src/pages/MyRequestsPage.tsx, frontend README, AI_USAGE.md.
  - Checks: EventCreatePage and DraftWorkflow component suites passed (59 tests); git diff --check passed. Signed-in browser view not re-tested.
  - Follow-up/conflicts: Preserved earlier runtime ledger entries; staged for human review, no commit or push.
  - Runtime verification follow-up: Vite was serving stale transformed MyRequestsPage code despite the updated bind-mounted source. Restarted only the frontend container; HTTP verification now confirms the served module retains My Requests and no longer contains the removed creation link. Database and backend left untouched.
  - Label follow-up: Renamed My Requests to My drafts in page heading, navigation, form links/help, related tests and frontend README. Kept existing list behavior and routes. Both affected suites passed (59 tests); restarted frontend and verified served heading/navigation contain My drafts; whitespace check passed. Staged without commit.
  - Submission visibility follow-up: My drafts now filters the requests response to Draft status only, with updated description/loading/empty-state wording. Existing submission creates an event and My Events loads /events; its submitted-event test passes. Updated mixed-status regression and added submitted-only empty-state test. Three frontend suites passed (62 tests); whitespace check passed; restarted frontend and verified served filter. API records retained; no backend changes, commit or push.
  - Missing submitted events follow-up: Backend /api/events returns two persisted submitted events under its local demo organiser. My Events incorrectly filtered this organiser ID against the Firebase UID. Removed redundant client organiser filtering, relying on existing backend organiser scoping; documented local identity limitation. Added Firebase-UID mismatch/reload regression. All three affected suites passed (63 tests); whitespace check passed; restarted frontend and confirmed old filter absent from served module. No data changes or backend authentication changes; signed-in browser verification remains with user.

- **Expand Confluence draft test procedures** (GPT-6) — SPM-37 (In Progress; seven acceptance criteria reviewed).: With explicit user authorization, updated 26 cases with 209 numbered steps covering setup, concrete inputs, browser/API/database actions and verification. Added execution-context and AC guidance; clarified normalized draft defaults, retry identifiers and attachment size checks. Preserved test IDs, authorship, automation references and execution-result fields.
  - Areas: Confluence Event Request Creation folder [private Atlassian URL omitted] EVE-DRF-01 through EVE-DRF-11; AI_USAGE.md only locally on the existing SPM-37 branch.
  - Checks: Compared against Jira AC, reference EVE-CRE pages and relevant local implementation/tests; validated HTML and read back all 11 published pages. Content matches authored HTML after normalizing generated local IDs and apostrophe encoding; execution fields unchanged.
  - Assumptions/follow-up: Procedures are authored, not executed; no application tests rerun or pass results claimed. Supporting security/boundary checks distinguished from the seven core AC. No code changes, Jira transitions, commit or push. Existing source work preserved; ledger staged for review.

- **Audit Confluence pre-conditions against dev** (GPT-6)
  - Issue/context: SPM-37; user requested assessment of all 11 EVE-DRF pages against Event Management cases and dev code.
  - Areas: AI_USAGE.md only; read all 26 draft-case pre-conditions and all eight EVE-CRE pages. Fetched origin/dev at 8179b93c7ad3193c949ddfb5cb65f885f883049c without switching or changing source files.
  - Findings: Specify test layer, branch/commit, mocks versus live services, dedicated PostgreSQL/schema setup, fixture state, failure injection and boundary files. Dev still uses DEMO_ORGANISER_ENABLED/current-user for event/draft APIs; Firebase middleware applies only to AuthController. EVE-DRF-08 and 09-B require newer authentication integration. Dev My Requests includes Submitted records, unlike EVE-DRF-03. Sixth-file error is Use up to five files.; combined-size error includes 50 MB total.
  - Checks: Read dev controllers, services, app bootstrap, frontend form/list/API code and test harnesses. No tests executed and no Confluence changes in this audit. Prior procedure rewrite used local feature-branch code; branch mismatch now explicitly reported. Existing staged ledger retained.
  - Branch-reference correction: User specified fix/SPM-37-Update-Draft-request-workflow instead of dev. Fetched and checked remote commit 4fda7e3f2efa07531b07c648c66c0679fe3334a2 (same source tree as local HEAD). Draft/event Firebase middleware, ORGANISER authorization, per-user ownership and My drafts filtering are present, so the dev-specific mismatches for EVE-DRF-03/08/09-B do not apply to this target. Keep recommendations for explicit test layer, authentication fixtures, database/schema setup, failure injection and fixture state. Integration token verification is stubbed; DEMO_ORGANISER_ENABLED is not an authentication prerequisite despite a leftover harness assignment. File-count error wording still differs from the current Confluence procedure. Assessment only; no Confluence changes or tests executed.

- **Update Confluence pre-conditions from SPM-37 fix branch** (GPT-6) — SPM-37. User explicitly requested updates using fix/SPM-37-Update-Draft-request-workflow, commit 4fda7e3f2efa07531b07c648c66c0679fe3334a2.: Replaced pre-conditions for all 26 cases with numbered branch-specific setup covering live browser versus mocked component tests, PostgreSQL/schema setup, stubbed token identities, initial fixture state, failure injection and validation helpers. Every case records the branch/commit baseline. Clarified owner-isolation read-back identity; corrected the attachment-count error wording in two procedure steps for consistency with the branch.
  - Areas: EVE-DRF-01 through EVE-DRF-11 in Confluence folder 10321973; AI_USAGE.md locally.
  - Checks: Inspected fix-branch authentication, draft integration tests, frontend test harnesses, validator and browser spec. Published all 11 pages and read each back to compare with intended HTML. Existing result fields and test IDs preserved; no tests executed or results claimed.
  - Follow-up/conflicts: Existing staged ledger entries retained. No application source changes, Jira transitions, commit or push. Ledger staged for human review.

## 2026-09-19 - Codex

- **Review SPM-37 commit message accuracy** (GPT-6) — SPM-37 (live status In Progress; current description has seven acceptance criteria).: Commit-message feature claims match the inspected implementation. Recommend replacing "complete" test suites with named test types and scoping 100% coverage to the eight configured source files. My Requests currently uses shared demo identity. Saved wizard-step resume is also implemented.
  - Scope: `AI_USAGE.md` only; reviewed staged frontend/backend draft implementation, tests, coverage configuration, migration and test-specification presence.
  - Checks: `npm run test:cov:spm37` in frontend (68 tests passed) and backend (260 tests passed); generated summaries confirm 100% statements, branches, functions and lines for all eight included files. Inspected integration and Playwright tests but did not rerun them. Confirmed staged test-case PDF exists.
  - Follow-up: Existing staged changes preserved; review entry left unstaged. No implementation changes, commits or pushes. Earlier ledger/test comments referring to eight AC and deferred AC7 reflect older Jira wording; current AC7 is submission lockout.

- **Inspect SPM-37 merge conflicts for user decisions** (GPT-6) — SPM-37; fetched current seven AC and In Progress status.: Current merge joins local HEAD 75e03df (rebuild feature commit 61bab0d) with older remote dfc7e64 (original feature 69c5986). Found 18 unresolved files and four original conflicts already staged as resolved. Prepared per-file old-remote versus new-local comparisons for the user's choices.
  - Scope: `AI_USAGE.md` only. Inspected merge metadata, index stages and frontend/backend conflicts.
  - Checks: Git status, divergent history, merge message, index-stage contents and diffs. No tests run because merge remains unresolved. Working Playwright config is empty; App routes are partially resolved; staged older implementation additions require consistency review after choices.
  - Assumptions/follow-up: User explicitly reserves resolution choices. No conflicts resolved, files staged, commits or pushes by this review. Existing partial resolutions preserved. This is a remote feature merge, not a dev merge; the dev-wins rule does not select a side here.

- **Resolve and validate SPM-37 feature merge** (GPT-6) — SPM-37; In Progress, current seven acceptance criteria rechecked against the implementation and tests.
  - Authorization: User directed use of the newer local implementation, correction of issues, and push to the SPM-37 feature branch.
  - Areas: frontend/backend merge resolution, component tooling/docs, local gateway, existing root guidance and ledger. Retained HEAD 75e03df/feature commit 61bab0d for application behavior, routes, draft API, migration and Playwright configuration. Removed only incoming older implementation additions; retained the user's recent frontend Node types dependency, merged historical ledger, root guidance and ignore rules.
  - Backup: Pre-resolution changed files and index copied to C:/Users/kirub/AppData/Local/Temp/SPM37-merge-backup-20260919-005932. Removed incoming scripts migrate.mjs and browser-fixture.mjs belong to the superseded event-requests implementation; migrate-drafts.mjs and run-browser.mjs remain. No application database reset or migration of old draft data was performed.
  - Issues fixed: TypeScript frontend aliases no longer use deprecated baseUrl; ESLint 10 flat configuration; Tailwind pinned to 3.4.19 for the existing theme/PostCSS setup; backend TypeScript pinned to 6.0.3 because Nest cannot use TypeScript 7.0 compiler API. Corrected stale AC7/Save Draft and nonexistent integration-test documentation. Gateway body limit now matches backend 8 MB attachments.
  - Checks: frontend 68 tests and backend 260 tests passed with all eight configured files at 100% coverage; backend rerun after npm ci with locked Vitest 5 passed. API/PostgreSQL integration 13 passed, including rerun with locked backend dependencies. Real Chromium save/reopen/refresh/retry/submit/lock flow passed after restarting Vite with compatible Tailwind. Frontend and backend production builds passed after toolchain fixes. Backend lint passed; frontend lint exits successfully with three existing API-loader state-reset warnings (retained as warnings in flat config). Both dependency lockfile dry-run checks passed; Compose config and git whitespace checks passed; no unmerged index entries remain.
  - Limits: Node 24.14 locally emits engine warnings; docs require Node 24.15+ for current packages. Docker daemon unavailable, so gateway was inspected but not exercised in Docker. Reused persistent embedded PostgreSQL; spm_test suites clean only their own records. Temporary browser servers stopped after checks; PostgreSQL left running with data preserved.
  - Handoff: Complete the existing merge with both parents and push normally, preserving remote history. Git transport can access origin; gh and GitHub connector cannot read PR metadata, so do not create a duplicate PR. No Jira status changes or PR merge requested.

- **Check earlier SPM-37 review comments** (GPT-6) — SPM-37; reviewed user-provided screenshots against local and remote commit 947972b.
  - Scope: `AI_USAGE.md` only; no implementation changes or review replies.
  - Findings: Requested unit-test discovery revert is not applied (`src/**/*.spec.ts` remains). Original event-requests service was removed, but explicit @Inject remains in replacement draft service/controller; reviewer clarification is still needed. Old migrate.mjs and browser-fixture.mjs were replaced, but no evidence establishes compliance with the reviewer's unspecified migration schedule/destination.
  - Checks: Current files, tracked script inventory, clean initial status and remote branch hash. Tests not rerun for this read-only comparison.
  - Follow-up: Outdated review locations do not prove the underlying comments are resolved. Ledger entry left unstaged; no commit or push.

## 2026-09-19 - Claude

- **SPM-37 coverage to 100% and test-case documentation** (Opus 4.8) — SPM-37 (In Progress; seven acceptance criteria; same staged rebuild as the prior Codex/Claude entries above).: Brought the SPM-37 modules to 100% per-file coverage. Refactored `EventsService.create()` into two explicit paths - a shared-transaction `insert()` reused by draft submission, and an owned BEGIN/COMMIT/ROLLBACK/release path for direct creation - removing a v8 branch-coverage artifact on the previous repeated `if (!transaction)` guards; runtime behaviour is unchanged. Raised `testTimeout`/`hookTimeout` in the frontend SPM-37 coverage config so component tests do not flake under slower coverage instrumentation. Produced the test-case specification PDF and authored the SPM-37 Confluence test cases (EVE-DRF-01..07) in the team's matrix + detail-page format (authored, not yet published to Confluence).
  - Scope: `services/backend/src/events/events.service.ts`, `apps/frontend/vitest.spm37.config.ts`, `docs/test-cases/SPM-37_Test-Cases.pdf`, this file.
  - Assumptions: The staged local `events/drafts` rebuild is the intended SPM-37 implementation and supersedes the different `event-requests` implementation on the remote branch (`dfc7e64`); replacing the remote requires a `force-with-lease` push and the user's explicit confirmation.
  - Checks: `npm run test:cov:spm37` - backend 260/260 and frontend 68/68, 100% statements/branches/functions/lines for the eight configured source files; backend API/database integration 13/13 against a scratch `spm_test` PostgreSQL; real-browser Playwright `Q2-021` passed headed. Backend `nest build` (Node 24) and oxlint passed.
  - Follow-up: No commit or push made this session (user commits manually). Remote `origin/feature/SPM-37-save-event-request-as-a-draft` still holds the older `event-requests`-module implementation; the local rebuild replaces it. `tmp/` holds session scratch (Codex handoff + PDF renders) and must not be committed. Current AC7 is the submitted-draft lockout (older eight-AC / org-isolation wording is superseded).

- **Address SPM-37 pull-request review feedback** (Opus 4.8) — SPM-37 (open PR on the feature branch; reviewer JacobSoh).: Reverted the backend Vitest `include` glob from `src/**/*.spec.ts` back to `**/*.spec.ts` as requested in review. Reviewed the other flagged comments against the current rebuild: the `@Inject` question and the `migrate.mjs`/`browser-fixture.mjs` comments were on the superseded `event-requests` implementation (now removed). The `@Inject(Class)` pattern carried into `drafts.controller.ts`/`drafts.service.ts` is technically redundant (`emitDecoratorMetadata` is enabled), but removing it drops v8 branch coverage on the emitted decorator metadata below the enforced 100% per-file gate, so it was deliberately kept and will be answered in the PR rather than changed.
  - Scope: `services/backend/vitest.config.ts`, `AI_USAGE.md`.
  - Assumptions: The reviewer's `**/*.spec.ts` request applies to the merged rebuild; all backend specs live under `src/`, so the broader glob matches the same files.
  - Checks: Backend `npm test` 260/260; `npm run test:cov:spm37` 100% statements/branches/functions/lines for the eight configured files; `npm run lint` and `nest build` (Node 24) passed.
  - Follow-up: `@Inject` questions to be answered in the PR (redundant but retained to preserve the 100% coverage gate). `migrate.mjs`/`browser-fixture.mjs` review comments are moot - those files were replaced by `migrate-drafts.mjs` and `scripts/testing/run-browser.mjs`.

- **Remove redundant @Inject in draft service/controller** (Opus 4.8) — SPM-37 (open PR; reviewer JacobSoh asked why `@Inject` was used).: Removed the redundant `@Inject(EventsService)` / `@Inject(DraftsService)` decorators (Nest resolves these by type since `emitDecoratorMetadata` is enabled), per review. This reverses the earlier "retain @Inject" decision. Removing the decorators exposed an unreachable branch in TypeScript's emitted `design:paramtypes` guard (`typeof X === "undefined" ? Object : X`) that v8 counted as half-covered; wrapped only the class-declaration line in a scoped `/* v8 ignore start/stop */` (method bodies still fully counted) so per-file coverage stays a genuine 100%.
  - Scope: `services/backend/src/events/drafts.service.ts`, `services/backend/src/events/drafts.controller.ts`, `AI_USAGE.md`.
  - Assumptions: `@Inject(Class)` was purely redundant here; the excluded branch is compiler-generated and unreachable, so ignoring it does not hide any real code path. `events.controller.ts` (SPM-36 scope) still uses `@Inject` and was left unchanged.
  - Checks: Backend `npm test` 260/260; `npm run test:cov:spm37` 100% statements/branches/functions/lines for the eight configured files; `npm run lint` and `nest build` (Node 24) passed.
  - Follow-up: Supersedes the earlier ledger note that retained `@Inject` to preserve the coverage gate. No behavioural change; DI resolves identically by type.

## 2026-09-16 - Codex

- **Restore SPM-30 frontend authentication integration** (GPT-5) — SPM-30 / PR #15: Restored the SPM-30 Firebase-derived user model after the manual merge combined it with mock-role code. Removed mock role switching and the unsupported admin role, restored the signed-out placeholder user, forwarded Firebase ID tokens from API calls, and repaired test discovery, build, and lint configuration.
  - Scope: `apps/frontend`, `AI_USAGE.md`
  - Assumptions: The backend event API remains responsible for verifying the forwarded token and enforcing resource authorization; it is not changed by this frontend-only update.
  - Checks: `npm ci --dry-run`, `npm run test:coverage` (86 tests passed), `npm run build`, and `npm run lint` in `apps/frontend`.
  - Follow-up: No files were staged, committed, or pushed. Server-side Firebase enforcement for `/api/events` remains outstanding.

- **Reconcile merged documentation with implementation** (GPT-5) — SPM-30 / PR #15: Reviewed the staged manual merge against the current implementation and corrected documentation that combined real Firebase authentication with the separate demo-only event API. Repaired stale test-path and CI statements, and restored malformed ledger headings.
  - Scope: repository Markdown documentation and `AI_USAGE.md`
  - Assumptions: This change documents current behavior and known limitations; it does not repair the frontend or server-side authorization defects identified in the review.
  - Checks: Markdown conflict-marker scan, `git diff --check`, Docker Compose configuration validation, frontend/backend package-lock validation, frontend/backend tests, builds, and lint checks.
  - Follow-up: Frontend compilation, lint, and test failures remain unresolved. The event API must be integrated with Firebase identity and RBAC before it can satisfy end-to-end authorization requirements.

- **Configure Firebase defaults for frontend tests** (GPT-5) — SPM-30 / PR #15: Added inert Firebase Web SDK environment values to the global Vitest setup so store imports cannot initialize Firebase Auth with an empty CI API key.
  - Scope: `apps/frontend/src/test`, `AI_USAGE.md`
  - Assumptions: Tests mock Firebase network operations; the test-only configuration is never used by the browser build or local Compose runtime.
  - Checks: `npm run test:coverage` in `apps/frontend` (72 tests passed); `git diff --check`.
  - Follow-up: Existing PR #15 is currently conflicted with overlapping dev event-feature work.

- **Complete SPM-30 attendee route and registration controls** (GPT-5) — SPM-30: Refreshed Jira and aligned the implementation to its current Attendee story: denied attendee direct navigation to venue, booking, and equipment operations; confined registration and withdrawal mutations to the authenticated attendee; added direct-route and registration behavior tests.
  - Scope: `apps/frontend`, `AI_USAGE.md`
  - Assumptions: `/events` and event details are intentionally attendee-accessible for browsing, while operational management routes belong only to their assigned staff roles.
  - Checks: `npm run test:coverage` in `apps/frontend` (72 tests passed; scoped SPM-30 coverage gate passed); shell syntax check for the frontend CI entrypoint; `git diff --check`. Frontend build remains blocked by the pre-existing TypeScript 6 `baseUrl` deprecation configuration.
  - Follow-up: The frontend currently uses an in-memory event/registration model. Server-side enforcement awaits the future event and registration API.

- **Close SPM-30 acceptance-path test gaps** (GPT-5) — SPM-30: Corrected login fixtures so every account receives its matching Firebase role claim, added the assigned-coordinator success case, added the frontend CI test entrypoint, and expanded CI E2E checks for organiser claims and seeded PostgreSQL RBAC permissions.
  - Scope: `apps/frontend`, `services/backend/test`, `AI_USAGE.md`
  - Assumptions: The current in-memory frontend event model is the implemented event-management surface for SPM-30; real event API ownership checks belong to the future resource API.
  - Checks: Frontend Vitest coverage (62 tests passed; 100% statements, branches, functions, and lines for the SPM-30 login, Firebase-role mapping, and access-guard files); backend lint, build, and unit tests (95 passed). Emulator/PostgreSQL E2E remains CI-only by requester preference.
  - Follow-up: Jira could not be re-read because the Atlassian OAuth refresh token is invalid; no Jira data was changed.

- **Remove superseded local Firebase verification helper** (GPT-5) — SPM-30: Removed the interactive real-Firebase curl helper and its README/changelog references at the requester's direction. CI Firebase Auth Emulator E2E coverage and the protected backend auth endpoint remain.
  - Scope: `development/local-dev`, `AI_USAGE.md`
  - Assumptions: GitHub Actions E2E coverage is the desired automated authentication verification path.
  - Checks: `git diff --check`.
  - Follow-up: No local Compose services were started or stopped.

- **Verify Firebase authentication through the production route** (GPT-5) — SPM-30: Added authenticated `GET /auth/me`, corrected the local curl helper to call it, and changed the Firebase emulator E2E test to exercise the production route rather than a test-only controller. The E2E suite also checks Firebase rejects an incorrect password before issuing a token.
  - Scope: `services/backend`, `development/local-dev`, `AI_USAGE.md`
  - Assumptions: The route is a small client-facing session-introspection contract; a verified token may disclose only its UID, optional email, and normalized application roles to that same token holder.
  - Checks: `npm run lint`, `npm run build`, and `npm test` in `services/backend` (95 tests passed); shell syntax check for the local helper; `git diff --check`. Emulator E2E remains CI-only by requester preference.
  - Follow-up: No event/request backend API exists yet, so server-side resource ownership enforcement remains future domain work; existing frontend guards cover the current in-memory UI routes.

- **Add local real-Firebase backend verification helper** (GPT-5) — SPM-30: Added an interactive curl-based helper that signs a prompted non-production Firebase user in through the real Firebase REST API and sends its ID token to the local backend's protected root route.
  - Scope: `development/local-dev`, `AI_USAGE.md`
  - Assumptions: The caller has started the local Compose stack and configured a non-production Firebase Web API key in `development/local-dev/.env`; the backend service account is configured for that same Firebase project.
  - Checks: Shell syntax check and static script inspection; no real Firebase credentials, user accounts, token, or local stack were used.
  - Follow-up: The helper verifies authentication only. Resource-specific backend role and ownership enforcement awaits corresponding resource endpoints.

- **Use real Firebase in local Compose** (GPT-5) — SPM-30: Removed the local Firebase Auth Emulator service and fake Firebase settings from Compose. Local Compose now receives real non-production Firebase settings from its untracked `.env`; the emulator remains confined to CI E2E tests.
  - Scope: `development/local-dev`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
  - Assumptions: Local developers supply Web SDK configuration and a same-project Firebase Admin service account in `development/local-dev/.env`, and do not use production Firebase credentials.
  - Checks: Docker Compose configuration validation with `.env.example`; Firebase emulator JSON parsing; `git diff --check`.
  - Follow-up: The shared local Compose stack was not started or stopped. No commit or pull request created.

- **Correct Firebase emulator Docker build source path** (GPT-5): Updated the Firebase emulator image to copy its configuration from the path within Compose's repository-root build context.
  - Scope: `development/local-dev/firebase`, `AI_USAGE.md`
  - Assumptions: The Firebase service will continue using the repository root as its Compose build context.
  - Checks: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`.
  - Follow-up: Existing unrelated frontend and ledger changes were preserved; no commit or pull request created.

- **Rebuild SPM-37 on current dev** (GPT-6) — SPM-37; live status In Progress, Medium, Sprint 1, no comments. Read the full story and eight AC. Requester explicitly deferred AC7; implement AC1-6 and AC8.
  - Baseline: Reset the existing feature/SPM-37-save-event-request-as-a-draft branch to origin/dev 7bd1193 at the requester's direction. Backup branch backup/SPM-37-before-rebuild-20260916 and stash SPM-37 before clean rebuild 2026-09-16 retain previous work. Tracked feature code was replaced with dev; ignored dependencies, local environment and database data were retained. Remote feature ref remains dfc7e64c225ed7d2aa9bca51cc83a22d3bf76b4f pending user verification/commit approval. Updating that remote after approval will require a guarded history replacement (force-with-lease), not a normal fast-forward push.
  - Areas: current frontend event form, My Requests/navigation, backend events/drafts API and migration, component tests/configuration/docs, shared Compose migration mount and setup docs. No unrelated previous draft UI was restored.
  - Implementation: Save incomplete drafts at every form step; persist all fields and attachments in PostgreSQL; show confirmation/error with retained input and retry; list/reopen/update the same request with versions and operation identifiers. Submit and permanently lock drafts atomically in the same transaction as the submitted event; preserve the request ID and reject draft edits after submission. AC7 real organisation isolation remains explicitly deferred; all demo visitors share the existing server-side organiser.
  - Verification: Frontend component tests 17/17; backend unit tests 43/43; API/database integration 9/9 (seven new draft cases plus two smoke tests); real Chromium flow passed on test frontend :5174/backend :8082 with PostgreSQL spm_test. Browser exercised save, refresh, reopen, repeated updates, simulated 503/retry, attachment/choice persistence, real submission and both UI/API lockout. Desktop and 390px mobile screenshots inspected; no page errors or framework overlay. Integration/browser harnesses remove only their run's records. Frontend production build/lint passed; backend Nest build passed using Node 24.19.0; Node 23.3.0 failed in installed Nest CLI with ERR_REQUIRE_CYCLE_MODULE. Backend lint passed. Git whitespace checks passed.
  - Runtime: Docker engine is unavailable; reused the existing persistent embedded PostgreSQL installation at C:/Users/kirub/AppData/Local/SPM-Draft-Postgres on localhost:5432. Applied events schema and additive draft migration to local spm without resetting data. Dependencies were not clean-installed; tests use existing node_modules. Added Playwright dev dependency and lockfile entries without changing existing locked packages.
  - Follow-up: GitHub PR lookup through both gh and connector lacked repository access; Jira development metadata reports one open PR, so reuse it after access/approval rather than creating a duplicate. No Jira status changes, commits or pushes. Review locally before authorizing commit and remote feature replacement.
  - Final runtime check: frontend http://localhost:5173/events/create, backend health and draft-list endpoint all returned HTTP 200. Frontend :5173, backend :8080 and persistent PostgreSQL :5432 are left running for human verification. Temporary browser test frontend :5174/backend :8082 were stopped. Mobile sidebar is fully hidden after its resize transition; screenshot timing was corrected, with no layout code change required.

## 2026-09-16 - Claude

- **Finish SPM-37 wizard-step resume left in progress** (Sonnet 5) — SPM-37 (In Progress; same story as the prior Codex rebuild entry above, which remains staged and unreviewed).: Picked up an unstaged, undocumented, untested in-progress change (an optional `fields.formStep` on `DraftFields` so reopening a draft resumes the wizard step it was saved on, instead of always restarting at step one) that was left in the working tree after the prior Codex session. Reformatted the two long unwrapped lines in `draft-input.ts`/`EventCreatePage.tsx` to match the repo's Prettier style, added frontend and backend test coverage (save persists `formStep`, reopening resumes the saved step, backend accepts/omits/rejects `formStep` per its 0-2 range), and documented the addition in both changelogs and handover files.
  - Scope: `apps/frontend/src/pages/EventCreatePage.tsx`, `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/types/draft.ts`, `services/backend/src/events/draft-input.ts`, `services/backend/src/events/draft-input.spec.ts`, this file, both apps'/services' `CHANGELOG.md`/`HANDOVER.md`.
  - Assumptions: The unstaged `formStep` change was intentional in-progress work to continue, not something to discard, since it built cleanly on the already-staged SPM-37 draft feature and matched its patterns. Kept it additive/optional so it does not alter the previously verified SPM-37 acceptance-criteria behavior.
  - Checks: Backend `npm test -- --run` (48/48 passed) and `npm run lint`; frontend `npm test -- --run` (19/19 passed), `npm run lint`, and `npm run build` (passed). Backend `npm run build` failed locally with `ERR_REQUIRE_CYCLE_MODULE` under Node 23.3.0, the same known Nest CLI/Node incompatibility already recorded in the entry above (Node 24 builds cleanly); not re-verified with Node 24 this session.
  - Follow-up: Everything from the prior Codex entry above is still staged and unreviewed/uncommitted; this entry's changes are unstaged on top of that. No commits, pushes, or Jira status changes were made. Stage and review together before committing, per this repo's explicit-commit-approval rule.

## 2026-09-15 - Codex

- **Enforce role-aware organiser routes for SPM-30** (GPT-5) — SPM-30: Read Firebase custom role claims after sign-in, restrict organiser event creation and ownership-bound edits, restrict event-change reviews to the assigned coordinator, organise guarded routes with nested React Router `Outlet`s, and document the new guard and test-helper contracts.
  - Scope: `apps/frontend`, `AI_USAGE.md`
  - Assumptions: Jira's current explicit acceptance criterion naming an Event Organiser governs the conflicting attendee story title; Firebase custom claims use the existing uppercase RBAC role names.
  - Checks: `npm --prefix apps/frontend test` (5 files, 50 tests passed); `git diff --check`.
  - Follow-up: The frontend's in-memory data store has no backend resource API yet, so server-side RBAC and ownership enforcement remains a required future security boundary. No commit or pull request created.

- **Share local Firebase Auth Emulator between frontend and backend** (GPT-5) — SPM-30: Added opt-in frontend Auth Emulator connection, a shared Compose Auth Emulator service, and backend emulator initialization using the same `demo-is212` project without service-account credentials.
  - Scope: `apps/frontend`, `services/backend`, `development/local-dev`, `AI_USAGE.md`
  - Assumptions: `demo-is212` is emulator-only; real Firebase remains the default whenever `VITE_USE_FIREBASE_AUTH_EMULATOR` is not `true`.
  - Checks: Frontend Vitest (32 passed); targeted frontend Firebase-module coverage (8 passed; 100% statements, branches, functions, and lines); backend Vitest (93 passed); targeted Firebase token-service coverage (19 passed; 100% statements, branches, functions, and lines); backend build and lint; Docker Compose configuration validation; `git diff --check`. Frontend build is blocked by the pre-existing TypeScript 6 `baseUrl` deprecation, and frontend lint is blocked because ESLint 10 has no `eslint.config.*` file.
  - Follow-up: The shared Compose stack was not started, preserving any existing local integration environment. No commit or pull request created.

- **Document Firebase role assignment script** (GPT-5): Added JSDoc for role-assignment data, validation inputs and failures, and the Firebase custom-claim update operation.
  - Scope: `services/backend/scripts/set-firebase-roles.mjs`, `AI_USAGE.md`
  - Assumptions: The existing email-to-role mappings and Firebase update behavior must remain unchanged.
  - Checks: `node --check services/backend/scripts/set-firebase-roles.mjs`; `git diff --check` (an unrelated existing trailing-whitespace warning remains in `apps/frontend/package.json`).
  - Follow-up: The role-assignment script was already staged; no Firebase users were modified, and no commit or pull request was created.

- **Load local backend environment configuration** (GPT-5): Load `services/backend/.env` before creating Nest providers so Firebase Admin uses the configured local service account instead of unrelated application-default credentials.
  - Scope: `services/backend/src/config`, `services/backend/src/main.ts`, `AI_USAGE.md`
  - Assumptions: The backend is launched with `services/backend` as its working directory, as its npm scripts do.
  - Checks: Targeted Vitest tests (19 passed); `npm run build`; `npm run lint`; `git diff --check`; isolated configuration check confirmed the configured service account targets `spm-is212-g5-t2-ecd8b`.
  - Follow-up: Existing unrelated working-tree changes were preserved; no commit or pull request created.

- **Firebase test-role assignment helper** (GPT-5) — None supplied: Added a manually run Firebase Admin script for assigning the five supported backend RBAC roles to local test users by email.
  - Scope: `services/backend`, `AI_USAGE.md`
  - Assumptions: The operator will replace placeholder emails, supply their own local service-account JSON path, and run the script intentionally against the selected Firebase project.
  - Checks: Script reviewed for supported role values, preserved non-role claims, and no embedded credentials.
  - Follow-up: The script performs external account mutations when executed; users must refresh their Firebase session afterwards.

- **Simplify local Compose to three tiers** (GPT-5) — None supplied: Reduced the local stack to frontend, backend, and PostgreSQL; removed the gateway, GCS, Pub/Sub, initialization, and Adminer services. The backend now runs and is published directly on `localhost:3000`, which is the frontend's default API URL.
  - Scope: `development/AGENTS.md`, `development/local-dev`, `AI_USAGE.md`
  - Assumptions: GCS, Pub/Sub, and the reverse proxy are not required by currently implemented local application behavior and should not be started by default. Keeping the backend on port 3000 inside and outside Compose is clearer for local development.
  - Checks: `docker compose -f development/local-dev/compose.yaml config --no-interpolate`; searched local-dev configuration and documentation for stale emulator/gateway references; `git diff --check` on changed local-dev files.
  - Follow-up: The requester deleted the now-unneeded `gateway/` and emulator `scripts/` folders after the Compose simplification; documentation was reconciled with the resulting layout.

- **Restore frontend clean-install compatibility** (GPT-5) — None supplied: Pinned frontend TypeScript to 6.0.3 so the ESLint TypeScript packages can satisfy their supported peer range and Docker's `npm ci` can install dependencies cleanly.
  - Scope: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
  - Assumptions: The existing ESLint TypeScript packages remain the intended toolchain; TypeScript 6 is the compatible interim version.
  - Checks: `npm ci --ignore-scripts --no-audit --no-fund` (passed); `npm ls typescript --depth=0` (6.0.3); `npm run build` reached TypeScript compilation but is blocked by the existing `baseUrl` deprecation requiring either migration or `ignoreDeprecations: "6.0"`.
  - Follow-up: No Docker image was built; the Dockerfile's dependency-install command was verified directly.

## 2026-09-14 - Codex

- **Remove hard-coded authentication test password** (GPT-5): Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
  - Scope: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
  - Assumptions: The repository’s GitHub secret is named `SEED_PASSWORD`; local test runs must export the variable themselves.
  - Checks: Source search for the removed literal and `git diff --check`; frontend tests require `SEED_PASSWORD` and dependencies to be available.
  - Follow-up: The exposed password should be rotated; existing untracked Firebase service-account material was preserved and not staged.

- **Use fake credentials for mocked login tests** (GPT-5): Replaced the real-looking test password with an explicitly fake password and removed unnecessary environment-secret wiring because Firebase authentication is mocked.
  - Scope: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
  - Assumptions: Login unit tests should validate UI behavior with deterministic mock data, not real Firebase accounts.
  - Checks: Source search for the removed credential and `git diff --check`; frontend tests remain unavailable locally because Vitest is not installed.
  - Follow-up: Existing untracked Firebase service-account material was preserved and not staged.

- **Local frontend-to-backend RBAC integration check** (GPT-5) — None supplied: Added the authenticated `/integration-check` frontend page and protected `GET /integration/permissions` backend endpoint to verify a Firebase ID token and test its custom roles claim against the seeded RBAC permissions. Added local browser CORS support and frontend API URL documentation.
  - Scope: `apps/frontend`, `services/backend`, `AI_USAGE.md`
  - Assumptions: This diagnostic route is useful for local integration verification before merging to `dev`; Firebase users being tested have a supported uppercase custom roles claim such as `roles: ["ATTENDEE"]`.
  - Checks: `services/backend`: `npm test` (93 passed), `npm run lint` (passed). `apps/frontend`: TypeScript project check passed before the pre-existing Tailwind/PostCSS build failure. Full frontend tests are blocked by a missing `@testing-library/jest-dom` installation; its production build is blocked by the existing Tailwind 4/PostCSS adapter mismatch. Backend Nest build is blocked by the existing TypeScript 7.0/Nest CLI incompatibility.
  - Follow-up: A live check still requires a Firebase user with a supported custom roles claim and Firebase Admin credentials in the backend. The existing frontend application role remains hardcoded to `attendee`; the integration endpoint reports the role(s) actually present in the verified Firebase token.

- **Restore Tailwind CSS 3 PostCSS compatibility** (GPT-5) — None supplied: Pinned Tailwind CSS to 3.4.19, restoring compatibility with the frontend's existing Tailwind 3 PostCSS configuration and CSS directives.
  - Scope: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
  - Assumptions: The existing `tailwind.config.js`, `postcss.config.js`, and `src/index.css` are intentionally Tailwind 3 configuration and should not be migrated to Tailwind 4.
  - Checks: `npm ls tailwindcss --depth=0` (3.4.19); `npm run build` reached TypeScript compilation but is blocked by the existing TypeScript 7 removal of `baseUrl`; `git diff --check` found pre-existing trailing whitespace in `apps/frontend/package.json`.
  - Follow-up: The separate pending TypeScript 7 update conflicts with the ESLint TypeScript peer range and prevents a clean build until it is reconciled; it was not changed in this scoped dependency fix.

## 2026-09-13 - Antigravity

- **Finalize SPM-36 event request and prepare PR** (Gemini 3.7 Flash) — SPM-36 (SPM-36): Reverified all 7 Acceptance Criteria for SPM-36, cleaned and consolidated test files into component directories (`apps/frontend/src/` and `services/backend/src/`), removed the legacy root `tests/` directory, verified all 36 backend tests and 12 frontend tests pass cleanly, and prepared the branch and commit for pull request into `dev`.
  - Scope: `apps/frontend`, `services/backend`, `development/database`, `AI_USAGE.md`.
  - Assumptions: Local demo organiser is used pending auth module merge.
  - Checks: `npm test -- --run` in `services/backend` (36 tests passed); `npm test -- --run` in `apps/frontend` (12 tests passed); frontend/backend build and lint passed with 0 errors.
  - Follow-up: Prepared `feature/SPM-36-create-and-submit-an-event-request` branch for PR into `dev`.

- **Additional event workflow preparation** (Gemini 3.7 Flash) — Second user story key not supplied.: Added optional supporting-file upload on EventCreatePage step 2, persisted attachment metadata/data URLs through the backend event contract, displayed attached files with view/download links on EventDetailPage, and added a top-right mock profile switcher for Coordinator, Organiser, Venue Staff, Tech Support, and Admin roles.
  - Scope: `apps/frontend`, `services/backend/src/events`, `development/database/postgresql/init/002_events.sql`, `AI_USAGE.md`.
  - Assumptions: This is preparatory work for a second Jira story and should remain separate from the first story's eventual push. The mock profile switcher is temporary local RBAC support until real authentication is merged.
  - Checks: Backend focused tests passed: `npm test -- --run src/events/event-input.spec.ts src/events/events.service.spec.ts`; frontend focused tests passed: `npm test -- --run src/pages/EventCreatePage.test.tsx src/pages/EventListPage.test.tsx src/pages/EventDetailPage.test.tsx src/components/layout/TopNav.test.tsx`; frontend/backend build and lint passed.
  - Follow-up: No Jira key was supplied for the second story. Coordinator assignment log and cross-coordinator access restrictions are not completed in this prep pass.

## 2026-09-13 - Codex

- **Rebuild SPM-36 tests one file at a time** (GPT-5) — SPM-36.: Rebuilt the backend validation/service tests beside their source files and cleaned the EventCreatePage/EventListPage page tests beside their React pages, using `SPM-36 Test Case ...` comments directly above each test case or grouped test case.
  - Scope: `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/pages/EventListPage.test.tsx`, `services/backend/src/events/event-input.spec.ts`, `services/backend/src/events/events.service.spec.ts`, `services/backend/src/events/event-input.ts`, `tests/backend/SPM-36`, `AI_USAGE.md`.
  - Assumptions: User wants each SPM-36 test file reviewed and explained before moving to the next file.
  - Checks: `cd services/backend && npm test -- --run src/events/event-input.spec.ts` passed; `cd services/backend && npm test -- --run src/events/events.service.spec.ts` passed; `cd apps/frontend && npm test -- --run src/pages/EventCreatePage.test.tsx` passed; `cd apps/frontend && npm test -- --run src/pages/EventListPage.test.tsx` passed. Frontend tests emitted React Router non-failing future-flag warnings.
  - Follow-up: Existing broader AI_USAGE entry and remaining database SPM-36 test were preserved for later cleanup/review.

- **Complete SPM-36 automated test coverage** (GPT-5) — SPM-36 — Jira verified as In Progress, Medium priority, with no comments; no PR.: Added page-level React tests beside Event Create/List, expanded backend validation/service and database integration coverage for every supplied SPM-36 test case, and fixed defects exposed by the tests: description/layout were not required and same-day past start times were accepted.
  - Scope: `apps/frontend`, `services/backend/src/events`, `tests/backend/SPM-36`, `tests/database/SPM-36`, `AI_USAGE.md`.
  - Assumptions: The existing fixed local demo organiser is the authenticated-organiser precondition until login is merged. The requester explicitly made preferred room layout, accessibility needs, and required facilities the option terminology source of truth.
  - Checks: Frontend `npm test` (2 files, 8 tests), lint, and build passed; backend `npm test` (3 files, 34 tests), lint, and build passed; rebuilt the local backend and ran the database/API SPM-36 integration test successfully.
  - Follow-up: No Cypress configuration or local login flow exists, so no browser E2E/login test was added. React Router emitted non-failing v7 future-flag warnings. Docker production pruning reported 3 existing high-severity dependency findings, outside this test scope. Existing unrelated staged/unstaged work on `fix/backend-dependency-lock` was preserved; no commit, push, or PR was performed.

- **Add Firebase emulator E2E workflow**: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
  - Scope: `services/backend/test/auth.e2e-spec.ts`, `firebase.json`, `.github/workflows/tests.yml`, `AI_USAGE.md`
  - Assumptions: `demo-is212` is used as a safe emulator-only project ID; PostgreSQL can be started from `development/database/postgresql` in GitHub Actions.
  - Checks: `npm run lint`; `npm run build`; Ruby YAML/JSON config validation; `git diff --check`. Emulator-backed E2E execution was not run because the local Auth Emulator was unavailable.
  - Follow-up: Local Docker/emulator execution was not run in this environment; no commit or pull request created.

- **Recheck authentication E2E coverage**: Rechecked the authentication E2E test against the current AuthModule and middleware wiring after removing AuthorizationService; no test changes were required.
  - Scope: `services/backend/test/auth.e2e-spec.ts`, `AI_USAGE.md`
  - Assumptions: The file is intended to cover Firebase authentication middleware, not resource-level RBAC enforcement.
  - Checks: `npm run test:e2e -- test/auth.e2e-spec.ts` outside the sandbox (3 tests passed); the full E2E command was sandbox-blocked because local server binding is restricted.
  - Follow-up: No commit or pull request created.

- **Organize database service tests**: Grouped successful database and transaction behavior separately from configuration and failure behavior, matching the RBAC test organization.
  - Scope: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
  - Assumptions: Missing configuration, connection failures, rollbacks, and unconfigured shutdown are unintended behavior cases.
  - Checks: `npm test -- src/database/database.service.spec.ts` (8 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: Existing database service tests were preserved; no commit or pull request created.

- **Document RBAC predicate return value**: Expanded the `buildPermissionPredicate()` comment with its SQL return value and execution behavior.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
  - Assumptions: None.
  - Checks: `git diff --check`.
  - Follow-up: No commit or pull request created.

- **Remove redundant authorization service**: Removed the separate `AuthorizationService` and its tests; updated auth wiring and backend documentation to use composable RBAC predicates inside resource queries.
  - Scope: `services/backend/src/auth`, `services/backend/README.md`, `services/backend/HANDOVER.md`, `services/backend/CHANGELOG.md`, `AI_USAGE.md`
  - Assumptions: Resource repositories will enforce RBAC and ownership in the same SQL operation and will not perform a preceding authorization query.
  - Checks: `npm test` (90 tests passed); `npm run lint`; `npm run build`; `git diff --check`; searched for remaining `AuthorizationService` references.
  - Follow-up: Existing Firebase authentication and `RbacRepository` work was preserved; no commit or pull request created.

- **Organize RBAC predicate behavior tests**: Grouped valid predicate generation under intended behavior and arbitrary/injected actions under unintended behavior.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: Runtime-invalid actions must be rejected even though the method accepts the `PermissionAction` TypeScript union.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `npm run build`; `git diff --check`.
  - Follow-up: No commit or pull request created.

- **Add RBAC predicate injection denial test**: Added unintended-behavior coverage proving arbitrary or injected permission column names are rejected.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: Runtime action values must be limited to the four supported CRUD actions even when TypeScript typing is bypassed.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: No commit or pull request created.

- **Make RBAC SQL placeholders explicit**: Replaced internal placeholder variables with explicit `$1` and `$2` positions in the composable RBAC predicate.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
  - Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: No commit or pull request created.

- **Harden RBAC SQL predicate construction**: Standardized the composable RBAC predicate on fixed `$1` and `$2` placeholders, eliminating interpolated placeholder text.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name, with operation-specific parameters beginning at `$3`.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: Permission columns remain selected only from the fixed `PermissionAction` mapping; no commit or pull request created.

- **Add composable RBAC permission predicate**: Added a composable SQL `EXISTS` predicate that resource repositories can embed in their data operation to enforce RBAC without a separate network request.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: Calling repositories will pass a PostgreSQL text-array parameter containing the authenticated user's roles and a parameter containing the resource name.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: `hasPermission()` remains available for standalone checks; no commit or pull request created.

- **Add RBAC denial edge cases**: Added focused negative tests for missing permission rows, explicit denials, and truthy non-boolean database values.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: Only an explicit boolean `true` should grant permission; missing or malformed rows should deny access.
  - Checks: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (53 tests passed); `npm run lint`; `git diff --check`.
  - Follow-up: No commit or pull request created; existing working-tree changes were preserved.

- **Expand database service coverage**: Added deterministic coverage for unreachable database URLs, query delegation, successful and failed transactions, client release, and pool shutdown.
  - Scope: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
  - Assumptions: A configured URL can still be invalid or unreachable; connection failures should be propagated by the database service for callers to handle.
  - Checks: Targeted Vitest coverage (8 tests passed; 100% statements, branches, functions, and lines); `npm --prefix services/backend run lint`; `git diff --check`.
  - Follow-up: Existing working-tree changes were preserved; no commit or pull request created.

- **Fix PR #6 CI dependency installation** — PR #6: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.
  - Scope: `services/backend`, `AI_USAGE.md`
  - Assumptions: The current Vite version's native `resolve.tsconfigPaths` support is the intended replacement.
  - Checks: `npm install --package-lock-only`; `npm ci --ignore-scripts`; `npm test`; workflow YAML validation; `git diff --check`.
  - Follow-up: No secret files were included or modified.

## 2026-09-12 - Codex

- **SPM-36 event request submission** (GPT-6) — SPM-36 — fetched full story, six AC, comments (none), Medium priority, Sprint 1, In Progress.: Added a light-mode three-step form, required/invalid field errors, calendar validation that blocks past start dates and non-logical date ranges, PostgreSQL Submitted persistence with duplicate retry protection, confirmation, and API-backed My Events/detail reloads. Added idempotent schema and fictional seed; removed the sign-in display.
  - Scope: `apps/frontend`, `services/backend`, `development/database`, `development/local-dev`.
  - Assumptions: User explicitly deferred branches, Save Draft, email delivery, and user accounts. Uses a fixed local demo organiser behind an explicit local configuration switch; no account implementation or real email. AC6 confirmation is implemented; its email requirement remains deferred by user instruction.
  - Checks: Frontend build/lint and 7 component interaction tests passed from `tests/frontend/SPM-36`; backend build/lint, 29 unit tests from `services/backend/src` and `tests/backend/SPM-36`, and 2 HTTP tests passed (HTTP tests required local port permission). Docker backend build passed. Live API/PostgreSQL integration passed required-field/invalid-value rejection, Submitted persistence, complete details/list retrieval, retry deduplication, and server-owned status/organiser checks; run-owned records removed. Schema and fictional seed applied to existing local database without reset. Browser-facing gateway returned the saved sample through /api/events. Browser tool reported no available browser, so visual browser QA remains unverified.
  - Follow-up: Latest origin/dev and origin/main inspected: neither has working login. No matching local/remote-tracking SPM-36 branch; PR lookup unavailable (no gh/GitHub connector). No branch/commit/push/PR actions for this ticket; existing staged dependency repair preserved, including nested TypeScript entry required by Docker npm 10. Backend rebuilt/restarted; shared stack left running. Docker npm audit reported 4 high findings during install and 3 after production pruning; not addressed in this scope. Integrate teammate's server-authenticated organiser identity later; local demo is not multi-user access control.

- **Expand RBAC permission matrix coverage**: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: CRUD bit strings represent `create`, `read`, `update`, and `delete` in that order; absent seeded role/resource rows are represented as `0000`.
  - Checks: Targeted Vitest coverage (50 role/resource cases and 200 permission checks passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
  - Follow-up: No separate unintended-behavior section remains; the uncovered branch is framework-generated NestJS decorator metadata.

- **Add explicit RBAC denial coverage**: Added a negative test for permission rows that explicitly deny an action.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: The repository should return `false` for an existing permission row with `allowed: false`.
  - Checks: Targeted coverage (3 tests passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
  - Follow-up: The remaining branch is emitted for NestJS decorator metadata rather than repository authorization logic.

- **Organize RBAC repository tests**: Organized RBAC repository tests into intended and unintended behavior sections consistent with the Firebase authentication specs, preserving the existing parameterized permission query.
  - Scope: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
  - Assumptions: The current `CASE`-based `hasPermission()` implementation is existing work and should remain unchanged.
  - Checks: Targeted RBAC repository tests (2 passed); `npm run lint`; `git diff --check`.
  - Follow-up: None.

- **Fix authentication middleware assertion**: Updated the middleware test expectation to include the verified user's email field and added coverage for Firebase verification failures.
  - Scope: `services/backend/src/auth/authentication/firebase-authentication.middleware.spec.ts`, `AI_USAGE.md`
  - Assumptions: The middleware should attach the complete verified Firebase user object to the request.
  - Checks: Targeted Vitest coverage and `git diff --check`; 5 tests passed; 100% statements/functions/lines and 90% branches.
  - Follow-up: The remaining branch gap is reported on the injectable decorator line and does not represent an untested middleware behavior.

- **Review Firebase token service test coverage**: Reviewed Firebase token service tests against implementation behavior and verified targeted Vitest coverage.
  - Scope: `services/backend/src/auth/authentication`, `AI_USAGE.md`
  - Assumptions: The question concerns unit-test completeness, including behavioral edge cases beyond line coverage.
  - Checks: `npm --prefix services/backend run test -- src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (17 passed; 100% statements/branches/functions/lines).
  - Follow-up: Coverage is complete at the instrumentation level, but additional edge-case assertions are recommended for stronger behavioral confidence.

- **Harden Firebase bearer-token parsing** — SPM-106: Replaced delimiter-based Authorization header parsing with a strict Bearer-token regular expression and added malformed-header coverage.
  - Scope: `services/backend/src/auth/authentication`, `AI_USAGE.md`
  - Assumptions: Bearer schemes are case-insensitive and Firebase ID tokens contain no whitespace.
  - Checks: `npx vitest run src/auth/authentication/firebase-authentication.middleware.spec.ts`; `npm run lint`.
  - Follow-up: Middleware files already contained other staged/comment changes; those changes were preserved.

- **Set up JWT verification and authorization** — SPM-106: Added a NestJS auth module with Firebase ID-token middleware that attaches verified uid/roles claims to requests, centralized PostgreSQL access through `DatabaseService`, and RBAC services that check role permissions against the existing PostgreSQL tables and support ownership checks.
  - Scope: `services/backend`, `AI_USAGE.md`
  - Assumptions: Firebase custom `roles` claims will use the existing RBAC seed role names (`ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, `ATTENDEE`); product endpoints or future route-specific middleware will call `AuthorizationService` when resource/action context exists.
  - Checks: `npx vitest run src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (100% statements/branches/functions/lines for `firebase-token.service.ts`); `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox because Supertest needs to bind a local test server.
  - Follow-up: Work was created on `feature/SPM-106-set-up-jwt-verification-and-authorization` from `feature/spm-30-attendee-login`; npm reported 6 vulnerabilities after adding Firebase Admin/PostgreSQL dependencies and they were not auto-fixed to avoid unrequested dependency churn.

- **Restore local app connectivity** (GPT-6) — None supplied.: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.
  - Scope: Local Docker runtime; `AI_USAGE.md`.
  - Assumptions: Gateway timeout after backend recreation indicated a stale upstream address; restarting restored connectivity.
  - Checks: Frontend `/planning` HTTP 200, gateway `/healthz` returned status ok, `/api/events` HTTP 200.
  - Follow-up: Existing repository changes preserved; services left running and database retained. Dependency install reported 5 moderate and 1 high audit findings; dependency upgrades were outside this runtime repair.

## 2026-09-12 - Claude

- **Login page with Firebase Authentication** (Sonnet) — SPM-104 (inferred from branch name `feature/spm-104-set-up-frontend-login-page`; Jira itself was not accessible in this session): Added a `/login` page (`src/pages/LoginPage.tsx`) using Firebase Authentication (Email/Password provider) via the `firebase` JS SDK: `src/lib/firebase.ts` (SDK init + error-message mapping), `.env.example` for `VITE_FIREBASE_*` config, `src/vite-env.d.ts` typings, an `onAuthStateChanged` subscription in `App.tsx` for session persistence, `authLoading`/`isAuthenticated` state plus a shared `AuthLoadingScreen`, a `RequireAuth` route guard applied to all other routes, and a "Log out" control in `TopNav`. Updated `README.md`/`HANDOVER.md`/`CHANGELOG.md`.
  - Scope: `apps/frontend`, `AI_USAGE.md`
  - Assumptions: Signed-in Firebase users are mapped to app role `attendee` since there is no backend role lookup yet. `.env` is expected to hold a real Firebase project's config; no live Firebase project was reachable from this session to test end-to-end.
  - Checks: `npm run build` (tsc + vite build) in `apps/frontend` — passed. `npm install firebase` completed cleanly. Not run: end-to-end sign-in against a real Firebase project; `npm run lint` (pre-existing missing ESLint config, unrelated to this change).
  - Follow-up: Role-aware sign-in (vs. hardcoded `attendee`), password reset/self-registration flows, and reconciling any doc staleness elsewhere in this directory are left as follow-up work.

## 2026-09-11 - Codex

- **Repair backend Docker dependency install** (GPT-6) — Unknown; no Jira key supplied.: Added the missing nested TypeScript 5.9.3 peer dependency required by tsconfck under vite-tsconfig-paths, preserving the backend TypeScript 6 dependency and existing lock metadata.
  - Scope: `services/backend/package-lock.json`, `AI_USAGE.md`.
  - Assumptions: Fix the reported npm ci failure without upgrading dependencies.
  - Checks: Regenerated using node:22-alpine/npm 10.9.8; backend Compose image build passed, including npm ci, Nest build, and production pruning; final formatting preserves the verified JSON data.
  - Follow-up: npm reported four high-severity audit findings during install and three after production pruning; not addressed in this focused fix. Stack not started. Changes staged on fix/backend-dependency-lock; no commit or push.

- **Set up RBAC database seed** — SPM-103: Added local PostgreSQL RBAC tables and seed data in a separate init SQL file, documented standalone PostgreSQL build/run/smoke-check usage, and removed baked PostgreSQL credentials from the database image.
  - Scope: `development/database`, `development/local-dev`, `AI_USAGE.md`
  - Assumptions: RBAC belongs in a separate local database init file from base/user-auth schema; backend relationship-level authorization will be implemented separately from this seed data.
  - Checks: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`; `rg -n "POSTGRES_PASSWORD|POSTGRES_USER|POSTGRES_DB" -g 'Dockerfile' development services apps`; `rg -n "can_create|can_read|can_update|can_delete" development/database`; Ruby validation that `002_rbac.sql` matches Jira's 5 roles, 10 resources, 27 permission rows, and plain quoted permission columns. Docker SQL execution was not run because the local Docker daemon socket was unavailable and no local PostgreSQL server binary was present.
  - Follow-up: No existing local or remote branch/PR for SPM-103 was found before starting `feature/SPM-103-set-up-database-for-rbac`.

- **Switch shared branch guidance to dev**: Updated branch workflow guidance and GitHub Actions filters so normal work starts from and targets `dev`, with branch flow `work branch -> dev -> main`.
  - Scope: `AGENTS.md`, `docs/`, `.github/`, `apps/frontend/README.md`, `services/backend/README.md`, `AI_USAGE.md`
  - Assumptions: There should be no active dependency on any intermediate shared branch between work branches and `dev`.
  - Checks: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/security.yml .github/workflows/tests.yml`; searched repo docs and workflows for stale branch references.
  - Follow-up: Supersedes earlier AI usage entries that documented previous branch-flow assumptions.

- **SPM-37 implementation and testing checkpoint** (GPT-6) — SPM-37: Implemented PostgreSQL-backed draft create/read/list/update, incomplete fields, repeated saves with retry identity and version conflict handling, My Requests and editable form, save feedback, organisation isolation, and server-side rejection of non-draft writes. Same-organisation draft access follows SPM-94. Week 4's 20 core functions remain release scope.
  - Scope: `apps/frontend`, `services/backend`, `AI_USAGE.md`; shared local PostgreSQL started for integration tests.
  - Assumptions: Authentication must populate a verified `request.user` containing userId, organisationId, and roles. Default app denies unauthenticated calls; no production auth bypass added. Frontend token-provider hook is an integration seam. Firebase/login/RBAC and submission/change-request workflows remain separate dependencies; request requirement fields are draft text pending catalogue integration.
  - Checks: Node 24 backend build, 13 unit tests, 10 e2e tests including 8 real-PostgreSQL draft tests; frontend TypeScript/Vite build, 8 component tests, frontend ESLint and backend oxlint. Chromium browser checks covered all eight AC scenarios with test-only sessions, loss/retry, blank draft, all-field reopening, organisation isolation, legacy edit URL, and desktop/mobile screenshots. No page runtime errors; expected failure responses were exercised. Real Firebase sign-in/sign-out remains unverified.
  - Follow-up: User requires a testing report and explicit 'ok' before preparing review. Nothing staged/committed/pushed; review documentation and handoff deferred. Existing AI_USAGE edits preserved. Test fixture stopped and its five remaining records removed; shared PostgreSQL and normal frontend/backend left running (frontend 127.0.0.1:5174, backend 3000). Default Node 23 fails existing Nest tooling; Node 24 passes. Existing frontend Vite/router dependency audit findings remain; newly added Vitest upgraded to 4.1.11. CI still targets staging and frontend shell executable mode must be set when staging is authorised. Browser plugin skill absent; bundled Playwright used for browser checks.

- **Prepare SPM-37 feature branch** (GPT-6) — SPM-37: Pulled dev with fast-forward-only; local dev and origin/dev match df9a0b1ecff768865526ba723755574ea68be0be. Created feature/SPM-37-save-event-request-as-a-draft after finding no matching local/remote branch or PR. Read ticket description, all four acceptance criteria, status, priority, sprint, and comments (none), plus scoped agent guidance.
  - Scope: Local Git branch; `AI_USAGE.md`; read-only frontend, backend, and database inspection.
  - Planning refresh: Re-read all seven repository AGENTS.md files and local integration/CI guidance; confirmed Jira now contains all eight discussed criteria and remains To Do. Week 4's 20 core functions define release scope. Plan covers persistent drafts, form/list integration, server-enforced ownership and draft status, failure feedback, and AC-traceable tests. Authentication is still absent; coordinate its contract before security/sign-in acceptance testing. Existing tests workflow targets staging, so dev PR automation needs alignment or a manual run.
  - Assumptions: User-requested dev base overrides stale staging references in docs/ai-issue-workflow.md. Draft persistence requires backend work; current frontend identity is a placeholder and authentication integration needs coordination.
  - Checks: git pull --ff-only origin dev; HEAD/origin-dev comparison; branch searches; gh pr list (successful, empty); source and ownership review.
  - Follow-up: Preserved pre-existing AI_USAGE.md edits. Frontend creation is a placeholder, edits use memory-only state, and backend/database have no event model. GitHub PR lookup succeeded on this attempt, superseding the earlier API lookup failure for this operation. No commit or push.

- **Verify connections and retrieve assigned stories** (GPT-6) — SPM Project assignment lookup; no implementation requested.: Confirmed origin points to IS212-G5-T2/IS212-G5-T2 and remote dev is reachable through Git. Retrieved all assigned Jira issues through the legacy connector authenticated as the requester; all three are stories.
  - Scope: `AI_USAGE.md`; read-only GitHub and Jira inspection.
  - Assumptions: Used the legacy connector identity matching the requester; the other Atlassian connector uses a different account.
  - Checks: Git remote/status, gh auth status, gh repo view, git ls-remote, Jira identity and paginated JQL search (last page confirmed).
  - Follow-up: GitHub CLI account kishorek2024-bot cannot resolve the repository through the API; write access was not tested. Preserved existing AI_USAGE.md changes. No implementation, commit, push, or Jira mutation.

## 2026-09-09 - Codex

- **Inspect live Jira automation** (GPT-6) — SPM project automation; no implementation ticket.: Verified four enabled SPM rules: Branch created with status To Do -> In Progress; Pull request created with status In Progress -> In Review; Pull request merged with status In Review -> Done; Pull request declined with status In Review -> In Review.
  - Scope: `AI_USAGE.md`; read-only Jira browser inspection.
  - Assumptions: Configuration inspection establishes rule intent, not evidence of successful executions. No Jira settings were changed.
  - Checks: Read all four rule canvases and the branch trigger condition in the authenticated Jira UI. Connector discovery did not expose automation rules.
  - Follow-up: The decline rule, named 'Copy of Transition to In Review', does not implement the user's desired return to In Progress. This live inspection supersedes the earlier unverified automation assumptions below.

- **Verify dev checkout and review repository flow** (GPT-6) — None; repository review requested directly.: Fast-forwarded local `dev` only to `origin/dev` at `e4a9450` and reviewed repository guidance, application structure, local integration configuration, and CI. No other branch was merged, and no commit, push, or PR was created.
  - Scope: Local Git checkout; `AI_USAGE.md`.
  - Assumptions: The user's current instruction overrides older guidance: always create new work branches from latest `dev`, name them `<type>/<ticket_id>-<ticket_name>`, merge work into `dev`, then promote `dev` into `main` (source of truth). User-described Jira transitions are branch created -> In Progress, PR created -> In Review, PR merged -> Done, PR rejected -> In Progress; live automation settings and the exact rejection trigger were not verified.
  - Checks: Git fetch, fast-forward-only update, HEAD/origin-dev equality, clean diff against origin/dev before this ledger entry, and source/configuration searches. Application tests were not run for this inspection.
  - Follow-up: AGENTS, workflow docs, component READMEs, PR template, and CI retain staging-based guidance; documented merge transition remains Testing. Root README partially reflects dev but omits promotion to main. These files and remote settings were not changed as part of the review.

- **Add frontend and database local-dev layout**: Added a frontend service to the local Docker Compose stack, separated PostgreSQL into a buildable local image under `development/database/postgresql`, baked local-only PostgreSQL defaults into that image, and updated repository/local development documentation for the frontend/backend/database layout.
  - Scope: `development/local-dev`, `development/database`, `apps/frontend`, `README.md`, `AGENTS.md`, `AI_USAGE.md`
  - Assumptions: The existing NestJS backend remains the backend service, the existing React/Vite app should run as the frontend service, and database ownership should be separated under `development/database/postgresql` while Compose orchestration remains under `development/local-dev`.
  - Checks: `docker compose -f development/local-dev/compose.yaml config --quiet`; `npm ci`; `npm run build`; searched README and scoped docs for stale local-dev/frontend/backend/database wording; `docker compose -f development/local-dev/compose.yaml build frontend` and `docker build -t spm-postgresql development/database/postgresql` could not complete because the local Docker daemon was unavailable.
  - Follow-up: None.

- **Update Jira branch naming convention**: Updated branch naming guidance to use `<type>/<ticket_id>-<ticket_name>` instead of `<issue>-<short-name>` so connected Jira and GitHub work displays the ticket id and Jira ticket name.
  - Scope: `AGENTS.md`, `README.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
  - Assumptions: The ticket name should be slugged with hyphens for branch compatibility while preserving the Jira ticket id exactly.
  - Checks: Searched repository docs for stale branch-name examples.
  - Follow-up: None.

- **Scaffold NestJS backend**: Removed the generic service template and scaffolded a real NestJS backend at `services/backend` with npm, strict TypeScript, Vitest, oxlint, Dockerfile support, service docs, and a monorepo CI unit-test entrypoint. Updated local Docker Compose and the gateway to build and route to the backend service.
  - Scope: `services/`, `development/local-dev/`, `.github/workflows/`, `README.md`, `AI_USAGE.md`
  - Assumptions: The backend service should be named `backend`; NestJS is the default backend framework; deployment-related Nest/Mau scripts should be removed to match the no-deployment repository direction.
  - Checks: `npm ci`; `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox after the sandbox blocked local server binding; `services/backend/scripts/ci/unit-test.sh`; `docker compose -f development/local-dev/compose.yaml config --quiet`; searched for stale `services/template`, `sample-service`, and deployment references.
  - Follow-up: The Nest CLI generated current NestJS 12 ESM/Vitest/oxlint defaults.

- **Remove deployment workflow assumptions**: Removed the remaining deployment, Terraform, Kubernetes, and previous multi-branch workflow assumptions after `platform/` was removed. This entry recorded the then-current shared branch guidance, which was superseded on 2026-09-11 by the `dev` branch flow.
  - Scope: repo-wide, `.github/`, `apps/`, `services/`, `development/`, `docs/`
  - Assumptions: The repository no longer needs deployment automation or promotion branches; local Docker Compose emulators remain useful for development and are not deployment infrastructure.
  - Checks: Parsed GitHub Actions YAML with Ruby YAML; searched the repo for deployment/platform/branch-flow references and deployment-related filenames.
  - Follow-up: Existing `platform/` deletions were already present before this work and were preserved.

## 2026-09-07 - Codex

- **Human-reviewed commit gate**: Updated AI workflow guidance so agents stage completed changes for human review and wait for explicit approval before committing, pushing, or creating a pull request. Added an explicit no-auto-merge rule.
  - Scope: `AGENTS.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
  - Assumptions: Staging changes is acceptable for review, but committing and pull request creation require explicit human approval to proceed with the commit.
  - Checks: Reviewed updated Markdown content.
  - Follow-up: Pending human review before commit.

- **Resolve security workflow annotations**: Fixed security workflow annotations by updating GitHub workflow checkout steps to `actions/checkout@v7`, correcting the Trivy action pin to `aquasecurity/trivy-action@v0.36.0`, and replacing the licensed Gitleaks Action wrapper with the pinned Gitleaks CLI Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1`.
  - Scope: `.github/workflows/security.yml`, `.github/workflows/tests.yml`, `.github/workflows/terraform.yml`, `AI_USAGE.md`
  - Assumptions: The repository should keep a free secret scan that works for an organization-owned GitHub repository without requiring `GITLEAKS_LICENSE`.
  - Checks: Verified available Trivy, checkout, and Gitleaks tags with `git ls-remote`; parsed all GitHub Actions workflow YAML files with Ruby YAML.
  - Follow-up: None.

- **Branch promotion CI guard**: Added a GitHub Actions check for the earlier multi-branch promotion model. This entry is historical only; the promotion workflow was later removed, and current branch guidance is `work branch -> dev -> main`.
  - Scope: `.github/workflows/branch-flow.yml`, `AGENTS.md`, `docs/ci-cd-process.md`, `AI_USAGE.md`
  - Assumptions: GitHub branch protection will be configured to require the `Validate Promotion Source` check where enforcement is needed.
  - Checks: Parsed all GitHub Actions workflow YAML files with Ruby YAML.
  - Follow-up: None.

- **Jira and GitHub authority rules**: Updated AI workflow guidance so Jira is the authoritative requirements source and GitHub is the authoritative development artifact source. Added status gating, existing branch/PR reuse, Jira-key branch/commit/PR requirements, acceptance-criteria recheck, and Jira automation ownership rules.
  - Scope: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
  - Assumptions: Jira statuses `To Do` and `In Progress` are the only statuses where implementation should proceed; Jira automation handles status transitions for branch creation, pull request creation, and pull request merge.
  - Checks: Reviewed updated Markdown sections and searched relevant workflow terminology.
  - Follow-up: Future AI agents should not duplicate the Jira story into GitHub Issues or manually mark Jira work items `Done`.

- **AI workflow and branch progression guidance**: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
  - Scope: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
  - Assumptions: Earlier multi-branch assumptions were recorded here for historical context only. Current branch guidance is `work branch -> dev -> main`.
  - Checks: Reviewed updated Markdown sections and searched relevant workflow terminology.
  - Follow-up: Future Codex, Claude, or other AI work should add a new entry here before pull request handoff.

- **GitLab to GitHub migration cleanup**: Copied working files from the GitLab export into the GitHub repository without copying nested `.git` directories, converted GitLab CI/review metadata to GitHub Actions and pull request metadata, removed stale project-info/GitLab-only material, simplified the service template, and documented the Codex issue workflow and monorepo CI/CD process.
  - Scope: repo-wide, `.github/`, `apps/`, `services/`, `platform/`, `development/`, `docs/`
  - Assumptions: The GitHub repository should be the single source repo; `services/template` is a scaffold rather than an implemented service; GitHub pull requests replace GitLab merge requests.
  - Checks: Verified only one `.git` directory exists; validated GitHub Actions YAML with Ruby YAML parsing; searched for stale GitLab/project-info references; checked for copied `.DS_Store`, `.terraform`, `.env`, and empty-directory leftovers.
  - Follow-up: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, and other tools.
