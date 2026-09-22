# Local development handover

## Current state

`development/local-dev` defines the shared three-tier Docker Compose integration environment: frontend, backend, and PostgreSQL. The backend is published directly on `localhost:8080`; no gateway or storage/messaging emulators are part of this stack.

The Compose build contexts currently expect `../../apps/frontend` for the React/Vite frontend, `../../services/backend` for the NestJS backend service, and `../database/postgresql` for the local PostgreSQL image in this checkout. PostgreSQL initialization assets are built into that image from `development/database/postgresql/init`.

The local PostgreSQL initialization runs `001_schema.sql` for every local
table, constraint, extension, and index, then `002_seed_data.sql` for RBAC,
accounts, health-check data, and a fictional event. Backend
authorization code should treat these as local schema/seed assumptions and
still enforce relationship-level record checks separately from role permissions.

## Lifecycle notes

- Treat local-dev as a shared integration environment, not a disposable unit-test fixture.
- Preserve existing stack state and named volumes unless the user explicitly asks to stop or reset them.
- Automated integration tests should clean up their own test records and temporary resources while leaving shared services available for reuse.

## Event requests

The backend uses `DATABASE_URL` for event persistence and
`DEMO_ORGANISER_ENABLED` for the account-free event sample. That event identity
is separate from the real Firebase configuration used for sign-in and
`/auth/me`; it is not authorization. Apply the additive events SQL scripts
using README instructions for existing volumes. Email delivery is deferred.
Preserve existing database data when testing.
