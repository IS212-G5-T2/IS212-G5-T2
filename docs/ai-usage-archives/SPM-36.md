# SPM-36 — Create and submit an event request

Jira status at migration: `Done`. Migrated at the user’s request on 30-09-2026.

## 13-09-2026 - Antigravity (Gemini 3.7 Flash) - SPM-36

- Issue/PR: SPM-36 (https://is212-g5-t2.atlassian.net/browse/SPM-36)
- Human requester/operator: Ei Chaw Zin
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `AI_USAGE.md`.
- Summary: Reverified all 7 Acceptance Criteria for SPM-36, cleaned and consolidated test files into component directories (`apps/frontend/src/` and `services/backend/src/`), removed the legacy root `tests/` directory, verified all 36 backend tests and 12 frontend tests pass cleanly, and prepared the branch and commit for pull request into `dev`.
- AI contribution: Code review, test consolidation, build/lint verification, Jira MCP integration, AI_USAGE tracking.
- Assumptions: Local demo organiser is used pending auth module merge.
- Checks run: `npm test -- --run` in `services/backend` (36 tests passed); `npm test -- --run` in `apps/frontend` (12 tests passed); frontend/backend build and lint passed with 0 errors.
- Follow-up/conflict notes: Prepared `feature/SPM-36-create-and-submit-an-event-request` branch for PR into `dev`.

## 13-09-2026 - Codex (GPT-5) - SPM-36

- Issue/PR: SPM-36.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/pages/EventListPage.test.tsx`, `services/backend/src/events/event-input.spec.ts`, `services/backend/src/events/events.service.spec.ts`, `services/backend/src/events/event-input.ts`, `tests/backend/SPM-36`, `AI_USAGE.md`.
- Summary: Rebuilt the backend validation/service tests beside their source files and cleaned the EventCreatePage/EventListPage page tests beside their React pages, using `SPM-36 Test Case ...` comments directly above each test case or grouped test case.
- AI contribution: Test restructuring, frontend test cleanup, backend validation fix, beginner-oriented explanation.
- Assumptions: User wants each SPM-36 test file reviewed and explained before moving to the next file.
- Checks run: `cd services/backend && npm test -- --run src/events/event-input.spec.ts` passed; `cd services/backend && npm test -- --run src/events/events.service.spec.ts` passed; `cd apps/frontend && npm test -- --run src/pages/EventCreatePage.test.tsx` passed; `cd apps/frontend && npm test -- --run src/pages/EventListPage.test.tsx` passed. Frontend tests emitted React Router non-failing future-flag warnings.
- Follow-up/conflict notes: Existing broader AI_USAGE entry and remaining database SPM-36 test were preserved for later cleanup/review.

## 12-09-2026 - Codex (GPT-6) - SPM-36

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-36 — fetched full story, six AC, comments (none), Medium priority, Sprint 1, In Progress.
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `development/local-dev`.
- Summary: Added a light-mode three-step form, required/invalid field errors, calendar validation that blocks past start dates and non-logical date ranges, PostgreSQL Submitted persistence with duplicate retry protection, confirmation, and API-backed My Events/detail reloads. Added idempotent schema and fictional seed; removed the sign-in display.
- AI contribution: UI/API/SQL implementation, component and integration tests, ticket-based test reorganization under `tests/<technical-layer>/SPM-36`, setup and ownership documentation.
- Assumptions: User explicitly deferred branches, Save Draft, email delivery, and user accounts. Uses a fixed local demo organiser behind an explicit local configuration switch; no account implementation or real email. AC6 confirmation is implemented; its email requirement remains deferred by user instruction.
- Checks run: Frontend build/lint and 7 component interaction tests passed from `tests/frontend/SPM-36`; backend build/lint, 29 unit tests from `services/backend/src` and `tests/backend/SPM-36`, and 2 HTTP tests passed (HTTP tests required local port permission). Docker backend build passed. Live API/PostgreSQL integration passed required-field/invalid-value rejection, Submitted persistence, complete details/list retrieval, retry deduplication, and server-owned status/organiser checks; run-owned records removed. Schema and fictional seed applied to existing local database without reset. Browser-facing gateway returned the saved sample through /api/events. Browser tool reported no available browser, so visual browser QA remains unverified.
- Follow-up/conflict notes: Latest origin/dev and origin/main inspected: neither has working login. No matching local/remote-tracking SPM-36 branch; PR lookup unavailable (no gh/GitHub connector). No branch/commit/push/PR actions for this ticket; existing staged dependency repair preserved, including nested TypeScript entry required by Docker npm 10. Backend rebuilt/restarted; shared stack left running. Docker npm audit reported 4 high findings during install and 3 after production pruning; not addressed in this scope. Integrate teammate's server-authenticated organiser identity later; local demo is not multi-user access control.
