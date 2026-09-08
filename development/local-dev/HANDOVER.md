# Local development handover

## Current state

`development/local-dev` defines the shared Docker Compose integration environment with gateway configuration, PostgreSQL initialization, and storage/messaging emulators.

The Compose build context currently expects `../../services/backend`, the NestJS backend service in this checkout.

## Lifecycle notes

- Treat local-dev as a shared integration environment, not a disposable unit-test fixture.
- Preserve existing stack state and named volumes unless the user explicitly asks to stop or reset them.
- Automated integration tests should clean up their own test records and temporary resources while leaving shared services available for reuse.
