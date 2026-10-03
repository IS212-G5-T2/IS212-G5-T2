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

1. Jira defines the required user story and acceptance criteria.
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
   every real Confluence case ID checked by a test in a short comment
   immediately above its `it`/`test` declaration, including parameterized
   tests. List multiple IDs on a shared test only when it checks each case.
   If a ticket test has no Confluence case, state that and name its Jira AC or
   regression in the preceding comment. A test title or traceability row does
   not replace the preceding comment.
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

## Changed-File Test and Coverage Contract

Create `implementation/test-coverage.md` for every ticket. List every changed
source file and classify it as runtime behavior, type/declaration-only, or
module wiring. For each runtime-behavior file, record:

- its direct unit-test suite and the test cases that exercise it;
- the relevant Jira AC/Confluence case IDs;
- statement/line, branch, and function coverage for the changed file;
- any supplemental API, database, or browser integration test;
- status: `implemented`, `partially implemented`, `not implemented`, `blocked`,
  or `not applicable`.

The test matrix must distinguish product implementation from test
implementation. A feature can be implemented while its test is missing; report
those as separate statuses rather than calling the feature unimplemented.

Every changed runtime-behavior file needs direct unit coverage in the owning
feature/module suite. In particular, backend controllers and repositories need
their own unit tests: controller tests exercise request-to-service delegation,
identity/body/parameter forwarding, and response/error behavior; repository
tests exercise query parameters, relevant SQL predicates/ordering, row mapping,
empty results, and database errors. Service, validator, and helper files also
need direct tests for their own behavior. API/database/browser tests supplement
these unit tests; they do not replace them where direct unit testing is
practical.

Target 100% statement/line, branch, and function coverage for new or changed
runtime behavior in the ticket's source files. Do not chase 100% for the whole
component just because the ticket touches it. Investigate every uncovered
changed line or branch, add a test when it represents behavior, and record a
specific reason when it is non-executable glue or genuinely not applicable.
Do not mark the implementation complete while changed behavior is uncovered
without an evidence-based exception. Coverage numbers support this review;
they do not replace meaningful assertions or source-case traceability.

Only `*.module.*` dependency-registration files are exempt from direct unit
tests. Still list them in the file matrix and verify their wiring through
relevant consumer/module tests where practical. Type-only interfaces and
declaration-only files have no executable coverage; list them as `not
applicable`, cite the consumer tests and type/build check, and do not create
tests that merely restate a type declaration. Do not create one test file per
Jira ticket or Confluence case; extend the owning behavior-focused suite.

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

Do not edit implementation files or read another reviewer's output. Start the
report with a coverage-status matrix for every Jira AC and relevant Confluence
case. For each row separately classify:

- **Implementation status:** `implemented`, `partially implemented`, `not
  implemented`, `blocked`, or `not applicable`.
- **Test status:** `implemented`, `partially implemented`, `not implemented`,
  `blocked`, or `not applicable`.

Use these statuses based on inspected behavior and evidence. “Test status:
not implemented” means the required automated test is absent or does not
establish the expected result; it does not by itself mean the product feature
is not implemented. State where the two statuses differ.

Then inspect each changed runtime-behavior source file and its direct test
mapping/coverage result. Do not edit implementation files or read another
reviewer's output. For each AC and relevant Confluence case:

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

Before judging changed-file coverage, Agent 2 must run the owning component's
coverage command itself against the frozen implementation. The implementation
coverage matrix is a file inventory and comparison aid, not evidence that
replaces this run. In this repository, run `npm run test:cov` from each
affected `backend/` or `frontend/` directory; for another component, inspect
its package scripts and use its established coverage entrypoint. Do not fetch
Jira or Confluence to do this.

Inspect the fresh command result and its generated per-file report (including
uncovered lines/branches when present) for every changed runtime-behavior file.
Record the exact command, pass/fail result, and the per-file statement/line,
branch, and function percentages in the review. For any claimed exception,
inspect the uncovered locations and cite why they are generated glue or
otherwise non-executable; do not accept an implementation summary's
explanation without independently checking the report. If the command fails,
coverage output is missing/unreadable, or changed files cannot be mapped to
the report, mark coverage review `blocked`, state the reason, and do not treat
Agent 1's numbers or claims as a substitute. Agent 2 may still report other
findings supported by available evidence. Running the established command may
create its normal generated coverage output; Agent 2 must not edit source,
tests, or configuration.

## Review Finding Format

Use one finding per issue:

```text
ID: TEST-<number>
Severity: critical | high | medium | low
Finding type: implementation defect | test coverage gap | test defect | specification gap
Requirement / AC: <Jira AC, or none identified>
Confluence case: <actual case ID, or none identified>
Implementation status: implemented | partially implemented | not implemented | blocked | not applicable
Test status: implemented | partially implemented | not implemented | blocked | not applicable
Location: <file and line, or runtime artifact>
Problem: <specific missing, incorrect, or weak behavior>
Evidence: <source requirement and observed test/implementation evidence>
Expected behavior: <source-backed outcome; state if underspecified>
Recommendation: <smallest actionable correction>
Confidence: high | medium | low
```

If no actionable issue exists, include the completed status matrix and then
write `No findings.` in the findings section. Do not report style preferences
or speculative test cases as defects.

## Completion Checks

Agent 1 is complete only when all applicable checks pass or are explicitly
recorded as blocked/not applicable:

- [ ] Every Jira AC is represented in `traceability.md`.
- [ ] Every changed source file appears in `implementation/test-coverage.md`;
      every changed runtime-behavior file has direct unit-test evidence, except
      `*.module.*` wiring files.
- [ ] Coverage was inspected for changed runtime-behavior files; changed code
      reaches the 100% target or has an evidence-based not-applicable reason.
- [ ] Every relevant Confluence case maps to an automated test or has a
      recorded reason it is manual-only, blocked, or not applicable.
- [ ] Each test claimed by a Confluence mapping has its real Jira key and case
      ID(s) immediately above the test declaration. Partial mappings state the
      uncovered part in that comment and in `traceability.md`.
- [ ] Tests assert source-backed observable behavior.
- [ ] Existing suite organization is preserved; no ticket-specific test file
      was added.
- [ ] Relevant local test/lint/type/build checks and outcomes are recorded.

Agent 2 review is complete only when each finding follows the format above, or
the report says `No findings.` Coverage percentages alone never establish
completion or test adequacy. Also record Agent 2's own coverage command and
result; an unavailable run leaves coverage review blocked even if Agent 1
provided a coverage matrix.

## Reference Materials

The repository-root test-generation prompt, rationale, usage guide, and Week 4
and Week 6 PDFs provide detailed rationale and examples. This protocol is the
operational contract. Consult a specific reference only when a method needs
clarification; do not reread all references for every ticket. The manual test
case execution fields (actual result, pass/fail, execution date) belong to test
management records and are not required in automated test source code.
