# SPM Local Development

This folder provides a Docker Compose setup for local integration before pull requests.

The stack is local-only; this repository no longer contains deployment, Terraform, or Kubernetes configuration.

| Local concern | Local implementation |
| --- | --- |
| Compose network | `spm` |
| Frontend container | `frontend` on `localhost:5173` |
| Backend container | `backend` on `localhost:3000` |
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
   curl http://localhost:3000/healthz
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
| Backend | `http://localhost:3000/healthz` |
| PostgreSQL | `localhost:5432` |

## Local Configuration

Local services connect to PostgreSQL through the Compose service name `postgres:5432`. Keep application code driven by `DATABASE_URL`, `DB_HOST`, and `DB_PORT` so local configuration stays outside source code.

The `.env` file configures PostgreSQL, backend, and frontend defaults, including `DATABASE_URL`, `PORT`, `FRONTEND_ORIGIN`, and `VITE_API_BASE_URL`.

Use local-only values in `.env`. Do not commit real credentials.

`VITE_API_BASE_URL` is passed into the frontend container. PostgreSQL and backend settings stay on their respective containers.

## Firebase Authentication

The Compose stack uses the real Firebase project configured in this folder's
untracked `.env` file. Fill the `VITE_FIREBASE_*` values with the Firebase Web
app configuration, enable Email/Password sign-in, and use dedicated
non-production Firebase users for local testing.

Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete service-account JSON for
the same Firebase project. The backend needs it to verify real Firebase ID
tokens. Never commit that JSON or use a production Firebase project for local
testing.

The Firebase Auth Emulator is reserved for the GitHub Actions E2E test; it is
not started by local Docker Compose.

## Frontend, Backend, And Database Layout

Local orchestration is intentionally split by responsibility:

| Path | Responsibility |
| --- | --- |
| `apps/frontend` | React/Vite frontend source and frontend container image |
| `services/backend` | NestJS backend source and backend container image |
| `development/database/postgresql` | Local PostgreSQL image and initialization assets |
| `development/local-dev` | Three-tier Docker Compose orchestration and local stack docs |

The frontend is exposed on `localhost:5173`; the backend is exposed directly on `localhost:3000` and PostgreSQL on `localhost:5432`.

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

This is the shared three-tier integration environment, with a persistent `postgres-data` volume. Automated integration tests should preserve the environment and existing data, remove their own test records and temporary resources, and report any services they started and left running. The [global automation policy](../../AGENTS.md#automation-resource-lifecycle) and [local agent rules](AGENTS.md) define resource ownership and the exception to disposable-test teardown.

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
