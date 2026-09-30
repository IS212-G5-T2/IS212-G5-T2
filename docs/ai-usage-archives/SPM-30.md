# SPM-30 — Attendee login

Jira status at migration: `Done`. Migrated at the user’s request on 30-09-2026.

## 22-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `services/backend/test`, `AI_USAGE.md`
- Summary: Restored the event seed query's placeholders so organiser, coordinator, attachments, and status values align with the supplied PostgreSQL parameter array.
- AI contribution: Parameter-mapping diagnosis and commit-history cleanup.
- Assumptions: `$6` represents the status value because it is the sixth query parameter; the explicit INSERT column list determines where that value is stored.
- Checks run: Focused `events-assign.e2e-spec.ts` execution attempted; blocked because no PostgreSQL service is listening on local port 5432.
- Follow-up/conflict notes: The correction is folded into the existing SPM-30 test commit; no remote push was made.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Restored the SPM-30 Firebase-derived user model after the manual merge combined it with mock-role code. Removed mock role switching and the unsupported admin role, restored the signed-out placeholder user, forwarded Firebase ID tokens from API calls, and repaired test discovery, build, and lint configuration.
- AI contribution: Merge correction, frontend authorization integration, regression tests, and verification.
- Assumptions: The backend event API remains responsible for verifying the forwarded token and enforcing resource authorization; it is not changed by this frontend-only update.
- Checks run: `npm ci --dry-run`, `npm run test:coverage` (86 tests passed), `npm run build`, and `npm run lint` in `apps/frontend`.
- Follow-up/conflict notes: No files were staged, committed, or pushed. Server-side Firebase enforcement for `/api/events` remains outstanding.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: repository Markdown documentation and `AI_USAGE.md`
- Summary: Reviewed the staged manual merge against the current implementation and corrected documentation that combined real Firebase authentication with the separate demo-only event API. Repaired stale test-path and CI statements, and restored malformed ledger headings.
- AI contribution: Merge review, documentation reconciliation, and static verification.
- Assumptions: This change documents current behavior and known limitations; it does not repair the frontend or server-side authorization defects identified in the review.
- Checks run: Markdown conflict-marker scan, `git diff --check`, Docker Compose configuration validation, frontend/backend package-lock validation, frontend/backend tests, builds, and lint checks.
- Follow-up/conflict notes: Frontend compilation, lint, and test failures remain unresolved. The event API must be integrated with Firebase identity and RBAC before it can satisfy end-to-end authorization requirements.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30 / PR #15
- Human requester/operator: swr
- Areas touched: `apps/frontend/src/test`, `AI_USAGE.md`
- Summary: Added inert Firebase Web SDK environment values to the global Vitest setup so store imports cannot initialize Firebase Auth with an empty CI API key.
- AI contribution: CI failure diagnosis and test-environment configuration.
- Assumptions: Tests mock Firebase network operations; the test-only configuration is never used by the browser build or local Compose runtime.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed); `git diff --check`.
- Follow-up/conflict notes: Existing PR #15 is currently conflicted with overlapping dev event-feature work.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Refreshed Jira and aligned the implementation to its current Attendee story: denied attendee direct navigation to venue, booking, and equipment operations; confined registration and withdrawal mutations to the authenticated attendee; added direct-route and registration behavior tests.
- AI contribution: Jira acceptance-criteria refresh, frontend access-control implementation, and tests.
- Assumptions: `/events` and event details are intentionally attendee-accessible for browsing, while operational management routes belong only to their assigned staff roles.
- Checks run: `npm run test:coverage` in `apps/frontend` (72 tests passed; scoped SPM-30 coverage gate passed); shell syntax check for the frontend CI entrypoint; `git diff --check`. Frontend build remains blocked by the pre-existing TypeScript 6 `baseUrl` deprecation configuration.
- Follow-up/conflict notes: The frontend currently uses an in-memory event/registration model. Server-side enforcement awaits the future event and registration API.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend/test`, `AI_USAGE.md`
- Summary: Corrected login fixtures so every account receives its matching Firebase role claim, added the assigned-coordinator success case, added the frontend CI test entrypoint, and expanded CI E2E checks for organiser claims and seeded PostgreSQL RBAC permissions.
- AI contribution: Acceptance-criteria test-gap analysis and focused test/CI implementation.
- Assumptions: The current in-memory frontend event model is the implemented event-management surface for SPM-30; real event API ownership checks belong to the future resource API.
- Checks run: Frontend Vitest coverage (62 tests passed; 100% statements, branches, functions, and lines for the SPM-30 login, Firebase-role mapping, and access-guard files); backend lint, build, and unit tests (95 passed). Emulator/PostgreSQL E2E remains CI-only by requester preference.
- Follow-up/conflict notes: Jira could not be re-read because the Atlassian OAuth refresh token is invalid; no Jira data was changed.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Removed the interactive real-Firebase curl helper and its README/changelog references at the requester's direction. CI Firebase Auth Emulator E2E coverage and the protected backend auth endpoint remain.
- AI contribution: Local helper removal and documentation cleanup.
- Assumptions: GitHub Actions E2E coverage is the desired automated authentication verification path.
- Checks run: `git diff --check`.
- Follow-up/conflict notes: No local Compose services were started or stopped.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added authenticated `GET /auth/me`, corrected the local curl helper to call it, and changed the Firebase emulator E2E test to exercise the production route rather than a test-only controller. The E2E suite also checks Firebase rejects an incorrect password before issuing a token.
- AI contribution: Backend API, test refactor, test helper correction, and documentation.
- Assumptions: The route is a small client-facing session-introspection contract; a verified token may disclose only its UID, optional email, and normalized application roles to that same token holder.
- Checks run: `npm run lint`, `npm run build`, and `npm test` in `services/backend` (95 tests passed); shell syntax check for the local helper; `git diff --check`. Emulator E2E remains CI-only by requester preference.
- Follow-up/conflict notes: No event/request backend API exists yet, so server-side resource ownership enforcement remains future domain work; existing frontend guards cover the current in-memory UI routes.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `AI_USAGE.md`
- Summary: Added an interactive curl-based helper that signs a prompted non-production Firebase user in through the real Firebase REST API and sends its ID token to the local backend's protected root route.
- AI contribution: Local integration test helper and setup documentation.
- Assumptions: The caller has started the local Compose stack and configured a non-production Firebase Web API key in `development/local-dev/.env`; the backend service account is configured for that same Firebase project.
- Checks run: Shell syntax check and static script inspection; no real Firebase credentials, user accounts, token, or local stack were used.
- Follow-up/conflict notes: The helper verifies authentication only. Resource-specific backend role and ownership enforcement awaits corresponding resource endpoints.

## 16-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `development/local-dev`, `apps/frontend/README.md`, `.github/workflows/tests.yml`, `AI_USAGE.md`
- Summary: Removed the local Firebase Auth Emulator service and fake Firebase settings from Compose. Local Compose now receives real non-production Firebase settings from its untracked `.env`; the emulator remains confined to CI E2E tests.
- AI contribution: Compose and documentation reconfiguration, plus CI emulator-config path correction after the Firebase config moved under `development/local-dev/firebase`.
- Assumptions: Local developers supply Web SDK configuration and a same-project Firebase Admin service account in `development/local-dev/.env`, and do not use production Firebase credentials.
- Checks run: Docker Compose configuration validation with `.env.example`; Firebase emulator JSON parsing; `git diff --check`.
- Follow-up/conflict notes: The shared local Compose stack was not started or stopped. No commit or pull request created.

## 15-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Read Firebase custom role claims after sign-in, restrict organiser event creation and ownership-bound edits, restrict event-change reviews to the assigned coordinator, organise guarded routes with nested React Router `Outlet`s, and document the new guard and test-helper contracts.
- AI contribution: Acceptance-criteria review, frontend authorization implementation, JSDoc, and happy-path/negative direct-navigation tests guided by Week 4 slides 26–33.
- Assumptions: Jira's current explicit acceptance criterion naming an Event Organiser governs the conflicting attendee story title; Firebase custom claims use the existing uppercase RBAC role names.
- Checks run: `npm --prefix apps/frontend test` (5 files, 50 tests passed); `git diff --check`.
- Follow-up/conflict notes: The frontend's in-memory data store has no backend resource API yet, so server-side RBAC and ownership enforcement remains a required future security boundary. No commit or pull request created.

## 15-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `services/backend`, `development/local-dev`, `AI_USAGE.md`
- Summary: Added opt-in frontend Auth Emulator connection, a shared Compose Auth Emulator service, and backend emulator initialization using the same `demo-is212` project without service-account credentials.
- AI contribution: Cross-service configuration, focused frontend/backend tests, and local setup documentation.
- Assumptions: `demo-is212` is emulator-only; real Firebase remains the default whenever `VITE_USE_FIREBASE_AUTH_EMULATOR` is not `true`.
- Checks run: Frontend Vitest (32 passed); targeted frontend Firebase-module coverage (8 passed; 100% statements, branches, functions, and lines); backend Vitest (93 passed); targeted Firebase token-service coverage (19 passed; 100% statements, branches, functions, and lines); backend build and lint; Docker Compose configuration validation; `git diff --check`. Frontend build is blocked by the pre-existing TypeScript 6 `baseUrl` deprecation, and frontend lint is blocked because ESLint 10 has no `eslint.config.*` file.
- Follow-up/conflict notes: The shared Compose stack was not started, preserving any existing local integration environment. No commit or pull request created.
