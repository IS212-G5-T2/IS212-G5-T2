# SPM-37 — Save event request as a draft

Jira status at migration: `Done`. Migrated at the user’s request on 30-09-2026.

## 22-09-2026 - Codex (GPT-5) - SPM-37

- Issue/PR: SPM-37
- Human requester/operator: swr
- Areas touched: `services/backend/test`, `AI_USAGE.md`
- Summary: Replaced the obsolete Firebase-token mock in the event-assignment E2E suite with temporary PostgreSQL users and real login cookies, including cleanup of test users and events.
- AI contribution: Firebase-removal regression diagnosis, E2E fixture migration, and static verification.
- Assumptions: Event route authentication is intentionally backed by the local PostgreSQL session middleware; temporary users are safe to delete after their test events.
- Checks run: Backend lint and build passed; PostgreSQL E2E rerun pending because Docker Desktop is unavailable.
- Follow-up/conflict notes: No commit or push created.

## 21-09-2026 - Codex (GPT-5) - SPM-37

- Issue/PR: SPM-37 / current `fix/SPM-37-Update-Draft-request-workflow` working tree
- Human requester/operator: kirub
- Areas touched: `apps/frontend/src/components/layout/`, `apps/frontend/src/pages/`, `AI_USAGE.md`
- Summary: Reviewed the latest My Requests-to-My Drafts rename and submitted-request filtering. Removed unreachable submitted-row rendering branches, added regressions for the organiser navigation label and submitted-only draft empty state, and expanded form coverage for registration selection and accumulated attachment uploads.
- AI contribution: Test-gap analysis, focused implementation cleanup, regression tests, coverage verification, and build/lint validation.
- Assumptions: Submitted requests are intentionally surfaced only under My Events; `/requests` may still return submitted records and the frontend must filter them defensively.
- Checks run: `npm run test:cov:spm37` (174/174, 100% statements/branches/functions/lines for configured files); `npm test` (174/174); `npm run build` passed; targeted ESLint for all changed frontend files passed; `git diff --check` passed. Full `npm run lint` remains blocked by pre-existing unused variables in `ClarificationThread.tsx:157` and `EventDetailPage.clarifications.test.tsx:8`.
- Follow-up/conflict notes: Preserved the latest Claude Code changes and added coverage around them. No commit, push, pull request, Jira transition, or runtime/database mutation performed.

## 21-09-2026 - Codex (GPT-6) - SPM-37

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; user requested branch maintenance.
- Summary: Rebased fix/SPM-37-Update-Draft-request-workflow from e7a73c6 onto latest origin/dev 90e8a60; resulting HEAD 1f0e67e. Preserved original history at backup/SPM-37-fix-before-rebase-20260921. Initial working tree was clean.
- Conflict resolution: Applied root AGENTS.md dev-wins rule to entire conflicted files: frontend EventListPage.tsx, DraftWorkflow.test.tsx, EventCreatePage.tsx, EventCreatePage.test.tsx, EventDetailPage.tsx, EventListPage.test.tsx; backend README.md, src/app.module.ts, and events drafts.e2e-spec.ts, drafts.service.spec.ts, drafts.service.ts, events.controller.ts, events.service.spec.ts, events.service.ts. Nonconflicting patches replayed normally. No scripts or dependency manifests/lockfiles were lost or changed relative to the backup.
- Checks: Rebase completed, origin/dev is an ancestor, no unresolved index entries, git diff --check passed. Backend unit tests: 385 passed, 1 failed (draft controller/service contract mismatch). Frontend: 151 passed, 11 failed across DraftWorkflow, EventDetailPage and registration suites, plus comments.filter runtime error in a test. Browser/database/build checks not run.
- Follow-up: Rebase is complete but the combined branch is not merge-ready. Dev conflict replacements remove branch-specific authorization/registration behavior while some nonconflicting callers/tests still expect it; reconcile in follow-up implementation work. User subsequently authorized committing this entry and syncing the remote fix branch. Verified remote still equals the pre-rebase backup e7a73c6; publish using an explicit force-with-lease to preserve any concurrent remote updates.

## 20-09-2026 - Gemini 3.8 / Claude Sonnet 4.6 - SPM-37

