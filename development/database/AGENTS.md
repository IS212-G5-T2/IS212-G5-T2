# Database agent rules

Scope: local database assets under `development/database`, within the [global agent instructions](../../AGENTS.md) and [development rules](../AGENTS.md).

## Ownership

- This directory owns local database images and initialization assets used by the shared Docker Compose integration stack.
- It does not own backend persistence code, application migrations, production database infrastructure, or frontend behavior.

## Change Guidance

- Keep Dockerfiles thin wrappers around official database images unless the local stack has a clear need for extra runtime packages.
- Keep SQL initialization idempotent so repeated local setup and persistent named volumes remain predictable.
- Coordinate schema assumptions with affected backend services under `services/` before changing tables, columns, or seed data.
- Keep the standalone PostgreSQL build/run/test workflow documented in `development/database/README.md` when changing `development/database/postgresql`.
- Update `development/local-dev/compose.yaml` and `development/local-dev/README.md` only when database paths, service names, ports, Compose integration, or environment variables change.
