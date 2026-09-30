# Shared Agent Workflow

```text
.ai/
├── agents/       # Canonical role instructions
├── workflow/     # Cross-platform stage and artifact contract
└── runtime/      # Temporary per-ticket context, reviews, and validation

.codex/
├── config.toml   # Codex role registrations and concurrency settings
└── agents/       # Per-role Codex TOML settings

.claude/
└── agents/       # Claude Code role adapters
```

- `agents/` contains platform-neutral instructions for each logical role.
- `workflow/README.md` defines the Jira-to-validation stages, shared runtime
  artifact contract, and retry rules.
- `runtime/{ticket_id}/` is temporary per-ticket context and output. It is
  ignored by Git because it may contain Jira and Confluence snapshots.
- `.codex/agents/` and `.claude/agents/` contain native adapters that point
  agents to the shared role instructions. Keep platform-specific settings in
  those adapters and role responsibilities in `agents/`.
- `pull-request-creation` is an opt-in helper that uses GitHub CLI and the
  repository PR template after an explicit user request.
- `ticket-completion` is an opt-in helper that archives one explicitly
  identified ticket's `AI_USAGE.md` section.

When adding a role, update the shared role contract first, then add or update
the native agent adapters for the platforms this repository supports.