- Issue/PR: SPM-37 / fix_request_view_logic
- Human requester/operator: kirub
- Areas touched: `services/backend/src/events/`, `services/backend/migrations/`, `development/database/postgresql/init/`, `apps/frontend/src/`, `AI_USAGE.md`
- Summary: Implemented complete role-based request and event viewing logic across backend and frontend:
  1. **Event Organiser & Multi-Role Users (e.g. `org_venue`)**: Full save draft and submission workflow enabled. After submission, events immediately appear under "My Events" (`/events`). Pre-submission drafts are directly editable. Post-submission direct editing is strictly restricted to `name` and `description` ("Save Name/Description Only"); date/time, attendance, venue, and equipment changes must go through coordinator Change Requests. Fixed SQL syntax error in `EventsService.insert` and enhanced `EventsService.list` and `get` to use capability-based `identity.roles.includes(...)` rather than assuming a single primary role.
  2. **Event Coordinator**: The ONLY role with access to the "All Events" oversight page (`/events`) and initial submitted requests (`submitted`, `under_review`) from event organisers. Unassigned events are automatically assigned by the system to an available coordinator (manual self-assignment removed). Assigned coordinator has full operational authority (`Review Event`, `Change Requests`, `Search Venues`). Non-assigned coordinators opening an event receive an immediate pop-up error modal: `"This event has not been assigned to you."` with `[Back to Events]`.
  3. **Venue Staff & Technical Support**: Strictly restricted from the "All Events" page (`/events` or `/`). Venue staff are routed to Venue Catalogue (`/venues`), and Technical Support staff are routed to Equipment Requests (`/equipment/requests`). Route guards (`RootRedirect`, `RequireRole`, and page-level guards) ensure they cannot view or browse raw submitted requests from organisers. Only the assigned coordinator submits formal venue booking requests to Venue Staff and equipment/tech support requests to Technical Support Staff.
  4. **Attendee**: Strictly blocked from unconfirmed requests. Views confirmed events on `/events`. If `registrationEnabled === true` and the attendee has not signed up, prompted to *"Please sign up through the website first to attend this event."* with the `Register` button. If `registrationEnabled === false`, explicitly displays *"Registration through the website is not enabled for this event."* and suppresses registration actions.
  5. **"Register through website"**: Checkbox on Step 0 of `EventCreatePage`, validated in backend `event-input.ts`, and persisted in the PostgreSQL `registration_enabled` column.
- AI contribution: Full-stack diagnosis, implementation plan, database migration, backend validation and query refactoring, frontend form controls, role-scoped filtering, auto-assignment logic, modal pop-up error handling, attendee prompt notices, routing & role guard updates, and comprehensive test suite updates.
- Assumptions: Firebase auth middleware attaches `request.currentUser`. Non-organisers cannot access draft endpoints (403 Forbidden). Venue staff and tech support do not have access to the All Events overview.
- Checks run:
  - Backend unit tests (`npm test` in `services/backend`): 364/364 passed across all 12 test suites.
  - Backend production build (`npm run build` in `services/backend`): completed successfully with zero errors.
  - Docker Compose backend rebuild and frontend restart: running healthy.
  - Frontend production build (`npm run build` in `apps/frontend`): `tsc -b && vite build` completed cleanly with zero errors.
  - Frontend unit tests (`npx vitest run` in `apps/frontend`): 158/158 passed across all 13 test suites.
- Follow-up/conflict notes: None. Staged for human review. No commit or push performed per AGENTS.md Rule 11.

## 20-09-2026 - Codex (GPT-6) - SPM-37

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37. User explicitly requested updates using fix/SPM-37-Update-Draft-request-workflow, commit 4fda7e3f2efa07531b07c648c66c0679fe3334a2.
- Areas: EVE-DRF-01 through EVE-DRF-11 in Confluence folder 10321973; AI_USAGE.md locally.
- Summary: Replaced pre-conditions for all 26 cases with numbered branch-specific setup covering live browser versus mocked component tests, PostgreSQL/schema setup, stubbed token identities, initial fixture state, failure injection and validation helpers. Every case records the branch/commit baseline. Clarified owner-isolation read-back identity; corrected the attachment-count error wording in two procedure steps for consistency with the branch.
- Checks: Inspected fix-branch authentication, draft integration tests, frontend test harnesses, validator and browser spec. Published all 11 pages and read each back to compare with intended HTML. Existing result fields and test IDs preserved; no tests executed or results claimed.
- Follow-up/conflicts: Existing staged ledger entries retained. No application source changes, Jira transitions, commit or push. Ledger staged for human review.

