# Local Database Assets

This directory contains database initialization files shared by local development tooling.

The local initializer consists of one complete schema script and one complete
seed-data script. Git history records how the local schema evolved.

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
a fresh database: `001_schema.sql` creates the complete local schema and
`002_seed_data.sql` creates local RBAC, venue lookups, and sample data:

| Table | Purpose |
| --- | --- |
| `roles` | Supported user roles for authorization checks. |
| `resources` | Protected event-management resources. |
| `role_permissions` | CRUD permissions for each role/resource pair. |
| `users` | Local account identity, password hash, active state, and display name. |
| `user_roles` | Local account membership in the seeded RBAC roles. |
| `auth_sessions` | Hashed, revocable, expiring local browser sessions. |
| `venues` | Venue Staff-created catalogue details, including one scalar location, free-text operating information, and an authenticated `owner_user_id` foreign key to `users`. |
| `facilities` | Controlled facility names and categories available to venues. |
| `venue_facilities` | Many-to-many facility selections linked to venues. |
| `room_layouts` | Controlled supported room-layout names. |
| `venue_layouts` | Many-to-many room-layout selections linked to venues. |
| `venue_images` | Optional one-to-one venue image metadata and data URL (maximum 5 MB). |
| `accessibility_features` | Controlled accessibility choices for venues. |
| `venue_accessibility` | Accessibility selections linked to each venue. |
| `equipment_requests` | Coordinator equipment requests with a Pending Review lifecycle and event/requester foreign keys. |
| `equipment_request_items` | Ordered required nonblank equipment name, type, and positive integer quantity for each request. |

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

The expected counts are 6 roles, 11 resources, and 30 role permission rows.

## Local login data

`001_schema.sql` enables PostgreSQL `pgcrypto`, adds local-role membership and
session storage; `002_seed_data.sql` seeds development-only accounts for every role. Each seed
account uses password `P@55w0rd`:

| Role | Email |
| --- | --- |
| Organiser | `organiser1@connectsphere.test` |
| Coordinator | `coordinator1@connectsphere.test` |
| Venue Staff | `venue_staff1@connectsphere.test` |
| Tech Support | `tech_support1@connectsphere.test` |
| Attendee | `attendee1@connectsphere.test` |
| Coordinator + Venue Staff | `coordinator_venuestaff@connectsphere.test` |
| Event Coordinator Lead | `lead@connectsphere.test` |

Accounts 2 and 3 of each role (e.g. `organiser2@connectsphere.test`) are also
seeded, except for the single Lead. `coordinator_venuestaff` is the one
multi-role account. No account may hold both Organiser and Coordinator, and the
Lead never also holds Coordinator.

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

## Equipment-availability demo data

`018_spm113_availability_demo.sql` is optional local-only data for trying the
SPM-113 Availability page before SPM-58's review-and-reserve workflow exists.
It creates two future Reserved requests and one Pending Review request for the
Technical Support queue. The reserved fixtures demonstrate real stock
subtraction: the Stage Lighting check for the first demo event window shows
10 Active, 4 Reserved and 6 Available; its 3 Under Maintenance and 2 Retired
units remain unavailable to reservation.

For an existing local Compose database, apply it once from the repository root:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres \
  psql -U spm -d spm -v ON_ERROR_STOP=1 -f - \
  < database/postgresql/init/018_spm113_availability_demo.sql
```

For existing local volumes, apply only relevant backend migrations; the two
initializer files are a fresh-database contract and are not upgrade scripts.
If a disposable local volume is missing a schema feature without a matching
backend migration, recreate that local volume rather than applying part of the
fresh initializer to a shared or long-lived database.

For SPM-118 on an existing volume, apply
`backend/migrations/011_equipment_record_updates.sql` with
`psql -v ON_ERROR_STOP=1 -f <path>` against the intended database. This adds
the equipment-update audit change type and enables the Technical Support
Equipment update permission; no database reset is needed.

Equipment quantities are stored in `active_quantity`,
`under_maintenance_quantity`, and `retired_quantity`; `quantity` remains their
checked total for existing consumers. Fresh databases receive this schema from
`001_schema.sql`. Existing databases must apply
`backend/migrations/015_spm113_equipment_status_quantities.sql` once with
`psql -v ON_ERROR_STOP=1 -f <path>`. It backfills the existing equipment and
audit rows into the bucket matching their former `maintenance_status`, retains
their history, and can be rerun safely.

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

## Migration application order

Each migration is applied once, in numeric order, against the database it targets: backend migrations under `backend/migrations/` for existing databases, and init files under `database/postgresql/init/` for fresh volumes. Init scripts never rerun on an existing volume, so an existing database must have every earlier migration installed before a later one. SPM-136 (`backend/migrations/011_spm136_cancel_event.sql`, mirrored as `init/017_spm136_cancel_event.sql`) supersedes migration 009's `venue_bookings` status and kind constraints and requires init 011-016 to be in place first.

## SPM-124 venue schedule

The SPM-50 venue tables, SPM-124 `venue_bookings` table, and their lookup
records are included in `001_schema.sql` and `002_seed_data.sql`. Fresh
databases also receive the local sample venues and their blockout booking.
For an existing volume, apply backend migrations 005–009 in order, then
`backend/migrations/010_remove_venue_operating_schedule.sql`; init scripts do
not rerun on an existing volume. Migration 010 removes the legacy operating
days and opening-time columns after the availability migration is installed.

The SPM-138 waitlist adds `Waitlisted` and `Removed` statuses and the ordering columns to `event_registrations` in `017_spm138_waitlist.sql`. For an existing volume, apply `backend/migrations/011_spm138_waitlist.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent and keeps existing rows.

