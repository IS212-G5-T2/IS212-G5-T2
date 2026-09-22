# Local Database Assets

This directory contains database initialization files shared by local development tooling.

For the feature and schema evolution that led to the consolidated initializer,
see [CHANGELOG.md](CHANGELOG.md). The init directory stays limited to one
schema script and one seed-data script.

## PostgreSQL

`postgresql/` contains a buildable PostgreSQL image for local development. Its `Dockerfile` copies `postgresql/init/` into `/docker-entrypoint-initdb.d`, so the same image can be used by Docker Compose or run on its own.

Build the database image from the repository root:

```sh
docker build -t spm-postgresql database/postgresql
```

Or build it from the PostgreSQL image folder:

```sh
cd database/postgresql
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

Pass PostgreSQL credentials at runtime. The Compose stack reads local-only defaults from `docker-compose/.env.example` and optional `.env`; standalone runs should pass their own `-e` values.

The PostgreSQL entrypoint runs two SQL files by filename order when it creates a fresh database: `001_schema.sql` creates all local tables, constraints, extensions, and indexes; `002_seed_data.sql` creates local RBAC, account, health-check, and fictional-event data:

| Table | Purpose |
| --- | --- |
| `roles` | Supported user roles for authorization checks. |
| `resources` | Protected event-management resources. |
| `role_permissions` | CRUD permissions for each role/resource pair. |
| `users` | Local account identity, password hash, active state, and display name. |
| `user_roles` | Local account membership in the seeded RBAC roles. |
| `auth_sessions` | Hashed, revocable, expiring local browser sessions. |

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

## Local login data

`001_schema.sql` enables PostgreSQL `pgcrypto`, adds local-role membership and
session storage; `002_seed_data.sql` seeds one development-only account per role. Each seed
account uses password `P@55w0rd`:

| Role | Email |
| --- | --- |
| Organiser | `organiser1@connectsphere.test` |
| Coordinator | `coordinator1@connectsphere.test` |
| Venue Staff | `venue_staff1@connectsphere.test` |
| Tech Support | `tech_support1@connectsphere.test` |
| Attendee | `attendee1@connectsphere.test` |

These values are intentionally local-only and must never be reused outside the
development database. Passwords are stored as bcrypt hashes; session tokens are
not stored directly.

PostgreSQL only runs these files when a fresh database directory is created. A standalone `docker run --rm ...` without a mounted volume starts clean each time. The Compose stack uses the persistent `postgres-data` volume; if that database already exists, update it manually or explicitly reset local data with:

```sh
docker compose -f docker-compose/docker-compose.yml down -v
```

Use reset only when local data can be discarded.

To reseed local accounts in an existing Compose volume without resetting data,
apply the seed script from the repository root:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/init/002_seed_data.sql
```

## Events sample database

The local `spm` PostgreSQL database stores requests in `events`. The complete
schema is in `001_schema.sql` and the fictional Submitted event is part of
`002_seed_data.sql`. Records persist in Docker's `postgres-data` volume.
Dates/times use `timestamptz`; the API/browser handles local-time display.

The two files create a fresh database only. For an existing volume, use the
backend migrations that correspond to the missing schema change; do not apply
the schema file as a replacement migration or delete the volume merely to pick
up initializer refactoring.

The Compose postgres service also mounts the backend-owned draft migration as `004_event_drafts.sql`. Drafts use separate `event_drafts` storage so incomplete values do not weaken submitted-event constraints. For existing volumes follow the additive migration command in docker-compose/README.md; no reset is required.

## Request rejection schema

Fresh PostgreSQL images receive the final event lifecycle directly from `001_schema.sql`: `Submitted`, `Approved`, or `Rejected`. A rejected event needs a 10–500-character `rejection_reason`. Existing volumes must retain their migration history: apply `backend/migrations/003_event_rejection.sql`, then `backend/migrations/004_allow_rejected_event_status.sql`, with `psql -v ON_ERROR_STOP=1 -f <path>` against the intended database. Existing events and notifications are retained; no volume reset is needed.
