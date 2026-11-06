# SPM-148 test authority and traceability

Status: the 32-case test-case document (`docs/specs/SPM-148-test-cases.md`) is **not in the repository**. Until it is committed, the authority for the SPM-148 tests is the written SPM-148 prompt, as follows.

## Order of authority (from the prompt)

1. Decision Register (D1 to D14, as answered in the session).
2. Acceptance criteria AC1 to AC7 and the notes in the story.
3. Business rules R1 to R12 and the resolved-spec table (prompt sections 2.4 and 2.6).
4. The test-case document, once committed (it is not available yet).
5. Repository naming and paths; Guide examples last.

## Decisions taken by the user in the session

- Submitted events answer 409 to venue booking requests. Venue and equipment requests are allowed only from Planning or later (Approved for the first request).
- Prompt defect resolutions F1 to F25 and open questions Q1 to Q5 were confirmed as proposed, except where recorded in `docs/specs/SPM-148-test-results.md`.

## Where each acceptance criterion is tested

The full mapping of test IDs to assertions, the adaptations and the gap list are in `docs/specs/SPM-148-test-results.md`. Mutation results are reproducible with `backend/scripts/mutation/spm148.mutants.mjs`.

## When the test-case document is committed

Re-check every ID in `docs/specs/SPM-148-test-results.md` against the document, and record any mismatch in that results file.