The local SPM-54 manual suitability fixtures in `020_spm54_suitability_manual_variants.sql` add four single-mismatch venues, a capacity-24 boundary venue, and one accessibility-specific event clone. The script is idempotent. For an existing local database, apply it to the intended database with `psql -v ON_ERROR_STOP=1 -f database/postgresql/init/020_spm54_suitability_manual_variants.sql`; it does not alter the shared EVT-201 row.

SPM-64 change requests add the `event_change_requests` table in `018_spm64_change_requests.sql` (one row per organiser request; at most one `Pending` per event). For an existing volume, apply `backend/migrations/012_spm64_change_requests.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-65 change request review (`019_spm65_change_request_review.sql`) adds `recheck` (jsonb array) and `safety_check_reset` to `event_change_requests`, the `Closed` status (SPM-65 AC11: a pending request is closed automatically when its event is cancelled; one the organiser withdraws keeps `Withdrawn`), a check that a Denied request has a 10 to 500 character `decision_reason`, and the append-only `event_change_request_audit` table (one entry per request; an `UPDATE` raises). The audit table is not delete-protected: its entries are removed with their event or change request (`ON DELETE CASCADE`), and a direct `DELETE` is not blocked; the application itself never deletes them. For an existing volume, apply `backend/migrations/013_spm65_change_request_review.sql` once; it is idempotent.

SPM-55 venue booking review (`021_spm55_booking_review.sql`) adds `venue_bookings.rejection_reason` (1–1000 characters, allowed only on `rejected` rows; `reason` stays reserved for blocked periods) and the append-only `booking_review_log` table, which records each approve or reject with its actor, action, timestamp, and rejection reason. Fresh volumes receive both from the init file; an existing volume needs this file applied once before the staff review endpoints are used.

SPM-48 (`023_spm48_safety_rejected.sql`) adds `rejected` to the allowed `event_safety_checks.status` values so the coordinator queue can show a rejected safety arrangement (SPM-130 AC2 writes it). For an existing volume, apply `backend/migrations/023_spm48_safety_rejected.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-159 (`024_spm159_tentative_hold_requests.sql`) adds `venue_bookings.request_kind` (`booking` or `tentative_hold`) and `reassessment_required`, a partial index for Pending tentative holds, and triggers that cancel Pending holds after event timing changes and flag Pending holds after venue setup changes. Fresh volumes receive the mirrored `database/postgresql/init/024_spm159_tentative_hold_requests.sql`. Existing volumes must apply the backend migration after the earlier venue booking migrations; do not reset the volume. Tentative hold expiry is stored in the existing `venue_bookings.hold_expires_at` column when Venue Staff approves a hold (14 days from approval). Only an approved, unexpired tentative hold blocks an ordinary booking; other tentative-hold statuses and expired holds do not.

SPM-159 migration `backend/migrations/025_spm159_approved_hold_expiry.sql` adds a validated conditional check: approved tentative holds require `hold_expires_at`, while pending holds and ordinary approved bookings may keep NULL. It fails with a clear count if existing approved tentative holds lack expiry; review those rows explicitly without assigning guessed dates, then rerun. Fresh volumes get the mirrored `025_spm159_approved_hold_expiry.sql` from `database/postgresql/init/`.

`002_seed_data.sql` adds two clearly named local sample venues, small
illustrative images, and one short blockout booking so the Venue Staff
catalogue has records on a fresh development database. It is idempotent and
does not replace staff-created venues.

`026_spm56_manual_conflict.sql` adds a manual-review fixture for SPM-56 at
Sample Birch Lecture Hall: one pending request overlaps an approved booking,
an active tentative hold, and an unavailable period. It requires the SPM-159
schema migration (`024_spm159_tentative_hold_requests.sql`). Fresh volumes run
the fixture after that migration when it is present; otherwise, the fixture
prints a skip notice so base database initialization can complete. Apply the
SPM-159 migration first on an existing local Compose database, then run this
fixture from the repository root with:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < backend/migrations/024_spm159_tentative_hold_requests.sql
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/init/026_spm56_manual_conflict.sql
```

The fixed fixture IDs make rerunning safe. The pending demo request is for
`Accessible hybrid seminar` on the 21st day after the database's current date,
from 10:00 to 13:00 Singapore time. The linked blocker events are seeded with
matching event and booking intervals so the staff review shows consistent times.
