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

- rickyshake3590 - implementation - SPM-136 - Cancel an Event and Release its Reservations: Added the cancellation path (assigned coordinator or submitting organiser, strict confirmation, one transaction with a release registry for venue bookings and holds, equipment reservations, registrations, and EventCancelled notices), the cancelled guard on every existing arrangement mutation, the cancel dialog and page changes, and migrations 011 and 017. Correction cycle 3: Reply and Resolve hidden on cancelled events, dialog focus trap and focus return, retry-after-failure test, released-booking and locked-row fixes, loopback bind for the two SPM-136 e2e suites (TR-136-08 root cause: editor listener on 127.0.0.1), migration supersession note and migration-order README section. Backend app mutants 49 (48 killed, 1 equivalent), triggers 2 and 6 killed, frontend mutants 23 (21 killed, 2 equivalent). Backend unit 1289 passing, backend e2e 395 passing with the 11 pre-existing drafts failures unchanged, frontend 1055 passing; backend and frontend lint and build pass. Not committed. Results in docs/specs/SPM-136-test-results.md.
