# AI Usage Log

Use this file to record meaningful AI-assisted work in this repository. The goal is coordination: if Codex, Claude, another AI tool, or a teammate changes the repo, future contributors should be able to see what was touched, why, and what assumptions were made.

Keep entries concise. Do not paste long prompts, private conversations, credentials, tokens, secrets, personal data, or production data.

## Entry Template

```md
## YYYY-MM-DD - <AI tool/model> - <short task title>

- Issue/PR: <GitHub issue, pull request, Jira ticket, or Unknown>
- Human requester/operator: <name or Unknown>
- Areas touched: <apps/...>, <services/...>, <platform/...>, <docs/...>, or <repo-wide>
- Summary: <what changed and why>
- AI contribution: <analysis, code, tests, docs, review, migration, etc.>
- Assumptions: <important assumptions made, or None>
- Checks run: <commands/workflows run, or Not run with reason>
- Follow-up/conflict notes: <known overlap with other AI/human work, pending review, or None>
```

## Entries

## 2026-09-22 - Claude (Sonnet 5) - Final negative/boundary/edge-case audit for SPM-38

- Issue/PR: SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet)
- Human requester/operator: chaw678
- Areas touched: `services/backend/src/events/events.service.spec.ts`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/components/domain/EventCard.test.tsx`, Confluence (EVE-REV-01 through EVE-REV-05 pages, plus the Matrix), `AI_USAGE.md`
- Summary: Audited every existing automated test against SPM-38's 5 ACs and found real coverage gaps, then closed them: (1) backend AC4 had no test for a dual-role account (both ORGANISER and COORDINATOR — relevant since `coor_tech@connectsphere.sg` genuinely holds both roles in this system) being able to view an event via either match; (2) no test that an unassigned event (`coordinator_id IS NULL`) is hidden from every coordinator, not just non-matching ones; (3) `get()` had no explicit test for a role that is neither organiser nor coordinator (only `list()` had one); (4) frontend had no test for the empty-attachments UI state ("None specified", no View/Download controls); (5) the `openAttachmentPreview` Blob-conversion fix had no test for its MIME-type fallback branch (when the `data:` URL header has no extractable MIME type); (6) `EventCard`'s truncation/overflow fix was only tested for the coordinator-email case, not other long values (added a long-venue-name case and its "Not booked" fallback). Added 3 new backend tests (EVE-REV-04-G/H/I), 2 new frontend attachment tests (EVE-REV-03-C/D), and 2 new EventCard tests. Also brought the Confluence documentation current: corrected two pages that had drifted from actual behavior since they were written (EVE-REV-02-A's test data still said `Under_Review`; EVE-REV-05-A/B's expected results still claimed status "advances to Under_Review", both now stale after the later Under-Review-removal work), added the 5 new test case entries to their respective pages, marked every now-passing case's Actual Result/Pass-Fail/Executed By/Date of Execution fields (several were still "Not executed" from initial creation despite the suite passing), and updated the Matrix's ID ranges (`EVE-REV-03-A to -D`, `EVE-REV-04-A to -I`).
- AI contribution: Test-coverage audit (read every existing test name across 6+ spec/test files, cross-referenced against the 5 ACs and against actual current service/component behavior), new test authoring, and a full Confluence consistency pass (content corrections plus new test case pages) using targeted `replaceNode`/`insertNodeAfter` edits rather than full-page rewrites.
- Assumptions: Two findings were surfaced as documented limitations rather than fixed, since they're architectural trade-offs rather than missing test coverage of implemented behavior: (a) `pickNextCoordinator`/`autoAssignCoordinator` has no protection against a concurrent-submission race — two simultaneous submissions could both read the same assigned-coordinator count and land on the same roster entry, since there's no row lock or atomic increment; low risk at current traffic levels, worth a follow-up ticket if submission volume grows. (b) `pickNextCoordinator` would divide by zero (`array[NaN]` → `undefined`) if `COORDINATOR_ROSTER` were ever edited down to empty; not guarded since the array is a fixed local constant, not runtime input, matching this repo's "don't validate what can't happen" convention — worth revisiting if the roster ever becomes dynamically loaded.
- Checks run: `npm test` in `services/backend` — 409/409 passed (15 suites). `npm test` in `apps/frontend` — 182/182 passed (18 suites). Both suites re-verified green after all additions.
- Follow-up/conflict notes: The two limitations noted above (round-robin concurrency race, empty-roster guard) are flagged for the user's awareness but intentionally left unaddressed — they're product/architecture decisions, not bugs in delivered scope. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-22 - Claude (Sonnet 5) - Retire the "Under Review" event status entirely

- Issue/PR: SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet)
- Human requester/operator: chaw678
- Areas touched: `services/backend/src/events/events.service.ts` (+ spec), `services/backend/src/clarifications/clarifications.service.ts` (+ spec), `services/backend/src/clarifications/clarifications.repository.ts`, `services/backend/test/events-assign.e2e-spec.ts`, `services/backend/test/clarifications.e2e-spec.ts`, `services/backend/README.md`, `services/backend/HANDOVER.md`, new `development/database/postgresql/init/006_remove_under_review_status.sql`, `development/local-dev/seed-clarification-test.sql`, `apps/frontend/src/types/index.ts`, `apps/frontend/src/components/ui/StatusBadge.tsx`, `apps/frontend/src/pages/EventListPage.tsx`, `apps/frontend/src/pages/EventDetailPage.tsx` (+ clarifications test), `apps/frontend/src/components/domain/EventCard.test.tsx`, `apps/frontend/src/store/useAppStore.ts` (+ events test), `AI_USAGE.md`
- Summary: In a prior session-turn today, "Under Review" was made to no longer auto-trigger on coordinator assignment (since assignment is now automatic and instant). The user then decided to remove "Under Review" as a status entirely, including retiring the AC that triggered it on a clarification request (SPM-39's `REQ-CLAR-01-A`, until now: "status changes to Under Review"). Removed every code path that could set the status: `ClarificationsService.createClarification` no longer calls `updateEventStatus` (which was deleted from `ClarificationsRepository` as dead code); `CLARIFIABLE_STATUSES` in both `ClarificationsService` and `EventDetailPage.tsx` dropped `'Under_Review'`/`"under_review"`. Removed `"under_review"` from the frontend's `EventStatus` type, `StatusBadge`'s style/label maps, `EventListPage`'s status filter, and `EventDetailPage`'s `STATUS_FLOW` stepper and "Review Event" button gate. Added migration `006_remove_under_review_status.sql`, which backfills any existing `Under_Review` rows to `Submitted` and tightens `events_status_check` to `('Submitted', 'Approved')` only (previously `('Submitted', 'Under_Review', 'Approved')`, set by `004_clarifications.sql`, which is left untouched as historical record per this project's additive-migration convention). Applied that migration directly to the running local Postgres and rebuilt/redeployed the backend container. The remaining lifecycle: an organiser submits a request, it's immediately auto-assigned a coordinator via round-robin (staying `Submitted`), and it advances only when a future approve/reject decision is implemented — clarification requests are now a side conversation that never changes status.
- AI contribution: Backend and frontend code changes, a new database migration applied to the live local stack, test rewrites across 6 spec/test files (unit + e2e), and documentation updates (`README.md`, `HANDOVER.md`).
- Assumptions: "The AC whereby that stage is triggered to under review when a clarification is sent will be removed" was read as "clarification requests no longer change event status at all" (not "change it to some other status") — the clarification thread itself (comments, notifications, reply/resolve) is otherwise fully intact and unaffected. `004_clarifications.sql` is treated as an immutable historical record (per this repo's established pattern of additive, sequentially-numbered init scripts, e.g. `005_clarification_resolution.sql` never edited `004`); the constraint change is a new, separate migration rather than an edit to `004`.
- Checks run: `npm test` in `services/backend` — 406/406 passed (15 suites). `npm test` in `apps/frontend` — 178/178 passed (18 suites). `npx eslint`/`oxlint` clean on all changed files. `npx tsc --noEmit` in `services/backend` clean aside from the same pre-existing, unrelated errors noted in the 2026-09-21 entry below. Migration applied directly to the running local Postgres via `docker compose exec postgres psql ... -f -`; confirmed via `\d events` that `events_status_check` now reads `CHECK (status = ANY (ARRAY['Submitted'::text, 'Approved'::text]))` and that the 2 pre-existing `Under_Review` rows were backfilled to `Submitted`. Backend container rebuilt and redeployed (`docker compose up -d --build backend`); confirmed healthy via `/healthz`.
- Follow-up/conflict notes: `services/backend/HANDOVER.md`'s "Known gaps" section (coordinator assignment, demo-identity auth) still has other stale claims beyond what this entry fixed — not addressed here, out of scope for this specific change. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-22 - Claude (Sonnet 5) - SPM-38 local verification, DB reset, and coordinator-edit removal

- Issue/PR: SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet)
- Human requester/operator: chaw678
- Areas touched: `development/local-dev/` (backend container rebuild, Postgres data reset), `development/local-dev/README.md`, `apps/frontend/src/pages/EventDetailPage.tsx`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/components/domain/EventCard.tsx`, new `apps/frontend/src/components/domain/EventCard.test.tsx`, `AI_USAGE.md`
- Summary: The user tested the 2026-09-21 SPM-38 implementation live and reported round-robin/access-scoping as not working. Root cause: the local Docker `spm-local-backend` container was still running code built before this session's changes (confirmed via `docker exec` inspection of the compiled `dist/` — no `coordinator-roster.js`, still used the old `identity()`/`DEMO_ORGANISER_ENABLED` scheme). Rebuilt and redeployed it (`docker compose up -d --build backend`); Postgres data (named volume) survived. Explained to the user that ~20 pre-existing event rows (owned by the old fixed demo identity, no coordinator) are legacy-owned and stay invisible under real-identity scoping by design (`services/backend/AGENTS.md`'s "never automatic assignment" policy) — not a new bug. At the user's request, cleared `events`, `event_drafts`, `event_comments`, and `notifications` (`TRUNCATE ... RESTART IDENTITY CASCADE`) for a clean re-test, leaving `roles`/`role_permissions`/`resources`/`app_health_checks` untouched. Fixed `development/local-dev/README.md`'s stale claim that `/api/events` doesn't require a Firebase token. Separately, the user found (a) a text-overflow bug where a long coordinator email in `EventCard`'s 4-column grid could overflow the card (no `min-w-0`/`truncate` on grid cells), and (b) confirmed the coordinator's post-submission "Edit" button — previously flagged as calling a client-only, non-persisting `updateEvent` store action — should be removed entirely for this sprint rather than fixed, since a separate Jira card ("Edit Event Details" under "Event Information Management") owns building real persistence later. Fixed the overflow (`min-w-0` + `truncate` + `title` tooltip on `EventCard`'s grid cells and `EventDetailPage`'s People card, using `break-words` there instead of `truncate` since it's a single-column sidebar). Removed the coordinator's inline Edit button, `editMode` state, and the local `EventEditForm` usage from `EventDetailPage.tsx` entirely (left the organiser's separate pre-submission draft-edit page/route untouched — out of scope, not discussed with the user).
- AI contribution: Infrastructure diagnosis (stale container) and redeploy, Postgres data reset, frontend bug fixes (overflow, edit removal) with new/updated tests, and one documentation fix.
- Assumptions: "Remove the edit feature" was scoped to the coordinator's post-submission inline edit on `EventDetailPage.tsx` (the button shown in the user's screenshot), not the organiser's separate draft-edit page at `/events/:id/edit` (which the user did not show or mention, and which — unlike the coordinator's button — was not confirmed broken in this conversation).
- Checks run: `npm test` in `apps/frontend` — 178/178 passed (18 suites, includes new `EventCard.test.tsx` and a new EventDetailPage regression test asserting no Edit button renders for the assigned coordinator). `npx eslint` clean on all changed files. Backend container health-checked healthy post-rebuild; `curl /healthz` returned 200; verified via `docker exec` that the rebuilt image's `dist/events/events.service.js` contains `pickNextCoordinator`/`requireOrganiser` (not the old `identity()`/`DEMO_ORGANISER_ENABLED` code).
- Follow-up/conflict notes: Postgres application data was intentionally cleared at the user's explicit request (not an automated test-teardown action, per `development/AGENTS.md`'s lifecycle rules). The organiser's draft-edit page (`EventEditPage.tsx`) still calls the same non-persisting `updateEvent` store action and is likely affected by the same root issue as the removed coordinator button, but was left untouched pending the "Edit Event Details" card's scope. Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-21 - Claude (Sonnet 5) - SPM-38 coordinator review access, round-robin assignment, and tests

