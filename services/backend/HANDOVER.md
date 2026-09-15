# Backend handover

## Current State

`services/backend` is a NestJS backend service generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`, and `/healthz` returns a simple health payload.

`AuthModule` provides shared Firebase JWT authentication middleware and database-backed RBAC helpers. Route-owning modules apply `FirebaseAuthenticationMiddleware` to their controllers; it verifies Bearer tokens for non-public routes and attaches the verified Firebase user to `request.currentUser`.

When `FIREBASE_AUTH_EMULATOR_HOST` is configured, `FirebaseTokenService` initializes Firebase Admin with `GCLOUD_PROJECT` (default `demo-is212`) and no service-account credential. This is for the shared local Auth Emulator only; non-emulator environments continue to use the configured service account or application-default credentials.

`RbacRepository` reads the existing local database tables: `roles`, `resources`, and `role_permissions`. Its composable permission predicate is intended to be embedded in resource SQL alongside ownership conditions, so authorization and the data operation can execute in one database request. Runtime configuration requires `DATABASE_URL`; Firebase Admin prefers `FIREBASE_SERVICE_ACCOUNT_PATH`, falls back to `FIREBASE_SERVICE_ACCOUNT_JSON`, and otherwise uses application default credentials.

Auth source is split by responsibility: `src/auth/authentication` for token verification and middleware, `src/auth/authorization` for RBAC/ownership services, and `src/auth/models` for shared auth types.

`DatabaseModule` centralizes PostgreSQL access. Repositories should inject `DatabaseService` instead of creating new pools so connection limits, timeouts, and shutdown behavior stay consistent. Use `query()` for single statements and `transaction()` for multi-step writes that need shared commit/rollback handling.

## Continuity Notes

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Reuse `FirebaseAuthenticationMiddleware` for token verification and `RbacRepository` for composable resource-query permission checks instead of duplicating RBAC SQL in controllers.
- Use `DatabaseService` for new PostgreSQL queries; do not instantiate `pg.Pool` inside feature repositories.
- Keep Firebase `roles` claim values aligned with the RBAC seed values: `ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, and `ATTENDEE`.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- Review the npm audit output from adding Firebase Admin/PostgreSQL dependencies before release hardening.
- No deployment path is configured in this repository.