## 19-09-2026 - Claude Opus 4.8 - SPM-37

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (In Progress; seven acceptance criteria; same staged rebuild as the prior Codex/Claude entries above).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `services/backend/src/events/events.service.ts`, `apps/frontend/vitest.spm37.config.ts`, `docs/test-cases/SPM-37_Test-Cases.pdf`, this file.
- Summary: Brought the SPM-37 modules to 100% per-file coverage. Refactored `EventsService.create()` into two explicit paths - a shared-transaction `insert()` reused by draft submission, and an owned BEGIN/COMMIT/ROLLBACK/release path for direct creation - removing a v8 branch-coverage artifact on the previous repeated `if (!transaction)` guards; runtime behaviour is unchanged. Raised `testTimeout`/`hookTimeout` in the frontend SPM-37 coverage config so component tests do not flake under slower coverage instrumentation. Produced the test-case specification PDF and authored the SPM-37 Confluence test cases (EVE-DRF-01..07) in the team's matrix + detail-page format (authored, not yet published to Confluence).
- AI contribution: Coverage-gap diagnosis and behaviour-preserving refactor, coverage-config fix, live test execution across all tiers, test-case authoring and PDF generation.
- Assumptions: The staged local `events/drafts` rebuild is the intended SPM-37 implementation and supersedes the different `event-requests` implementation on the remote branch (`dfc7e64`); replacing the remote requires a `force-with-lease` push and the user's explicit confirmation.
- Checks run: `npm run test:cov:spm37` - backend 260/260 and frontend 68/68, 100% statements/branches/functions/lines for the eight configured source files; backend API/database integration 13/13 against a scratch `spm_test` PostgreSQL; real-browser Playwright `Q2-021` passed headed. Backend `nest build` (Node 24) and oxlint passed.
- Follow-up/conflict notes: No commit or push made this session (user commits manually). Remote `origin/feature/SPM-37-save-event-request-as-a-draft` still holds the older `event-requests`-module implementation; the local rebuild replaces it. `tmp/` holds session scratch (Codex handoff + PDF renders) and must not be committed. Current AC7 is the submitted-draft lockout (older eight-AC / org-isolation wording is superseded).

## 19-09-2026 - Codex (GPT-6) - SPM-37

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37 (live status In Progress; current description has seven acceptance criteria).
- Areas touched: `AI_USAGE.md` only; reviewed staged frontend/backend draft implementation, tests, coverage configuration, migration and test-specification presence.
- Summary: Commit-message feature claims match the inspected implementation. Recommend replacing "complete" test suites with named test types and scoping 100% coverage to the eight configured source files. My Requests currently uses shared demo identity. Saved wizard-step resume is also implemented.
- Checks run: `npm run test:cov:spm37` in frontend (68 tests passed) and backend (260 tests passed); generated summaries confirm 100% statements, branches, functions and lines for all eight included files. Inspected integration and Playwright tests but did not rerun them. Confirmed staged test-case PDF exists.
- Follow-up/conflict notes: Existing staged changes preserved; review entry left unstaged. No implementation changes, commits or pushes. Earlier ledger/test comments referring to eight AC and deferred AC7 reflect older Jira wording; current AC7 is submission lockout.

## 16-09-2026 - Claude Sonnet 5 - SPM-37

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (In Progress; same story as the prior Codex rebuild entry above, which remains staged and unreviewed).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `apps/frontend/src/pages/EventCreatePage.tsx`, `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/types/draft.ts`, `services/backend/src/events/draft-input.ts`, `services/backend/src/events/draft-input.spec.ts`, this file, both apps'/services' `CHANGELOG.md`/`HANDOVER.md`.
- Summary: Picked up an unstaged, undocumented, untested in-progress change (an optional `fields.formStep` on `DraftFields` so reopening a draft resumes the wizard step it was saved on, instead of always restarting at step one) that was left in the working tree after the prior Codex session. Reformatted the two long unwrapped lines in `draft-input.ts`/`EventCreatePage.tsx` to match the repo's Prettier style, added frontend and backend test coverage (save persists `formStep`, reopening resumes the saved step, backend accepts/omits/rejects `formStep` per its 0-2 range), and documented the addition in both changelogs and handover files.
- AI contribution: Code review of pre-existing in-progress diff, test authoring, formatting, documentation.
- Assumptions: The unstaged `formStep` change was intentional in-progress work to continue, not something to discard, since it built cleanly on the already-staged SPM-37 draft feature and matched its patterns. Kept it additive/optional so it does not alter the previously verified SPM-37 acceptance-criteria behavior.
- Checks run: Backend `npm test -- --run` (48/48 passed) and `npm run lint`; frontend `npm test -- --run` (19/19 passed), `npm run lint`, and `npm run build` (passed). Backend `npm run build` failed locally with `ERR_REQUIRE_CYCLE_MODULE` under Node 23.3.0, the same known Nest CLI/Node incompatibility already recorded in the entry above (Node 24 builds cleanly); not re-verified with Node 24 this session.
- Follow-up/conflict notes: Everything from the prior Codex entry above is still staged and unreviewed/uncommitted; this entry's changes are unstaged on top of that. No commits, pushes, or Jira status changes were made. Stage and review together before committing, per this repo's explicit-commit-approval rule.

