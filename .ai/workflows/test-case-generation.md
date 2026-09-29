# Test-Case Generation from Acceptance Criteria

Derive reviewable cases from Jira ACs. Cases specify inputs, conditions, steps, and expected results; ACs state outcomes. Map `Given` to preconditions, `When` to steps/data, and `Then` to expected results.

## Input and confidence gate

Use Jira as the requirements source; access Confluence only through private Context Loader artifacts. Before generating cases, state confidence, assumptions, and ambiguities:

- **High:** AC specifies constraints, values, and outcomes.
- **Medium:** behavior is clear; flag assumed constraints.
- **Low:** critical constraints or outcomes are missing; request clarification.

Never pass inferred limits, enum values, behavior, or implementation details off as ticket facts. Keep private content out of tracked files.

## Coverage strategy

Use relevant Confluence cases as the verification baseline. Privately map each to an existing/new automated test, justified manual check, or explicit gap. Cite test file/name or manual rationale; do not omit, duplicate, or claim unsupported coverage.

Independently assess each Jira AC for missing cases in this order:

1. **Happy (`-A`):** one valid golden flow per AC.
2. **Sad (`-B`, `-C`, ...):** each significant validation, business-rule, or failure path; assert rejection, handling, and state preservation where relevant.
3. **Boundary (`-BND-<n>`):** explicit and implicit limits on ranges, lengths, dates, quantities, precision, capacity, transitions, and permissions. Test below/at/above meaningful limits; flag unknown limits instead of inventing them.
4. **Cross-cutting (`-SEC-<n>`, `-PERF-<n>`):** assess auth, data safety, accessibility, pagination/sorting, concurrency, and performance only for story-specific behavior.
5. **Variation (`-VAR-<n>`):** selected valid combinations when fields interact.

Visualize the workflow first. Account for every applicable Confluence case and meaningful AC behavior in the matrix. Code coverage is separate; a percentage cannot prove story coverage. Human-review AI cases, especially implicit negatives and domain boundaries.

## Case format

Preserve existing Confluence Matrix names and IDs. Add a searchable tag: Jira key + zero-padded AC number + variant, such as `SPM-99-AC-01-A`, `SPM-99-AC-01-BND-01`, or `SPM-99-AC-01-SEC-01`. Put it in the case heading and automated test name or nearby comment for workspace search. Each case needs:

- ID and one-sentence scenario.
- Concrete preconditions: deterministic auth, state, fixtures, environment.
- Numbered reproducible steps and checks.
- Test data and labelled assumptions.
- Observable expected results: state, response, error, or persisted data; avoid “works properly.”
- `Actual Result` and status (`Not Executed`, `Passed`, `Failed`, `Blocked`); mark passed only after execution.
- Links to automated tests, limitations, related cases, and environment.
- Created/executed metadata if required by the destination.

Keep case specifications separate from run records; revise on requirement changes and record each run.

## Outputs and use in the agent workflow

Write generated cases to `.ai/runtime/{ticket-id}/generated-test-cases.md` and the matrix to `test-case-coverage.md`, unless explicitly authorized to publish to approved test management. The Test Case Reviewer records gaps and conclusions in `test-review.md`. The Unit Test Writer receives only `independent-test-context.md`, never Confluence or generated artifacts.

Automated tests must follow component guidance, be fast, isolated, repeatable, self-validating, and live beside their behavior. Never alter production behavior just to satisfy generated tests.
