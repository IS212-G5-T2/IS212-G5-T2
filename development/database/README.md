# Local Database Assets

This directory contains database initialization files shared by local development tooling.

## PostgreSQL

`postgresql/` contains a buildable PostgreSQL image for local development. Its `Dockerfile` copies `postgresql/init/` into `/docker-entrypoint-initdb.d`, so the same image can be used by Docker Compose or run on its own.

Build the database image from the repository root:

```sh
docker build -t spm-postgresql development/database/postgresql
```

Or build it from the PostgreSQL image folder:

```sh
cd development/database/postgresql
docker build -t spm-postgresql .
```

Run only the local database from either location:

```sh
docker run --rm --name spm-postgresql \
  -e POSTGRES_USER=spm \
  -e POSTGRES_PASSWORD=spm_dev_password \
  -e POSTGRES_DB=spm \
  -p 5432:5432 \
  spm-postgresql
```

Pass PostgreSQL credentials at runtime. The Compose stack reads local-only defaults from `development/local-dev/.env.example` and optional `.env`; standalone runs should pass their own `-e` values.

The PostgreSQL entrypoint runs every SQL file in `postgresql/init/` by filename order when it creates a fresh database. `001_schema.sql` contains base local schema, and `002_rbac.sql` creates and seeds the local RBAC tables:

| Table | Purpose |
| --- | --- |
| `roles` | Supported user roles for authorization checks. |
| `resources` | Protected event-management resources. |
| `role_permissions` | CRUD permissions for each role/resource pair. |

To check a standalone database after it starts, connect with the local defaults:

```sh
psql postgresql://spm:spm_dev_password@localhost:5432/spm
```

Example RBAC smoke checks:

```sql
SELECT count(*) FROM roles;
SELECT count(*) FROM resources;
SELECT count(*) FROM role_permissions;
```

The expected counts are 5 roles, 10 resources, and 27 role permission rows.

PostgreSQL only runs these files when a fresh database directory is created. A standalone `docker run --rm ...` without a mounted volume starts clean each time. The Compose stack uses the persistent `postgres-data` volume; if that database already exists, update it manually or explicitly reset local data with:

```sh
docker compose -f development/local-dev/compose.yaml down -v
```

Use reset only when local data can be discarded.

## Events sample database

The local `spm` PostgreSQL database stores requests in `events`.
`002_events.sql` defines the schema and `003_sample_events.sql` adds one
fictional Submitted event. Records persist in Docker's `postgres-data` volume.
Dates/times use `timestamptz`; the API/browser handles local-time display.
Two initialization files currently share the `002_` prefix (`002_events.sql`
and `002_rbac.sql`), so Docker executes them in lexical filename order. Rename
them to distinct sequence numbers before relying on a strict migration order.

For an existing local volume, apply these additive scripts from the repository root (no reset needed):

```sh
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/002_events.sql
docker compose -f development/local-dev/compose.yaml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < development/database/postgresql/init/003_sample_events.sql
```

The second command is optional sample data. Both scripts are safe to repeat. Fresh volumes receive them when the PostgreSQL image is rebuilt. Do not delete volumes to apply these scripts.

The Compose postgres service also mounts the backend-owned draft migration as `004_event_drafts.sql`. Drafts use separate `event_drafts` storage so incomplete values do not weaken submitted-event constraints. For existing volumes follow the additive migration command in development/local-dev/README.md; no reset is required.
