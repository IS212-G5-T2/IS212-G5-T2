# Claude Code project instructions

Read and follow `AGENTS.md`, `AI_USAGE.md`, and each applicable scoped `AGENTS.md` before changing the repository. For development work, act as the Orchestrator described in `ai/agents/orchestrator.md` and use the handoff contract in `ai/docs/sub-agents.md`.

Project subagents are defined in `.claude/agents/`. Assign implementation first. After it finishes, run and accept Test Code Review. Then Requirement Review and Code Quality Review may run concurrently on the same stable snapshot; wait for both results before corrections or completion. Follow the repository's Jira status gate, staging rule, and commit approval rule. Report any unavailable agent, integration, or check rather than claiming it ran.

## Model, effort, and usage budget

Before every subagent launch or follow-up, the Orchestrator assesses that specific assignment and explicitly selects its model and effort. Agent roles do not determine effort: a small Test Review may use low effort, while a difficult implementation may need high effort. The values in `.claude/agents/` are fallback settings, not mandatory choices. Avoid inheriting an expensive session model for unnamed exploration tasks; explicitly choose Haiku/low for simple lookups.

Choose the lowest effort sufficient for the assignment, using a brief assessment rather than a separate planning agent:

| Effort | Assignment characteristics |
|---|---|
| `low` | Clear instructions, local changes, simple lookups, routine checks, or verification of a specific correction with known evidence. |
| `medium` | Several interacting files, nontrivial implementation or test reasoning, or tracing multiple acceptance criteria across code and evidence. |
| `high` | Difficult concurrency, security, transaction, or cross-component reasoning; conflicting technical evidence; or a specific reasoning problem unresolved at medium effort. |

Select the model separately: Haiku for straightforward bounded work, Sonnet for substantial implementation and review, and Opus only when the reasoning demands it. Do not select high effort or Opus merely because the assignment is a review, touches many lines, or belongs to a large story. Do not routinely choose `xhigh` or `max`.

Include `model`, `effort`, and a one-sentence `selection_reason` in each handoff. Apply the selected model and effort through the invocation's actual parameters; prose such as "think harder" does not configure runtime effort. Per-invocation effort requires Claude Code v2.1.292 or later and a model that supports the selected level. If the installed tool does not expose an effort parameter, use the definition's fallback and disclose that runtime selection is unavailable; do not silently edit shared agent definitions to simulate per-invocation selection.

Escalate only for concrete task complexity or an unresolved reasoning problem: first increase low effort to medium or Haiku to Sonnet; reserve Opus or high effort for difficult cross-component reasoning or problems that remain unresolved at Sonnet/medium. State the reason in the handoff and keep the escalation limited to the affected task. A missing source, failed check, or substantiated review finding alone is not a reason to rerun the task on a stronger model. Subagents report a need to escalate to the Orchestrator rather than spawning extra agents or changing their own configuration. Reassess each follow-up so a narrow correction does not automatically retain the previous task's higher effort.

Invoke only the stages required by the request; retain every required gate and its evidence standards. Keep handoffs focused on scope, relevant sources, changed paths, prior findings, and evidence locations. Reuse valid results on an unchanged snapshot and rerun checks only when changes or unresolved evidence justify it. Keep reports concise and load only applicable playbooks and skills.

Agent `effort` defaults do not override `CLAUDE_CODE_EFFORT_LEVEL`; if the runtime still reports high effort, check for that environment override. Verify the actual model and effort in `/tasks` on versions that display them.
