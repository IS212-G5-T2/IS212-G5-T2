# SPM Local Development

This folder provides a Docker Compose setup for local integration before pull requests.

The stack is local-only; this repository no longer contains deployment, Terraform, or Kubernetes configuration.

| Local concern | Local implementation |
| --- | --- |
| Compose network | `spm` |
| Frontend container | `frontend` on `localhost:5173` |
| Backend container | `backend` on `localhost:8080` |
| PostgreSQL | `postgres` on `localhost:5432` |
| Runtime configuration | `.env` file |
| Service readiness | Compose health checks |

## Current setup

The Compose build contexts expect `../../apps/frontend` for the React/Vite frontend, `../../services/backend` for the NestJS backend service, and `../database/postgresql` for the local PostgreSQL image. Database assets are owned separately from the Compose orchestration.

## First Run

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Start the stack:

   ```sh
   docker compose up --build
   ```

3. Check the backend:

   ```sh
   curl http://localhost:8080/healthz
   ```

The response should show `status: ok` once Postgres is ready and the backend service has started.

4. Open the frontend:

   ```text
   http://localhost:5173
   ```

## Common URLs

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:8080/healthz` |
| PostgreSQL | `localhost:5432` |

## Local Configuration

Local services connect to PostgreSQL through the Compose service name `postgres:5432`. Keep application code driven by `DATABASE_URL`, `DB_HOST`, and `DB_PORT` so local configuration stays outside source code.

The `.env` file configures PostgreSQL, backend, and frontend defaults, including `DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, and `VITE_API_BASE_URL`.

Use local-only values in `.env`. Do not commit real credentials.

`VITE_API_BASE_URL` is passed into the frontend container. PostgreSQL and backend settings stay on their respective containers.

## PostgreSQL Authentication

The backend authenticates against PostgreSQL at `/api/auth/login`,
`/api/auth/me`, and `/api/auth/logout`. Login sets an HTTP-only `SameSite=Lax`
cookie with an eight-hour default lifetime. The Compose defaults keep
`AUTH_COOKIE_SECURE=false` for `http://localhost`; set it to `true` only behind
HTTPS.

Fresh database volumes receive local role accounts automatically. Existing
volumes can receive them without a reset (they already contain the RBAC seed):

```sh
docker compose exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < ../database/postgresql/init/001_users.sql
```

Use the documented development accounts and password in
`development/database/README.md`; never reuse them outside local development.

## Frontend, Backend, And Database Layout

Local orchestration is intentionally split by responsibility:

| Path | Responsibility |
| --- | --- |
| `apps/frontend` | React/Vite frontend source and frontend container image |
| `services/backend` | NestJS backend source and backend container image |
| `development/database/postgresql` | Local PostgreSQL image and initialization assets |
| `development/local-dev` | Three-tier Docker Compose orchestration and local stack docs |

The frontend is exposed on `localhost:5173`; the backend is exposed directly on `localhost:8080` and PostgreSQL on `localhost:5432`.

## Replacing The Backend Service

The Compose configuration targets `services/backend`. To integrate a different service:

1. Put the service code under `services/<service-name>` or point the Compose build context to the existing local path.
2. Keep `/healthz` or `/readyz` for local health checks.
3. Keep the backend port consistent with its Compose port mapping and local API URL.
4. Add matching database and frontend API configuration to `.env.example` and this README.

## Updating Database Initialization

PostgreSQL init scripts are built into the local image from `development/database/postgresql/init`. These scripts run only when Docker creates a fresh `postgres-data` volume. For already-initialized local databases, apply changes manually or explicitly reset data with `docker compose down -v` from this directory when it is safe to discard local state.

To build and run only the database without the rest of Docker Compose:

```sh
docker build -t spm-postgresql ../database/postgresql
docker run --name spm-postgresql -p 5432:5432 spm-postgresql
```

The standalone database image includes local-only defaults for `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Compose can still override them through `.env.example` or `.env`.

## Integration environment lifecycle

This is the shared three-tier integration environment, with a persistent
`postgres-data` volume. Automated integration tests should preserve the
environment and existing data, remove their own test records and temporary
resources, and report any services they started and left running. The
[development lifecycle rules](../AGENTS.md#lifecycle-rules) define resource
ownership and the exception to disposable-test teardown.

When explicitly stopping the whole stack, run `docker compose down` from this directory. It removes the stack's containers and network while retaining the named database volume.

Use `docker compose down -v` only for an explicitly requested data reset: it also deletes the named database volume. Neither command is an automatic integration-test cleanup step. Disposable tests outside this shared environment must remove their own containers and associated temporary resources after the run.

## Daily Commands

```sh
docker compose up --build
docker compose down
docker compose logs -f backend
docker compose logs -f frontend
docker compose ps
```

Choose shutdown or data reset according to the lifecycle guidance above.

## Events sample database

The local `spm` PostgreSQL database stores requests in `events`. `002_events.sql` defines the schema; `003_sample_events.sql` adds one fictional Submitted event. Records persist in Docker's `postgres-data` volume. Dates/times use `timestamptz`; the API/browser handles local-time display.

For an existing local volume, apply these additive scripts from the repository root (no reset needed):

```sh
docker compose -f development/local-dev/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/002_events.sql
docker compose -f development/local-dev/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/003_sample_events.sql
```

The second command is optional sample data. Both scripts are safe to repeat. Fresh volumes receive them when the PostgreSQL image is rebuilt. Do not delete volumes to apply these scripts.

As of SPM-38, `/api/events` and `/api/requests` (drafts) require a verified
identity; `DEMO_ORGANISER_ENABLED` no longer applies to these routes
(`request.currentUser`, set by `AuthenticationMiddleware` from a Postgres
session — this later replaced the original Firebase-token implementation,
see the SPM-30 local-session-auth migration — is the only source of
identity). An Organiser sees only their own requests; a Coordinator sees only
requests round-robin has assigned to them. The coordinator roster
(`services/backend/src/events/coordinator-roster.ts`) is queried live from
Postgres (`users`/`user_roles`/`roles`, seeded in
`development/database/postgresql/init/001_users.sql`) rather than hardcoded —
any active account holding the `COORDINATOR` role is eligible. A request is
assigned a coordinator automatically at submission time — there is no manual
"claim this request" step. Pre-SPM-38 event rows created under the old fixed
demo identity (`current-user`, no coordinator) are legacy-owned and stay
invisible under real-identity scoping; they are not automatically migrated
(see `services/backend/AGENTS.md`'s events-boundary policy). After backend
changes, rebuild and start it with `docker compose up -d --build backend`.
The frontend code is bind-mounted and
refreshed by Vite. Visit http://localhost:5173/planning to create an event,
then inspect it under My Events.
