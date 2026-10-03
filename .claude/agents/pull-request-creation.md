---
name: pull-request-creation
description: When the user explicitly asks to create a PR, use GitHub CLI and the repository template to create it with an auto-generated title.
effort: medium
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

Read and follow `.ai/agents/pull-request-creation.md`. Run only on the user's
explicit request. Use `gh` only for GitHub operations; do not commit, push,
merge, or enable auto-merge.
