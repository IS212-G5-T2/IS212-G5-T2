# Development agent rules

Scope: shared tooling under `development/`, within the [global agent instructions](../AGENTS.md).

## Current state

- This directory defines the shared local integration stack with Docker Compose, gateway configuration, PostgreSQL initialization, and storage/messaging emulators.
- The Compose build context currently expects `../../services/sample-service`, which is absent from this checkout. The checked-out stack cannot build that service until the context is supplied or changed for an implemented service.
- The stack is an integration environment, not a disposable unit-test fixture. Treat its containers, networks, and named volumes as shared state unless the user explicitly asks to stop or reset them.

## Lifecycle rules

- Reuse existing local-dev services when testing integration behavior. Clean up records, files, containers, and other resources created by the test itself.
- Do not automatically run `docker compose down` or `docker compose down -v` as test teardown. Use `docker compose down` only for an explicit stack stop, and `docker compose down -v` only for an explicit data reset.
- If an automation starts the local-dev stack for integration testing, report that it started the services and whether they were left running for reuse.
- For disposable Docker tests outside this shared stack, follow the [global automation resource lifecycle](../AGENTS.md#automation-resource-lifecycle): remove run-owned containers, networks, temporary images, and volumes by recorded identity.

## Change guidance

- Keep environment variable names aligned with the Kubernetes and Terraform conventions documented in [local-dev/README.md](local-dev/README.md).
- Update Compose, gateway routes, `.env.example`, and README instructions together when replacing the sample service or adding an implemented service.
