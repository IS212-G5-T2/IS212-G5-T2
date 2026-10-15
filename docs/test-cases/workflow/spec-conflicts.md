# Spec conflict register

Record a conflict here before any test depends on an expected value whose sources disagree. `OPEN` blocks gate G2 until it is decided. `DECIDED` means the sources were reconciled with a stated basis. `ASSUMED` means the question stays unresolved: the affected tests carry the tag in the `Tag` column and are not reported as passing the requirement until it is. `Confirmed by` records whether the decision has been confirmed by the owner (`pending` is reported as a gap). See `ai/docs/test-workflow.md` section 1.

| ID | Story | Subject | Source A | Source B | Decision | Status | Tag | Confirmed by | Follow-up |
|---|---|---|---|---|---|---|---|---|---|
| SC-001 | SPM-135 | HTTP status when confirming a Rejected or Cancelled event (CONFIRM-EVENT-06-A, CONFIRM-EVENT-06-B) | Confluence case expected result: HTTP 422 with MSG-CF-05 (Jira AC6 gives no status code) | Confluence case execution notes: "HTTP 409 MSG-CF-05" | 422. The case expected result is the oracle. The code returns 422 EVENT_NOT_CONFIRMABLE with the MSG-CF-05 text and the e2e asserts all three. The 409 in the notes belongs to the already-Confirmed case (CONFIRM-EVENT-04-B, EVENT_ALREADY_CONFIRMED). | DECIDED | none (decided, not assumed) | pending (Product Owner) | Correct the two "HTTP 409" lines in the Notes of the Confluence pages CONFIRM-EVENT-06-A and CONFIRM-EVENT-06-B. |
