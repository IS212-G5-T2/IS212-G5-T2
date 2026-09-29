# AI Usage Log

Record meaningful AI-assisted work under one heading per date and tool. Use concise bullets for the ticket or area, change, key check, and unresolved risk. Add detail only when it helps the next contributor. Git history holds full diffs and commit details; older bullets describe work at the time and may be superseded.

Keep private Jira/Confluence content, URLs, credentials, secrets, personal data, and long transcripts out of this file.

## 2026-09-30 - Codex

- AI workflow: Added numbered vendor-neutral roles (`00`–`10`, `99` recovery), thin Claude/Codex adapters, runtime schemas, and Git ignore rules for private ticket context. Jira remains the requirements authority; Confluence cases verify coverage.
- Quality and tests: Split requirements, architecture, and code-quality reviews into independent contexts; Accountability alone reconciles them. Added Context7 checks, searchable AC/test tags, private Confluence coverage mapping, and AC-derived happy, negative, boundary, and cross-cutting cases. Verified role/adaptor parity, schemas, and runtime ignore rules.
- Repository guidance: Mapped backend services and feature folders; placed new backend E2E suites under `backend/test/` while retaining the existing legacy suite. Updated CI documentation, PR security wording, private-data guidance, and the team Definition of Done.
- Code documentation: Required language-conventional documentation for public APIs and non-obvious logic, checked by implementation and review roles.
- Instruction cleanup: Shortened 17 active instruction files from 5,170 to 3,539 words (32%) without changing their key boundaries. Consolidated this ledger by date/tool; no application or CI behavior changed.
- Ticket closeout: Added a user-triggered final agent and private conversation registry for chat/subagent IDs. It verifies branch/PR completion, archives only confirmed idle ticket chats, and records pending or unsupported archives privately.

## 2026-09-22 - Codex

- Repository layout: Moved application, database, and Compose directories to root-level `frontend/`, `backend/`, `database/`, and `docker-compose/`; updated references and CI entrypoints.
- SPM-83: Reconciled rejection API/UI after the `dev` rebase. Current code requires the assigned coordinator and validates rejection reasons; earlier reason limits were superseded.
- Database: Routed event and draft services through shared `DatabaseService`. Consolidated fresh-volume PostgreSQL initialization into schema and seed scripts; existing volumes use backend migrations. Recorded initializer history in the database changelog.
- E2E/CI: Switched event-assignment tests to PostgreSQL sessions, corrected seed parameters and a missing API import, serialized suites sharing one database, and waited for final PostgreSQL startup in CI.
- Authentication/frontend: Added a stale-session restoration guard, repaired a clarification session fixture and route identity selector, and expanded backend auth coverage.
- Coverage: Fixed the frontend coverage entrypoint, enabled component-level Vitest V8 reports, and removed the obsolete combined dashboard. At that checkpoint, frontend coverage ran 201 tests and backend coverage ran 434 tests.

## 2026-09-22 - Claude

- SPM-38: Replaced the temporary hardcoded coordinator roster with a live PostgreSQL query after local-login changes made Firebase assumptions obsolete.
- SPM-38: Retired `Under_Review` from the event lifecycle and audited negative, boundary, and role-access tests. Rebuilt stale local containers during verification; a user-authorized local application-data reset supported retesting.

## 2026-09-21 - Codex

- Authentication: Built PostgreSQL-backed local login and sessions, reorganized auth source, centralized configuration, omitted password hashes from returned account data, and added repository, API, E2E, and failure-path coverage.
- Frontend authentication: Rebuilt login-page, API-helper, and auth-client tests for sessions; kept case traceability and covered redirects, errors, normalization, and session behavior.
- SPM-37: Rebasing and draft workflow work added My Drafts filtering/navigation checks and form regressions. Scoped coverage reached 100% for configured files; that figure was not project-wide coverage.
- SPM-83: Added coordinator rejection with a required reason, atomic persistence, and notification. The later 2026-09-22 integration superseded intermediate behavior.
- Event workflow: Removed approval UI outside its Jira scope and briefly restored manual assignment while reconciling branches; later SPM-38 work superseded that intermediate assignment state.

## 2026-09-21 - Claude

- SPM-38: Implemented initial coordinator-scoped event access, round-robin assignment, attachment viewing, and tests. The initial roster and `Under_Review` status were replaced on 2026-09-22; consult current code before relying on this historical design.

