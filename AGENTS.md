# AI Agent Instructions

Read this file, search `AI_USAGE.md` only for active overlap relevant to the ticket or affected paths, and read each scoped `AGENTS.md` for files you change. Do not load the complete historical ledger.

## Shared Agent Architecture

`.ai/` is the vendor-neutral source of agent instructions:

```text
.ai/agents/     # role-specific instructions
.ai/workflows/  # workflow sequencing and stage transitions
.ai/schemas/    # shared runtime schemas
.ai/runtime/    # private, temporary ticket context
```

`.claude/agents/` and `.codex/agents/` only point to canonical roles; do not duplicate prompts.

## Runtime Privacy

Keep temporary Jira, Confluence, conversation IDs, and workflow state in `.ai/runtime/{ticket-id}/`. Never stage or commit `.ai/runtime/`. Publish private content only when explicitly instructed and safe.

## Agent Role Boundaries

Read your numbered `.ai/agents/` role file (for example, `03-implementer.md`). `00-orchestrator.md` coordinates implementation; `11-ticket-closeout.md` runs only when the user requests ticket closure; `99-recovery.md` is separate. Respect role permissions and context boundaries, including indirect access to prohibited Confluence-derived cases.

Ticket sequence:

```text
Core: 01 Context Loader → 02 Architecture Planner (when needed) → 03 Implementer → 04 Unit Test Writer → 05 Requirements and Test Reviewer → 08 Delivery Reviewer. Add 06 Code Quality Reviewer for material/risky changes; add 07 Accountability Reviewer after 06 or when explicitly requested.
```

After delivery, run `11 Ticket Closeout` only when the user explicitly names a finished ticket and asks to close it. Register available chat/thread and subagent IDs in private `.ai/runtime/{ticket-id}/conversation-registry.json` during ticket work; never invent IDs. Run `99 Recovery` only for a reported issue or explicit recovery request. Details: `.ai/workflows/jira-ticket.md`.

## Repository Safety

Inspect relevant files; follow established conventions; preserve others' work; keep changes scoped. Change credentials, environment files, or deployment configuration only when required. Never add secrets, tokens, private Jira/Confluence URLs, or confidential data to source control.

## Repository Shape

| Path | Owns | Does not own |
| --- | --- | --- |
| `frontend/` | Client application | Backend logic or shared local tooling |
| `backend/` | Service logic, contracts, persistence, service tests | Frontend UI or shared local tooling |
| `database/` | Local database images and initialization assets | Application persistence code or production database infrastructure |
| `docker-compose/` | Local integration stack and setup | Application feature logic or production infrastructure |
| `.github/workflows/` | Repository CI orchestration | Component-specific test commands or release automation |
| `docs/` | Durable human and process documentation | Dynamic task tracking, source implementation, or secrets |

Each implementation component needs a scoped `AGENTS.md` covering ownership, exclusions, runtime, interfaces, local commands, CI, and coordination.

## Cross-Boundary Changes

Name affected areas and read their scoped instructions first. API work needs frontend and backend guidance; local integration needs `docker-compose/AGENTS.md` and its README; CI work needs `docs/ci-process.md` and the relevant workflow.

## Testing Principles

Test behavior, not coverage numbers. Do not change production behavior solely for tests. Run affected checks; report skips and limits. Derive cases from ACs using `.ai/workflows/test-case-generation.md`. Components own test commands; root CI runs them.

## Code Documentation

Document public APIs and non-obvious domain, business, integration, lifecycle, and security logic in the language's and component's style (such as JSDoc/TSDoc). Explain intent, contracts, constraints, side effects, and errors; avoid comments that restate obvious code or trivial private helpers.

## Git Safety

Stage or commit only if your role permits it. Check `git status` and relevant diffs; stage only task files, never `.ai/runtime/`. Preserve unrelated changes. Rewrite history only when explicitly requested; prefer corrective commits.

## Branching Defaults

Branch from the latest `dev`; target PRs to `dev` (`work branch → dev → main`). For Jira work, use `<type>/<JIRA-key>-<ticket-name-slug>` (for example, `feature/SPM-155-add-event-approval-workflow`). See the canonical Jira workflow for details.

## Documentation Ownership

Use `AGENTS.md` for agent rules, `AI_USAGE.md` for active AI-work overlap only, `README.md` for setup, `HANDOVER.md` for durable context and risks, `CHANGELOG.md` for notable changes, and `docs/` for human process guidance. Use Git history and PRs for completed-work detail. Update the ledger only while work remains active or has an unresolved handoff, then remove the entry after merge/abandonment.

## Scoped Instruction Precedence

Scoped `AGENTS.md` rules govern their files unless an explicit user request conflicts. Resolve conflicts without discarding valid work; prefer a branch version only if directed.
