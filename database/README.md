# Local Database Assets

This directory contains database initialization files shared by local development tooling.

For the feature and schema evolution that led to the consolidated initializer,
see [CHANGELOG.md](CHANGELOG.md). The base schema and seed scripts are followed
by additive feature init scripts in filename order.

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

The PostgreSQL entrypoint runs the init files by filename order when it creates
a fresh database: `001_schema.sql` creates the base and SPM-50 venue schema,
`002_seed_data.sql` creates local RBAC, venue lookups, and sample data, and later
numbered scripts apply additive feature changes:

| Table | Purpose |
| --- | --- |
| `roles` | Supported user roles for authorization checks. |
| `resources` | Protected event-management resources. |
| `role_permissions` | CRUD permissions for each role/resource pair. |
| `users` | Local account identity, password hash, active state, and display name. |
| `user_roles` | Local account membership in the seeded RBAC roles. |
| `auth_sessions` | Hashed, revocable, expiring local browser sessions. |
| `venues` | Venue Staff-created catalogue details, including one scalar location, operating information, selected operating days with start/end times, and an authenticated `owner_user_id` foreign key to `users`. |
| `facilities` | Controlled facility names and categories available to venues. |
| `venue_facilities` | Many-to-many facility selections linked to venues. |
| `room_layouts` | Controlled supported room-layout names. |
| `venue_layouts` | Many-to-many room-layout selections linked to venues. |
| `venue_images` | Optional one-to-one venue image metadata and data URL (maximum 5 MB). |
| `accessibility_features` | Controlled accessibility choices for venues. |
| `venue_accessibility` | Accessibility selections linked to each venue. |

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

The init scripts run for a fresh database only. For an existing volume, use the
backend migrations that correspond to the missing schema change; do not apply
the schema file as a replacement migration or delete the volume merely to pick
up initializer refactoring.

SPM-50 venue creation uses `venues`, controlled accessibility/facility/layout
lookups and junctions, plus optional `venue_images` on fresh databases.
Existing databases must apply the
additive `backend/migrations/005_venues.sql`; do not reset a volume merely to
receive this schema change. `venues.id` is a PostgreSQL-generated UUID; the
migration converts any earlier local text identifiers deterministically while
preserving accessibility links.
The `venues_name_location_unique` index separately prevents case-insensitive,
trimmed duplicates of the same venue name at the same location; names and
locations remain editable attributes rather than identifiers.
The migration also converts legacy venue facility/layout arrays into the
normalized lookup relationships before dropping those array columns.

The Compose postgres service also mounts the backend-owned draft migration as `004_event_drafts.sql`. Drafts use separate `event_drafts` storage so incomplete values do not weaken submitted-event constraints. For existing volumes follow the additive migration command in docker-compose/README.md; no reset is required.

## Request rejection schema

Fresh PostgreSQL images receive the final event lifecycle directly from `001_schema.sql`: `Submitted`, `Approved`, or `Rejected`. A rejected event needs a 10–500-character `rejection_reason`. Existing volumes must retain their migration history: apply `backend/migrations/003_event_rejection.sql`, then `backend/migrations/004_allow_rejected_event_status.sql`, with `psql -v ON_ERROR_STOP=1 -f <path>` against the intended database. Existing events and notifications are retained; no volume reset is needed.

## SPM-124 venue schedule

The SPM-50 venue tables and lookup records are copied into `001_schema.sql`
and `002_seed_data.sql` from `feature/SPM-50-Create-Venue-Records`. On a fresh
volume, `007_spm124_venue_schedule.sql` then creates one `venue_bookings` table
for event reservations and staff blockouts, followed by the local sample venues
in `008_spm124_sample_venues.sql`.
For an existing volume, apply backend migrations 005–008, then
`backend/migrations/009_venue_availability.sql`; init scripts do not rerun on
an existing volume.

`008_spm124_sample_venues.sql` adds two clearly named local sample venues,
small illustrative images, and one short blockout booking so the Venue Staff catalogue has records on a
fresh development database. For an existing local volume, apply it manually
after migration 009 if sample data is wanted. It is idempotent and does not
replace staff-created venues.