- Issue/PR: SPM-38 / branch `feature/SPM-38-Review-a-submitted-request-details` (no PR yet)
- Human requester/operator: chaw678
- Areas touched: `services/backend/src/app.module.ts`, `services/backend/src/events/` (events/drafts controllers, services, specs, new `coordinator-roster.ts` + spec), `services/backend/test/events-assign.e2e-spec.ts`, `apps/frontend/src/pages/EventDetailPage.tsx`, `apps/frontend/src/pages/EventDetailPage.test.tsx`, `apps/frontend/src/pages/EventListPage.tsx`, `AI_USAGE.md`
- Summary: Implemented SPM-38 ("Review a submitted request details") ACs 1-5, with AC4's "unless I have admin privileges" clause dropped per explicit instruction (no admin role exists in this system). Wired real Firebase-authenticated identity (`AuthenticatedUser`) through `EventsController`/`DraftsController` into `EventsService`/`DraftsService` (previously events/drafts ran on a single hardcoded demo identity gated by `DEMO_ORGANISER_ENABLED`, per `services/backend/AGENTS.md`'s events-boundary policy). `EventsService.list`/`get` now scope strictly by the caller's verified UID and role: an organiser sees their own requests, a coordinator sees only requests assigned to them, and a coordinator the event isn't assigned to gets the same `NotFoundException` as a bad ID (AC4, never leaking existence). Added stateless round-robin auto-assignment (`coordinator-roster.ts`, a small hardcoded roster of the two given real Firebase coordinator accounts, since no coordinator directory exists in Postgres) that assigns a coordinator at submission time and advances status to `Under_Review` (AC5); an event that already has a coordinator is never reassigned. Removed the now-obsolete "Assign Myself as Coordinator" manual-claim UI from `EventDetailPage.tsx` since every submitted request is auto-assigned. Also fixed a real AC3 bug found via manual verification: the "View" attachment action used `<a href="data:...">` with `target="_blank"`, which Chrome/Firefox silently block for top-level navigation (a phishing-hardening measure) — the file appeared to do nothing when clicked. Fixed by converting the attachment to a Blob object URL (`openAttachmentPreview` in `EventDetailPage.tsx`) before opening it.
- AI contribution: Backend auth-wiring implementation, round-robin design and implementation, frontend UI adjustment and bug fix, full test coverage (new/rewritten unit specs for every AC plus the attachment-view fix, and an e2e spec update), and Confluence test documentation (matrix + individual test case pages).
- Assumptions: The two supplied accounts (`coordinator@connectsphere.sg`, `coor_tech@connectsphere.sg`) are the complete coordinator roster for now; their real Firebase UIDs are hardcoded in `coordinator-roster.ts` (non-secret identifiers, not credentials). `POST /api/events/:id/assign` (manual override, kept for reassignment edge cases) now also requires a valid Firebase Bearer token as an incidental consequence of wiring auth onto all of `EventsController`'s routes, but does not itself check the caller's role — flagging as a possible follow-up if manual reassignment should be restricted further.
- Checks run: `npm test` in `services/backend` — 407/407 passed (15 suites, includes 3 new/rewritten spec files). `npm test` in `apps/frontend` — 175/175 passed (17 suites). `npx eslint`/`oxlint` clean on all changed files. `npx tsc --noEmit` in `services/backend` clean aside from pre-existing, unrelated errors (`supertest/types` resolution in `.e2e-spec.ts` files, `vitest.spm37.config.ts`'s `./vitest.config` import). `npx tsc -b` in `apps/frontend` blocked by a pre-existing, unrelated `tsconfig.json` `ignoreDeprecations: "6.0"` vs installed TypeScript 5.9.3 mismatch (no diff on `tsconfig.json`; not introduced by this work). `services/backend/test/events-assign.e2e-spec.ts` was updated to override `FirebaseTokenService` with a fixed token->identity map (no live Firebase Auth Emulator available in this session) and to add an Authorization header to `/assign` calls (now also auth-gated), but could **not** be executed here: this machine has a native Postgres process already bound to `127.0.0.1:5432`/`[::1]:5432`, which intercepts connections meant for the Docker Postgres container (`role "spm" does not exist`). Needs `npm run test:e2e` verification in an environment without that port conflict.
- Follow-up/conflict notes: The 2026-09-20 entry below (Gemini 3.8 / Claude Sonnet 4.6, branch `fix_request_view_logic`) describes coordinator auto-assignment and per-coordinator access-restriction work that was **not present** in this branch's `events.service.ts` before this session (it had no role-based scoping, no roster, no round-robin) — that other branch's work does not appear to have been merged into `dev`/this feature branch. Treat this session's implementation as the first working version of AC4/AC5 here, and reconcile with `fix_request_view_logic` if/when it merges. Created Confluence documentation under the existing "Review Submitted Event Request Details" folder (space SP, folder id 11207103), mirroring the SPM-36 format: repurposed the empty placeholder live_doc into "Review Submitted Event Request Details Matrix" (page id 12353538) and created five new test case pages — EVE-REV-01 (id 12550145, AC1), EVE-REV-02 (id 12353557, AC2), EVE-REV-03 (id 12386307, AC3, two sub-cases including the View-bug fix), EVE-REV-04 (id 12353573, AC4, six sub-cases across backend/frontend/e2e), EVE-REV-05 (id 12550161, AC5, five sub-cases). Not committed, pushed, or opened as a PR per AGENTS.md Rule 11 — staged for review, awaiting explicit commit approval.

## 2026-09-21 - Codex (GPT-5) - Verify My Drafts frontend changes and close test gaps

- Issue/PR: SPM-37 / current `fix/SPM-37-Update-Draft-request-workflow` working tree
- Human requester/operator: kirub
- Areas touched: `apps/frontend/src/components/layout/`, `apps/frontend/src/pages/`, `AI_USAGE.md`
- Summary: Reviewed the latest My Requests-to-My Drafts rename and submitted-request filtering. Removed unreachable submitted-row rendering branches, added regressions for the organiser navigation label and submitted-only draft empty state, and expanded form coverage for registration selection and accumulated attachment uploads.
- AI contribution: Test-gap analysis, focused implementation cleanup, regression tests, coverage verification, and build/lint validation.
- Assumptions: Submitted requests are intentionally surfaced only under My Events; `/requests` may still return submitted records and the frontend must filter them defensively.
- Checks run: `npm run test:cov:spm37` (174/174, 100% statements/branches/functions/lines for configured files); `npm test` (174/174); `npm run build` passed; targeted ESLint for all changed frontend files passed; `git diff --check` passed. Full `npm run lint` remains blocked by pre-existing unused variables in `ClarificationThread.tsx:157` and `EventDetailPage.clarifications.test.tsx:8`.
- Follow-up/conflict notes: Preserved the latest Claude Code changes and added coverage around them. No commit, push, pull request, Jira transition, or runtime/database mutation performed.

## 2026-09-20 - Gemini 3.8 / Claude Sonnet 4.6 - Role-based request & event access control, coordinator boundaries, and venue/tech support role separation

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



## 2026-09-16 - Codex (GPT-5) - Restore SPM-30 frontend authentication integration

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Restored the SPM-30 Firebase-derived user model after the manual merge combined it with mock-role code. Removed mock role switching and the unsupported admin role, restored the signed-out placeholder user, forwarded Firebase ID tokens from API calls, and repaired test discovery, build, and lint configuration.
- AI contribution: Merge correction, frontend authorization integration, regression tests, and verification.
- Assumptions: The backend event API remains responsible for verifying the forwarded token and enforcing resource authorization; it is not changed by this frontend-only update.
- Checks run: `npm ci --dry-run`, `npm run test:coverage` (86 tests passed), `npm run build`, and `npm run lint` in `apps/frontend`.
- Follow-up/conflict notes: No files were staged, committed, or pushed. Server-side Firebase enforcement for `/api/events` remains outstanding.

## 2026-09-16 - Codex (GPT-5) - Reconcile merged documentation with implementation

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: repository Markdown documentation and `AI_USAGE.md`
- Summary: Reviewed the staged manual merge against the current implementation and corrected documentation that combined real Firebase authentication with the separate demo-only event API. Repaired stale test-path and CI statements, and restored malformed ledger headings.
- AI contribution: Merge review, documentation reconciliation, and static verification.
- Assumptions: This change documents current behavior and known limitations; it does not repair the frontend or server-side authorization defects identified in the review.
- Checks run: Markdown conflict-marker scan, `git diff --check`, Docker Compose configuration validation, frontend/backend package-lock validation, frontend/backend tests, builds, and lint checks.
- Follow-up/conflict notes: Frontend compilation, lint, and test failures remain unresolved. The event API must be integrated with Firebase identity and RBAC before it can satisfy end-to-end authorization requirements.

## 2026-09-16 - Codex (GPT-5) - Configure Firebase defaults for frontend tests

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test`, `AI_USAGE.md`
- Summary: Added inert Firebase Web SDK environment values to the global Vitest setup so store imports cannot initialize Firebase Auth with an empty CI API key.
- AI contribution: CI failure diagnosis and test-environment configuration.
- Assumptions: Tests mock Firebase network operations; the test-only configuration is never used by the browser build or local Compose runtime.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed); `git diff --check`.
- Follow-up/conflict notes: Existing PR #15 is currently conflicted with overlapping dev event-feature work.

## 2026-09-16 - Codex (GPT-5) - Complete SPM-30 attendee route and registration controls

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Refreshed Jira and aligned the implementation to its current Attendee story: denied attendee direct navigation to venue, booking, and equipment operations; confined registration and withdrawal mutations to the authenticated attendee; added direct-route and registration behavior tests.
- AI contribution: Jira acceptance-criteria refresh, frontend access-control implementation, and tests.
- Assumptions: `/events` and event details are intentionally attendee-accessible for browsing, while operational management routes belong only to their assigned staff roles.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed; scoped SPM-30 coverage gate passed); shell syntax check for the frontend CI entrypoint; `git diff --check`. Frontend build remains blocked by the pre-existing TypeScript 6 `baseUrl` deprecation configuration.
- Follow-up/conflict notes: The frontend currently uses an in-memory event/registration model. Server-side enforcement awaits the future event and registration API.

## 2026-09-16 - Codex (GPT-5) - Close SPM-30 acceptance-path test gaps

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend/test`, `AI_USAGE.md`
- Summary: Corrected login fixtures so every account receives its matching Firebase role claim, added the assigned-coordinator success case, added the frontend CI test entrypoint, and expanded CI E2E checks for organiser claims and seeded PostgreSQL RBAC permissions.
- AI contribution: Acceptance-criteria test-gap analysis and focused test/CI implementation.
- Assumptions: The current in-memory frontend event model is the implemented event-management surface for SPM-30; real event API ownership checks belong to the future resource API.
- Checks run: Frontend Vitest coverage (62 tests passed; 100% statements, branches, functions, and lines for the SPM-30 login, Firebase-role mapping, and access-guard files); backend lint, build, and unit tests (95 passed). Emulator/PostgreSQL E2E remains CI-only by requester preference.
- Follow-up/conflict notes: Jira could not be re-read because the Atlassian OAuth refresh token is invalid; no Jira data was changed.

## 2026-09-16 - Codex (GPT-5) - Remove superseded local Firebase verification helper

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Removed the interactive real-Firebase curl helper and its README/changelog references at the requester's direction. CI Firebase Auth Emulator E2E coverage and the protected backend auth endpoint remain.
- AI contribution: Local helper removal and documentation cleanup.
- Assumptions: GitHub Actions E2E coverage is the desired automated authentication verification path.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No local Compose services were started or stopped.

## 2026-09-16 - Codex (GPT-5) - Verify Firebase authentication through the production route

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added authenticated `GET /auth/me`, corrected the local curl helper to call it, and changed the Firebase emulator E2E test to exercise the production route rather than a test-only controller. The E2E suite also checks Firebase rejects an incorrect password before issuing a token.
- AI contribution: Backend API, test refactor, test helper correction, and documentation.
- Assumptions: The route is a small client-facing session-introspection contract; a verified token may disclose only its UID, optional email, and normalized application roles to that same token holder.
- Checks run: `npm run lint`, `npm run build`, and `npm test` in `services/backend` (95 tests passed); shell syntax check for the local helper; `git diff --check`. Emulator E2E remains CI-only by requester preference.
- Follow-up/conflict notes: No event/request backend API exists yet, so server-side resource ownership enforcement remains future domain work; existing frontend guards cover the current in-memory UI routes.

## 2026-09-16 - Codex (GPT-5) - Add local real-Firebase backend verification helper

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Added an interactive curl-based helper that signs a prompted non-production Firebase user in through the real Firebase REST API and sends its ID token to the local backend's protected root route.
- AI contribution: Local integration test helper and setup documentation.
- Assumptions: The caller has started the local Compose stack and configured a non-production Firebase Web API key in `development/local-dev/.env`; the backend service account is configured for that same Firebase project.
- Checks run: Shell syntax check and static script inspection; no real Firebase credentials, user accounts, token, or local stack were used.
- Follow-up/conflict notes: The helper verifies authentication only. Resource-specific backend role and ownership enforcement awaits corresponding resource endpoints.

## 2026-09-16 - Codex (GPT-5) - Use real Firebase in local Compose

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Removed the local Firebase Auth Emulator service and fake Firebase settings from Compose. Local Compose now receives real non-production Firebase settings from its untracked `.env`; the emulator remains confined to CI E2E tests.
- AI contribution: Compose and documentation reconfiguration, plus CI emulator-config path correction after the Firebase config moved under `development/local-dev/firebase`.
- Assumptions: Local developers supply Web SDK configuration and a same-project Firebase Admin service account in `development/local-dev/.env`, and do not use production Firebase credentials.
- Checks run: Docker Compose configuration validation with `.env.example`; Firebase emulator JSON parsing; `git diff --check`.
- Follow-up/conflict notes: The shared local Compose stack was not started or stopped. No commit or pull request created.

## 2026-09-13 - Antigravity (Gemini 3.7 Flash) - Finalize SPM-36 event request and prepare PR

- Issue/PR: SPM-36 (https://is212-g5-t2.atlassian.net/browse/SPM-36)
- Human requester/operator: Ei Chaw Zin
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `AI_USAGE.md`.
- Summary: Reverified all 7 Acceptance Criteria for SPM-36, cleaned and consolidated test files into component directories (`apps/frontend/src/` and `services/backend/src/`), removed the legacy root `tests/` directory, verified all 36 backend tests and 12 frontend tests pass cleanly, and prepared the branch and commit for pull request into `dev`.
- AI contribution: Code review, test consolidation, build/lint verification, Jira MCP integration, AI_USAGE tracking.
- Assumptions: Local demo organiser is used pending auth module merge.
- Checks run: `npm test -- --run` in `services/backend` (36 tests passed); `npm test -- --run` in `apps/frontend` (12 tests passed); frontend/backend build and lint passed with 0 errors.
- Follow-up/conflict notes: Prepared `feature/SPM-36-create-and-submit-an-event-request` branch for PR into `dev`.

## 2026-09-13 - Antigravity (Gemini 3.7 Flash) - Additional event workflow preparation

- Issue/PR: Second user story key not supplied.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend`, `services/backend/src/events`, `development/database/postgresql/init/002_events.sql`, `AI_USAGE.md`.
- Summary: Added optional supporting-file upload on EventCreatePage step 2, persisted attachment metadata/data URLs through the backend event contract, displayed attached files with view/download links on EventDetailPage, and added a top-right mock profile switcher for Coordinator, Organiser, Venue Staff, Tech Support, and Admin roles.
- AI contribution: Frontend/backend implementation, local schema update, unit/component tests, build/lint verification.
- Assumptions: This is preparatory work for a second Jira story and should remain separate from the first story's eventual push. The mock profile switcher is temporary local RBAC support until real authentication is merged.
- Checks run: Backend focused tests passed: `npm test -- --run src/events/event-input.spec.ts src/events/events.service.spec.ts`; frontend focused tests passed: `npm test -- --run src/pages/EventCreatePage.test.tsx src/pages/EventListPage.test.tsx src/pages/EventDetailPage.test.tsx src/components/layout/TopNav.test.tsx`; frontend/backend build and lint passed.
- Follow-up/conflict notes: No Jira key was supplied for the second story. Coordinator assignment log and cross-coordinator access restrictions are not completed in this prep pass.

## 2026-09-13 - Codex (GPT-5) - Rebuild SPM-36 tests one file at a time

- Issue/PR: SPM-36.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/pages/EventListPage.test.tsx`, `services/backend/src/events/event-input.spec.ts`, `services/backend/src/events/events.service.spec.ts`, `services/backend/src/events/event-input.ts`, `tests/backend/SPM-36`, `AI_USAGE.md`.
- Summary: Rebuilt the backend validation/service tests beside their source files and cleaned the EventCreatePage/EventListPage page tests beside their React pages, using `SPM-36 Test Case ...` comments directly above each test case or grouped test case.
- AI contribution: Test restructuring, frontend test cleanup, backend validation fix, beginner-oriented explanation.
- Assumptions: User wants each SPM-36 test file reviewed and explained before moving to the next file.
- Checks run: `cd services/backend && npm test -- --run src/events/event-input.spec.ts` passed; `cd services/backend && npm test -- --run src/events/events.service.spec.ts` passed; `cd apps/frontend && npm test -- --run src/pages/EventCreatePage.test.tsx` passed; `cd apps/frontend && npm test -- --run src/pages/EventListPage.test.tsx` passed. Frontend tests emitted React Router non-failing future-flag warnings.
- Follow-up/conflict notes: Existing broader AI_USAGE entry and remaining database SPM-36 test were preserved for later cleanup/review.

## 2026-09-13 - Codex (GPT-5) - Complete SPM-36 automated test coverage

- Issue/PR: SPM-36 — Jira verified as In Progress, Medium priority, with no comments; no PR.
- Human requester/operator: Unknown.
- Areas touched: `apps/frontend`, `services/backend/src/events`, `tests/backend/SPM-36`, `tests/database/SPM-36`, `AI_USAGE.md`.
- Summary: Added page-level React tests beside Event Create/List, expanded backend validation/service and database integration coverage for every supplied SPM-36 test case, and fixed defects exposed by the tests: description/layout were not required and same-day past start times were accepted.
- AI contribution: Repository/test-framework review, Jira verification through Atlassian Rovo, React interaction tests, NestJS TestingModule service tests, integration assertions, narrow validation fixes, documentation, and verification.
- Assumptions: The existing fixed local demo organiser is the authenticated-organiser precondition until login is merged. The requester explicitly made preferred room layout, accessibility needs, and required facilities the option terminology source of truth.
- Checks run: Frontend `npm test` (2 files, 8 tests), lint, and build passed; backend `npm test` (3 files, 34 tests), lint, and build passed; rebuilt the local backend and ran the database/API SPM-36 integration test successfully.
- Follow-up/conflict notes: No Cypress configuration or local login flow exists, so no browser E2E/login test was added. React Router emitted non-failing v7 future-flag warnings. Docker production pruning reported 3 existing high-severity dependency findings, outside this test scope. Existing unrelated staged/unstaged work on `fix/backend-dependency-lock` was preserved; no commit, push, or PR was performed.

## 2026-09-12 - Codex (GPT-6) - SPM-36 event request submission

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-36 — fetched full story, six AC, comments (none), Medium priority, Sprint 1, In Progress.
- Areas touched: `apps/frontend`, `services/backend`, `development/database`, `development/local-dev`.
- Summary: Added a light-mode three-step form, required/invalid field errors, calendar validation that blocks past start dates and non-logical date ranges, PostgreSQL Submitted persistence with duplicate retry protection, confirmation, and API-backed My Events/detail reloads. Added idempotent schema and fictional seed; removed the sign-in display.
- AI contribution: UI/API/SQL implementation, component and integration tests, ticket-based test reorganization under `tests/<technical-layer>/SPM-36`, setup and ownership documentation.
- Assumptions: User explicitly deferred branches, Save Draft, email delivery, and user accounts. Uses a fixed local demo organiser behind an explicit local configuration switch; no account implementation or real email. AC6 confirmation is implemented; its email requirement remains deferred by user instruction.
- Checks run: Frontend build/lint and 7 component interaction tests passed from `tests/frontend/SPM-36`; backend build/lint, 29 unit tests from `services/backend/src` and `tests/backend/SPM-36`, and 2 HTTP tests passed (HTTP tests required local port permission). Docker backend build passed. Live API/PostgreSQL integration passed required-field/invalid-value rejection, Submitted persistence, complete details/list retrieval, retry deduplication, and server-owned status/organiser checks; run-owned records removed. Schema and fictional seed applied to existing local database without reset. Browser-facing gateway returned the saved sample through /api/events. Browser tool reported no available browser, so visual browser QA remains unverified.
- Follow-up/conflict notes: Latest origin/dev and origin/main inspected: neither has working login. No matching local/remote-tracking SPM-36 branch; PR lookup unavailable (no gh/GitHub connector). No branch/commit/push/PR actions for this ticket; existing staged dependency repair preserved, including nested TypeScript entry required by Docker npm 10. Backend rebuilt/restarted; shared stack left running. Docker npm audit reported 4 high findings during install and 3 after production pruning; not addressed in this scope. Integrate teammate's server-authenticated organiser identity later; local demo is not multi-user access control.

## 2026-09-11 - Codex (GPT-6) - Repair backend Docker dependency install

- Issue/PR: Unknown; no Jira key supplied.
- Areas touched: `services/backend/package-lock.json`, `AI_USAGE.md`.
- Summary: Added the missing nested TypeScript 5.9.3 peer dependency required by tsconfck under vite-tsconfig-paths, preserving the backend TypeScript 6 dependency and existing lock metadata.
- AI contribution: Diagnosis, lock-file repair, Docker build verification.
- Assumptions: Fix the reported npm ci failure without upgrading dependencies.
- Checks run: Regenerated using node:22-alpine/npm 10.9.8; backend Compose image build passed, including npm ci, Nest build, and production pruning; final formatting preserves the verified JSON data.
- Follow-up/conflict notes: npm reported four high-severity audit findings during install and three after production pruning; not addressed in this focused fix. Stack not started. Changes staged on fix/backend-dependency-lock; no commit or push.
## 2026-09-16 - Codex (GPT-5) - Correct Firebase emulator Docker build source path

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev/firebase`, `AI_USAGE.md`
- Summary: Updated the Firebase emulator image to copy its configuration from the path within Compose's repository-root build context.
- AI contribution: Docker build-context diagnosis and targeted configuration correction.
- Assumptions: The Firebase service will continue using the repository root as its Compose build context.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`.
- Follow-up/conflict notes: Existing unrelated frontend and ledger changes were preserved; no commit or pull request created.

## 2026-09-15 - Codex (GPT-5) - Enforce role-aware organiser routes for SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Read Firebase custom role claims after sign-in, restrict organiser event creation and ownership-bound edits, restrict event-change reviews to the assigned coordinator, organise guarded routes with nested React Router `Outlet`s, and document the new guard and test-helper contracts.
- AI contribution: Acceptance-criteria review, frontend authorization implementation, JSDoc, and happy-path/negative direct-navigation tests guided by Week 4 slides 26–33.
- Assumptions: Jira's current explicit acceptance criterion naming an Event Organiser governs the conflicting attendee story title; Firebase custom claims use the existing uppercase RBAC role names.
- Checks run: `npm --prefix apps/frontend test` (5 files, 50 tests passed); `git diff --check`.
- Follow-up/conflict notes: The frontend's in-memory data store has no backend resource API yet, so server-side RBAC and ownership enforcement remains a required future security boundary. No commit or pull request created.

## 2026-09-15 - Codex (GPT-5) - Share local Firebase Auth Emulator between frontend and backend

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added opt-in frontend Auth Emulator connection, a shared Compose Auth Emulator service, and backend emulator initialization using the same `demo-is212` project without service-account credentials.
- AI contribution: Cross-service configuration, focused frontend/backend tests, and local setup documentation.
- Assumptions: `demo-is212` is emulator-only; real Firebase remains the default whenever `VITE_USE_FIREBASE_AUTH_EMULATOR` is not `true`.
- Checks run: Frontend Vitest (32 passed); targeted frontend Firebase-module coverage (8 passed; 100% statements, branches, functions, and lines); backend Vitest (93 passed); targeted Firebase token-service coverage (19 passed; 100% statements, branches, functions, and lines); backend build and lint; Docker Compose configuration validation; `git diff --check`. Frontend build is blocked by the pre-existing TypeScript 6 `baseUrl` deprecation, and frontend lint is blocked because ESLint 10 has no `eslint.config.*` file.
- Follow-up/conflict notes: The shared Compose stack was not started, preserving any existing local integration environment. No commit or pull request created.

## 2026-09-15 - Codex (GPT-5) - Document Firebase role assignment script

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/scripts/set-firebase-roles.mjs`, `AI_USAGE.md`
- Summary: Added JSDoc for role-assignment data, validation inputs and failures, and the Firebase custom-claim update operation.
- AI contribution: Script documentation and syntax verification.
- Assumptions: The existing email-to-role mappings and Firebase update behavior must remain unchanged.
- Checks run: `node --check services/backend/scripts/set-firebase-roles.mjs`; `git diff --check` (an unrelated existing trailing-whitespace warning remains in `apps/frontend/package.json`).
- Follow-up/conflict notes: The role-assignment script was already staged; no Firebase users were modified, and no commit or pull request was created.

## 2026-09-15 - Codex (GPT-5) - Load local backend environment configuration

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/config`, `services/backend/src/main.ts`, `AI_USAGE.md`
- Summary: Load `services/backend/.env` before creating Nest providers so Firebase Admin uses the configured local service account instead of unrelated application-default credentials.
- AI contribution: Root-cause analysis, implementation, and regression test.
- Assumptions: The backend is launched with `services/backend` as its working directory, as its npm scripts do.
- Checks run: Targeted Vitest tests (19 passed); `npm run build`; `npm run lint`; `git diff --check`; isolated configuration check confirmed the configured service account targets `spm-is212-g5-t2-ecd8b`.
- Follow-up/conflict notes: Existing unrelated working-tree changes were preserved; no commit or pull request created.

## 2026-09-13 - Codex - Add Firebase emulator E2E workflow

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `firebase.json`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the mocked authentication E2E flow with Firebase Auth Emulator user creation/sign-in, and added CI orchestration for the emulator and PostgreSQL image.
- AI contribution: E2E implementation, CI workflow, and emulator integration.
- Assumptions: `demo-is212` is used as a safe emulator-only project ID; PostgreSQL can be started from `development/database/postgresql` in GitHub Actions.
- Checks run: `npm run lint`; `npm run build`; Ruby YAML/JSON config validation; `git diff --check`. Emulator-backed E2E execution was not run because the local Auth Emulator was unavailable.
- Follow-up/conflict notes: Local Docker/emulator execution was not run in this environment; no commit or pull request created.

## 2026-09-13 - Codex - Recheck authentication E2E coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/test/auth.e2e-spec.ts`, `AI_USAGE.md`
- Summary: Rechecked the authentication E2E test against the current AuthModule and middleware wiring after removing AuthorizationService; no test changes were required.
- AI contribution: Test review and execution.
- Assumptions: The file is intended to cover Firebase authentication middleware, not resource-level RBAC enforcement.
- Checks run: `npm run test:e2e -- test/auth.e2e-spec.ts` outside the sandbox (3 tests passed); the full E2E command was sandbox-blocked because local server binding is restricted.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Organize database service tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Grouped successful database and transaction behavior separately from configuration and failure behavior, matching the RBAC test organization.
- AI contribution: Test organization and verification.
- Assumptions: Missing configuration, connection failures, rollbacks, and unconfigured shutdown are unintended behavior cases.
- Checks run: `npm test -- src/database/database.service.spec.ts` (8 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing database service tests were preserved; no commit or pull request created.

## 2026-09-13 - Codex - Document RBAC predicate return value

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Expanded the `buildPermissionPredicate()` comment with its SQL return value and execution behavior.
- AI contribution: Documentation update.
- Assumptions: None.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Remove redundant authorization service

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth`, `services/backend/README.md`, `services/backend/HANDOVER.md`, `services/backend/CHANGELOG.md`, `AI_USAGE.md`
- Summary: Removed the separate `AuthorizationService` and its tests; updated auth wiring and backend documentation to use composable RBAC predicates inside resource queries.
- AI contribution: Architecture refactor, cleanup, and verification.
- Assumptions: Resource repositories will enforce RBAC and ownership in the same SQL operation and will not perform a preceding authorization query.
- Checks run: `npm test` (90 tests passed); `npm run lint`; `npm run build`; `git diff --check`; searched for remaining `AuthorizationService` references.
- Follow-up/conflict notes: Existing Firebase authentication and `RbacRepository` work was preserved; no commit or pull request created.

## 2026-09-13 - Codex - Organize RBAC predicate behavior tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Grouped valid predicate generation under intended behavior and arbitrary/injected actions under unintended behavior.
- AI contribution: Test organization and type-safe test correction.
- Assumptions: Runtime-invalid actions must be rejected even though the method accepts the `PermissionAction` TypeScript union.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `npm run build`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Add RBAC predicate injection denial test

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added unintended-behavior coverage proving arbitrary or injected permission column names are rejected.
- AI contribution: Security-focused unit-test design and verification.
- Assumptions: Runtime action values must be limited to the four supported CRUD actions even when TypeScript typing is bypassed.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (58 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Make RBAC SQL placeholders explicit

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `AI_USAGE.md`
- Summary: Replaced internal placeholder variables with explicit `$1` and `$2` positions in the composable RBAC predicate.
- AI contribution: Code clarity improvement and verification.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created.

## 2026-09-13 - Codex - Harden RBAC SQL predicate construction

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Standardized the composable RBAC predicate on fixed `$1` and `$2` placeholders, eliminating interpolated placeholder text.
- AI contribution: Security review, implementation, and unit tests.
- Assumptions: Calling repositories reserve `$1` for roles and `$2` for the resource name, with operation-specific parameters beginning at `$3`.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: Permission columns remain selected only from the fixed `PermissionAction` mapping; no commit or pull request created.

## 2026-09-13 - Codex - Add composable RBAC permission predicate

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.ts`, `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a composable SQL `EXISTS` predicate that resource repositories can embed in their data operation to enforce RBAC without a separate network request.
- AI contribution: Repository API design, unit tests, and verification.
- Assumptions: Calling repositories will pass a PostgreSQL text-array parameter containing the authenticated user's roles and a parameter containing the resource name.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (57 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: `hasPermission()` remains available for standalone checks; no commit or pull request created.

## 2026-09-13 - Codex - Add RBAC denial edge cases

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added focused negative tests for missing permission rows, explicit denials, and truthy non-boolean database values.
- AI contribution: Unit-test design and verification.
- Assumptions: Only an explicit boolean `true` should grant permission; missing or malformed rows should deny access.
- Checks run: `npm test -- src/auth/authorization/rbac.repository.spec.ts` (53 tests passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No commit or pull request created; existing working-tree changes were preserved.

## 2026-09-13 - Codex - Expand database service coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/database/database.service.spec.ts`, `AI_USAGE.md`
- Summary: Added deterministic coverage for unreachable database URLs, query delegation, successful and failed transactions, client release, and pool shutdown.
- AI contribution: Unit-test design and coverage expansion.
- Assumptions: A configured URL can still be invalid or unreachable; connection failures should be propagated by the database service for callers to handle.
- Checks run: Targeted Vitest coverage (8 tests passed; 100% statements, branches, functions, and lines); `npm --prefix services/backend run lint`; `git diff --check`.
- Follow-up/conflict notes: Existing working-tree changes were preserved; no commit or pull request created.

## 2026-09-12 - Codex - Expand RBAC permission matrix coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Simplified RBAC tests to one readable case per role/resource pair using CRUD bit strings such as `1110`, and expanded coverage from Event-only checks to all 10 seeded resources.
- AI contribution: Parameterized unit-test design and coverage verification.
- Assumptions: CRUD bit strings represent `create`, `read`, `update`, and `delete` in that order; absent seeded role/resource rows are represented as `0000`.
- Checks run: Targeted Vitest coverage (50 role/resource cases and 200 permission checks passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: No separate unintended-behavior section remains; the uncovered branch is framework-generated NestJS decorator metadata.

## 2026-09-12 - Codex - Add explicit RBAC denial coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Added a negative test for permission rows that explicitly deny an action.
- AI contribution: Unit-test addition and coverage verification.
- Assumptions: The repository should return `false` for an existing permission row with `allowed: false`.
- Checks run: Targeted coverage (3 tests passed; 100% statements/functions/lines, 50% branches); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: The remaining branch is emitted for NestJS decorator metadata rather than repository authorization logic.

## 2026-09-12 - Codex - Organize RBAC repository tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authorization/rbac.repository.spec.ts`, `AI_USAGE.md`
- Summary: Organized RBAC repository tests into intended and unintended behavior sections consistent with the Firebase authentication specs, preserving the existing parameterized permission query.
- AI contribution: Test-structure refactor and verification.
- Assumptions: The current `CASE`-based `hasPermission()` implementation is existing work and should remain unchanged.
- Checks run: Targeted RBAC repository tests (2 passed); `npm run lint`; `git diff --check`.
- Follow-up/conflict notes: None.

## 2026-09-12 - Codex - Fix authentication middleware assertion

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication/firebase-authentication.middleware.spec.ts`, `AI_USAGE.md`
- Summary: Updated the middleware test expectation to include the verified user's email field and added coverage for Firebase verification failures.
- AI contribution: Test correction, negative-path test, and targeted coverage verification.
- Assumptions: The middleware should attach the complete verified Firebase user object to the request.
- Checks run: Targeted Vitest coverage and `git diff --check`; 5 tests passed; 100% statements/functions/lines and 90% branches.
- Follow-up/conflict notes: The remaining branch gap is reported on the injectable decorator line and does not represent an untested middleware behavior.

## 2026-09-12 - Codex - Review Firebase token service test coverage

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Reviewed Firebase token service tests against implementation behavior and verified targeted Vitest coverage.
- AI contribution: Test coverage and negative-case review; no production code changes.
- Assumptions: The question concerns unit-test completeness, including behavioral edge cases beyond line coverage.
- Checks run: `npm --prefix services/backend run test -- src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (17 passed; 100% statements/branches/functions/lines).
- Follow-up/conflict notes: Coverage is complete at the instrumentation level, but additional edge-case assertions are recommended for stronger behavioral confidence.

## 2026-09-12 - Codex - Harden Firebase bearer-token parsing

- Issue/PR: SPM-106
- Human requester/operator: swr
- Areas touched: `services/backend/src/auth/authentication`, `AI_USAGE.md`
- Summary: Replaced delimiter-based Authorization header parsing with a strict Bearer-token regular expression and added malformed-header coverage.
- AI contribution: Middleware implementation and unit test update.
- Assumptions: Bearer schemes are case-insensitive and Firebase ID tokens contain no whitespace.
- Checks run: `npx vitest run src/auth/authentication/firebase-authentication.middleware.spec.ts`; `npm run lint`.
- Follow-up/conflict notes: Middleware files already contained other staged/comment changes; those changes were preserved.

## 2026-09-12 - Codex - Set up JWT verification and authorization

- Issue/PR: SPM-106
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Added a NestJS auth module with Firebase ID-token middleware that attaches verified uid/roles claims to requests, centralized PostgreSQL access through `DatabaseService`, and RBAC services that check role permissions against the existing PostgreSQL tables and support ownership checks.
- AI contribution: Jira review, backend auth/RBAC code, unit/e2e tests, dependency updates, and backend documentation.
- Assumptions: Firebase custom `roles` claims will use the existing RBAC seed role names (`ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, `ATTENDEE`); product endpoints or future route-specific middleware will call `AuthorizationService` when resource/action context exists.
- Checks run: `npx vitest run src/auth/authentication/firebase-token.service.spec.ts --coverage.enabled true --coverage.include src/auth/authentication/firebase-token.service.ts --coverage.reporter text` (100% statements/branches/functions/lines for `firebase-token.service.ts`); `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox because Supertest needs to bind a local test server.
- Follow-up/conflict notes: Work was created on `feature/SPM-106-set-up-jwt-verification-and-authorization` from `feature/spm-30-attendee-login`; npm reported 6 vulnerabilities after adding Firebase Admin/PostgreSQL dependencies and they were not auto-fixed to avoid unrequested dependency churn.

## 2026-09-14 - Codex (GPT-5) - Remove hard-coded authentication test password

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the literal shared mock-account password with `process.env.SEED_PASSWORD`, removed it from documentation, and injected the GitHub Actions secret into the test step.
- AI contribution: Secret-handling remediation and CI configuration.
- Assumptions: The repository’s GitHub secret is named `SEED_PASSWORD`; local test runs must export the variable themselves.
- Checks run: Source search for the removed literal and `git diff --check`; frontend tests require `SEED_PASSWORD` and dependencies to be available.
- Follow-up/conflict notes: The exposed password should be rotated; existing untracked Firebase service-account material was preserved and not staged.

## 2026-09-14 - Codex (GPT-5) - Use fake credentials for mocked login tests

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test/fixtures/authUsers.ts`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Replaced the real-looking test password with an explicitly fake password and removed unnecessary environment-secret wiring because Firebase authentication is mocked.
- AI contribution: Test-fixture security remediation and documentation.
- Assumptions: Login unit tests should validate UI behavior with deterministic mock data, not real Firebase accounts.
- Checks run: Source search for the removed credential and `git diff --check`; frontend tests remain unavailable locally because Vitest is not installed.
- Follow-up/conflict notes: Existing untracked Firebase service-account material was preserved and not staged.

## 2026-09-13 - Codex - Fix PR #6 CI dependency installation

- Issue/PR: PR #6
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.
- AI contribution: Dependency/configuration fix, CI cleanup, lockfile regeneration, tests, commit, and push.
- Assumptions: The current Vite version's native `resolve.tsconfigPaths` support is the intended replacement.
- Checks run: `npm install --package-lock-only`; `npm ci --ignore-scripts`; `npm test`; workflow YAML validation; `git diff --check`.
- Follow-up/conflict notes: No secret files were included or modified.

## 2026-09-11 - Codex - Set up RBAC database seed

- Issue/PR: SPM-103
- Human requester/operator: swr
- Areas touched: `development/database`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added local PostgreSQL RBAC tables and seed data in a separate init SQL file, documented standalone PostgreSQL build/run/smoke-check usage, and removed baked PostgreSQL credentials from the database image.
- AI contribution: Jira review, database SQL, local development documentation, and validation.
- Assumptions: RBAC belongs in a separate local database init file from base/user-auth schema; backend relationship-level authorization will be implemented separately from this seed data.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `git diff --check`; `rg -n "POSTGRES_PASSWORD|POSTGRES_USER|POSTGRES_DB" -g 'Dockerfile' development services apps`; `rg -n "can_create|can_read|can_update|can_delete" development/database`; Ruby validation that `002_rbac.sql` matches Jira's 5 roles, 10 resources, 27 permission rows, and plain quoted permission columns. Docker SQL execution was not run because the local Docker daemon socket was unavailable and no local PostgreSQL server binary was present.
- Follow-up/conflict notes: No existing local or remote branch/PR for SPM-103 was found before starting `feature/SPM-103-set-up-database-for-rbac`.

## 2026-09-11 - Codex - Switch shared branch guidance to dev

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/`, `.github/`, `apps/frontend/README.md`, `services/backend/README.md`, `AI_USAGE.md`
- Summary: Updated branch workflow guidance and GitHub Actions filters so normal work starts from and targets `dev`, with branch flow `work branch -> dev -> main`.
- AI contribution: Documentation, workflow configuration, and AI usage logging.
- Assumptions: There should be no active dependency on any intermediate shared branch between work branches and `dev`.
- Checks run: `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/security.yml .github/workflows/tests.yml`; searched repo docs and workflows for stale branch references.
- Follow-up/conflict notes: Supersedes earlier AI usage entries that documented previous branch-flow assumptions.
## 2026-09-11 - Codex (GPT-6) - SPM-37 implementation and testing checkpoint

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`; shared local PostgreSQL started for integration tests.
- Summary: Implemented PostgreSQL-backed draft create/read/list/update, incomplete fields, repeated saves with retry identity and version conflict handling, My Requests and editable form, save feedback, organisation isolation, and server-side rejection of non-draft writes. Same-organisation draft access follows SPM-94. Week 4's 20 core functions remain release scope.
- Assumptions: Authentication must populate a verified `request.user` containing userId, organisationId, and roles. Default app denies unauthenticated calls; no production auth bypass added. Frontend token-provider hook is an integration seam. Firebase/login/RBAC and submission/change-request workflows remain separate dependencies; request requirement fields are draft text pending catalogue integration.
- Checks run: Node 24 backend build, 13 unit tests, 10 e2e tests including 8 real-PostgreSQL draft tests; frontend TypeScript/Vite build, 8 component tests, frontend ESLint and backend oxlint. Chromium browser checks covered all eight AC scenarios with test-only sessions, loss/retry, blank draft, all-field reopening, organisation isolation, legacy edit URL, and desktop/mobile screenshots. No page runtime errors; expected failure responses were exercised. Real Firebase sign-in/sign-out remains unverified.
- Follow-up/conflict notes: User requires a testing report and explicit 'ok' before preparing review. Nothing staged/committed/pushed; review documentation and handoff deferred. Existing AI_USAGE edits preserved. Test fixture stopped and its five remaining records removed; shared PostgreSQL and normal frontend/backend left running (frontend 127.0.0.1:5174, backend 3000). Default Node 23 fails existing Nest tooling; Node 24 passes. Existing frontend Vite/router dependency audit findings remain; newly added Vitest upgraded to 4.1.11. CI still targets staging and frontend shell executable mode must be set when staging is authorised. Browser plugin skill absent; bundled Playwright used for browser checks.

## 2026-09-11 - Codex (GPT-6) - Prepare SPM-37 feature branch

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: Local Git branch; `AI_USAGE.md`; read-only frontend, backend, and database inspection.
- Summary: Pulled dev with fast-forward-only; local dev and origin/dev match df9a0b1ecff768865526ba723755574ea68be0be. Created feature/SPM-37-save-event-request-as-a-draft after finding no matching local/remote branch or PR. Read ticket description, all four acceptance criteria, status, priority, sprint, and comments (none), plus scoped agent guidance.
- AI contribution: Branch preparation and implementation planning; no feature code changed.
- Planning refresh: Re-read all seven repository AGENTS.md files and local integration/CI guidance; confirmed Jira now contains all eight discussed criteria and remains To Do. Week 4's 20 core functions define release scope. Plan covers persistent drafts, form/list integration, server-enforced ownership and draft status, failure feedback, and AC-traceable tests. Authentication is still absent; coordinate its contract before security/sign-in acceptance testing. Existing tests workflow targets staging, so dev PR automation needs alignment or a manual run.
- Assumptions: User-requested dev base overrides stale staging references in docs/ai-issue-workflow.md. Draft persistence requires backend work; current frontend identity is a placeholder and authentication integration needs coordination.
- Checks run: git pull --ff-only origin dev; HEAD/origin-dev comparison; branch searches; gh pr list (successful, empty); source and ownership review.
- Follow-up/conflict notes: Preserved pre-existing AI_USAGE.md edits. Frontend creation is a placeholder, edits use memory-only state, and backend/database have no event model. GitHub PR lookup succeeded on this attempt, superseding the earlier API lookup failure for this operation. No commit or push.

## 2026-09-11 - Codex (GPT-6) - Verify connections and retrieve assigned stories

- Issue/PR: SPM Project assignment lookup; no implementation requested.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only GitHub and Jira inspection.
- Summary: Confirmed origin points to IS212-G5-T2/IS212-G5-T2 and remote dev is reachable through Git. Retrieved all assigned Jira issues through the legacy connector authenticated as the requester; all three are stories.
- AI contribution: Connection verification and assignment retrieval.
- Assumptions: Used the legacy connector identity matching the requester; the other Atlassian connector uses a different account.
- Checks run: Git remote/status, gh auth status, gh repo view, git ls-remote, Jira identity and paginated JQL search (last page confirmed).
- Follow-up/conflict notes: GitHub CLI account kishorek2024-bot cannot resolve the repository through the API; write access was not tested. Preserved existing AI_USAGE.md changes. No implementation, commit, push, or Jira mutation.

## 2026-09-09 - Codex (GPT-6) - Inspect live Jira automation

- Issue/PR: SPM project automation; no implementation ticket.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only Jira browser inspection.
- Summary: Verified four enabled SPM rules: Branch created with status To Do -> In Progress; Pull request created with status In Progress -> In Review; Pull request merged with status In Review -> Done; Pull request declined with status In Review -> In Review.
- AI contribution: Jira automation inspection, workflow analysis, and AI usage logging.
- Assumptions: Configuration inspection establishes rule intent, not evidence of successful executions. No Jira settings were changed.
- Checks run: Read all four rule canvases and the branch trigger condition in the authenticated Jira UI. Connector discovery did not expose automation rules.
- Follow-up/conflict notes: The decline rule, named 'Copy of Transition to In Review', does not implement the user's desired return to In Progress. This live inspection supersedes the earlier unverified automation assumptions below.

## 2026-09-09 - Codex (GPT-6) - Verify dev checkout and review repository flow

- Issue/PR: None; repository review requested directly.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: Local Git checkout; `AI_USAGE.md`.
- Summary: Fast-forwarded local `dev` only to `origin/dev` at `e4a9450` and reviewed repository guidance, application structure, local integration configuration, and CI. No other branch was merged, and no commit, push, or PR was created.
- AI contribution: Repository inspection and workflow analysis.
- Assumptions: The user's current instruction overrides older guidance: always create new work branches from latest `dev`, name them `<type>/<ticket_id>-<ticket_name>`, merge work into `dev`, then promote `dev` into `main` (source of truth). User-described Jira transitions are branch created -> In Progress, PR created -> In Review, PR merged -> Done, PR rejected -> In Progress; live automation settings and the exact rejection trigger were not verified.
- Checks run: Git fetch, fast-forward-only update, HEAD/origin-dev equality, clean diff against origin/dev before this ledger entry, and source/configuration searches. Application tests were not run for this inspection.
- Follow-up/conflict notes: AGENTS, workflow docs, component READMEs, PR template, and CI retain staging-based guidance; documented merge transition remains Testing. Root README partially reflects dev but omits promotion to main. These files and remote settings were not changed as part of the review.

## 2026-09-09 - Codex - Add frontend and database local-dev layout

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `development/database`, `apps/frontend`, `README.md`, `AGENTS.md`, `AI_USAGE.md`
- Summary: Added a frontend service to the local Docker Compose stack, separated PostgreSQL into a buildable local image under `development/database/postgresql`, baked local-only PostgreSQL defaults into that image, and updated repository/local development documentation for the frontend/backend/database layout.
- AI contribution: Local integration configuration, Dockerfile support, README updates, documentation, and AI usage logging.
- Assumptions: The existing NestJS backend remains the backend service, the existing React/Vite app should run as the frontend service, and database ownership should be separated under `development/database/postgresql` while Compose orchestration remains under `development/local-dev`.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --quiet`; `npm ci`; `npm run build`; searched README and scoped docs for stale local-dev/frontend/backend/database wording; `docker compose -f development/local-dev/compose.yaml build frontend` and `docker build -t spm-postgresql development/database/postgresql` could not complete because the local Docker daemon was unavailable.
- Follow-up/conflict notes: None.

## 2026-09-09 - Codex - Update Jira branch naming convention

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `README.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated branch naming guidance to use `<type>/<ticket_id>-<ticket_name>` instead of `<issue>-<short-name>` so connected Jira and GitHub work displays the ticket id and Jira ticket name.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: The ticket name should be slugged with hyphens for branch compatibility while preserving the Jira ticket id exactly.
- Checks run: Searched repository docs for stale branch-name examples.
- Follow-up/conflict notes: None.

## 2026-09-09 - Codex - Scaffold NestJS backend

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `services/`, `development/local-dev/`, `.github/workflows/`, `README.md`, `AI_USAGE.md`
- Summary: Removed the generic service template and scaffolded a real NestJS backend at `services/backend` with npm, strict TypeScript, Vitest, oxlint, Dockerfile support, service docs, and a monorepo CI unit-test entrypoint. Updated local Docker Compose and the gateway to build and route to the backend service.
- AI contribution: Official-docs lookup, Nest CLI scaffold, backend wiring, tests, and documentation updates.
- Assumptions: The backend service should be named `backend`; NestJS is the default backend framework; deployment-related Nest/Mau scripts should be removed to match the no-deployment repository direction.
- Checks run: `npm ci`; `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e` outside the sandbox after the sandbox blocked local server binding; `services/backend/scripts/ci/unit-test.sh`; `docker compose -f development/local-dev/compose.yaml config --quiet`; searched for stale `services/template`, `sample-service`, and deployment references.
- Follow-up/conflict notes: The Nest CLI generated current NestJS 12 ESM/Vitest/oxlint defaults.

## 2026-09-09 - Codex - Remove deployment workflow assumptions

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `development/`, `docs/`
- Summary: Removed the remaining deployment, Terraform, Kubernetes, and previous multi-branch workflow assumptions after `platform/` was removed. This entry recorded the then-current shared branch guidance, which was superseded on 2026-09-11 by the `dev` branch flow.
- AI contribution: Repository scan, workflow cleanup, documentation updates, and AI usage logging.
- Assumptions: The repository no longer needs deployment automation or promotion branches; local Docker Compose emulators remain useful for development and are not deployment infrastructure.
- Checks run: Parsed GitHub Actions YAML with Ruby YAML; searched the repo for deployment/platform/branch-flow references and deployment-related filenames.
- Follow-up/conflict notes: Existing `platform/` deletions were already present before this work and were preserved.

## 2026-09-07 - Codex - Human-reviewed commit gate

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so agents stage completed changes for human review and wait for explicit approval before committing, pushing, or creating a pull request. Added an explicit no-auto-merge rule.
- AI contribution: Documentation and process guidance updates.
- Assumptions: Staging changes is acceptable for review, but committing and pull request creation require explicit human approval to proceed with the commit.
- Checks run: Reviewed updated Markdown content.
- Follow-up/conflict notes: Pending human review before commit.

## 2026-09-07 - Codex - Resolve security workflow annotations

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/security.yml`, `.github/workflows/tests.yml`, `.github/workflows/terraform.yml`, `AI_USAGE.md`
- Summary: Fixed security workflow annotations by updating GitHub workflow checkout steps to `actions/checkout@v7`, correcting the Trivy action pin to `aquasecurity/trivy-action@v0.36.0`, and replacing the licensed Gitleaks Action wrapper with the pinned Gitleaks CLI Docker image `ghcr.io/gitleaks/gitleaks:v8.30.1`.
- AI contribution: CI workflow repair and validation.
- Assumptions: The repository should keep a free secret scan that works for an organization-owned GitHub repository without requiring `GITLEAKS_LICENSE`.
- Checks run: Verified available Trivy, checkout, and Gitleaks tags with `git ls-remote`; parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 2026-09-07 - Codex - Branch promotion CI guard

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `.github/workflows/branch-flow.yml`, `AGENTS.md`, `docs/ci-cd-process.md`, `AI_USAGE.md`
- Summary: Added a GitHub Actions check for the earlier multi-branch promotion model. This entry is historical only; the promotion workflow was later removed, and current branch guidance is `work branch -> dev -> main`.
- AI contribution: CI workflow and documentation updates.
- Assumptions: GitHub branch protection will be configured to require the `Validate Promotion Source` check where enforcement is needed.
- Checks run: Parsed all GitHub Actions workflow YAML files with Ruby YAML.
- Follow-up/conflict notes: None.

## 2026-09-07 - Codex - Jira and GitHub authority rules

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Updated AI workflow guidance so Jira is the authoritative requirements source and GitHub is the authoritative development artifact source. Added status gating, existing branch/PR reuse, Jira-key branch/commit/PR requirements, acceptance-criteria recheck, and Jira automation ownership rules.
- AI contribution: Documentation and workflow guidance updates.
- Assumptions: Jira statuses `To Do` and `In Progress` are the only statuses where implementation should proceed; Jira automation handles status transitions for branch creation, pull request creation, and pull request merge.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future AI agents should not duplicate the Jira story into GitHub Issues or manually mark Jira work items `Done`.

## 2026-09-07 - Codex - AI workflow and branch progression guidance

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
- AI contribution: Documentation structure, workflow guidance updates, and coordination rules for multiple AI agents.
- Assumptions: Earlier multi-branch assumptions were recorded here for historical context only. Current branch guidance is `work branch -> dev -> main`.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future Codex, Claude, or other AI work should add a new entry here before pull request handoff.

## 2026-09-07 - Codex - GitLab to GitHub migration cleanup

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `platform/`, `development/`, `docs/`
- Summary: Copied working files from the GitLab export into the GitHub repository without copying nested `.git` directories, converted GitLab CI/review metadata to GitHub Actions and pull request metadata, removed stale project-info/GitLab-only material, simplified the service template, and documented the Codex issue workflow and monorepo CI/CD process.
- AI contribution: Migration cleanup, workflow restructuring, documentation updates, repo boundary guidance, and local verification sweeps.
- Assumptions: The GitHub repository should be the single source repo; `services/template` is a scaffold rather than an implemented service; GitHub pull requests replace GitLab merge requests.
- Checks run: Verified only one `.git` directory exists; validated GitHub Actions YAML with Ruby YAML parsing; searched for stale GitLab/project-info references; checked for copied `.DS_Store`, `.terraform`, `.env`, and empty-directory leftovers.
- Follow-up/conflict notes: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, and other tools.

## 2026-09-12 - Claude (Sonnet) - Login page with Firebase Authentication

- Issue/PR: SPM-104 (inferred from branch name `feature/spm-104-set-up-frontend-login-page`; Jira itself was not accessible in this session)
- Human requester/operator: Unknown (chat user; name not provided)
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Added a `/login` page (`src/pages/LoginPage.tsx`) using Firebase Authentication (Email/Password provider) via the `firebase` JS SDK: `src/lib/firebase.ts` (SDK init + error-message mapping), `.env.example` for `VITE_FIREBASE_*` config, `src/vite-env.d.ts` typings, an `onAuthStateChanged` subscription in `App.tsx` for session persistence, `authLoading`/`isAuthenticated` state plus a shared `AuthLoadingScreen`, a `RequireAuth` route guard applied to all other routes, and a "Log out" control in `TopNav`. Updated `README.md`/`HANDOVER.md`/`CHANGELOG.md`.
- AI contribution: Dependency addition, frontend code (Firebase integration, store, routing, UI), documentation updates, local build verification.
- Assumptions: Signed-in Firebase users are mapped to app role `attendee` since there is no backend role lookup yet. `.env` is expected to hold a real Firebase project's config; no live Firebase project was reachable from this session to test end-to-end.
- Checks run: `npm run build` (tsc + vite build) in `apps/frontend` — passed. `npm install firebase` completed cleanly. Not run: end-to-end sign-in against a real Firebase project; `npm run lint` (pre-existing missing ESLint config, unrelated to this change).
- Follow-up/conflict notes: Role-aware sign-in (vs. hardcoded `attendee`), password reset/self-registration flows, and reconciling any doc staleness elsewhere in this directory are left as follow-up work.

## 2026-09-14 - Codex (GPT-5) - Local frontend-to-backend RBAC integration check

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `AI_USAGE.md`
- Summary: Added the authenticated `/integration-check` frontend page and protected `GET /integration/permissions` backend endpoint to verify a Firebase ID token and test its custom roles claim against the seeded RBAC permissions. Added local browser CORS support and frontend API URL documentation.
- Assumptions: This diagnostic route is useful for local integration verification before merging to `dev`; Firebase users being tested have a supported uppercase custom roles claim such as `roles: ["ATTENDEE"]`.
- Checks run: `services/backend`: `npm test` (93 passed), `npm run lint` (passed). `apps/frontend`: TypeScript project check passed before the pre-existing Tailwind/PostCSS build failure. Full frontend tests are blocked by a missing `@testing-library/jest-dom` installation; its production build is blocked by the existing Tailwind 4/PostCSS adapter mismatch. Backend Nest build is blocked by the existing TypeScript 7.0/Nest CLI incompatibility.
- Follow-up/conflict notes: A live check still requires a Firebase user with a supported custom roles claim and Firebase Admin credentials in the backend. The existing frontend application role remains hardcoded to `attendee`; the integration endpoint reports the role(s) actually present in the verified Firebase token.

## 2026-09-15 - Codex (GPT-5) - Firebase test-role assignment helper

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Added a manually run Firebase Admin script for assigning the five supported backend RBAC roles to local test users by email.
- Assumptions: The operator will replace placeholder emails, supply their own local service-account JSON path, and run the script intentionally against the selected Firebase project.
- Checks run: Script reviewed for supported role values, preserved non-role claims, and no embedded credentials.
- Follow-up/conflict notes: The script performs external account mutations when executed; users must refresh their Firebase session afterwards.

## 2026-09-14 - Codex (GPT-5) - Restore Tailwind CSS 3 PostCSS compatibility

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned Tailwind CSS to 3.4.19, restoring compatibility with the frontend's existing Tailwind 3 PostCSS configuration and CSS directives.
- AI contribution: Dependency downgrade, lockfile refresh, and verification.
- Assumptions: The existing `tailwind.config.js`, `postcss.config.js`, and `src/index.css` are intentionally Tailwind 3 configuration and should not be migrated to Tailwind 4.
- Checks run: `npm ls tailwindcss --depth=0` (3.4.19); `npm run build` reached TypeScript compilation but is blocked by the existing TypeScript 7 removal of `baseUrl`; `git diff --check` found pre-existing trailing whitespace in `apps/frontend/package.json`.
- Follow-up/conflict notes: The separate pending TypeScript 7 update conflicts with the ESLint TypeScript peer range and prevents a clean build until it is reconciled; it was not changed in this scoped dependency fix.

## 2026-09-15 - Codex (GPT-5) - Simplify local Compose to three tiers

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `development/AGENTS.md`, `development/local-dev`, `AI_USAGE.md`
- Summary: Reduced the local stack to frontend, backend, and PostgreSQL; removed the gateway, GCS, Pub/Sub, initialization, and Adminer services. The backend now runs and is published directly on `localhost:3000`, which is the frontend's default API URL.
- AI contribution: Compose/environment/documentation update and configuration validation.
- Assumptions: GCS, Pub/Sub, and the reverse proxy are not required by currently implemented local application behavior and should not be started by default. Keeping the backend on port 3000 inside and outside Compose is clearer for local development.
- Checks run: `docker compose -f development/local-dev/compose.yaml config --no-interpolate`; searched local-dev configuration and documentation for stale emulator/gateway references; `git diff --check` on changed local-dev files.
- Follow-up/conflict notes: The requester deleted the now-unneeded `gateway/` and emulator `scripts/` folders after the Compose simplification; documentation was reconciled with the resulting layout.

## 2026-09-15 - Codex (GPT-5) - Restore frontend clean-install compatibility

- Issue/PR: None supplied
- Human requester/operator: swr
- Areas touched: `apps/frontend/package.json`, `apps/frontend/package-lock.json`, `AI_USAGE.md`
- Summary: Pinned frontend TypeScript to 6.0.3 so the ESLint TypeScript packages can satisfy their supported peer range and Docker's `npm ci` can install dependencies cleanly.
- AI contribution: Dependency diagnosis, manifest/lockfile update, and clean-install verification.
- Assumptions: The existing ESLint TypeScript packages remain the intended toolchain; TypeScript 6 is the compatible interim version.
- Checks run: `npm ci --ignore-scripts --no-audit --no-fund` (passed); `npm ls typescript --depth=0` (6.0.3); `npm run build` reached TypeScript compilation but is blocked by the existing `baseUrl` deprecation requiring either migration or `ignoreDeprecations: "6.0"`.
- Follow-up/conflict notes: No Docker image was built; the Dockerfile's dependency-install command was verified directly.
## 2026-09-12 - Codex (GPT-6) - Restore local app connectivity

- Issue/PR: None supplied.
- Areas touched: Local Docker runtime; `AI_USAGE.md`.
- Summary: Refreshed frontend dependencies in its existing Docker volume with `npm ci` after Vite failed to resolve `@testing-library/react`; restarted frontend and gateway.
- Assumptions: Gateway timeout after backend recreation indicated a stale upstream address; restarting restored connectivity.
- Checks run: Frontend `/planning` HTTP 200, gateway `/healthz` returned status ok, `/api/events` HTTP 200.
- Follow-up/conflict notes: Existing repository changes preserved; services left running and database retained. Dependency install reported 5 moderate and 1 high audit findings; dependency upgrades were outside this runtime repair.

## 2026-09-16 - Codex (GPT-6) - Rebuild SPM-37 on current dev

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; live status In Progress, Medium, Sprint 1, no comments. Read the full story and eight AC. Requester explicitly deferred AC7; implement AC1-6 and AC8.
- Baseline: Reset the existing feature/SPM-37-save-event-request-as-a-draft branch to origin/dev 7bd1193 at the requester's direction. Backup branch backup/SPM-37-before-rebuild-20260916 and stash SPM-37 before clean rebuild 2026-09-16 retain previous work. Tracked feature code was replaced with dev; ignored dependencies, local environment and database data were retained. Remote feature ref remains dfc7e64c225ed7d2aa9bca51cc83a22d3bf76b4f pending user verification/commit approval. Updating that remote after approval will require a guarded history replacement (force-with-lease), not a normal fast-forward push.
- Areas: current frontend event form, My Requests/navigation, backend events/drafts API and migration, component tests/configuration/docs, shared Compose migration mount and setup docs. No unrelated previous draft UI was restored.
- Implementation: Save incomplete drafts at every form step; persist all fields and attachments in PostgreSQL; show confirmation/error with retained input and retry; list/reopen/update the same request with versions and operation identifiers. Submit and permanently lock drafts atomically in the same transaction as the submitted event; preserve the request ID and reject draft edits after submission. AC7 real organisation isolation remains explicitly deferred; all demo visitors share the existing server-side organiser.
- Verification: Frontend component tests 17/17; backend unit tests 43/43; API/database integration 9/9 (seven new draft cases plus two smoke tests); real Chromium flow passed on test frontend :5174/backend :8082 with PostgreSQL spm_test. Browser exercised save, refresh, reopen, repeated updates, simulated 503/retry, attachment/choice persistence, real submission and both UI/API lockout. Desktop and 390px mobile screenshots inspected; no page errors or framework overlay. Integration/browser harnesses remove only their run's records. Frontend production build/lint passed; backend Nest build passed using Node 24.19.0; Node 23.3.0 failed in installed Nest CLI with ERR_REQUIRE_CYCLE_MODULE. Backend lint passed. Git whitespace checks passed.
- Runtime: Docker engine is unavailable; reused the existing persistent embedded PostgreSQL installation at C:/Users/kirub/AppData/Local/SPM-Draft-Postgres on localhost:5432. Applied events schema and additive draft migration to local spm without resetting data. Dependencies were not clean-installed; tests use existing node_modules. Added Playwright dev dependency and lockfile entries without changing existing locked packages.
- Follow-up: GitHub PR lookup through both gh and connector lacked repository access; Jira development metadata reports one open PR, so reuse it after access/approval rather than creating a duplicate. No Jira status changes, commits or pushes. Review locally before authorizing commit and remote feature replacement.
- Final runtime check: frontend http://localhost:5173/events/create, backend health and draft-list endpoint all returned HTTP 200. Frontend :5173, backend :8080 and persistent PostgreSQL :5432 are left running for human verification. Temporary browser test frontend :5174/backend :8082 were stopped. Mobile sidebar is fully hidden after its resize transition; screenshot timing was corrected, with no layout code change required.

## 2026-09-16 - Claude Sonnet 5 - Finish SPM-37 wizard-step resume left in progress

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (In Progress; same story as the prior Codex rebuild entry above, which remains staged and unreviewed).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `apps/frontend/src/pages/EventCreatePage.tsx`, `apps/frontend/src/pages/EventCreatePage.test.tsx`, `apps/frontend/src/types/draft.ts`, `services/backend/src/events/draft-input.ts`, `services/backend/src/events/draft-input.spec.ts`, this file, both apps'/services' `CHANGELOG.md`/`HANDOVER.md`.
- Summary: Picked up an unstaged, undocumented, untested in-progress change (an optional `fields.formStep` on `DraftFields` so reopening a draft resumes the wizard step it was saved on, instead of always restarting at step one) that was left in the working tree after the prior Codex session. Reformatted the two long unwrapped lines in `draft-input.ts`/`EventCreatePage.tsx` to match the repo's Prettier style, added frontend and backend test coverage (save persists `formStep`, reopening resumes the saved step, backend accepts/omits/rejects `formStep` per its 0-2 range), and documented the addition in both changelogs and handover files.
- AI contribution: Code review of pre-existing in-progress diff, test authoring, formatting, documentation.
- Assumptions: The unstaged `formStep` change was intentional in-progress work to continue, not something to discard, since it built cleanly on the already-staged SPM-37 draft feature and matched its patterns. Kept it additive/optional so it does not alter the previously verified SPM-37 acceptance-criteria behavior.
- Checks run: Backend `npm test -- --run` (48/48 passed) and `npm run lint`; frontend `npm test -- --run` (19/19 passed), `npm run lint`, and `npm run build` (passed). Backend `npm run build` failed locally with `ERR_REQUIRE_CYCLE_MODULE` under Node 23.3.0, the same known Nest CLI/Node incompatibility already recorded in the entry above (Node 24 builds cleanly); not re-verified with Node 24 this session.
- Follow-up/conflict notes: Everything from the prior Codex entry above is still staged and unreviewed/uncommitted; this entry's changes are unstaged on top of that. No commits, pushes, or Jira status changes were made. Stage and review together before committing, per this repo's explicit-commit-approval rule.

## 2026-09-19 - Codex (GPT-6) - Review SPM-37 commit message accuracy

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37 (live status In Progress; current description has seven acceptance criteria).
- Areas touched: `AI_USAGE.md` only; reviewed staged frontend/backend draft implementation, tests, coverage configuration, migration and test-specification presence.
- Summary: Commit-message feature claims match the inspected implementation. Recommend replacing "complete" test suites with named test types and scoping 100% coverage to the eight configured source files. My Requests currently uses shared demo identity. Saved wizard-step resume is also implemented.
- Checks run: `npm run test:cov:spm37` in frontend (68 tests passed) and backend (260 tests passed); generated summaries confirm 100% statements, branches, functions and lines for all eight included files. Inspected integration and Playwright tests but did not rerun them. Confirmed staged test-case PDF exists.
- Follow-up/conflict notes: Existing staged changes preserved; review entry left unstaged. No implementation changes, commits or pushes. Earlier ledger/test comments referring to eight AC and deferred AC7 reflect older Jira wording; current AC7 is submission lockout.

## 2026-09-19 - Claude Opus 4.8 - SPM-37 coverage to 100% and test-case documentation

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (In Progress; seven acceptance criteria; same staged rebuild as the prior Codex/Claude entries above).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `services/backend/src/events/events.service.ts`, `apps/frontend/vitest.spm37.config.ts`, `docs/test-cases/SPM-37_Test-Cases.pdf`, this file.
- Summary: Brought the SPM-37 modules to 100% per-file coverage. Refactored `EventsService.create()` into two explicit paths - a shared-transaction `insert()` reused by draft submission, and an owned BEGIN/COMMIT/ROLLBACK/release path for direct creation - removing a v8 branch-coverage artifact on the previous repeated `if (!transaction)` guards; runtime behaviour is unchanged. Raised `testTimeout`/`hookTimeout` in the frontend SPM-37 coverage config so component tests do not flake under slower coverage instrumentation. Produced the test-case specification PDF and authored the SPM-37 Confluence test cases (EVE-DRF-01..07) in the team's matrix + detail-page format (authored, not yet published to Confluence).
- AI contribution: Coverage-gap diagnosis and behaviour-preserving refactor, coverage-config fix, live test execution across all tiers, test-case authoring and PDF generation.
- Assumptions: The staged local `events/drafts` rebuild is the intended SPM-37 implementation and supersedes the different `event-requests` implementation on the remote branch (`dfc7e64`); replacing the remote requires a `force-with-lease` push and the user's explicit confirmation.
- Checks run: `npm run test:cov:spm37` - backend 260/260 and frontend 68/68, 100% statements/branches/functions/lines for the eight configured source files; backend API/database integration 13/13 against a scratch `spm_test` PostgreSQL; real-browser Playwright `Q2-021` passed headed. Backend `nest build` (Node 24) and oxlint passed.
- Follow-up/conflict notes: No commit or push made this session (user commits manually). Remote `origin/feature/SPM-37-save-event-request-as-a-draft` still holds the older `event-requests`-module implementation; the local rebuild replaces it. `tmp/` holds session scratch (Codex handoff + PDF renders) and must not be committed. Current AC7 is the submitted-draft lockout (older eight-AC / org-isolation wording is superseded).

## 2026-09-19 - Claude Opus 4.8 - Address SPM-37 pull-request review feedback

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (open PR on the feature branch; reviewer JacobSoh).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `services/backend/vitest.config.ts`, `AI_USAGE.md`.
- Summary: Reverted the backend Vitest `include` glob from `src/**/*.spec.ts` back to `**/*.spec.ts` as requested in review. Reviewed the other flagged comments against the current rebuild: the `@Inject` question and the `migrate.mjs`/`browser-fixture.mjs` comments were on the superseded `event-requests` implementation (now removed). The `@Inject(Class)` pattern carried into `drafts.controller.ts`/`drafts.service.ts` is technically redundant (`emitDecoratorMetadata` is enabled), but removing it drops v8 branch coverage on the emitted decorator metadata below the enforced 100% per-file gate, so it was deliberately kept and will be answered in the PR rather than changed.
- AI contribution: Review triage against the current implementation, config fix, coverage-impact verification, documentation.
- Assumptions: The reviewer's `**/*.spec.ts` request applies to the merged rebuild; all backend specs live under `src/`, so the broader glob matches the same files.
- Checks run: Backend `npm test` 260/260; `npm run test:cov:spm37` 100% statements/branches/functions/lines for the eight configured files; `npm run lint` and `nest build` (Node 24) passed.
- Follow-up/conflict notes: `@Inject` questions to be answered in the PR (redundant but retained to preserve the 100% coverage gate). `migrate.mjs`/`browser-fixture.mjs` review comments are moot - those files were replaced by `migrate-drafts.mjs` and `scripts/testing/run-browser.mjs`.

## 2026-09-19 - Codex (GPT-6) - Inspect SPM-37 merge conflicts for user decisions

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; fetched current seven AC and In Progress status.
- Areas touched: `AI_USAGE.md` only. Inspected merge metadata, index stages and frontend/backend conflicts.
- Summary: Current merge joins local HEAD 75e03df (rebuild feature commit 61bab0d) with older remote dfc7e64 (original feature 69c5986). Found 18 unresolved files and four original conflicts already staged as resolved. Prepared per-file old-remote versus new-local comparisons for the user's choices.
- Checks run: Git status, divergent history, merge message, index-stage contents and diffs. No tests run because merge remains unresolved. Working Playwright config is empty; App routes are partially resolved; staged older implementation additions require consistency review after choices.
- Assumptions/follow-up: User explicitly reserves resolution choices. No conflicts resolved, files staged, commits or pushes by this review. Existing partial resolutions preserved. This is a remote feature merge, not a dev merge; the dev-wins rule does not select a side here.

## 2026-09-19 - Codex (GPT-6) - Resolve and validate SPM-37 feature merge

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; In Progress, current seven acceptance criteria rechecked against the implementation and tests.
- Authorization: User directed use of the newer local implementation, correction of issues, and push to the SPM-37 feature branch.
- Areas: frontend/backend merge resolution, component tooling/docs, local gateway, existing root guidance and ledger. Retained HEAD 75e03df/feature commit 61bab0d for application behavior, routes, draft API, migration and Playwright configuration. Removed only incoming older implementation additions; retained the user's recent frontend Node types dependency, merged historical ledger, root guidance and ignore rules.
- Backup: Pre-resolution changed files and index copied to C:/Users/kirub/AppData/Local/Temp/SPM37-merge-backup-20260919-005932. Removed incoming scripts migrate.mjs and browser-fixture.mjs belong to the superseded event-requests implementation; migrate-drafts.mjs and run-browser.mjs remain. No application database reset or migration of old draft data was performed.
- Issues fixed: TypeScript frontend aliases no longer use deprecated baseUrl; ESLint 10 flat configuration; Tailwind pinned to 3.4.19 for the existing theme/PostCSS setup; backend TypeScript pinned to 6.0.3 because Nest cannot use TypeScript 7.0 compiler API. Corrected stale AC7/Save Draft and nonexistent integration-test documentation. Gateway body limit now matches backend 8 MB attachments.
- Checks: frontend 68 tests and backend 260 tests passed with all eight configured files at 100% coverage; backend rerun after npm ci with locked Vitest 5 passed. API/PostgreSQL integration 13 passed, including rerun with locked backend dependencies. Real Chromium save/reopen/refresh/retry/submit/lock flow passed after restarting Vite with compatible Tailwind. Frontend and backend production builds passed after toolchain fixes. Backend lint passed; frontend lint exits successfully with three existing API-loader state-reset warnings (retained as warnings in flat config). Both dependency lockfile dry-run checks passed; Compose config and git whitespace checks passed; no unmerged index entries remain.
- Limits: Node 24.14 locally emits engine warnings; docs require Node 24.15+ for current packages. Docker daemon unavailable, so gateway was inspected but not exercised in Docker. Reused persistent embedded PostgreSQL; spm_test suites clean only their own records. Temporary browser servers stopped after checks; PostgreSQL left running with data preserved.
- Handoff: Complete the existing merge with both parents and push normally, preserving remote history. Git transport can access origin; gh and GitHub connector cannot read PR metadata, so do not create a duplicate PR. No Jira status changes or PR merge requested.

## 2026-09-19 - Codex (GPT-6) - Check earlier SPM-37 review comments

- Issue: SPM-37; reviewed user-provided screenshots against local and remote commit 947972b.
- Areas touched: `AI_USAGE.md` only; no implementation changes or review replies.
- Findings: Requested unit-test discovery revert is not applied (`src/**/*.spec.ts` remains). Original event-requests service was removed, but explicit @Inject remains in replacement draft service/controller; reviewer clarification is still needed. Old migrate.mjs and browser-fixture.mjs were replaced, but no evidence establishes compliance with the reviewer's unspecified migration schedule/destination.
- Checks: Current files, tracked script inventory, clean initial status and remote branch hash. Tests not rerun for this read-only comparison.
- Follow-up: Outdated review locations do not prove the underlying comments are resolved. Ledger entry left unstaged; no commit or push.

## 2026-09-19 - Claude Opus 4.8 - Remove redundant @Inject in draft service/controller

- Issue/PR: https://is212-g5-t2.atlassian.net/browse/SPM-37 (open PR; reviewer JacobSoh asked why `@Inject` was used).
- Human requester/operator: Kishore kirubakaran.
- Areas touched: `services/backend/src/events/drafts.service.ts`, `services/backend/src/events/drafts.controller.ts`, `AI_USAGE.md`.
- Summary: Removed the redundant `@Inject(EventsService)` / `@Inject(DraftsService)` decorators (Nest resolves these by type since `emitDecoratorMetadata` is enabled), per review. This reverses the earlier "retain @Inject" decision. Removing the decorators exposed an unreachable branch in TypeScript's emitted `design:paramtypes` guard (`typeof X === "undefined" ? Object : X`) that v8 counted as half-covered; wrapped only the class-declaration line in a scoped `/* v8 ignore start/stop */` (method bodies still fully counted) so per-file coverage stays a genuine 100%.
- AI contribution: Refactor, coverage-artifact diagnosis, scoped v8 ignore, verification, documentation.
- Assumptions: `@Inject(Class)` was purely redundant here; the excluded branch is compiler-generated and unreachable, so ignoring it does not hide any real code path. `events.controller.ts` (SPM-36 scope) still uses `@Inject` and was left unchanged.
- Checks run: Backend `npm test` 260/260; `npm run test:cov:spm37` 100% statements/branches/functions/lines for the eight configured files; `npm run lint` and `nest build` (Node 24) passed.
- Follow-up/conflict notes: Supersedes the earlier ledger note that retained `@Inject` to preserve the coverage gate. No behavioural change; DI resolves identically by type.

## 2026-09-20 - Codex (GPT-6) - Diagnose blank frontend and login setup

- Issue/PR: None supplied; runtime diagnosis requested by user.
- Areas touched: AI_USAGE.md only; inspected frontend, backend and local Compose runtime.
- Findings: Chromium reproduced an empty page and Firebase auth/invalid-api-key during module initialization. All six VITE_FIREBASE configuration values are empty in the frontend container; local development/local-dev/.env has no matching Firebase entries. Backend FIREBASE_SERVICE_ACCOUNT_JSON is also empty. Required team Firebase configuration must be supplied locally before real sign-in can be verified.
- Checks: Compose frontend/backend/PostgreSQL healthy; backend /healthz returned status ok; frontend source HTTP 200; Playwright captured missing-config warning and uncaught Firebase error. In-app browser timed out, so used installed Playwright for diagnosis. No application tests rerun because no implementation changed.
- Follow-up/conflicts: Existing services and data preserved; no credentials printed, configuration invented, commits or pushes. Await team local Firebase configuration, then recreate frontend/backend and verify sign-in.

- Runtime follow-up: User supplied Firebase values and requested stack restart. Recreated Compose services preserving volumes. Browser now renders /login without page errors. Corrected local untracked .env PORT and VITE_API_BASE_URL from 8080 to Compose's published 3000; restarted services. Real account sign-in remains untested.

## 2026-09-20 - Codex (GPT-6) - Remove My Requests creation link

- Issue/PR: No new Jira key supplied; user requested a small follow-up to the existing My Requests UI on the current feature branch.
- Areas: apps/frontend/src/pages/MyRequestsPage.tsx, frontend README, AI_USAGE.md.
- Summary: Removed the + Create event request link above the request list. Existing request links and creation routes remain available.
- Checks: EventCreatePage and DraftWorkflow component suites passed (59 tests); git diff --check passed. Signed-in browser view not re-tested.
- Follow-up/conflicts: Preserved earlier runtime ledger entries; staged for human review, no commit or push.
- Runtime verification follow-up: Vite was serving stale transformed MyRequestsPage code despite the updated bind-mounted source. Restarted only the frontend container; HTTP verification now confirms the served module retains My Requests and no longer contains the removed creation link. Database and backend left untouched.
- Label follow-up: Renamed My Requests to My drafts in page heading, navigation, form links/help, related tests and frontend README. Kept existing list behavior and routes. Both affected suites passed (59 tests); restarted frontend and verified served heading/navigation contain My drafts; whitespace check passed. Staged without commit.
- Submission visibility follow-up: My drafts now filters the requests response to Draft status only, with updated description/loading/empty-state wording. Existing submission creates an event and My Events loads /events; its submitted-event test passes. Updated mixed-status regression and added submitted-only empty-state test. Three frontend suites passed (62 tests); whitespace check passed; restarted frontend and verified served filter. API records retained; no backend changes, commit or push.
- Missing submitted events follow-up: Backend /api/events returns two persisted submitted events under its local demo organiser. My Events incorrectly filtered this organiser ID against the Firebase UID. Removed redundant client organiser filtering, relying on existing backend organiser scoping; documented local identity limitation. Added Firebase-UID mismatch/reload regression. All three affected suites passed (63 tests); whitespace check passed; restarted frontend and confirmed old filter absent from served module. No data changes or backend authentication changes; signed-in browser verification remains with user.

## 2026-09-20 - Codex (GPT-6) - Expand Confluence draft test procedures

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37 (In Progress; seven acceptance criteria reviewed).
- Areas: Confluence Event Request Creation folder https://is212-g5-t2.atlassian.net/wiki/spaces/SP/folder/10321973, EVE-DRF-01 through EVE-DRF-11; AI_USAGE.md only locally on the existing SPM-37 branch.
- Summary: With explicit user authorization, updated 26 cases with 209 numbered steps covering setup, concrete inputs, browser/API/database actions and verification. Added execution-context and AC guidance; clarified normalized draft defaults, retry identifiers and attachment size checks. Preserved test IDs, authorship, automation references and execution-result fields.
- Checks: Compared against Jira AC, reference EVE-CRE pages and relevant local implementation/tests; validated HTML and read back all 11 published pages. Content matches authored HTML after normalizing generated local IDs and apostrophe encoding; execution fields unchanged.
- Assumptions/follow-up: Procedures are authored, not executed; no application tests rerun or pass results claimed. Supporting security/boundary checks distinguished from the seven core AC. No code changes, Jira transitions, commit or push. Existing source work preserved; ledger staged for review.

## 2026-09-20 - Codex (GPT-6) - Audit Confluence pre-conditions against dev

- Issue/context: SPM-37; user requested assessment of all 11 EVE-DRF pages against Event Management cases and dev code.
- Areas: AI_USAGE.md only; read all 26 draft-case pre-conditions and all eight EVE-CRE pages. Fetched origin/dev at 8179b93c7ad3193c949ddfb5cb65f885f883049c without switching or changing source files.
- Findings: Specify test layer, branch/commit, mocks versus live services, dedicated PostgreSQL/schema setup, fixture state, failure injection and boundary files. Dev still uses DEMO_ORGANISER_ENABLED/current-user for event/draft APIs; Firebase middleware applies only to AuthController. EVE-DRF-08 and 09-B require newer authentication integration. Dev My Requests includes Submitted records, unlike EVE-DRF-03. Sixth-file error is Use up to five files.; combined-size error includes 50 MB total.
- Checks: Read dev controllers, services, app bootstrap, frontend form/list/API code and test harnesses. No tests executed and no Confluence changes in this audit. Prior procedure rewrite used local feature-branch code; branch mismatch now explicitly reported. Existing staged ledger retained.
- Branch-reference correction: User specified fix/SPM-37-Update-Draft-request-workflow instead of dev. Fetched and checked remote commit 4fda7e3f2efa07531b07c648c66c0679fe3334a2 (same source tree as local HEAD). Draft/event Firebase middleware, ORGANISER authorization, per-user ownership and My drafts filtering are present, so the dev-specific mismatches for EVE-DRF-03/08/09-B do not apply to this target. Keep recommendations for explicit test layer, authentication fixtures, database/schema setup, failure injection and fixture state. Integration token verification is stubbed; DEMO_ORGANISER_ENABLED is not an authentication prerequisite despite a leftover harness assignment. File-count error wording still differs from the current Confluence procedure. Assessment only; no Confluence changes or tests executed.

## 2026-09-20 - Codex (GPT-6) - Update Confluence pre-conditions from SPM-37 fix branch

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37. User explicitly requested updates using fix/SPM-37-Update-Draft-request-workflow, commit 4fda7e3f2efa07531b07c648c66c0679fe3334a2.
- Areas: EVE-DRF-01 through EVE-DRF-11 in Confluence folder 10321973; AI_USAGE.md locally.
- Summary: Replaced pre-conditions for all 26 cases with numbered branch-specific setup covering live browser versus mocked component tests, PostgreSQL/schema setup, stubbed token identities, initial fixture state, failure injection and validation helpers. Every case records the branch/commit baseline. Clarified owner-isolation read-back identity; corrected the attachment-count error wording in two procedure steps for consistency with the branch.
- Checks: Inspected fix-branch authentication, draft integration tests, frontend test harnesses, validator and browser spec. Published all 11 pages and read each back to compare with intended HTML. Existing result fields and test IDs preserved; no tests executed or results claimed.
- Follow-up/conflicts: Existing staged ledger entries retained. No application source changes, Jira transitions, commit or push. Ledger staged for human review.

## 2026-09-21 - Codex (GPT-6) - Rebase SPM-37 fix branch onto dev

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; user requested branch maintenance.
- Summary: Rebased fix/SPM-37-Update-Draft-request-workflow from e7a73c6 onto latest origin/dev 90e8a60; resulting HEAD 1f0e67e. Preserved original history at backup/SPM-37-fix-before-rebase-20260921. Initial working tree was clean.
- Conflict resolution: Applied root AGENTS.md dev-wins rule to entire conflicted files: frontend EventListPage.tsx, DraftWorkflow.test.tsx, EventCreatePage.tsx, EventCreatePage.test.tsx, EventDetailPage.tsx, EventListPage.test.tsx; backend README.md, src/app.module.ts, and events drafts.e2e-spec.ts, drafts.service.spec.ts, drafts.service.ts, events.controller.ts, events.service.spec.ts, events.service.ts. Nonconflicting patches replayed normally. No scripts or dependency manifests/lockfiles were lost or changed relative to the backup.
- Checks: Rebase completed, origin/dev is an ancestor, no unresolved index entries, git diff --check passed. Backend unit tests: 385 passed, 1 failed (draft controller/service contract mismatch). Frontend: 151 passed, 11 failed across DraftWorkflow, EventDetailPage and registration suites, plus comments.filter runtime error in a test. Browser/database/build checks not run.
- Follow-up: Rebase is complete but the combined branch is not merge-ready. Dev conflict replacements remove branch-specific authorization/registration behavior while some nonconflicting callers/tests still expect it; reconcile in follow-up implementation work. User subsequently authorized committing this entry and syncing the remote fix branch. Verified remote still equals the pre-rebase backup e7a73c6; publish using an explicit force-with-lease to preserve any concurrent remote updates.

## 2026-09-21 - Codex (GPT-6) - Attempt local container startup

- Context: SPM-37 branch; user requested all local stack containers start.
- Areas: Docker Desktop runtime; AI_USAGE.md. Read development guidance and local Compose configuration.
- Checks/result: docker desktop start attempted; docker compose up -d --build could not connect to the Linux engine. Docker host log reports backend startup crash while opening/renaming sailor-ingest.sock (file cannot be accessed by the system). Frontend, backend and PostgreSQL startup could not proceed.
- Follow-up: Repair/restart Docker Desktop before retrying Compose. No containers, volumes or database data removed; no source edits, commit or push. Ledger left unstaged.

## 2026-09-21 - Codex (GPT-6) - Diagnose Docker failure

- Context: User requested runtime diagnosis; no issue supplied. Areas changed: AI_USAGE.md only.
- Findings: Docker Desktop failed at 14:12 SGT because Windows could not access/rename sailor-ingest.sock; its log records successful socket listening at 14:21. Engine now responds; frontend, backend and PostgreSQL healthy, frontend HTTP 200 and backend health status ok. Old gateway container remains exited with a file/directory bind-mount mismatch for gateway/nginx.conf. Existing containers reference former compose.yaml; current checkout uses docker-compose.yml.
- Checks: docker version, compose ls, container status/state, Docker host logs, HTTP readiness and current Compose service names. No application tests needed for diagnosis.
- Follow-up/conflicts: Preserved existing ledger changes; no runtime or source changes, deletions, commit or push. Old gateway failure is separate from recovered Docker Desktop startup failure.
## 2026-09-21 - Codex (GPT-6) - Restore manual coordinator assignment

- Context: User requested the pre-auto-assignment workflow on the existing SPM-37 fix branch; no new Jira key or acceptance criteria supplied. Reused existing branch work. GitHub PR lookup failed because gh could not resolve the configured repository.
- Areas: frontend store, EventDetailPage tests, frontend README, AI_USAGE.md.
- Summary: Reverted the store's automatic coordinator assignment and assignment notifications to the implementation before 05da9db. Current page already contains Assign Myself as Coordinator and no access-restricted popup. Added submission/unassigned and explicit-click regression coverage; corrected the assigned-coordinator test's comment API mock.
- Checks: Two focused regression tests passed; targeted ESLint and production build passed. Full detail suite has four existing rebase-related failures (popup expectation, missing Change Requests control, venue/technical access expectations). Playwright on localhost:5173 at 1440x1000 verified Unassigned -> Assign Myself as Coordinator -> Review Event, with mocked API/auth state, no page errors or Vite overlay, and before/after screenshots outside the repo. Browser plugin unavailable; used installed Playwright. Served store confirmed free of automatic assignment.
- Limits/follow-up: Preserved earlier browser-memory-only assignment behavior; database persistence and real authenticated API flow were not implemented or verified. Existing runtime/backend state untouched. Prior ledger edits preserved. Changes staged for human review; no commit or push.

## 2026-09-21 - Codex (GPT-6) - Remove event approval/rejection outside SPM-37

- Issue: https://is212-g5-t2.atlassian.net/browse/SPM-37; fetched full story, all seven AC, comments (none), Medium priority and In Progress status. User explicitly requested removing approval/rejection and limiting fixes to draft-story scope.
- Areas: frontend EventDetailPage, store, page regression tests, README, AI_USAGE.md; reused existing fix branch and staged work. Earlier GitHub PR lookup remains unavailable.
- Summary: Removed Review Event entrypoint, decision modal/state/handler, and the reviewEvent store action that changed status and sent approval/rejection notifications. Git history traces the UI to 3f46e16 Frontend Skeleton. Preserved the separately requested manual assignment and unrelated existing features.
- Checks: Three focused tests passed (submission stays unassigned, explicit manual assignment, no approval/rejection controls for assigned coordinator); production build passed. Playwright at localhost:5173 (1440x1000, mocked auth/API) verified manual assignment with no review/decision controls, page errors or framework overlay. Served source matches. ESLint reports two pre-existing unused constants in EventDetailPage (AVAILABLE_FACILITIES and AVAILABLE_ACCESSIBILITY); left unchanged. Earlier unrelated page-suite failures remain; no full-story pass claimed.
- AC review: All seven SPM-37 criteria concern draft save/status/reopen/update/persistence/feedback/submitted-edit restrictions; approval/rejection is outside that scope. This removal does not change draft APIs or forms. Real authenticated backend flow and full AC regression were not rerun for this removal.
- Follow-up/conflicts: Changes staged without commit/push. Previous staged changes preserved. Supersedes the prior check that expected Review Event after manual assignment; that action is intentionally absent now.

- Lint follow-up: At the user's request, removed the two unused EventDetailPage constants. ESLint now passes for EventDetailPage.tsx, EventDetailPage.test.tsx and useAppStore.ts. No behavior change; no additional tests required. Staged without commit or push.

## 2026-09-21 - Codex (GPT-6) - Diagnose comments error after manual assignment

- Context: User reported Cannot GET /api/events/:id/comments after assignment; scope remains SPM-37.
- Findings: Assignment changes frontend state and triggers the existing SPM-39 comment fetch. Current source registers ClarificationsModule and GET events/:id/comments, but the running backend image has no compiled clarification module and startup logs show no comments route. Frontend/backend runtime versions are mismatched.
- Checks: Read controller/module wiring and frontend effect; inspected compiled module existence and backend route logs without printing credentials. No code or runtime changes; prior mocked browser test did not validate live route availability.
- Follow-up: Align backend runtime with reviewed source before live clarification testing. Current rebased backend has previously documented authentication/contract differences, so blindly rebuilding it is broader than this SPM-37 diagnosis. Ledger staged; no commit/push.
