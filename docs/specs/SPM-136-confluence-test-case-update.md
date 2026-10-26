# SPM-136 Confluence test-case update: only the assigned Coordinator cancels

Written for: the QA lead and Product Owner who maintain the SPM-136 test cases in the SPM Confluence space.

## Why this update

The product decision changed who may cancel an event. Only the Event Coordinator assigned to the event can cancel it. The submitting Organiser can no longer cancel, and is refused on the server and not offered the action in the UI. The Organiser still receives the cancellation notice.

Jira AC1 now reads: "The Event Coordinator assigned to an event can cancel the event". The Confluence matrix and the CANCEL-EVENT-01 and CANCEL-EVENT-06 pages still describe the Organiser as a canceller and must be changed as below.

The Coordinator's cancel is still confirmed in the dialog and still needs `confirmed: true`. Nothing else in AC2 to AC8 changes.

An event with no assigned Coordinator (for example, Submitted before the Lead assigns one) cannot be cancelled by anyone. This was agreed as acceptable.

## Changes to the matrix page

Page: "Cancel an Event & Release its Reservations Matrix" (page id 23691421).

| Row | Current text | Replace with |
|---|---|---|
| AC1, CANCEL-EVENT-01-A | AC1 — Assigned Coordinator or submitting Organiser can cancel | AC1 — The Event Coordinator assigned to an event can cancel the event |
| AC1, CANCEL-EVENT-01-B | AC1 — Assigned Coordinator or submitting Organiser can cancel | AC1 — The Event Coordinator assigned to an event can cancel the event (the submitting Organiser is refused) |
| AC1, CANCEL-EVENT-01-C | AC1 — Assigned Coordinator or submitting Organiser can cancel | AC1 — The Event Coordinator assigned to an event can cancel the event (no one else can) |

The code-module column is unchanged. CANCEL-EVENT-01-B's module list no longer means the Organiser can cancel; its test verifies the refusal.

## Changes to the CANCEL-EVENT-01 page

Page id 23691532. CANCEL-EVENT-01-A is unchanged. Replace CANCEL-EVENT-01-B and update CANCEL-EVENT-01-C as follows.

### CANCEL-EVENT-01-B (replace the whole case)

| Item | New value |
|---|---|
| Test Case ID | CANCEL-EVENT-01-B |
| Related AC | SPM-136 AC1 |
| Test Scenario | Verify that the Organiser who submitted the event cannot cancel it, even when the event is Confirmed. |
| Pre-conditions | 1. ORG-01 logged in and is the submitter of EVT-301; EVT-301 Confirmed and assigned to COO-01 |
| Test Steps | 1. Open `/events/EVT-301` as ORG-01 and check for a Cancel Event action 2. Send `POST /events/EVT-301/status-change` as ORG-01 with the body below |
| Test Data | `{ "targetStatus": "Cancelled", "confirmed": true }` |
| Expected Result | - Step 1: no Cancel Event action is shown - Step 2: HTTP 403, message "You do not have permission to cancel this event." - EVT-301 stays Confirmed; no reservation released; no status history row written |
| Remarks | Traces SPM-136 AC1. Automation: `backend/test/events-cancel.e2e-spec.ts:320`; `frontend/src/features/events/pages/detail/EventDetailPage.cancel.test.tsx:117`; `frontend/src/features/events/lib/cancellation.test.ts:32`. |

Delete the old expected result that said HTTP 200, status Cancelled, and "audit row actor ORG-01". Delete the old remark that the Coordinator receives the notice "see CANCEL-EVENT-06-A" as part of this case. The notice check now lives in CANCEL-EVENT-06-A.

### CANCEL-EVENT-01-C (update)

| Item | Change |
|---|---|
| Test Steps | Add **Subtest G:** ORG-01 (the submitting Organiser) sends the same cancel request. Subtest F now also checks ORG-01's page. |
| Expected Result | Add "G: HTTP 403 with the same message". Subtest F: "Cancel Event action not shown" applies to COO-02, ORG-02, ORG-01 and LEAD-01. |
| Remarks | Traces SPM-136 AC1. Lead cannot cancel (PO confirmed) `[G11]`. The submitting Organiser cannot cancel (ORG-01 row added with the decision above). Automation: `backend/test/events-cancel.e2e-spec.ts:338` (describe block) and `frontend/src/features/events/pages/detail/EventDetailPage.cancel.test.tsx:134`. |

Keep the Actual Result and Pass/Fail fields as the owner has them. Do not mark the case Passed based on this document.

## Changes to the CANCEL-EVENT-06 page

Page id 23265521. Only CANCEL-EVENT-06-A changes. CANCEL-EVENT-06-B and 06-C are unchanged.

| Field | Current text | Replace with |
|---|---|---|
| Test Scenario | ...the Organiser, the assigned Coordinator and every Confirmed registered Attendee receive an in-app notification, whoever cancels. | ...the Organiser, the assigned Coordinator and every Confirmed registered Attendee receive an in-app notification when the assigned Coordinator cancels. |
| Test Steps, Subtest B | ORG-01 cancels the second EVT-301 clone; note time | COO-01 cancels the second EVT-301 clone; note time |
| Expected Result, Subtest B | COO-01 is notified although the Organiser cancelled | ORG-01 is notified although only the Coordinator can cancel |
| Remarks | Coordinator notification added by PO decision; ... | Keep the existing remark. Add: Subtest B changed 2026-10-26 because the Organiser can no longer cancel. |

The notice check and the 10-second bound are unchanged. The Subtest B cancel is still a separate clone so both subtests have a fresh event.

Automation for this case: `backend/test/events-cancel.e2e-spec.ts:738` (the notification test on two cancelled clones, both cancelled by COO-01) and `backend/test/events-cancel.e2e-spec.ts:762` (the GET `/api/notifications` variant).

## Edit log entry to add on each page

> 26 Oct 2026: Organiser cancellation removed. Only the assigned Coordinator may cancel (SPM-136 AC1 as amended in Jira). Cases updated: matrix AC1 rows; CANCEL-EVENT-01-B replaced; 01-C adds ORG-01; 06-A Subtest B now cancelled by COO-01. Source: `docs/specs/SPM-136-confluence-test-case-update.md`.

## Automated evidence (not a manual result)

The automated cancel suite was run against a fresh database built from `database/postgresql/init` (`spm_cycle`) on commit `061dde1`. `events-cancel.e2e-spec.ts` passed 35 of 35. The waiting-list, cancelled-guard and cancel suites together passed 126 tests, with 1 skipped (the existing `JOIN-WAITLIST-11-E` Blocked case). The full backend unit suite (1785 tests) and frontend unit suite (1794 tests, 1 skipped, 1 todo) also pass.

Do not copy these results into Confluence's Pass/Fail or Executed By fields. The manual cases still need an execution by the owner in the Confluence sense. The automated runs are evidence for the test-workflow records only.

## Not changed by this update

- AC2 to AC8 and their test cases.
- The cancel dialog wording and confirmation rule.
- The Coordinator Lead's refusal (01-C subtest E).
- The matrix's code-module column, except where a row's meaning changes (see above).