## 16-09-2026 - Codex (GPT-6) - SPM-37

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; live status In Progress, Medium, Sprint 1, no comments. Read the full story and eight AC. Requester explicitly deferred AC7; implement AC1-6 and AC8.
- Baseline: Reset the existing feature/SPM-37-save-event-request-as-a-draft branch to origin/dev 7bd1193 at the requester's direction. Backup branch backup/SPM-37-before-rebuild-20260916 and stash SPM-37 before clean rebuild 2026-09-16 retain previous work. Tracked feature code was replaced with dev; ignored dependencies, local environment and database data were retained. Remote feature ref remains dfc7e64c225ed7d2aa9bca51cc83a22d3bf76b4f pending user verification/commit approval. Updating that remote after approval will require a guarded history replacement (force-with-lease), not a normal fast-forward push.
- Areas: current frontend event form, My Requests/navigation, backend events/drafts API and migration, component tests/configuration/docs, shared Compose migration mount and setup docs. No unrelated previous draft UI was restored.
- Implementation: Save incomplete drafts at every form step; persist all fields and attachments in PostgreSQL; show confirmation/error with retained input and retry; list/reopen/update the same request with versions and operation identifiers. Submit and permanently lock drafts atomically in the same transaction as the submitted event; preserve the request ID and reject draft edits after submission. AC7 real organisation isolation remains explicitly deferred; all demo visitors share the existing server-side organiser.
- Verification: Frontend component tests 17/17; backend unit tests 43/43; API/database integration 9/9 (seven new draft cases plus two smoke tests); real Chromium flow passed on test frontend :5174/backend :8082 with PostgreSQL spm_test. Browser exercised save, refresh, reopen, repeated updates, simulated 503/retry, attachment/choice persistence, real submission and both UI/API lockout. Desktop and 390px mobile screenshots inspected; no page errors or framework overlay. Integration/browser harnesses remove only their run's records. Frontend production build/lint passed; backend Nest build passed using Node 24.19.0; Node 23.3.0 failed in installed Nest CLI with ERR_REQUIRE_CYCLE_MODULE. Backend lint passed. Git whitespace checks passed.
- Runtime: Docker engine is unavailable; reused the existing persistent embedded PostgreSQL installation at C:/Users/kirub/AppData/Local/SPM-Draft-Postgres on localhost:5432. Applied events schema and additive draft migration to local spm without resetting data. Dependencies were not clean-installed; tests use existing node_modules. Added Playwright dev dependency and lockfile entries without changing existing locked packages.
- Follow-up: GitHub PR lookup through both gh and connector lacked repository access; Jira development metadata reports one open PR, so reuse it after access/approval rather than creating a duplicate. No Jira status changes, commits or pushes. Review locally before authorizing commit and remote feature replacement.
- Final runtime check: frontend http://localhost:5173/events/create, backend health and draft-list endpoint all returned HTTP 200. Frontend :5173, backend :8080 and persistent PostgreSQL :5432 are left running for human verification. Temporary browser test frontend :5174/backend :8082 were stopped. Mobile sidebar is fully hidden after its resize transition; screenshot timing was corrected, with no layout code change required.

## 11-09-2026 - Codex (GPT-6) - SPM-37

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`; shared local PostgreSQL started for integration tests.
- Summary: Implemented PostgreSQL-backed draft create/read/list/update, incomplete fields, repeated saves with retry identity and version conflict handling, My Requests and editable form, save feedback, organisation isolation, and server-side rejection of non-draft writes. Same-organisation draft access follows SPM-94. Week 4's 20 core functions remain release scope.
- Assumptions: Authentication must populate a verified `request.user` containing userId, organisationId, and roles. Default app denies unauthenticated calls; no production auth bypass added. Frontend token-provider hook is an integration seam. Firebase/login/RBAC and submission/change-request workflows remain separate dependencies; request requirement fields are draft text pending catalogue integration.
- Checks run: Node 24 backend build, 13 unit tests, 10 e2e tests including 8 real-PostgreSQL draft tests; frontend TypeScript/Vite build, 8 component tests, frontend ESLint and backend oxlint. Chromium browser checks covered all eight AC scenarios with test-only sessions, loss/retry, blank draft, all-field reopening, organisation isolation, legacy edit URL, and desktop/mobile screenshots. No page runtime errors; expected failure responses were exercised. Real Firebase sign-in/sign-out remains unverified.
- Follow-up/conflict notes: User requires a testing report and explicit 'ok' before preparing review. Nothing staged/committed/pushed; review documentation and handoff deferred. Existing AI_USAGE edits preserved. Test fixture stopped and its five remaining records removed; shared PostgreSQL and normal frontend/backend left running (frontend 127.0.0.1:5174, backend 3000). Default Node 23 fails existing Nest tooling; Node 24 passes. Existing frontend Vite/router dependency audit findings remain; newly added Vitest upgraded to 4.1.11. CI still targets staging and frontend shell executable mode must be set when staging is authorised. Browser plugin skill absent; bundled Playwright used for browser checks.
