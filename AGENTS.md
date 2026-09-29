# AI Agent Instructions

These are repository-wide rules. Read this file, the current relevant entries in `AI_USAGE.md`, and every scoped `AGENTS.md` from the repository root to the files you will change.

## Shared Agent Architecture

`.ai/` is the canonical vendor-neutral source for shared agent instructions and process:

```text
.ai/agents/     # role-specific instructions
.ai/workflows/  # workflow sequencing and stage transitions
.ai/schemas/    # shared runtime schemas
.ai/runtime/    # private, temporary ticket context
```

`.claude/agents/` and `.codex/agents/` are thin adapters to the corresponding canonical role files. Do not duplicate full role prompts in vendor-specific configuration.

## Runtime Privacy

Keep temporary Jira, Confluence, and workflow state only in `.ai/runtime/{ticket-id}/`. Never stage or commit `.ai/runtime/`, or expose its content in source control, documentation, commit messages, pull-request descriptions, or public artifacts unless explicitly required and safe.

## Agent Role Boundaries

When operating as a named role, read and obey its numbered canonical file under `.ai/agents/` (for example, `02-implementer.md`). The prefix is the normal workflow order; `00-orchestrator.md` coordinates it and `99-recovery.md` is an exception path. Respect each role's permissions and context boundaries. In particular, an agent forbidden from Confluence-derived test cases must not obtain them indirectly through another runtime artifact.

The high-level ticket sequence is:

```text
01 Context Loader → 02 Implementer → 03 Unit Test Writer → 04 Test Case Reviewer → 05 Requirements Traceability Reviewer → 06 Architecture Reviewer → 07 Code Quality Reviewer → 08 Accountability Reviewer → 09 Change Reviewer → 10 Git Committer
```

`99 Recovery` is separate and runs only for a reported issue or explicit recovery request. The detailed process is `.ai/workflows/jira-ticket.md`.

## Repository Safety

Inspect relevant files before editing; follow established architecture and conventions; keep changes focused; avoid unrelated refactors; and preserve existing user or teammate work. Do not modify credentials, secrets, environment files, or deployment configuration unless explicitly required. Never introduce credentials, API keys, access tokens, private Jira or Confluence URLs, confidential business data, or secrets into source control.

## Repository Shape

| Path | Owns | Does not own |
| --- | --- | --- |
| `frontend/` | Client application | Backend logic or shared local tooling |
| `backend/` | Service logic, contracts, persistence, service tests | Frontend UI or shared local tooling |
| `database/` | Local database images and initialization assets | Application persistence code or production database infrastructure |
| `docker-compose/` | Local integration stack and setup | Application feature logic or production infrastructure |
| `.github/workflows/` | Repository CI orchestration | Component-specific test commands or release automation |
| `docs/` | Durable human and process documentation | Dynamic task tracking, source implementation, or secrets |

Each top-level implementation component must have a scoped `AGENTS.md` defining its ownership, exclusions, runtime, public interfaces, local commands, CI entrypoint, and permitted coordination boundaries.

## Cross-Boundary Changes

Name every affected ownership area and read each scoped `AGENTS.md` before editing. For example, frontend/backend API work requires both component instructions; local integration work requires `docker-compose/AGENTS.md` and its README; CI work requires `docs/ci-process.md` and the relevant workflow.

## Testing Principles

Tests must validate behavior, not merely raise coverage metrics. Do not change production behavior solely to make tests pass. Use meaningful coverage, run affected checks where possible, and report skipped checks and their limitations. Derive reviewable test cases from acceptance criteria using `.ai/workflows/test-case-generation.md`. Components own their local test entrypoints; root CI orchestrates them.

## Code Documentation

Implementation must document public APIs and non-obvious domain, business-rule, integration, lifecycle, or security logic using the documentation convention established by that language and component (for example, JSDoc/TSDoc for TypeScript). Documentation must explain intent, contracts, important constraints, side effects, errors, and non-obvious decisions—not restate self-evident syntax. Follow the component's existing style where one exists; do not add noisy docstrings to trivial private helpers.

## Git Safety

Stage or commit only when the assigned role permits it. Before either action, inspect `git status` and relevant diffs, preserve unrelated working-tree changes, and stage only task files. Never stage `.ai/runtime/`. Do not rewrite history unless explicitly requested; prefer corrective commits over destructive history changes.

## Branching Defaults

`dev` is the normal development base. Start focused work branches from the latest `dev` and target pull requests to `dev`; the usual flow is `work branch → dev → main`. For Jira work, use `<type>/<JIRA-key>-<ticket-name-slug>` (for example, `feature/SPM-155-add-event-approval-workflow`). The canonical Jira workflow defines the detailed branch and pull-request progression.

## Documentation Ownership

`AGENTS.md` holds agent instructions and ownership boundaries; `AI_USAGE.md` is the shared AI-assisted-work ledger and template; `README.md` is the human setup and overview; `HANDOVER.md` records durable technical context and risks; `CHANGELOG.md` records durable notable changes; and `docs/` holds durable human/process documentation such as CI behavior. Follow the ledger requirements before and after meaningful AI-assisted work.

## Scoped Instruction Precedence

More specific scoped `AGENTS.md` instructions govern files within their scope unless they conflict with an explicit user request. Resolve conflicts by understanding both sides and preserving valid work; never automatically prefer one branch's version unless the user or workflow explicitly directs it.
