# SPM Local Development

This folder provides a Docker Compose setup for local integration before pull requests.

The stack is local-only; this repository no longer contains deployment, Terraform, or Kubernetes configuration.

| Local concern | Local implementation |
| --- | --- |
| Compose network | `spm` |
| Local gateway | `gateway` reverse proxy on `localhost:8080` |
| Frontend container | `frontend` on `localhost:5173` |
| Backend container | `backend` |
| PostgreSQL | `postgres` on `localhost:5432` |
| Object storage emulator | `fake-gcs-server` on `localhost:4443` |
| Pub/Sub emulator | Pub/Sub emulator on `localhost:8085` |
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

3. Check the local gateway:

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
| Local gateway | `http://localhost:8080` |
| Backend through gateway | `http://localhost:8080/healthz` |
| PostgreSQL | `localhost:5432` |
| Pub/Sub emulator | `localhost:8085` |
| Storage emulator | `http://localhost:4443` |
| Adminer, optional | `http://localhost:8081` |

Start Adminer only when needed:

```sh
docker compose --profile tools up db-admin
```

Use these Adminer values:

| Field | Value |
| --- | --- |
| System | `PostgreSQL` |
| Server | `postgres` |
| Username | `spm` |
| Password | `spm_dev_password` |
| Database | `spm` |

## Local Configuration

Local services connect to PostgreSQL through the Compose service name `postgres:5432`. Keep application code driven by `DATABASE_URL`, `DB_HOST`, and `DB_PORT` so local configuration stays outside source code.

The `.env` file configures local service defaults:

- `PROJECT_ID`
- `REGION`
- `ENVIRONMENT`
- `CLOUD_SQL_CONNECTION_NAME`
- `CLOUD_SQL_DATABASE`
- `STORAGE_BUCKET`
- `PUBSUB_TOPIC`
- `VITE_API_BASE_URL`

Use local-only values in `.env`. Do not commit real credentials.

Only `VITE_API_BASE_URL` is passed into the frontend container. Backend, database, storage, and Pub/Sub settings stay on the backend and infrastructure containers.

## Frontend, Backend, And Database Layout

Local orchestration is intentionally split by responsibility:

| Path | Responsibility |
| --- | --- |
| `apps/frontend` | React/Vite frontend source and frontend container image |
| `services/backend` | NestJS backend source and backend container image |
| `development/database/postgresql` | Local PostgreSQL image and initialization assets |
| `development/local-dev` | Docker Compose, gateway, emulator setup, and local stack docs |

The frontend is exposed directly on `localhost:5173` for Vite development. Backend API traffic remains available through the local gateway on `localhost:8080`.

## Replacing The Backend Service

The Compose configuration targets `services/backend`. To integrate a different service:

1. Put the service code under `services/<service-name>` or point the Compose build context to the existing local path.
2. Keep `/healthz` or `/readyz` for local health checks.
3. Keep the internal container port as `8080`, unless the Compose gateway changes too.
4. Add a new route in `gateway/nginx.conf` when there is more than one service.
5. Add matching topic, subscription, database, or storage config to `.env.example` and this README.

## Updating Database Initialization

PostgreSQL init scripts are built into the local image from `development/database/postgresql/init`. These scripts run only when Docker creates a fresh `postgres-data` volume. For already-initialized local databases, apply changes manually or explicitly reset data with `docker compose down -v` from this directory when it is safe to discard local state.

To build and run only the database without the rest of Docker Compose:

```sh
docker build -t spm-postgresql ../database/postgresql
docker run --name spm-postgresql -p 5432:5432 spm-postgresql
```

The standalone database image includes local-only defaults for `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Compose can still override them through `.env.example` or `.env`.

## Integration environment lifecycle

This is the shared integration environment, with persistent `postgres-data` and `gcs-data` volumes. Automated integration tests should preserve the environment and existing data, remove their own test records and temporary resources, and report any services they started and left running. The [global automation policy](../../AGENTS.md#automation-resource-lifecycle) and [local agent rules](AGENTS.md) define resource ownership and the exception to disposable-test teardown.

When explicitly stopping the whole stack, run `docker compose down` from this directory. It removes the stack's containers and networks while retaining the named database and storage volumes. Stopping the stack also loses Pub/Sub emulator state because this Compose configuration gives that emulator no persistent volume.

Use `docker compose down -v` only for an explicitly requested data reset: it also deletes the named database and storage volumes. Neither command is an automatic integration-test cleanup step. Disposable tests outside this shared environment must remove their own containers and associated temporary resources after the run.

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
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/002_events.sql
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/003_sample_events.sql
```

The second command is optional sample data. Both scripts are safe to repeat. Fresh volumes receive them when the PostgreSQL image is rebuilt. Do not delete volumes to apply these scripts.

`DEMO_ORGANISER_ENABLED=true` in `.env.example` enables the fixed local organiser; user-account functionality and email delivery are deferred. After backend changes, rebuild and start it with `docker compose up -d --build backend`. The frontend code is bind-mounted and refreshed by Vite. Visit http://localhost:5173/planning to create an event, then inspect it under My Events.
