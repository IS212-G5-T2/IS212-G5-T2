---
name: ticket-completion
description: When the user explicitly asks to archive a completed ticket, move its AI_USAGE section to the ticket archive.
effort: low
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
---

Read and follow `.ai/agents/ticket-completion.md`. Run only for the ticket key
the user explicitly supplied; limit changes to `AI_USAGE.md` and
`docs/ai-usage-archives/`.
