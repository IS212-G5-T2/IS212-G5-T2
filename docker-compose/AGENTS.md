# Development agent rules

Scope: shared local Docker Compose tooling under `docker-compose/`, within the [global agent instructions](../AGENTS.md).

## Current state

- This directory defines the shared three-tier Docker Compose integration stack.
- The Compose build contexts expect `../frontend`, the React/Vite frontend, and `../backend`, the NestJS backend service in this checkout.
- The stack is an integration environment, not a disposable unit-test fixture. Treat its containers, networks, and named volumes as shared state unless the user explicitly asks to stop or reset them.

## Lifecycle rules

- Reuse existing local-dev services when testing integration behavior. Clean up records, files, containers, and other resources created by the test itself.
- Do not automatically run `docker compose down` or `docker compose down -v` as test teardown. Use `docker compose down` only for an explicit stack stop, and `docker compose down -v` only for an explicit data reset.
- If an automation starts the local-dev stack for integration testing, report that it started the services and whether they were left running for reuse.
- For disposable Docker tests outside this shared stack, follow these lifecycle
  rules: remove run-owned containers, networks, temporary images, and volumes
  by recorded identity.

## Change guidance

- Keep environment variable names aligned with the local integration conventions documented in [README.md](README.md).
- Keep database images and initialization assets under `database/`; keep Compose orchestration under `docker-compose/`.
- Update Compose, `.env.example`, and README instructions together when replacing services or adding implemented services.
