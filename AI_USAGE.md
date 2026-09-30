# AI Usage Log

Record concise AI-assisted work here. Keep open-ticket history in this file; move a ticket's complete section to `docs/ai-usage-archives/SPM-<id>.md` only after the user explicitly says it is closed or asks to archive that identified ticket. Move unlinked issue records to `unknown.md` only when the user asks. Do not record secrets, private conversations, or production data.

## Writing convention

- Use `dd-mm-yyyy - <agent> - <ticket-id-or-branch-name>` headings, such as `30-09-2026 - Codex - SPM-50` or `30-09-2026 - Codex - fix/example-branch`. Use a known ticket ID first, then a recorded branch name. Use `Unknown` for unlinked issue records with neither; use `General` for other work. Do not infer IDs or branches.
- Use level-three headings for dated entries nested under sections in this file. Archive files use level-two dated headings. Keep current entries concise in this format: `- <user> prompted <issue>: <summary>`. Keep detailed assumptions, checks, and follow-up notes in archived histories when useful.
- Combine entries with the same date, agent, and ticket, branch, or category under one heading; keep different tickets separate.
- Keep active ticket histories under `## SPM-<id>`. For ticket work, read only that section through the next level-two heading; read `General` only when relevant.
- Move a ticket's complete history to `docs/ai-usage-archives/SPM-<id>.md` only after the user says it is closed or asks to archive that identified ticket. After moving it, leave one concise pointer under `Archived ticket pointers` in the current entry format, with an archive link. Put each pointer under its own dated heading with the ticket ID.
- Move unlinked issue records to `docs/ai-usage-archives/unknown.md` only when the user asks.

## Ticket sections

Unarchived ticket history stays here. Add ongoing work under `## SPM-<id>`.

## SPM-40

### 22-09-2026 - Codex - SPM-40
- kirub prompted SPM-40: Prepared the accept-request branch after confirming the earlier branch had no work to reuse; Jira details were unavailable.

### 26-09-2026 - Codex - SPM-40
- kirub prompted SPM-40: Implemented coordinator approval and its notification flow, with browser and API tests for authorization, persistence, and status handling.

### 27-09-2026 - Codex - SPM-40
- chaw678 and kirub prompted SPM-40: Addressed PR #31 review feedback and refined the approval regression-test headers.

## SPM-99

### 26-09-2026 - Codex - SPM-99
- swr prompted SPM-99: Updated EVENT-VIEW traceability, expanded attendee-view test evidence, and repaired fresh database initialization and availability handling.

### 24-09-2026 - Codex - SPM-99
- swr prompted SPM-99: Implemented the attendee event view, lifecycle and registration details, and supporting schema and tests.

## Unknown

### 24-09-2026 - Codex - Unknown
- swr prompted Unknown: Added four fictional local seed events covering event statuses, registration, and accessibility.

### 22-09-2026 - Codex - Unknown
- swr prompted Unknown: Audited backend authentication coverage and added focused coverage tests.

## Archived ticket pointers

### 30-09-2026 - Codex - SPM-30

- swr prompted SPM-30 (Attendee login): Frontend authentication and attendee route controls. [Archive](docs/ai-usage-archives/SPM-30.md)

### 30-09-2026 - Codex - SPM-36

- Ei Chaw Zin prompted SPM-36 (Create and submit an event request): Event request form, submission persistence, and acceptance tests. [Archive](docs/ai-usage-archives/SPM-36.md)

### 30-09-2026 - Codex - SPM-37

- swr and kirub prompted SPM-37 (Save event request as a draft): Draft persistence, resume/edit flows, and related frontend/backend tests. [Archive](docs/ai-usage-archives/SPM-37.md)

### 30-09-2026 - Codex - SPM-38

- chaw678 prompted SPM-38 (Review a submitted request details): Coordinator review access, assignment, and event status handling. [Archive](docs/ai-usage-archives/SPM-38.md)

### 30-09-2026 - Codex - SPM-39

- swr prompted SPM-39 (Request clarification or amendment): Clarification session fixtures and PostgreSQL E2E diagnostics. [Archive](docs/ai-usage-archives/SPM-39.md)

### 30-09-2026 - Codex - SPM-83

- kirub prompted SPM-83 (Reject a request): Rejection validation, API/UI flow, and notification persistence. [Archive](docs/ai-usage-archives/SPM-83.md)

### 30-09-2026 - Codex - SPM-103

