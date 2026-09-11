# Changelog

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
