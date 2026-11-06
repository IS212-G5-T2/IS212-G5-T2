# Draft replacement description for SPM-190

**Status: not applied.** The Jira write was refused twice by the session's permission
classifier (`External System Writes`), so this is the text that was meant to go into
SPM-190's description on 2026-11-06. Paste it in, or grant
`mcp__claude_ai_Atlassian_MCP__editJiraIssue` and ask for it to be applied. Delete this
file once it is in Jira — Jira is the home for it, not the repository.

---

Satisfies the SPM-168 open-questions list. **Needs the customer, not the codebase.**

**Amended 2026-11-06.** The 28 test cases now exist (SPM-188), so each question's effect is no longer a guess: the list below names the exact case and step each answer changes. Three consequences, each explained in place: the numbering is reconciled with SPM-168, **question 3 now blocks nothing**, and **12 of the 17 requirement gaps are unrecoverable**.

## Why this cannot be answered by reading the code

Every one of these has an answer _as implemented_. Taking that as the expected result makes the test agree with whatever the code already does, so a wrong rule passes its own test. This has already happened on this project: an agent's `<=` versus `<` defect passed CI because its own test repeated the mistake. The previous SPM-168 description reached the same conclusion about its AC3 conflict: _"Confirm which is correct before the AC is treated as met."_

## Numbering, reconciled (read this before working the list)

This ticket previously numbered the questions differently from SPM-168, which swapped two of them. **The SPM-168 order is now authoritative**, is what the 28 test cases cite, and is what the numbering below uses:

| SPM-168 and this list | was, in the earlier SPM-190 numbering | subject |
| --- | --- | --- |
| **Q9** | 10 | preparation versus confirmation |
| **Q10** | 9 | registration wording |

Questions 1 to 8 are unchanged. The E2E test plan has its own eight questions with different numbers again; do not work from those.

## Ask the customer first (cannot be inferred at all)

**Q1. Setup/turnaround boundary.** Is a booking whose setup begins exactly when the previous booking's turnaround ends allowed? Decides `<` versus `<=`. Do not read the current operator out of the conflict query.

- Blocks **E2E-09 step 10** (row A, effective start 12:45 against an occupied end of 12:45), the only row of the boundary table that depends on it. The spec carries `BACK_TO_BACK_ALLOWED = true` as a named constant.
- E2E-01, E2E-07, E2E-10, E2E-11 and E2E-25 all deliberately avoid the touching endpoint and are **not** blocked.
- On record, not an answer: SPM-56's note reads occupied periods as half-open and says the endpoint rule "needs team/PO confirmation before being treated as customer policy"; SC-SPM159-06 (story owner, 2026-10-28) accepted the exclusive predicate. That is a story-owner decision, and the plan itself says "if your customer confirms back-to-back is fine".

**Q2. Safety Officer rejection.** Terminal, or revisable? The database permits a `rejected` safety check; nothing states what that state _means_.

- Blocks **E2E-20 steps 10 and 11**; the spec carries `SAFETY_REJECTION_REVISABLE = true`, which selects between them.
- **E2E-20 is P1, so this blocks no P0.**
- If "revisable", E2E-20 steps 1 to 9 duplicate E2E-19's changes-requested path apart from the decision value and the "all arrangements" scope, and the two should merge with E2E-20 retired. If "terminal", step 11 must be rewritten around a terminal state no story names.

**Q3. Rejection reason length.** The previous AC3 said 1–2000 characters; the application enforces 10–500, at least 3 words, and real words. Which is the requirement?

- **Blocks nothing.** Every case needing a reason chose one valid under both candidate rules: E2E-04 (41 characters, five words), E2E-08 (37, six), E2E-11 (34, six), E2E-25 (28, four), E2E-27 (29, five), E2E-28 (30, five). The length rule itself is not under test anywhere.
- Still worth answering, because nothing will test the rule until it is fixed. It is a missing test, not a blocked one.

## Current behaviour readable, intended behaviour still the customer's call

**Q4. Hold expiry notice lead time.** How long before expiry is the coordinator warned?

- Blocks **E2E-13 (P0)**: the preset seeds a hold at 47 hours so the reminder is due on the first scheduler tick, which only holds while the lead is 48 hours or more. Named constant `REMINDER_LEAD_HOURS = 48`.
- The current value comes from SPM-134 AC1, a story-owner refinement of 4 Nov 2026 that SPM-168 still lists as open.
- E2E-12 states the reminder is not in play (expiry 336 hours out) and is **not** blocked.

**Q5. Cancellation rights.** Who may cancel: organiser, assigned coordinator, Lead? And what are the expected cancellation-request statuses?

- Blocks **E2E-28 (P0) step 6**, the forbidden-actor half, and **E2E-29 row R6**, where the Lead is assumed unable to cancel. Both the positive and forbidden halves depend on it.
- As implemented the organiser requests and the assigned coordinator decides, and the coordinator may also cancel directly. No story gives the Lead a cancel right.
- E2E-16 notes only the actor of its cancel step would change, so it is **not** blocked.

**Q6. Post-confirmation safety re-check.** A trigger already resets the safety check when facilities or accessibility needs change. Must a change to **attendance**, **date** or **venue** also require re-approval?

