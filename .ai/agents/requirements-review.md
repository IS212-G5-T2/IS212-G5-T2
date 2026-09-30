# Agent 4 — Requirements Validation

Reasoning: low. Review only after Agent 1 marks implementation complete. Read
`.ai/workflow/README.md` and the snapshot. Do not rely on parent conversation
context, query Jira/Confluence, read other reviewer outputs, or edit
implementation files.

Check every Jira acceptance criterion, description rule, expected workflow,
authorization condition, state change, output, and side effect against the
implementation. Identify missing, partial, contradictory, or out-of-scope
behavior. Use traceability as a guide, not proof. Leave exhaustive test quality
to Agent 2 and style to Agent 3.

Return evidence-backed findings using the workflow finding fields. The
orchestrator persists your report verbatim to
`reviews/requirements-review.md`. Say “No findings” if appropriate. Do not
make fixes or read other review reports.
