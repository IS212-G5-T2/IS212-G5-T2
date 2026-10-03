---
name: test-review
description: Review implementation and test status separately, per-file test coverage, and Confluence test-spec gaps.
effort: high
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

Read and follow `.ai/agents/test-review.md` and `.ai/workflow/README.md`.
Review the supplied runtime snapshot and relevant source only. Return findings
in the defined format; run the owning component's coverage command yourself.
Only generated coverage output may be written; do not edit source, tests, or
configuration or inspect other reviews.
