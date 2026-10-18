# AI Usage Log

Record current AI-assisted work in this file. Archive entries under
[`docs/archived/`](docs/archived/README.md) when the user explicitly requests
archival or asks the agent to create a pull request.

Add entries under one date per day, using this format:

```md
## YYYY-MM-DD

- <user or general> - <type> - <Jira ticket or branch name> - <title>: <concise result>
```
Where user is the user's github username.

## 2026-10-18

- taneishakaur - feature - SPM-65 - Review and Approve/Deny a Change Request: Implemented on `feature/SPM-65-Review-and-Approve-Deny-a-Change-Request` (from dev 15e93d1). Backend: read-only conflict preview (venue bookings, equipment, registrations), approve (re-validates, applies through `applyFields`, resets an existing safety check with reason "Change request approved", Confirmed → Planning with status history, stores the re-check list), deny with a 10-500 character reason, re-check tick-off, append-only `event_change_request_audit` (Approved/Denied/Withdrawn/Closed), cancellation closes pending requests, organiser notified of each decision; migration 013 / init 019. Frontend: coordinator pending list, review panel on the event page and Change Requests page, confirmations, re-check list, audit log, organiser decision notices. Tests: backend unit 1590 passed, backend e2e 624 passed (20 new in `change-request-review.e2e-spec.ts`), frontend 1516 passed, TZ matrix passed, changed code at 100% coverage; checked in Chromium with Playwright. Confluence SPM-65 pages and matrix updated with results. Project review subagents not run; nothing committed or pushed.
- taneishakaur - update - SPM-65 - AC11 revised ("A pending request is closed automatically if the organiser withdraws the change request, or the event is cancelled"): behaviour already matched (withdraw → Withdrawn, cancel → Closed; neither can then be decided). Agreed to keep the Withdrawn status. Comments, READMEs and test IDs updated: new REVIEW-CHANGE-12-A (withdrawal), 12-B (cancellation, was 04-E) and 12-C (UI refresh), with a new e2e test for 12-A. Confluence REVIEW-CHANGE-12 page added and the matrix updated. Nothing committed.
- taneishakaur - update - SPM-65 / SPM-64 - Coordinator change request notice: the change request notice is no longer repeated under Assignment Updates; Pending Change Requests moved to the top of the coordinator's events page, with a New tag for requests not yet opened (unread SPM-64 AC3 notice; opening the review marks it read). Backend unchanged (the notice is still stored). Tests: REQ-CHANGE-03-A frontend test revised, REVIEW-CHANGE-01-F added; frontend 1522 passed, TZ matrix passed. Confluence REQ-CHANGE-03 and REVIEW-CHANGE-01 pages and the SPM-65 matrix updated. Nothing committed.
- taneishakaur - fix - SPM-65 - PR #72 review: Approve Change is disabled until the conflict check loads (Retry Conflict Check on failure; Deny unaffected), new REVIEW-CHANGE-03-I tests. Audit log delete limits (ON DELETE CASCADE, no DELETE block) documented in the migration, backend and database READMEs and Confluence 10-D. AC9 venue/technical notifications left for a PO decision (non-blocking). Patch built on PR commit fdef966. Nothing committed.
