# Test-Case Generation from Acceptance Criteria

Use this workflow to derive reviewable test cases from Jira acceptance criteria. It is the repository's canonical adaptation of the team's test-case-generation guidance. Test cases describe concrete inputs, conditions, steps, and expected results; acceptance criteria describe the high-level outcome. Map `Given` to pre-conditions, `When` to test steps and data, and `Then` to expected results.

## Input and confidence gate

Use the Jira story and acceptance criteria as the primary input. Consult Confluence test material only through the Context Loader's private runtime artifacts. Before generating cases, state one of these confidence levels and list any assumptions or ambiguities:

- **High:** the AC specifies relevant constraints, values, and outcomes.
- **Medium:** the desired behavior is clear but some constraints need explicitly flagged assumptions.
- **Low:** critical constraints or outcomes are missing; request clarification instead of inventing them.

Never present estimated limits, enum values, system behavior, or implementation details as ticket facts. Do not use private Jira or Confluence content in tracked files.

## Coverage strategy

Start with the relevant Confluence cases as the required verification baseline. Build a private coverage matrix that maps every applicable Confluence case to one of: an existing automated test, a newly added automated test, a justified manual-only check, or an explicit gap. Do not silently omit, duplicate, or mark a case as covered without a specific test file and test name or a clear manual rationale.

Then analyze the Jira acceptance criteria independently to find missing cases. For every AC, deliberately assess these tiers in priority order:

1. **Happy path (`-A`):** one clear golden-flow case with valid required values.
2. **Sad paths (`-B`, `-C`, ...):** at least one case for each significant validation, business-rule, or failure behavior; verify specific rejection, error handling, and state preservation where applicable.
3. **Boundary cases (`-BND-<n>`):** identify explicit *and implicit* limits for ranges, lengths, dates, quantities, precision, capacities, state transitions, and permissions. For each meaningful boundary, cover just below, exactly at, and just above it; if a limit is unknown, record the assumption or request clarification rather than inventing one.
4. **Cross-cutting cases (`-SEC-<n>` or `-PERF-<n>`):** assess authentication, authorization, data safety, accessibility, pagination/sorting, concurrency, and performance. Add a case when the story creates feature-specific behavior; do not duplicate generic checks for every story.
5. **Variation cases (`-VAR-<n>`):** add selected valid-value combinations when field interactions make them worthwhile.

Visualize the workflow before deriving cases. Complete test-case coverage means every applicable Confluence case and every meaningful AC-derived behavior has an explicit disposition in the matrix. This is separate from code coverage: aim for complete meaningful coverage of changed code, but never treat a percentage as proof that the test cases cover the story. AI-generated cases require human curation, especially for implicit business-rule negatives and domain boundaries.

## Case format

Use the existing Confluence Matrix naming convention when one exists, and preserve its ID. In addition, assign every case a searchable canonical tag formatted as `SPM-99-AC-01-A`: Jira key, zero-padded acceptance-criterion number, and coverage variant. Use zero-padded numeric variants for lexical search order, for example `SPM-99-AC-01-BND-01` and `SPM-99-AC-01-SEC-01`. Put this tag in the test-case heading and in the corresponding automated test name or its nearby traceability comment, so a workspace-wide VS Code search finds the case, implementation evidence, and tests together. Each case must include:

- Test case ID and a single-sentence scenario.
- Concrete pre-conditions, including deterministic authentication, state, fixtures, and environment needs.
- Numbered, reproducible test steps with result checks.
- Explicit test data and clearly labelled assumptions.
- Specific expected results, such as observable state, assertion, response/status, error message, or persisted data; avoid vague claims such as “works properly.”
- `Actual Result` and execution status (`Not Executed`, `Passed`, `Failed`, or `Blocked`); do not report a case as passed until it has run.
- Remarks linking relevant automated tests, known limitations, related cases, and test environment.
- Created/executed metadata when the team's destination requires it.

Keep the specification separate from its execution records: revise the specification when requirements change, and record each run independently.

## Outputs and use in the agent workflow

Write generated cases only to `.ai/runtime/{ticket-id}/generated-test-cases.md` and the Confluence/AC coverage matrix to `.ai/runtime/{ticket-id}/test-case-coverage.md`, unless the user explicitly directs publication to an approved test-management location. The Test Case Reviewer uses them to identify gaps in Confluence cases and automated coverage; it writes conclusions in `test-review.md`. The Unit Test Writer still receives only `independent-test-context.md`, never Confluence content or these generated private artifacts.

When automating a selected case, follow component guidance and ensure tests are fast, isolated, repeatable, self-validating, and written alongside the behavior they cover. Do not alter production behavior merely to satisfy a generated test.
