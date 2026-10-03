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

## 15-09-2026 - Codex (GPT-5) - SPM-30

- Issue/PR: SPM-30
- Human requester/operator: swr
- Areas touched: `apps/frontend`, `AI_USAGE.md`
- Summary: Read Firebase custom role claims after sign-in, restrict organiser event creation and ownership-bound edits, restrict event-change reviews to the assigned coordinator, organise guarded routes with nested React Router `Outlet`s, and document the new guard and test-helper contracts.
- AI contribution: Acceptance-criteria review, frontend authorization implementation, JSDoc, and happy-path/negative direct-navigation tests guided by Week 4 slides 26–33.
- Assumptions: Jira's current explicit acceptance criterion naming an Event Organiser governs the conflicting attendee story title; Firebase custom claims use the existing uppercase RBAC role names.
- Checks run: `npm --prefix apps/frontend test` (5 files, 50 tests passed); `git diff --check`.
- Follow-up/conflict notes: The frontend's in-memory data store has no backend resource API yet, so server-side RBAC and ownership enforcement remains a required future security boundary. No commit or pull request created.
