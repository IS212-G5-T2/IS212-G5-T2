# Local development handover

## Current state

`development/local-dev` defines the shared Docker Compose integration environment with frontend, backend, gateway configuration, PostgreSQL, and storage/messaging emulators.

The Compose build contexts currently expect `../../apps/frontend` for the React/Vite frontend, `../../services/backend` for the NestJS backend service, and `../database/postgresql` for the local PostgreSQL image in this checkout. PostgreSQL initialization assets are built into that image from `development/database/postgresql/init`.

## Lifecycle notes

- Treat local-dev as a shared integration environment, not a disposable unit-test fixture.
- Preserve existing stack state and named volumes unless the user explicitly asks to stop or reset them.
- Automated integration tests should clean up their own test records and temporary resources while leaving shared services available for reuse.

## Event requests

The backend now uses DATABASE_URL for event persistence and DEMO_ORGANISER_ENABLED for the account-free local sample. Apply the additive events SQL scripts using README instructions for existing volumes. Email delivery is deferred. Preserve existing database data when testing.

Draft storage is backend-owned. Compose mounts its migration into PostgreSQL initialization for new volumes; apply it manually to existing volumes as documented in README. Preserve both the shared volume and existing records during upgrades.

The gateway `client_max_body_size` is 8 MB to match the backend JSON parser; keep these limits aligned when attachment limits change.
