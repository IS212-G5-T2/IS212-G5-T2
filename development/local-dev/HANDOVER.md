# Local development handover

## Current state

`development/local-dev` defines the shared Docker Compose integration environment with frontend, backend, gateway configuration, PostgreSQL, and storage/messaging emulators.

The Compose build contexts currently expect `../../apps/frontend` for the React/Vite frontend, `../../services/backend` for the NestJS backend service, and `../database/postgresql` for the local PostgreSQL image in this checkout. PostgreSQL initialization assets are built into that image from `development/database/postgresql/init`.

The local PostgreSQL initialization runs `001_schema.sql` for base local schema and `002_rbac.sql` for seeded RBAC tables: `roles`, `resources`, and `role_permissions`. Backend authorization code should treat these as local schema/seed assumptions and still enforce relationship-level record checks separately from role permissions.

## Lifecycle notes

- Treat local-dev as a shared integration environment, not a disposable unit-test fixture.
- Preserve existing stack state and named volumes unless the user explicitly asks to stop or reset them.
- Automated integration tests should clean up their own test records and temporary resources while leaving shared services available for reuse.
