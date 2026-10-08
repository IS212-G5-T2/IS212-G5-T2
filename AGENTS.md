# Repository AI Agent Instructions

This file defines **shared governance and agent routing**. Load specialized instructions only for the assigned role; do not treat every linked playbook as mandatory context.

## Authority and Routing

- The primary coding-agent session follows [Orchestrator](ai/agents/orchestrator.md): classify the user's request, invoke only relevant agents, and control review transitions. Agents use their own playbooks in `ai/agents/` and the shared [assignment/evidence contract](ai/docs/sub-agents.md). Platform adapters live in `.codex/agents/` and `.claude/agents/`; load available `SKILL.md` workflows only when applicable.
- Current user instructions define task scope; applicable Jira issues define story, acceptance criteria, status, priority, and sprint; relevant current Confluence pages define supporting specifications. Existing code is technical evidence, not authority to invent or override business requirements. Report material conflicts and unavailable sources.
- Read applicable scoped `AGENTS.md` files for every affected component, and relevant `AI_USAGE.md` history before meaningful changes. Scoped instructions define ownership; role playbooks define specialized procedures.

## Repository Ownership

| Path | Responsibility | Excludes |
|---|---|---|
| `frontend/` | Client application/UI | Backend services |
| `backend/` | Services, APIs, persistence, service tests | Frontend UI |
| `docker-compose/` | Local integration stack/setup | Application features or production infrastructure |
| `database/` | Local DB initialization assets | App migrations and backend persistence |
| `.github/workflows/` | Shared CI orchestration | Component-specific test commands |
| `docs/` | Durable repository-wide processes | Dynamic task tracking or implementation code |

This is one GitHub repository. Respect component boundaries; for cross-component work, consult every affected scoped instruction file. New implemented components require a scoped ownership contract as described in the Implementation playbook.

## Shared Safeguards

- Preserve unrelated behavior, public contracts, user/teammate changes, and secrets. Never discard changes or perform destructive operations without authorization.
- Follow the Orchestrator's selected workflow: reviewers are read-only; only authorized implementation work may edit code/tests. Review handoffs, findings, severity, evidence, and completion rules are defined in `ai/docs/sub-agents.md`.
- Do not commit, push, open a PR, or manually transition Jira without required authorization. Jira-governed implementation may proceed in `To Do`, `In Progress`, or `In Review`; detailed branch, PR, automation, and correction rules are in `ai/agents/implementation.md`.
- Never claim a tool, test, connector, reviewer, or check ran unless it did. Record actual verification and limitations; passing tests alone do not prove business correctness.
- Use `AI_USAGE.md` for shared work traceability; role-specific reporting and durable documentation conventions are defined in the appropriate playbooks. Never record secrets or private production data.
