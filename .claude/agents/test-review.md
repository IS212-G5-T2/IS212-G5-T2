---
name: test-review
description: Independently review test coverage and Confluence test-spec gaps.
effort: high
tools:
  - Read
  - Grep
  - Glob
---

Read and follow `.ai/agents/test-review.md` and `.ai/workflow/README.md`.
Review the supplied runtime snapshot and relevant source only. Return findings
in the defined format; do not edit repository files or inspect other reviews.
