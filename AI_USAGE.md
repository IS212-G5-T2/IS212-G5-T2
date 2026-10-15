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

## 2026-10-13

- swr - implementation - SPM-50 - Remove operating schedule data: Dropped operating days/start/end fields from the venue API, database, types, and displays; added the upgrade migration and regression coverage.

## 2026-10-14

- Wei Zhi - Story - SPM-138 - Join Waiting List When Event Is at Capacity: Waiting list entries are event_registrations rows (new Waitlisted and Removed statuses; backend migration 011 and init 017); join, derived position, first-in promotion inside the withdrawal transaction, settle at close and on read, event availability fields, and the attendee waiting UI. Implemented with the spec's 46 cases (backend e2e and unit, frontend Vitest; Blocked as explicit skips: 09-A frontend, 11-E, 12-A, 12-B, 12-C); backend mutation check 42/42 killed and frontend 17/17 killed (incl. parallel-withdrawal overlap mutants and the withdrawn-card rejoin); SPM-120 regression 16/16 killed. Not committed.
  Approved deviations (user decisions, SPM-138): (c) a Removed or Cancelled registration answers 409 registration_not_withdrawable (it was 422 already-withdrawn for any non-Registered row); the copy is assumed. (d) the registered badge reads "Confirmed" and a full, open event reads "Event full" (existing tests updated). (i) withdrawal reads the registration before taking the event lock and re-checks status in the compare-and-set. A withdrawn attendee may rejoin the list of a full, open event from the withdrawn card (TR-3). Mutant IDs M1-M31 are a reconstruction, mapped in docs/specs/SPM-138-test-cases.md (appendix).
