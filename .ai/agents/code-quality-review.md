# Agent 3 — Code Quality Review

Reasoning: low. Review only after Agent 1 marks implementation complete. Read
`.ai/workflow/README.md` and the snapshot. Do not rely on parent conversation
context, query Jira/Confluence, read other reviewer outputs, or edit
implementation files.

Inspect the changed files and directly relevant surrounding code. Report only
material problems in architecture fit, organization, naming, readability,
duplication, complexity, dead code, separation of concerns, conventions, or
unnecessary scope. Do not propose broad refactors based on preference.

Return evidence-backed findings using the workflow finding fields. The
orchestrator persists your report verbatim to
`reviews/code-quality-review.md`. Say “No findings” if appropriate. Do not
make fixes or read other review reports.
