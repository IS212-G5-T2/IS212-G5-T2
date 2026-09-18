# Local Database Assets

This directory contains database initialization files shared by local development tooling.

## PostgreSQL

`postgresql/` contains a buildable PostgreSQL image for local development. Its `Dockerfile` copies `postgresql/init/` into `/docker-entrypoint-initdb.d`, so the same image can be used by Docker Compose or run on its own.

Build the database image from the repository root:

```sh
docker build -t spm-postgresql development/database/postgresql
```

Run only the local database:

```sh
docker run --name spm-postgresql -p 5432:5432 spm-postgresql
```

The image includes local-only defaults for `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Override them with `-e` flags only when you intentionally need different local credentials.

PostgreSQL only runs these files when the `postgres-data` volume is first created. If the database already exists, update it manually or explicitly reset local data with:

```sh
docker compose -f development/local-dev/compose.yaml down -v
```

Use reset only when local data can be discarded.

## Events sample database

The local `spm` PostgreSQL database stores requests in `events`. `002_events.sql` defines the schema; `003_sample_events.sql` adds one fictional Submitted event. Records persist in Docker's `postgres-data` volume. Dates/times use `timestamptz`; the API/browser handles local-time display.

For an existing local volume, apply these additive scripts from the repository root (no reset needed):

```sh
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/002_events.sql
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/003_sample_events.sql
```

The second command is optional sample data. Both scripts are safe to repeat. Fresh volumes receive them when the PostgreSQL image is rebuilt. Do not delete volumes to apply these scripts.

The Compose postgres service also mounts the backend-owned draft migration as `004_event_drafts.sql`. Drafts use separate `event_drafts` storage so incomplete values do not weaken submitted-event constraints. For existing volumes follow the additive migration command in development/local-dev/README.md; no reset is required.