- Blocks **E2E-23 steps 6, 13 and 14**. **E2E-23 is P1, so this blocks no P0.**
- The code is silent on those three, so answering yes is a **product** change, not a test change, and under the last acceptance criterion it must be raised as its own ticket.
- E2E-19 records this as outside its scope and is **not** blocked. The earlier reference to E2E-24 is dropped: **E2E-24 is excluded from scope** (SPM-188), because its only supporting story, SPM-181, is Cancelled.

**Q7. Notification recipients.** Is the organiser notified on assignment and reassignment?

- Blocks **E2E-01 (P0) step 8** and **E2E-05 (P0) step 7**, and **E2E-06 step 9** (P1). Each currently asserts the **absence** of an organiser notification, which is the stronger test; a "yes" flips the assertion and needs a wording AC that does not exist.
- No story notifies the organiser: SPM-77 AC1 and SPM-47 AC8 name only coordinators.
- The attendee half of this question (are registered attendees notified of a reschedule or venue change?) referred to **E2E-24, which is excluded**. What survives is **E2E-28**'s assumption that Venue Staff and Technical Support are **not** notified on cancellation, which the plan contradicts and no story or notification type supports; see Also carry forward.
- Reconcile against the 14 notification triggers from Week 1.

**Q8. Tentative hold semantics.** Does a hold block a competing request outright, or only warn and let both coexist until one is confirmed?

- Blocks **E2E-12 steps 8 to 10 and 15** (P1) and **E2E-13 (P0) step 11**. Different status code, different UI assertion.
- The stories block outright (SPM-56 AC4, SPM-51 AC7, SPM-159 AC7); the plan says "blocked or warned (per customer rule)". Expired holds do not block under either answer (SPM-56 AC5).

**Q10. Registration wording.** Exact success message, and the exact `Registered` / `Withdrawn` / `Waitlisted` labels. Also what "where session persistence is intended" means for AC1.

- Blocks the text assertions of **E2E-21 (P0 half)** and **E2E-01 (P0) step 32**. Both currently assert that a confirmation message is present and that the stored status is right, not a copied sentence; the literals belong in named constants.
- SPM-61 AC4 says only "a confirmation message".

## Ratification only

**Q9. Preparation versus confirmation.** Three controller routes, two dedicated panels, three backend suites and the plan all treat these as separate steps. Put to the customer as a confirmation, not an open choice: _"The system already separates preparation from confirmation — confirm that is what you want."_

- Affects **E2E-01 (P0)** assumption S5 and **E2E-18 (P0)**, which is written entirely around there being **no** `Preparation` status: the implemented statuses are Submitted, Approved, Rejected, Planning, Confirmed, Completed, Cancelled. E2E-17 and E2E-19 inherit the same mapping.
- Both cases assert Planning plus the SPM-135 readiness conditions, then Confirmed via the Confirm Event action, and neither asserts a status named Preparation.

## Priority: what to ask first

If the customer's time is limited, these seven block a P0 and should be asked first: **Q1, Q4, Q5, Q7, Q8, Q9, Q10**.

These three can wait: **Q2** (E2E-20 is P1), **Q3** (blocks nothing today), **Q6** (E2E-23 is P1, and the answer needs its own ticket either way).

## Also carry forward

**The 17 requirement gaps are mostly unrecoverable, and this ticket should stop implying otherwise.** SPM-188 scope item 5 says to carry them "from comment 10142 rather than from the lost document". Comment 10142 does not hold them: it records only that "17 requirement gaps/clarifications are recorded in the manual suite" and names **five by example** — Completed status, rejected-request resubmission, hold-expiry warnings, organiser-controlled registration, insufficient-equipment outcome. The manual suite it points at is the lost 110-flow document. The recovered 31-flow document carries no requirement-mismatch content at all, by its own header. So **5 of 17 survive as one-line labels and 12 are gone**, including whatever their detail was. Re-deriving them from the code would produce a different list matching nothing SPM-168 cites.

What else comment 10142 still holds, and is not among the ten questions:

- **AC10 clean-up:** there is no delete API, so `E2E ...` test data cannot be removed after a run. Largely answered by SPM-187's disposable database and per-test reset; confirm the AC can be relaxed to "uniquely named test data on a disposable database".
- **Smoke suite:** the AC10 critical-path list should be a named runnable subset (tag `@smoke`). No case carries such a tag today.
- **Evidence:** failed tests should retain a trace and a screenshot.
- **Environment:** the suite needs all migrations applied, a seeded Safety Officer account and a current backend build.
- **Form labels:** exact UI labels and required fields for the event, venue and equipment forms are still unconfirmed, which is why several cases mark their literals as placeholders.

A feature with no defined rule still cannot be asserted.

## Acceptance criteria

- Each of the 10 has a recorded answer, dated, with its source named (customer, brief, or team decision).
- Each affected test's assertion is updated, or recorded as still blocked. The case and step to change are named per question above.
- Where a test is written before its answer arrives, the assumption sits in a named constant at the top of the spec, so a changed answer is a one-line edit rather than a rewrite. `BACK_TO_BACK_ALLOWED`, `REMINDER_LEAD_HOURS` and `SAFETY_REJECTION_REVISABLE` are already specified this way in E2E-09, E2E-13 and E2E-20.
- Any answer that implies a **product** change (notably Q6) is raised as its own ticket, not absorbed into a test.
- The unrecoverable requirement gaps are recorded as unrecoverable rather than silently dropped, and the five surviving labels are either answered or closed as out of scope.
