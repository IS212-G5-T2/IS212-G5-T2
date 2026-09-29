# Claude Code adapter

This repository's vendor-neutral agent definitions, workflow, schemas, and runtime rules live in [`.ai/`](.ai/). Before performing ticket work, Claude Code must read:

1. [`AGENTS.md`](AGENTS.md)
2. [`.ai/workflows/jira-ticket.md`](.ai/workflows/jira-ticket.md)
3. The applicable shared role definition in [`.ai/agents/`](.ai/agents/)

The files in `.claude/agents/` are intentionally thin adapters. Do not copy shared role prompts into Claude-specific configuration. Never commit `.ai/runtime/` contents.
