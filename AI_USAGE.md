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

## 2026-10-12

- swr - implementation - SPM-140 - Fix event planning E2E schema path: Corrected the relative path to the repository PostgreSQL schema initialization file.

- tanwz - implementation - SPM-135 - Confirm an Event (Coordinator): Coordinator confirm from Planning with fail-closed readiness, one transaction (status, history, EventConfirmed notification), organiser confirmed-arrangements view and coordinator confirm panel. Iteration 2 (Test Review TR-01 to TR-09 remediation): 39 real-DB e2e, 23 readiness unit, 1167 backend unit, 952 frontend tests (page-level confirm tests added); committed mutation runner `backend/scripts/mutation/spm135.mutants.mjs`, 37 mutants: 32 killed, 5 equivalent, 0 survived. Test Code Review, Requirement Review and Code Quality Review not re-run; see docs/specs/SPM-135-test-results.md.

## 2026-10-13

- tanwz - implementation - feature/SPM-135-Confirm-an-Event - Planning information page redesign: Added the coordinator `PlanningInformationPage` (Event info, Venues, Equipment tabs with status icons, venue/equipment status cards, "confirm no equipment" checkbox, operational safety check section with prerequisites). Backend adds `POST /api/events/:id/confirm-no-equipment` and `POST /api/events/:id/safety-check/request`, a `checklist` block on `GET arrangements-status`, and migration `013_spm135_planning_checklist.sql` (`events.equipment_confirmed_at`, `event_safety_checks`). Confirm Event now appears only once the safety check is approved. Unit tests added (backend 1174, frontend 978 pass); no real-DB e2e for the new endpoints, no independent reviews run, not verified in a browser.

## 2026-10-14

- tanwz - implementation - SPM-135 - Planning checklist and request removal: Planning Information page with per-request venue and equipment status, Remove From List with inline confirmation for unavailable requests (`DELETE /api/events/:id/venue-requests/:id`, `DELETE /api/events/:id/equipment-reservations/:id`), venue label sync across list, details and planning, title-case headings and buttons, and migrations 013 to 016 (planning checklist, safety invalidation, feedback resolution, reset reason). Backend unit 364, backend integration 91, frontend 992 pass; tsc and eslint clean. Not verified in a browser; Test Code Review run after commit; Requirement and Code Quality Reviews not run.
