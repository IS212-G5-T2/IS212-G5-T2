# Database agent rules

Scope: local database assets under `database/`, within the [global policy](../AGENTS.md).

## Ownership

- This directory owns the local PostgreSQL image and initialization/seed assets used by the shared Docker Compose development stack.
- It does not own backend persistence code, application migrations for existing databases, frontend behavior, production database infrastructure, or Compose orchestration.
- Coordinate schema assumptions and additive migrations with `backend/`; coordinate service paths, ports, and environment with `docker-compose/` when those interfaces change.

## Shared Jira agent workflow

For Jira work, follow [`.ai/workflow/README.md`](../.ai/workflow/README.md) and [`.ai/agents/implementation.md`](../.ai/agents/implementation.md). Agent 1 owns implementation and tests; when a ticket touches this component, it captures Jira and Confluence context once under `.ai/runtime/{ticket_id}/`. Reviewers use that snapshot instead of retrieving the same source context. Agents 2–4 review independently without editing; the orchestrator reconciles findings, selectively reruns affected reviewers within the bounded retry, and runs final validation. Do not create a database-specific agent flow.

## Layout and change guidance

- `postgresql/Dockerfile` is a thin wrapper around the official PostgreSQL image and copies `postgresql/init/` into the image entrypoint directory.
- `postgresql/init/001_schema.sql` defines the schema for a fresh local database. `postgresql/init/002_seed_data.sql` inserts development-only roles, accounts, health-check data, and fictional sample records.
- Preserve the two-file initializer convention and numeric execution order unless a documented repository decision changes it. Keep schema definitions in the schema file and seed inserts in the seed file.
- Make SQL safe to apply in the documented local workflows; use idempotent seed operations where appropriate because the seed script can also be rerun manually against an existing local database.
- These scripts run only when PostgreSQL initializes a fresh data directory. Editing them does not upgrade an existing named volume. Never direct someone to reset a volume to apply a schema change without confirming local data may be discarded.
- Existing-database changes belong in ordered, additive migrations under `backend/migrations/`. Inspect `backend/AGENTS.md` and coordinate the migration and fresh-install schema with backend owners. Do not place application migrations here or replace an existing schema from an init script.
- Keep initialization safe and predictable. Use deterministic, fictional development data only. Never add real credentials, production data, or secrets; runtime passwords belong in local environment configuration.
- Do not change Compose service names, mounts, ports, or environment assumptions from this directory without coordinating with `docker-compose/` and reading its scoped instructions.
- Update [README.md](README.md) and `CHANGELOG.md` when the initializer layout, fresh-database behavior, expected seed data, or standalone setup changes.

## Local verification

The standalone PostgreSQL build/run workflow is documented in [README.md](README.md). After SQL changes, use an isolated disposable database or container when available. Do not reset or modify the shared Compose volume as a shortcut. Record skipped database validation and its environmental reason in the ticket runtime and `AI_USAGE.md`.
