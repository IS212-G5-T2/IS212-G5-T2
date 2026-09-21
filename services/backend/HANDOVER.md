# Backend handover

## Current State

`services/backend` is a NestJS backend service generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`, and `/healthz` returns a simple health payload.

`AuthModule` provides shared Firebase JWT authentication middleware and database-backed RBAC helpers. Route-owning modules apply `FirebaseAuthenticationMiddleware` to their controllers; it verifies Bearer tokens for non-public routes and attaches the verified Firebase user to `request.currentUser`.

When `FIREBASE_AUTH_EMULATOR_HOST` is configured, `FirebaseTokenService` initializes Firebase Admin with `GCLOUD_PROJECT` (default `demo-is212`) and no service-account credential. This is for the shared local Auth Emulator only; non-emulator environments continue to use the configured service account or application-default credentials.

`RbacRepository` reads the existing local database tables: `roles`, `resources`, and `role_permissions`. Its composable permission predicate is intended to be embedded in resource SQL alongside ownership conditions, so authorization and the data operation can execute in one database request. Runtime configuration requires `DATABASE_URL`; Firebase Admin prefers `FIREBASE_SERVICE_ACCOUNT_PATH`, falls back to `FIREBASE_SERVICE_ACCOUNT_JSON`, and otherwise uses application default credentials.

Auth source is split by responsibility: `src/auth/authentication` for token verification and middleware, `src/auth/authorization` for RBAC/ownership services, and `src/auth/models` for shared auth types.

`DatabaseModule` centralizes PostgreSQL access. Repositories should inject
`DatabaseService` instead of creating new pools so connection limits, timeouts,
and shutdown behavior stay consistent. Use `query()` for single statements and
`transaction()` for multi-step writes that need shared commit/rollback handling.
The current `EventsService` does not yet follow this guidance: it creates a
separate pool. The generated starter endpoint currently returns `Hello World!`.
The events controller/service validates and persists submitted requests in
PostgreSQL. Drafts and events use Firebase UID ownership; submission retains the owner. Email delivery is deferred.

## Continuity Notes

Legacy demo-owned records are retained but cannot be safely attributed to a Firebase account. Do not expose or auto-claim them; migrate only after explicit confirmation of the actual owner. My drafts and My Events must remain scoped to the verified UID.

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Reuse `FirebaseAuthenticationMiddleware` for token verification and
  `RbacRepository` for composable resource-query permission checks instead of
  duplicating RBAC SQL in controllers. Draft and event controllers apply this middleware and require the ORGANISER role.
- Use `DatabaseService` for new PostgreSQL queries; do not instantiate
  `pg.Pool` inside feature repositories. Migrate the current event pool as part
  of hardening that endpoint.
- Keep Firebase `roles` claim values aligned with the RBAC seed values: `ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, and `ATTENDEE`.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- Review the npm audit output from adding Firebase Admin/PostgreSQL dependencies before release hardening.
- No deployment path is configured in this repository.

## Event persistence

`src/events` owns submission validation and the API. Local schema initialization
belongs to `development/database`; production migrations remain outside this
ticket. The `DEMO_ORGANISER_ENABLED` switch must be replaced by authenticated
server identity integration before multi-user use. Never trust an organiser ID
or status supplied by the client. Keep the nested TypeScript 5 lock entry when
using local npm 11; Docker npm 10 requires it.

## Coordinator clarification/amendment requests (SPM-39)

`src/clarifications` implements the Coordinator-to-Organiser clarification
thread on an event request, using real Firebase-authenticated identity
(`FirebaseAuthenticationMiddleware` is applied to `ClarificationsController`
in `AppModule.configure()`), unlike `EventsController`. `004_clarifications.sql`
adds `events.coordinator_id`/`coordinator_name` and creates `event_comments`
(the clarification/reply thread) and a minimal `notifications` table.
`006_remove_under_review_status.sql` (SPM-38 follow-up) later tightens the
`status` CHECK constraint back down to `Submitted`/`Approved` only —
"Under Review" was retired as a distinct status, since neither coordinator
assignment nor a clarification request is a meaningful "review started"
signal on its own.

Known gaps to close before this is fully production-ready:

- **No endpoint sets `coordinator_id`.** Assigning a coordinator to an event
  is a separate, unticketed feature (today it's mock-only in the frontend
  Zustand store — see `apps/frontend/src/store/useAppStore.ts`'s
  `assignCoordinator`). Until a real assignment endpoint exists,
  `coordinator_id` must be populated directly (e.g., seed data or a manual
  `UPDATE`) for the coordinator-side clarification flow to work against real
  data.
- **`EventsService.identity()` still returns a single hardcoded demo
  organiser** (`DEMO_ORGANISER_ENABLED`) for every caller regardless of the
  real authenticated Firebase user, and every event created today has
  `organiser_id = 'current-user'`. The clarification reply endpoint's
  ownership check (`events.organiser_id === currentUser.uid`) is real and
  correct, but it will only match a real Firebase-authenticated organiser
  once `EventsService` is migrated off that demo identity — see the
  "Event persistence" note above. Until then, only rows seeded/updated with a
  real uid as `organiser_id` can exercise the reply endpoint end-to-end.
- The `notifications` table is new and intentionally minimal (insert +
  per-recipient read), scoped to clarification/clarification-reply events
  only. It does not replace the frontend's broader mock notification system
  in `useAppStore.ts` (approvals, rejections, venue bookings, etc.), which
  remains client-only.
- RBAC's `002_rbac.sql` seed grants `ORGANISER` only `read` on the "Event
  Review" resource (not `update`), so the Organiser-reply endpoint is
  authorized by a direct `organiser_id` ownership check rather than
  `RbacRepository`'s predicate builder. See the comment in
  `clarifications.service.ts`.
