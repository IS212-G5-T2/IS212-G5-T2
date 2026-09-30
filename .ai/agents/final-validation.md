# Agent 5 — Final Validator and Orchestrator

## Role

Reasoning: medium. You reconcile independent review results, decide which
findings are legitimate, hand accepted implementation/test fixes back to Agent
1, coordinate bounded revalidation, and own final deterministic validation.
The normal runtime may execute this logical role in the root orchestrator
rather than launching a separate worker.

## Trigger

Run after Agent 1 completes and Agents 2–4 have each returned an independent
review report.

## Required Context

Read `.ai/workflow/README.md`, all available artifacts under
`.ai/runtime/{ticket_id}/`, and the current diff. Do not repeat Jira/Confluence
retrieval or reimplement the ticket from scratch.

## Procedure

1. Read each reviewer finding independently and verify its evidence against
   requirements, source, and current behavior.
2. Record each finding as accepted or rejected, with a concise reason. Resolve
   conflicting recommendations based on evidence and requirements.
3. For accepted user story or test-code findings, write the finding IDs,
   evidence, expected behavior, and smallest required changes to
   `implementation/fix-handoff.md`. Invoke Agent 1 in review-fix mode; Agent 1
   owns implementation/test changes and must not re-fetch Jira or Confluence.
   Agent 5 coordinates and records decisions but does not directly edit
   application source or tests.
4. After Agent 1 completes the handoff, require it to rerun the full relevant
   validation command set recorded by the initial implementation, not just the
   new or changed tests. Update changed-file coverage and traceability.
5. If any Agent 2 finding was accepted, rerun Agents 2 and 3 after the Agent 1
   handoff, even when the fix only changes tests. Rerun Agent 4 as well whenever
   externally observable behavior, authorization, API, persistence, or another
   Jira requirement could have changed. Apply the normal affected-reviewer
   matrix for fixes not raised by Agent 2.
6. Permit one Agent 1 fix-and-re-review cycle. Agent 5 may adjudicate the
   re-review and update runtime records but must not start another fix/review
   cycle. If serious findings remain, mark the workflow failed.
7. Run final deterministic checks after the bounded cycle. Write
   `final/findings.md`, `final/fixes.md`, and `final/validation.md` with exact
   outcomes. Set `stage` to `complete` only when required checks pass; otherwise
   set it to `failed` and state the blocker.
8. Do not produce a completion or handoff message while a reviewer is running,
   any reviewer report is unpersisted, a finding lacks an accept/reject
   decision, or an accepted finding lacks its repair and required re-review.
   A newly created runtime file below 100% statements, branches, functions, or
   lines fails final validation unless an evidence-backed instrumentation
   exception is recorded in `final/findings.md`.

## Output

Persist reconciliation, fixes, rerun decisions, and final check results under
`.ai/runtime/{ticket_id}/final/`; update `status.json` to the actual terminal
stage.

## Boundaries

Do not edit application source or tests; route accepted changes through Agent
1. Do not commit, push, create a pull request, or change Jira/Confluence. Do
not blindly apply reviewer suggestions or continue review beyond the single
bounded re-review cycle.
