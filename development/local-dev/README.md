# SPM Local Development

This folder provides a Docker Compose setup that mirrors the platform stack closely enough for local development before pull requests.

Production/dev infrastructure is defined in [../../platform](../../platform/):

| Cloud or Kubernetes resource | Local equivalent |
| --- | --- |
| GKE namespace `spm` | Compose network `spm` |
| GKE Gateway and HTTPRoute | `gateway` reverse proxy on `localhost:8080` |
| Microservice Deployment | `sample-service` container |
| Cloud SQL for PostgreSQL 16 | `postgres` on `localhost:5432` |
| Cloud SQL Auth Proxy sidecar | Direct Compose DNS name `postgres` |
| Cloud Storage bucket | `fake-gcs-server` on `localhost:4443` |
| Pub/Sub topic and subscription | Pub/Sub emulator on `localhost:8085` |
| Secret Manager and ConfigMap | `.env` file |
| Kubernetes readiness/liveness probes | Compose health checks |

## Current setup limitation

The Compose build context expects `../../services/sample-service`, which is absent from this checkout. The stack cannot build that service as checked out. See the [local agent rules](AGENTS.md) and [service rules](../../services/AGENTS.md) for the current integration boundaries; the commands below require that build context to be supplied or configured for an implemented service.

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

The response should show `status: ok` once Postgres is ready and the sample service has started.

## Common URLs

| Service | URL |
| --- | --- |
| Local gateway | `http://localhost:8080` |
| Sample service through gateway | `http://localhost:8080/healthz` |
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

## How This Maps To Kubernetes

The Kubernetes sample service connects to Cloud SQL through a sidecar on `127.0.0.1:5432`. Locally, the same service connects to the Compose service name `postgres:5432`. Keep application code driven by `DATABASE_URL`, `DB_HOST`, and `DB_PORT` so no code changes are needed between local and cloud.

The Kubernetes `platform-config` ConfigMap is represented by `.env`. The names intentionally match the deployed environment:

- `PROJECT_ID`
- `REGION`
- `ENVIRONMENT`
- `CLOUD_SQL_CONNECTION_NAME`
- `CLOUD_SQL_DATABASE`
- `STORAGE_BUCKET`
- `PUBSUB_TOPIC`

Secrets from Secret Manager are represented by local-only values in `.env`. Do not commit real credentials.

## Replacing The Sample Service

The Compose configuration targets a sample service, but its source is not present in this checkout. To integrate a real service:

1. Put the service code under `services/<service-name>` or point the Compose build context to the existing local path.
2. Keep `/healthz` or `/readyz`, matching the Kubernetes probes.
3. Keep the internal container port as `8080`, unless the Kubernetes manifest changes too.
4. Add a new route in `gateway/nginx.conf` when there is more than one service.
5. Add matching topic, subscription, database, or storage config to `.env.example` and this README.

## Integration environment lifecycle

This is the shared integration environment, with persistent `postgres-data` and `gcs-data` volumes. Automated integration tests should preserve the environment and existing data, remove their own test records and temporary resources, and report any services they started and left running. The [global automation policy](../../AGENTS.md#automation-resource-lifecycle) and [local agent rules](AGENTS.md) define resource ownership and the exception to disposable-test teardown.

When explicitly stopping the whole stack, run `docker compose down` from this directory. It removes the stack's containers and networks while retaining the named database and storage volumes. Stopping the stack also loses Pub/Sub emulator state because this Compose configuration gives that emulator no persistent volume.

Use `docker compose down -v` only for an explicitly requested data reset: it also deletes the named database and storage volumes. Neither command is an automatic integration-test cleanup step. Disposable tests outside this shared environment must remove their own containers and associated temporary resources after the run.

## Daily Commands

```sh
docker compose up --build
docker compose down
docker compose logs -f sample-service
docker compose ps
```

Choose shutdown or data reset according to the lifecycle guidance above.
