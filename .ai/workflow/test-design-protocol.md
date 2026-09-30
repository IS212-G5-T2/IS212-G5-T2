# Test Design and Verification Protocol

## Purpose

Use this protocol when implementing or reviewing tests for a Jira ticket. Follow
the steps in order. Apply only the checks relevant to the ticket; do not expand
the test set for completeness alone.

## Inputs

Read the shared ticket snapshot first. Do not fetch Jira or Confluence again
when the snapshot is complete.

| Input | Use |
| --- | --- |
| `context/requirements.md` | Jira acceptance criteria, business rules, constraints, and labeled gaps |
| `context/confluence-test-matrix.md` | Required test coverage and case relationships |
| `context/confluence-test-cases.md` | Specified case IDs, setup, inputs, steps, and expected results |
| `traceability.md` | Existing requirement-to-case-to-test mapping |
| `implementation/implementation-summary.md` | Intended behavior and implementation areas |
| `implementation/changed-files.md` plus repository diff/source | Files and behavior to implement or review |

## Source-of-Truth Rules

1. Jira defines the required product behavior and acceptance criteria.
2. Confluence defines the detailed test cases, data, steps, and expected
   results. Treat each relevant case as a required verification target.
3. Repository behavior and conventions explain how to implement or test the
   requirement; they do not override Jira or Confluence.
4. Generated test ideas are candidates only. Never invent a case ID, input
   constraint, business rule, or expected result.
5. If sources conflict or omit behavior needed for a reliable expected result,
   record the conflict or gap and its confidence. Do not silently choose an
   expected result.

## Agent 1 Procedure — Design and Implement Tests

Perform these steps before marking implementation complete:

1. **Inventory requirements.** List each Jira AC and each relevant Confluence
   case ID. Preserve the source IDs; do not create replacement IDs.
2. **Derive observable checks.** Convert Given to setup/preconditions, When to
   an action with concrete inputs, and Then to an observable output or state
   assertion. Expected values must be supported by Jira, Confluence, or
   established behavior independently of the code under test.
3. **Choose scenarios using the decision table.** Add a scenario only when its
   `Include when` condition applies. Consolidate cases that exercise the same
   behavior without losing requirement or case traceability.
4. **Choose the narrowest suitable test layer.** Use unit tests for isolated
   logic, integration tests for persistence/API/authorization boundaries, and
   browser tests for user workflows that need a real browser. Add another
   layer when a narrower test cannot prove the behavior.
5. **Extend the established suite.** Add cases to the existing behavior-focused
   module/feature suite. Never create a new test file per Jira ticket or
   Confluence case. Follow scoped component instructions. Put the Jira key and
   real Confluence case ID in the test name or a nearby comment where useful.
6. **Make tests diagnostic.** Use reproducible setup, isolated data, meaningful
   assertions, and deterministic outcomes. A plausible incorrect
   implementation should fail the test. Add short comments for test intent and
   important setup/action/assertion sections.
7. **Validate and trace.** Run the relevant local checks. Update `traceability.md`
   to map every AC to its real Confluence case(s), automated test(s), and
   implementation. Use `none identified` where an actual mapping is absent;
   explain relevant manual-only or blocked cases.
8. **Report uncertainty.** Label assumptions and gaps as high, medium, or low
   confidence. Ask for clarification if missing behavior prevents a reliable
   implementation or test oracle. Do not encode speculative behavior as a
   passing assertion.

### Scenario Selection Table

| Priority | Scenario | Include when | Do not add when |
| --- | --- | --- | --- |
| 1 | Happy path | The AC or Confluence case defines successful behavior | Never omit a specified success case without recording why it cannot be automated |
| 2 | Negative/error path | A requirement or case defines rejection, invalid input, failure handling, or denied access | Failure behavior is unspecified and cannot be derived from established behavior |
| 3 | Boundary | A source defines a range, limit, transition, or boundary condition | The boundary value would be guessed |
| 4 | Cross-cutting | The story touches auth, persistence, concurrency, data safety, API integration, accessibility, or another material risk | It is generic project DoD coverage unrelated to this change |
| 5 | Variation | Interacting valid inputs create a material combination risk | It only multiplies permutations without testing a distinct behavior |

For a stated numeric or ordered boundary, consider just below, exactly at, and
just above the limit when each value is valid to test. Use equivalence groups
to avoid redundant inputs. A negative case is not mandatory for an AC that
defines no rejection or failure behavior; record why none applies when review
could reasonably question its absence.

## Agent 2 Procedure — Review Tests Independently

Do not edit implementation files or read another reviewer's output. For each
AC and relevant Confluence case:

1. Confirm the traceability row points to a real test and changed behavior, or
   clearly identifies a gap/manual-only check.
2. Check that setup, data, action, and expected result match the source case.
3. Verify the expected result independently against Jira/Confluence or
   established behavior, not against the implementation alone.
4. Check the scenario selection table for omitted relevant cases and
   unjustified/speculative additions.
5. Check test quality: reproducibility, isolation, deterministic execution,
   meaningful non-vacuous assertions, and whether a plausible faulty
   implementation would fail.
6. Check that tests use the established suite and test layer, and that generic
   project-wide checks are not duplicated without a story-specific reason.
7. Report only actionable gaps or defects with concrete evidence. Separate a
   Confluence specification gap from an implementation/test gap.

## Review Finding Format

Use one finding per issue:

```text
ID: TEST-<number>
Severity: critical | high | medium | low
Requirement / AC: <Jira AC, or none identified>
Confluence case: <actual case ID, or none identified>
Location: <file and line, or runtime artifact>
Problem: <specific missing, incorrect, or weak behavior>
Evidence: <source requirement and observed test/implementation evidence>
Expected behavior: <source-backed outcome; state if underspecified>
Recommendation: <smallest actionable correction>
Confidence: high | medium | low
```

If no actionable issue exists, output exactly `No findings.` Do not report
style preferences or speculative test cases as defects.

## Completion Checks

Agent 1 is complete only when all applicable checks pass or are explicitly
recorded as blocked/not applicable:

- [ ] Every Jira AC is represented in `traceability.md`.
- [ ] Every relevant Confluence case maps to an automated test or has a
      recorded reason it is manual-only, blocked, or not applicable.
- [ ] Tests assert source-backed observable behavior.
- [ ] Existing suite organization is preserved; no ticket-specific test file
      was added.
- [ ] Relevant local test/lint/type/build checks and outcomes are recorded.

Agent 2 review is complete only when each finding follows the format above, or
the report says `No findings.` Coverage percentages alone never establish
completion or test adequacy.

## Reference Materials

The repository-root test-generation prompt, rationale, usage guide, and Week 4
and Week 6 PDFs provide detailed rationale and examples. This protocol is the
operational contract. Consult a specific reference only when a method needs
clarification; do not reread all references for every ticket. The manual test
case execution fields (actual result, pass/fail, execution date) belong to test
management records and are not required in automated test source code.
