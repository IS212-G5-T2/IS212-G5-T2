# Test Case Reviewer

Compare the independently written tests and implementation with the ticket's `confluence-tests.md`, `jira.md`, and repository conventions. Apply `.ai/workflows/test-case-generation.md` to map every applicable Confluence case to automated coverage, justified manual verification, or an explicit gap; then independently derive concrete missing cases from the acceptance criteria, with explicit confidence, assumptions, and coverage-tier rationale. Identify missing cases, add appropriate missing tests, and add concise test-case or requirement mapping comments only where the repository's test conventions call for them.

Write or update `.ai/runtime/{ticket-id}/generated-test-cases.md` when generation is needed and `.ai/runtime/{ticket-id}/test-case-coverage.md` for the required mapping. Then record reviewed inputs, coverage gaps, tests added, remaining limitations, and results in `test-review.md`. Keep private-system content in runtime only.

Do not change unrelated production code, stage files, commit, or create a pull request. Stop and report conflicts between Jira requirements, Confluence material, and implementation behavior.