## 2026-09-20 - Codex

- SPM-37: Expanded private Confluence draft-case procedures and corrected branch-specific preconditions; private case content remains outside this ledger.
- Frontend: Removed the My Requests creation link and diagnosed local blank-page/login setup issues.

## 2026-09-20 - Gemini and Claude

- SPM-37 branch work: Added role-scoped request/event views, coordinator boundaries, attendee registration behavior, and related tests across frontend/backend. This was separate branch work; verify merged code before treating every detail as current.

## 2026-09-19 - Codex

- SPM-37: Reviewed and resolved feature-branch merge conflicts, preserving valid local work. Clarified that “100% coverage” referred to configured files and reviewed commit wording against implementation.

## 2026-09-19 - Claude

- SPM-37: Reached 100% coverage for the targeted modules, improved draft submission transaction paths and case documentation, addressed PR review feedback, and removed redundant Nest dependency-injection decorators.

## 2026-09-16 - Codex

- SPM-30: Repaired attendee route/registration controls, Firebase-based frontend authentication, protected-route checks, and CI/test coverage. This Firebase implementation was later replaced by PostgreSQL sessions.
- SPM-37: Rebuilt draft work on the current `dev` baseline.
- Documentation and local setup: Reconciled merged auth documentation; tested local Firebase integration, then removed a superseded interactive verification helper.

## 2026-09-16 - Claude

- SPM-37: Finished optional draft wizard-step resumption while preserving in-progress work; added focused tests. Later work superseded the original staged-state notes.

## 2026-09-15 - Codex

- SPM-30: Added role-aware organiser routes, local Firebase emulator integration, and a manual test-role assignment helper. These auth choices are historical after the PostgreSQL session migration.
- Local setup: Simplified Compose to frontend/backend/PostgreSQL, loaded backend environment configuration, and repaired frontend clean installs.

## 2026-09-14 - Codex

- Test credentials: Replaced hardcoded or real-looking authentication test passwords with environment-provided or clearly fake values.
- Frontend/local integration: Restored Tailwind 3/PostCSS compatibility and added a temporary frontend-to-backend permission check.

## 2026-09-13 - Codex

- SPM-36: Expanded event-request page, validation, service, and database tests; kept test files beside component behavior and fixed defects revealed by coverage.
- Authorization: Added composable, parameterized RBAC SQL predicates; removed a redundant authorization service; covered denial and injection cases.
- CI/tests: Added then-current Firebase emulator E2E orchestration, organized database/RBAC tests, and repaired PR #6 dependency installation. Firebase test setup was later replaced.

## 2026-09-13 - Antigravity

- SPM-36: Rechecked event-request acceptance paths, consolidated tests in owning components, prepared PR work, and added supporting-file upload and display. Check the current implementation for later changes.

## 2026-09-12 - Codex

- SPM-106: Added Firebase JWT verification and RBAC wiring; tightened Bearer-header parsing and tested malformed headers. Firebase auth was later replaced by PostgreSQL sessions.
- SPM-36: Implemented the initial multi-step event submission form, validation, and PostgreSQL persistence.
- RBAC: Expanded role/resource permission and explicit-denial tests; reorganized repository coverage. Also repaired local app connectivity during development.

## 2026-09-12 - Claude

- SPM-104: Added the original Firebase-backed login page and tests. The current login uses PostgreSQL sessions.

## 2026-09-11 - Codex

- SPM-103: Added local PostgreSQL RBAC schema/seed data and documented setup.
- SPM-37: Started the draft feature from `dev`; implemented draft persistence, repeat-save behavior, version conflicts, and frontend editing with tests. Later rebuilds and reviews refined it.
- Repository process: Set normal branches/PRs to `dev`, checked Jira/Git connections, and repaired backend Docker dependency installation.

## 2026-09-09 - Codex

- Scaffolded the NestJS backend and local frontend/PostgreSQL layout; updated Jira branch naming and removed obsolete deployment assumptions.
- Verified the then-active Jira automation and `dev` repository flow; consult current workflows for present behavior.

## 2026-09-07 - Codex

- Migrated GitLab workflow guidance to GitHub; defined Jira requirements versus GitHub code/PR ownership and the human-reviewed commit gate.
- Updated security CI annotations. An early branch-promotion CI guard was later removed; current branching is `work branch → dev → main`.
