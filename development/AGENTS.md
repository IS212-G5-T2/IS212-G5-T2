# Development agent rules

Scope: shared tooling under `development/`, within the [global agent instructions](../AGENTS.md).

## Current state

- This directory defines shared local development assets, including the Docker Compose integration stack, gateway configuration, local database initialization, and storage/messaging emulators.
- The Compose build contexts currently expect `../../apps/frontend`, the React/Vite frontend, and `../../services/backend`, the NestJS backend service in this checkout.
- The stack is an integration environment, not a disposable unit-test fixture. Treat its containers, networks, and named volumes as shared state unless the user explicitly asks to stop or reset them.

## Lifecycle rules

- Reuse existing local-dev services when testing integration behavior. Clean up records, files, containers, and other resources created by the test itself.
- Do not automatically run `docker compose down` or `docker compose down -v` as test teardown. Use `docker compose down` only for an explicit stack stop, and `docker compose down -v` only for an explicit data reset.
- If an automation starts the local-dev stack for integration testing, report that it started the services and whether they were left running for reuse.
- For disposable Docker tests outside this shared stack, follow the [global automation resource lifecycle](../AGENTS.md#automation-resource-lifecycle): remove run-owned containers, networks, temporary images, and volumes by recorded identity.

## Change guidance

- Keep environment variable names aligned with the local integration conventions documented in [local-dev/README.md](local-dev/README.md).
- Keep database images and initialization assets under `development/database`; keep Compose orchestration under `development/local-dev`.
- Update Compose, gateway routes, `.env.example`, and README instructions together when replacing services or adding implemented services.
