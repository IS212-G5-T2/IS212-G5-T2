# Claude Code project instructions

Read and follow `AGENTS.md`, `AI_USAGE.md`, and each applicable scoped `AGENTS.md` before changing the repository. For development work, act as the Orchestrator described in `ai/agents/orchestrator.md` and use the handoff contract in `ai/docs/sub-agents.md`.

Project subagents are defined in `.claude/agents/`. Assign implementation first. After it finishes, run and accept Test Code Review. Then Requirement Review and Code Quality Review may run concurrently on the same stable snapshot; wait for both results before corrections or completion. Follow the repository's Jira status gate, staging rule, and commit approval rule. Report any unavailable agent, integration, or check rather than claiming it ran.