- swr prompted SPM-103 (Set up Database for RBAC): PostgreSQL RBAC schema and seed data. [Archive](docs/ai-usage-archives/SPM-103.md)

### 30-09-2026 - Codex - SPM-104

- An unidentified user prompted SPM-104 (Set up Frontend login page): Firebase login, session persistence, and route guards. [Archive](docs/ai-usage-archives/SPM-104.md)

### 30-09-2026 - Codex - SPM-106

- swr prompted SPM-106 (Set up JWT verification and authorization): Bearer-token verification and role-based permissions. [Archive](docs/ai-usage-archives/SPM-106.md)

### 30-09-2026 - Codex - Unknown

- Multiple users prompted unlinked issues: Setup, maintenance, and troubleshooting records. [Archive](docs/ai-usage-archives/unknown.md)

## General

### 13-09-2026 - Codex - General

- Issue/PR: PR #6
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.
- AI contribution: Dependency/configuration fix, CI cleanup, lockfile regeneration, tests, commit, and push.
- Assumptions: The current Vite version's native `resolve.tsconfigPaths` support is the intended replacement.
- Checks run: `npm install --package-lock-only`; `npm ci --ignore-scripts`; `npm test`; workflow YAML validation; `git diff --check`.
- Follow-up/conflict notes: No secret files were included or modified.

### 22-09-2026 - Codex (GPT-5) - General

- Context: User no longer wanted frontend and backend coverage aggregated into one folder; the V8 package and per-component reports remain required.
- Areas touched: root coverage-dashboard documentation and `AI_USAGE.md`.
- Summary: Removed the obsolete root dashboard documentation. The already-removed aggregation scripts and CI dashboard upload are not restored; frontend and backend retain their independent V8 coverage configuration and commands.
- Assumptions: Per-component `coverage/` reports are sufficient for local coverage use.
- Checks: Confirmed the combined dashboard scripts and CI steps are absent while both component coverage configurations remain present.
- Follow-up/conflict notes: No dependency, commit, push, or pull request was removed or created.

### 30-09-2026 - Codex - General

- swr prompted AI usage organization: Grouped ticket histories, standardized headings, and archived nine completed tickets with concise pointers.
- swr prompted agent workflow setup: Added Codex and Claude role adapters and read-only reviewer contracts.
- swr prompted AI usage archive refactor: Moved 72 unlinked records to `unknown.md` and standardized ticket, branch, and General headings.
- swr prompted test verification guidance: Integrated curated case derivation, test quality, traceability, and CI validation rules into the implementation and test-review workflow using the provided prompts and course references.
- swr prompted AI-readable test guidance: Recast shared test rules as `.ai/workflow/test-design-protocol.md` with input contracts, decision tables, review schema, and completion checks; standardized every role prompt's section order.
- swr prompted agent effort alignment: Matched Claude subagent effort frontmatter to Codex role TOMLs and documented that root Agent 5 inherits the active session's effort.
- swr prompted backend E2E environment fix: Updated `test:e2e` to load `backend/.env` into the Vitest process while preserving already-exported shell values.
- swr prompted backend E2E setup alignment: Updated the drafts suite to use the shared `DATABASE_URL`, Nest testing-module lifecycle, and a seeded organiser session for protected routes; schema setup remains with the shared stack.

### 30-09-2026 - Codex - refactor/agent_workflow

- swr prompted test-review workflow feedback: Added per-changed-file unit-test and coverage requirements, separate implementation/test status reporting, and a bounded Agent 5 to Agent 1 repair handoff followed by selective re-review.
- swr prompted independent coverage verification: Require Agent 2 to run each affected component's coverage command and inspect fresh per-file reports; missing coverage evidence blocks that part of review.
- swr prompted frontend/backend organization refactor: Grouped frontend route files and page-only UI by domain/page; grouped backend features by responsibility, with top-level authentication/authorization and feature-local clarifications DTOs/models/repositories; removed confirmed duplicate test cases and updated component guidance.
- swr prompted backend refactor follow-up: Kept the draft PostgreSQL E2E suite beside its module and corrected authentication guidance to match the implemented session-cookie middleware.
- swr prompted frontend coverage preservation: Restored the coordinator review-controls test in its page suite after confirming it had assertions beyond the overlapping SPM-83 test.
- swr prompted frontend test repair: Fixed EventDetailPage imports, merged the three distinct SPM-40 approval cases into its existing suite, and verified all 238 frontend tests pass.
