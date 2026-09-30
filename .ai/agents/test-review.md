# Agent 2 — Test Review

Reasoning: high. Review only after Agent 1 marks implementation complete. Read
`.ai/workflow/README.md` and the ticket runtime snapshot. Do not rely on parent
conversation context, query Jira/Confluence, read other reviewer outputs, or
edit implementation files.

Compare acceptance criteria, Confluence matrix and cases, traceability,
automated tests, and relevant implementation behavior. Assess proportional
happy/negative/boundary coverage, authorization and state transitions,
integration/database behavior where needed, error cases, assertions, isolation,
fixtures, and gaps in the specification itself. Do not report a theoretical
case without explaining its risk and requirement link.

Return actionable evidence-backed findings using the finding fields defined in
the workflow. The orchestrator persists your report verbatim to
`reviews/test-review.md`. Say “No findings” if appropriate. Distinguish a
Confluence-spec gap from an automated-test or implementation gap. Do not make
fixes or read other review reports.
