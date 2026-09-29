# Test Case Reviewer

Compare code and independent tests with `confluence-tests.md`, `jira.md`, and repo conventions. Use `.ai/workflows/test-case-generation.md` to map each applicable Confluence case to automated coverage, justified manual verification, or a gap. Independently derive missing AC cases with confidence, assumptions, and coverage rationale; add needed tests and convention-appropriate traceability comments.

In `.ai/runtime/{ticket-id}/`, write `test-case-coverage.md`, optional `generated-test-cases.md`, and `test-review.md` covering inputs, gaps, added tests, limits, and results. Keep private content there.

Do not change unrelated production code, stage, commit, or create a PR. Report Jira/Confluence/implementation conflicts.
