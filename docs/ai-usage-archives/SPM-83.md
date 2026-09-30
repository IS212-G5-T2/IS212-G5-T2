# SPM-83 — Reject a request

Jira status at migration: `Done`. Migrated at the user’s request on 30-09-2026.

## 22-09-2026 - Codex (GPT-5) - SPM-83

- Issue/PR: SPM-83 / branch `feature/SPM-83-reject-a-request` (Jira connector unavailable; used the user-supplied acceptance criteria).
- Human requester/operator: kirub
- Areas touched: `apps/frontend/src/pages`, `apps/frontend/src/store`, `services/backend/src/events`, `services/backend/src/app.module.ts`, backend/local database migrations, component documentation, `AI_USAGE.md`.
- Summary: Restored the SPM-83 API and UI integration displaced by the required dev-wins rebase, while preserving SPM-38's verified Firebase ownership, round-robin assignment, and removal of `Under_Review`. Only an assigned coordinator can reject a Submitted request. Rejection records a validated 10–500-character, three-word, letter-containing reason, persists an organiser notification atomically, and follows the `draft → submitted → rejected` timeline. Coordinators open on Submitted pending requests and can find decisions through the Rejected filter.
- AI contribution: Rebase-conflict reconciliation, tests, migration/documentation alignment, local Docker database reset and stack rebuild.
- Assumptions: The user explicitly authorized deletion of the local PostgreSQL volume. The fresh database retains the repository's one built-in fictional sample event. Rejection remains in-app notification only; email is outside the supplied story.
- Checks run: `npm test` in `services/backend` — 427/427 passed; `npm test` in `apps/frontend` — 200/200 passed; production builds passed in both components; backend lint passed. Frontend lint remains blocked by pre-existing unused `hasReplies` in `apps/frontend/src/components/domain/ClarificationThread.tsx`, outside this work. Docker rebuilt/recreated all services; frontend, backend, and PostgreSQL are healthy; `/healthz` returned `status: ok`; database constraints verified for `Submitted`, `Approved`, `Rejected` and a 10–500-character rejected reason.
- Follow-up/conflict notes: No commit, push, or pull request was created. The SPM-83 implementation now deliberately supersedes stale documentation/tests that mentioned `Under_Review` or a 1–2000-character reason.

## 22-09-2026 - Codex (GPT-5) - SPM-83

- Issue/PR: Unknown (user-requested maintenance; branch `feature/SPM-83-reject-a-request`)
- Human requester/operator: kirub
- Areas touched: `services/backend/src/app.module.ts`, `services/backend/src/events`, backend documentation, `AI_USAGE.md`
- Summary: Replaced the separate `pg.Pool` instances in `EventsService` and `DraftsService` with injected `DatabaseService` access. Single statements now use `query()` and multi-step operations use the shared `transaction()` helper, preserving atomic draft submission and rejection workflows. Registered `DatabaseModule` with `AppModule`.
- AI contribution: Dependency wiring, transaction refactor, unit-test migration, and documentation update.
- Assumptions: This request refers to the outstanding shared PostgreSQL-pool migration described in the backend README and handover notes.
- Checks run: `npm test` in `services/backend` — 427/427 passed; `npm run build` passed; `git diff --check` passed.
- Follow-up/conflict notes: Changes are staged for human review only; no commit, push, pull request, or database schema migration was run.


## 21-09-2026 - Codex (GPT-6) - SPM-83

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-83; Reject a request, In Progress, Medium, no comments. All seven Jira AC match the supplied story. Reused feature/SPM-83-reject-a-request; GitHub PR search returned none.
- Areas: frontend request list/detail/store and rejection notifications panel; isolated backend rejection/notification controller and service methods; backend migration and local database initialization; component documentation.
- Summary: Default coordinator pending view to Submitted; require a trimmed 1–2000 character reason; block blank confirmation; persist Rejected/reason and recipient notification atomically with row locking. Return only successful server state to the UI; organiser sees the notification and recorded reason and can persist read state. Existing event, draft, and coordinator-assignment behavior remains unchanged.
- AC review: 1 Submitted default filter; 2 detail rejection dialog; 3/4 required field plus UI/store/server blank validation; 5 persisted status/reason; 6 recipient-scoped persistent in-app notification and detail reason; 7 rejected records excluded from Submitted list. Under_Review is intentionally outside this story's rejection eligibility.
- Checks: Frontend/backend production builds and targeted source lint passed. Independent temporary PostgreSQL verification in a uniquely named schema passed repeatable migration, role isolation, required reason, concurrent decision (one success/one 409), exactly one persisted notification, recipient read-state persistence and complete rollback on notification insertion failure. Verification schema removed; shared records preserved. Playwright with fictional API/auth state verified pending list, blank/whitespace blocking, successful rejection/reason, pending-list removal, organiser notification and its detail link; visually inspected organiser screenshot outside repository. git diff --check passed.
- User constraint: Existing testing code was not read, edited, used as implementation guidance, or executed; user-owned untracked files remain untouched and unstaged. Verification used production builds and temporary independent runtime checks, not the existing unit suites.
- Limits/follow-up: Browser API/auth were mocked; real Firebase cross-account flow not executed. Shared backend container was not redeployed and shared database migration was not applied. Apply migrations/003_event_rejection.sql after clarification schema before using the updated backend. Existing local demo ownership is preserved. In-app delivery only, no email. Changes staged for human review; no commit, push, PR, or Jira status change.

- Workspace recovery: During final handoff, an external operation stashed SPM-83 and switched the shared checkout. Restored the implementation and the user's three untracked test files unchanged, then moved `feature/SPM-83-reject-a-request` into the shared workspace. The test files remain unstaged and were not read.
