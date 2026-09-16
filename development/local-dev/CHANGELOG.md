# Changelog

## 2026-09-16

- Removed the Firebase Auth Emulator from local Docker Compose. Local Compose
  now uses real Firebase configuration supplied through its untracked `.env`;
  the emulator remains CI-only for backend E2E tests.

## 2026-09-15

- Simplified the local Compose stack to frontend, backend, and PostgreSQL.
- Removed gateway, GCS, Pub/Sub, initialization, and Adminer services; the backend is now exposed directly on `localhost:3000`.

## 2026-09-11

- Added local PostgreSQL RBAC schema and seed data in a separate init file for roles, resources, and role permissions.
- Removed baked PostgreSQL credentials from the local database image; pass local credentials through Compose or standalone `docker run` environment variables.

## 2026-09-09

- Added the frontend service to the local Docker Compose stack.
- Moved PostgreSQL initialization ownership to `development/database/postgresql/init`.
- Added a buildable local PostgreSQL Dockerfile used by Docker Compose and standalone database runs.
- Documented the frontend, backend, and database local development layout.

## 2026-09-06

- Added local-dev agent guidance and handover notes for shared integration lifecycle behavior.
- Clarified that `docker compose down` and `docker compose down -v` require explicit stop or reset intent.

## Event request sample

- Documented additive events schema/seed setup for existing volumes and the
  demo-only event identity limitation.
