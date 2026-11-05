# Local Database Assets

This directory contains database initialization files shared by local development tooling.

The local initializer consists of one complete schema script, one complete
seed-data script and one complete functions-and-triggers script. Git history
records how the local schema evolved.

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
a fresh database:

| File | Contents |
| --- | --- |
| `001_schema.sql` | Every table, column, constraint and index in its final state, declared directly. |
| `002_seed_data.sql` | All seed data: local RBAC, accounts, venue lookups, and sample events, venues and bookings. |
| `003_functions_triggers.sql` | Every function and trigger, in its final form. |

The order matters. Triggers are created after the seed data so that loading the
samples does not fire them: the safety-check triggers delete an event's
`event_safety_checks` row whenever its event, booking or equipment row changes,
and the audit triggers would write `event_audit_log` entries for every seeded
row. A new trigger or function therefore belongs in `003`, and a new table,
column, constraint or index belongs in `001`; do not add numbered migration
files here. These files can create a database but cannot upgrade one: `CREATE
... IF NOT EXISTS` skips a table that already exists, so a column added to `001`
never reaches an existing volume. Recreate the volume, or apply the matching
`backend/migrations/` file. `002_seed_data.sql` and `003_functions_triggers.sql`
are idempotent and can be re-run against an initialised database.

The tables and their purposes:

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

The expected counts are 7 roles, 11 resources, and 31 role permission rows.

## Disposable test database (SPM-185)

Automated tests must never run against the shared Compose stack's `spm` database: they create and
delete rows, and two backend suites re-apply migrations, which rolls schema backwards for everyone
using that volume. `postgresql/scripts/test-db.sh` owns a separate throwaway container instead, so
the Compose containers, networks, and named volumes are left untouched.

`npm run test:e2e` in `backend` provisions one automatically when `TEST_DATABASE_URL` is unset, so
no setup is needed:

```sh
cd backend && npm run test:e2e
database/postgresql/scripts/test-db.sh down   # when finished; it is left running for reuse
```

Set `TEST_DATABASE_URL` yourself to use a database you manage instead:

```sh
export TEST_DATABASE_URL="$(database/postgresql/scripts/test-db.sh up)"
cd backend && npm run test:e2e
```

`up` builds this directory's image, starts a container with an anonymous data volume, waits for
initialisation, stamps the database, and prints the connection URL. Because the volume is anonymous,
every `up` replays the full initialisation and the database is fresh by construction; `down` removes
the container and that volume by recorded identity. The script refuses to remove a container it did
not create, so a hand-started container of the same name is never deleted silently.

| Command | Effect |
| --- | --- |
| `up` | Build, start, initialise, print the connection URL. Reuses an already-running container. |
| `down` | Remove this script's container and its data volume. |
| `url` | Print the connection URL without starting anything. |
| `status` | Report `running`, `stopped`, or `absent`. |
| `psql` | Open `psql` inside the container; extra arguments are passed through. |

Defaults: port `55432`, user `spm`, database `spm`. The port avoids `5432`, which the Compose stack
publishes, and `5433`, which hand-started test containers have used. Override with
`SPM_TEST_DB_PORT`, `SPM_TEST_DB_CONTAINER`, and `SPM_TEST_DB_IMAGE`.

### What the disposable database contains

Only the image's own `init/` directory, which is the complete schema for a fresh database:
`001_schema.sql` (every table, including `event_drafts`), `002_seed_data.sql` and
`003_functions_triggers.sql`, applied by the entrypoint in that order. There is nothing to mount, and
no two init files share a numeric prefix, so the order never depends on the rest of a filename.

A catalogue comparison between a database built from `init/` and one built from `init/` plus all 45
files in `backend/migrations/` differs only in `venues_owner_user_id_required`, which
`backend/migrations/008_venue_owner_user_id.sql` adds `NOT VALID` and `001_schema.sql` declares
validated (`CREATE TABLE` cannot express `NOT VALID`). Every seeded venue has an owner, so the two
enforce the same rule on every insert and update.

### Resetting a disposable database

> **This destroys seeded demo data.** It runs before every Playwright test (via `frontend/e2e/fixtures.ts`,
> which builds each test's own state afterwards), but it is NOT wired into the backend suites and it does not
> return the database to its freshly-initialised state - see the limits below before using it.

`backend/scripts/testing/reset-test-database.mjs` truncates a disposable database back to reference
data only:

```sh
node backend/scripts/testing/reset-test-database.mjs   # needs TEST_DATABASE_URL
```

It reads the table list from the catalogue on every call rather than from a hardcoded list, so a
table added later is reset from the day it exists instead of being silently skipped. It truncates
every table in `public` except the reference and identity tables — `roles`, `resources`,
`role_permissions`, `users`, `user_roles`, `facilities`, `room_layouts`, `accessibility_features`,
`app_health_checks` — and then checks those hold exactly the row counts a fresh database has, so a
future foreign key that makes `TRUNCATE ... CASCADE` reach into preserved data fails loudly instead
of quietly deleting login accounts. Preserving the accounts also keeps resets fast, since the seeded
password hashes are bcrypt. A reset clears `auth_sessions`, so it must run before a test logs in.

**What it does not do.** Everything outside that list is truncated, including the seeded demo data
from `init/002_seed_data.sql` beyond its reference data — sample venues, sample events and
demo bookings. Suites that assert on those rows fail after a reset; `venues-booking-requests` expects
the SPM-51 sample venues, for example. So this is a truncation to reference data, not a return to the
initialised state. Only the browser suite calls it (SPM-187; each test then builds its own rows with
`backend/scripts/testing/browser-fixtures.mjs`). The backend suites are not affected by that fixture and still need
the seeded data, so do not run this against a database they will use: they would need seed restoration adding
here first. To get a
genuinely fresh database today, use `test-db.sh down && test-db.sh up` — it replays the full init in
about eight seconds.

### Guards

Both the reset helper and `npm run test:e2e` require `TEST_DATABASE_URL` and reject `DATABASE_URL`;
the runner also overrides `DATABASE_URL` for the child process so the `TEST_DATABASE_URL ??
DATABASE_URL` fallback in the suites cannot reach a dev database. Both also refuse any database
without the `spm_disposable_test_db` marker that `test-db.sh` stamps, and CI stamps its own
job-scoped database for the same reason.

The marker is a guard against accident, **not** authentication: anyone can create that table by hand,
and a database that has it is trusted. What it prevents is pointing a destructive run at a database
nobody prepared for destruction. Note also that invoking vitest directly
(`npx vitest run --config vitest.config.e2e.ts`) bypasses the runner and therefore every guard.

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
| Safety Officer | `safety_officer@connectsphere.test` |

Accounts 2 and 3 of each role (e.g. `organiser2@connectsphere.test`) are also
seeded, except for the single Lead and Safety Officer. `coordinator_venuestaff` is the one
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

## Coordinator sample events (SPM-149)

`002_seed_data.sql` includes sample events owned by
`coordinator1`, `coordinator2`, `coordinator3` and `coordinator_venuestaff`, with
statuses that match their venue bookings, equipment and safety state. Submitted
events 401 and 402 are left unassigned for the Coordinator Lead's queue, and
organiser 1 gets one saved draft.

- A `Confirmed` event meets the SPM-135 readiness rule: an approved venue booking, reserved equipment or a "no equipment needed" confirmation, and an approved safety check.
- Planning events show outstanding items (a pending venue request, a missing safety check, or equipment not yet reserved).
- Rejected events carry a reason.
- Dates start 50 days out, so the SPM-51/52 availability windows stay free.

The events `Community Welcome Evening` (`...000036`) and `Inclusive Arts Workshop`
(`...000104`) are `Approved`, not `Confirmed`, because they have no venue or equipment.

Seed events use the current facility and accessibility option lists only
(`Wheelchair access`, `AV System`, and so on); the retired values `Wheelchair ramps`,
`Step-free access`, `PA System`, `Quiet room`, `First aid station` and `Sink access` are not seeded.

For an existing volume, re-run the seed script from the repository root; it is idempotent:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/init/002_seed_data.sql
```

## Readiness check (SPM-149)

`postgresql/checks/confirmed_readiness.sql` is not part of `init/`. It fails and names every Confirmed event that does not meet the SPM-135 readiness rule. It mirrors `backend/src/events/status/readiness.ts` and `venue-unavailable.ts`, including the setup and turnaround buffers. CI runs it after PostgreSQL starts. To run it locally against a seeded database:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/checks/confirmed_readiness.sql
```

## Live demo data

`postgresql/demo/demo_seed.sql` replaces the development data with a fictional
Singapore campus dataset for a live demonstration. It is not part of `init/`, so
the disposable test database never runs it.

**The Compose stack does run it automatically.** `docker-compose.yml` mounts it as
`/docker-entrypoint-initdb.d/900_demo_seed.sql`, which sorts after `init/` 001-003, so a
fresh Compose volume initialises straight into the demo dataset. That is deliberate: the
local stack is what people look at, while the test suites need `init/`'s fixed accounts and
ids, and they build their own database from the same image without that mount. Accounts in
the Compose database are therefore `@connectsphere.sg`, not the `@connectsphere.test` ones
`init/` seeds — `backend/test` and the Playwright specs authenticate as the latter and must
never be pointed at this database.

It is destructive: it empties events, venues, equipment and all user accounts,
then reseeds them. Keep roles, permissions and the lookup catalogues — it looks those up by
name rather than creating them, which is why it needs `002_seed_data.sql` to have run first
and cannot replace it. Re-run it shortly before a demo so the dates stay current (dates are
relative to the day it runs); recreating the volume with `docker compose down -v` has the
same effect:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/demo/demo_seed.sql
```

Every demo account uses password `P@55w0rd` and the domain `@connectsphere.sg`:

| Role | Email |
| --- | --- |
| Organiser | `org@connectsphere.sg` |
| Coordinator | `coord1@connectsphere.sg`, `coord2@connectsphere.sg` |
| Coordinator + Venue Staff | `coord_vs@connectsphere.sg` |
| Venue Staff | `vs@connectsphere.sg` |
| Tech Support | `ts@connectsphere.sg` |
| Event Coordinator Lead | `lead@connectsphere.sg` |
| Safety Officer | `so@connectsphere.sg` |
| Attendee | `att1@connectsphere.sg` to `att5@connectsphere.sg` |

The dataset has 48 events across every status, including Confirmed events with a
full waitlist (`Leadership Lecture Series: Sustainable Cities`, limit 3), a venue
blocked over a Planning event's booking (`Community Health Fair`, which the coordinator must resolve), and a registration
report with several statuses (`Annual Science Open Day`). Only five attendee
accounts exist, so each event has at most five registrations.

It also seeds two unsubmitted drafts for the organiser (`Green Campus Week
Kickoff`, mostly filled, and `Photography Club Open Studio`, name and purpose
only) so My Drafts and the draft resume flow have rows; their `fields` use the
`name` key, not `eventName`. `event_flagged_changes` holds five change-history
rows of all three kinds, including a pending `booking_conflict` on `Community
Health Fair` that overlaps the blocked Community Hall period, and `venue_images`
gives Main Auditorium, Community Hall and Rooftop Garden Terrace a tiny
placeholder PNG. The seed clears `event_drafts` explicitly; it does not clear
`event_audit_log` (no foreign key, filled by triggers), so that table grows with
each run.

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

`002_seed_data.sql` includes local-only data for trying the
SPM-113 Availability page before SPM-58's review-and-reserve workflow exists.
It creates two future Reserved requests and one Pending Review request for the
Technical Support queue. The reserved fixtures demonstrate real stock
subtraction: the Stage Lighting check for the first demo event window shows
10 Active, 4 Reserved and 6 Available; its 3 Under Maintenance and 2 Retired
units remain unavailable to reservation.

For an existing local Compose database, re-run the seed script from the repository root
(it is idempotent):

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres \
  psql -U spm -d spm -v ON_ERROR_STOP=1 -f - \
  < database/postgresql/init/002_seed_data.sql
```

For existing local volumes, apply only relevant backend migrations; the schema
and trigger files are a fresh-database contract and are not upgrade scripts.
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

Drafts use separate `event_drafts` storage (declared in `001_schema.sql`) so incomplete values do not weaken submitted-event constraints. For existing volumes follow the additive migration command in docker-compose/README.md; no reset is required.

## Request rejection schema

Fresh PostgreSQL images receive the final event lifecycle directly from `001_schema.sql`: `Submitted`, `Approved`, or `Rejected`. A rejected event needs a 10–500-character `rejection_reason`. Existing volumes must retain their migration history: apply `backend/migrations/003_event_rejection.sql`, then `backend/migrations/004_allow_rejected_event_status.sql`, with `psql -v ON_ERROR_STOP=1 -f <path>` against the intended database. Existing events and notifications are retained; no volume reset is needed.

## Migration application order

Each migration is applied once, in numeric order, against the database it targets: backend migrations under `backend/migrations/` for existing databases, and the three init files under `database/postgresql/init/` for fresh volumes. Init scripts never rerun on an existing volume, so an existing database must have every earlier migration installed before a later one. SPM-136 (`backend/migrations/011_spm136_cancel_event.sql`) supersedes migration 009's `venue_bookings` status and kind constraints; `001_schema.sql` already declares the final constraints.

## SPM-124 venue schedule

The SPM-50 venue tables, SPM-124 `venue_bookings` table, and their lookup
records are included in `001_schema.sql` and `002_seed_data.sql`. Fresh
databases also receive the local sample venues and their blockout booking.
For an existing volume, apply backend migrations 005–009 in order, then
`backend/migrations/010_remove_venue_operating_schedule.sql`; init scripts do
not rerun on an existing volume. Migration 010 removes the legacy operating
days and opening-time columns after the availability migration is installed.

The SPM-138 waitlist adds `Waitlisted` and `Removed` statuses and the ordering columns to `event_registrations` in `001_schema.sql`. For an existing volume, apply `backend/migrations/011_spm138_waitlist.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent and keeps existing rows.

The local SPM-54 manual suitability fixtures (VEN-BKG-01-B) in `002_seed_data.sql` add four single-mismatch venues, a capacity-24 boundary venue, and one accessibility-specific event clone. They are idempotent. For an existing local database, re-run `psql -v ON_ERROR_STOP=1 -f database/postgresql/init/002_seed_data.sql` against the intended database; it does not alter the shared EVT-201 row.

SPM-64 change requests add the `event_change_requests` table in `001_schema.sql` (one row per organiser request; at most one `Pending` per event). For an existing volume, apply `backend/migrations/012_spm64_change_requests.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-65 change request review (`001_schema.sql` and the `change_request_audit_no_update` trigger in `003_functions_triggers.sql`) adds `recheck` (jsonb array) and `safety_check_reset` to `event_change_requests`, the `Closed` status (SPM-65 AC11: a pending request is closed automatically when its event is cancelled; one the organiser withdraws keeps `Withdrawn`), a check that a Denied request has a 10 to 500 character `decision_reason`, and the append-only `event_change_request_audit` table (one entry per request; an `UPDATE` raises). The audit table is not delete-protected: its entries are removed with their event or change request (`ON DELETE CASCADE`), and a direct `DELETE` is not blocked; the application itself never deletes them. For an existing volume, apply `backend/migrations/013_spm65_change_request_review.sql` once; it is idempotent.

SPM-55 venue booking review (`001_schema.sql`) adds `venue_bookings.rejection_reason` (1–1000 characters, allowed only on `rejected` rows; `reason` stays reserved for blocked periods) and the append-only `booking_review_log` table, which records each approve or reject with its actor, action, timestamp, and rejection reason. Fresh volumes receive both from `001_schema.sql`; an existing volume needs the matching backend migration applied once before the staff review endpoints are used.

SPM-48 (`001_schema.sql`) adds `rejected` to the allowed `event_safety_checks.status` values so the coordinator queue can show a rejected safety arrangement (SPM-130 AC2 writes it). For an existing volume, apply `backend/migrations/023_spm48_safety_rejected.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-159 (`001_schema.sql` and `003_functions_triggers.sql`) adds `venue_bookings.request_kind` (`booking` or `tentative_hold`) and `reassessment_required`, a partial index for Pending tentative holds, and triggers that cancel Pending holds after event timing changes and flag Pending holds after venue setup changes. Fresh volumes receive the final schema and triggers from `database/postgresql/init/`. Existing volumes must apply the backend migration after the earlier venue booking migrations; do not reset the volume. Tentative hold expiry is stored in the existing `venue_bookings.hold_expires_at` column when Venue Staff approves a hold (14 days from approval). Only an approved, unexpired tentative hold blocks an ordinary booking; other tentative-hold statuses and expired holds do not.

SPM-159 migration `backend/migrations/025_spm159_approved_hold_expiry.sql` adds a validated conditional check: approved tentative holds require `hold_expires_at`, while pending holds and ordinary approved bookings may keep NULL. It fails with a clear count if existing approved tentative holds lack expiry; review those rows explicitly without assigning guessed dates, then rerun. Fresh volumes get the validated check (`venue_bookings_approved_tentative_hold_expiry_check`) from `001_schema.sql`.

SPM-132 adds nullable `venue_bookings.hold_expiry_processed_at` and the `expired` tentative-hold status through `backend/migrations/032_spm132_tentative_hold_expiry_processing.sql`; fresh databases get both from `database/postgresql/init/001_schema.sql`. Existing databases apply the backend migration after the current venue migrations. The scheduled worker changes each elapsed approved tentative hold to `expired` once, while availability remains based on `hold_expires_at` before processing. `TENTATIVE_HOLD_EXPIRY_INTERVAL_MS` controls scheduler cadence and defaults to 60000 ms; no maximum permitted expiry-processing lag is defined by the product specification.

`002_seed_data.sql` adds two clearly named local sample venues, small
illustrative images, and one short blockout booking so the Venue Staff
catalogue has records on a fresh development database. It is idempotent and
does not replace staff-created venues.

`002_seed_data.sql` includes a manual-review fixture for SPM-56 at
Sample Birch Lecture Hall: one pending request overlaps an approved booking,
an active tentative hold, and an unavailable period. It needs the SPM-159
columns (`venue_bookings.request_kind`), which `001_schema.sql` always declares.
On an existing local Compose database, apply the SPM-159 backend migration first
if that column is missing, then re-run the seed from the repository root with:

```sh
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < backend/migrations/024_spm159_tentative_hold_requests.sql
docker compose -f docker-compose/docker-compose.yml exec -T postgres psql -U spm -d spm -v ON_ERROR_STOP=1 -f - < database/postgresql/init/002_seed_data.sql
```

The fixed fixture IDs make rerunning safe. The pending demo request is for
`Accessible hybrid seminar` on the 21st day after the database's current date,
from 10:00 to 13:00 Singapore time. The linked blocker events are seeded with
matching event and booking intervals so the staff review shows consistent times.

SPM-128 provisions the `SAFETY_OFFICER` role with read-only Event permission and a local `safety_officer@connectsphere.test` account (`P@55w0rd`). Fresh databases receive these from `002_seed_data.sql`; apply `backend/migrations/028_spm128_safety_officer_role.sql` once to an existing database. SPM-129 uses this role for its safety-check queue.

SPM-137 (`001_schema.sql`) adds the nullable `notifications.related_booking_id` (`ON DELETE CASCADE`) and a partial index on it, so a notice can link to one venue booking. For an existing volume, apply `backend/migrations/029_spm137_booking_decision_notification.sql` once; it is idempotent.

SPM-125 (`001_schema.sql`) adds the append-only `venue_unavailability_history` table: one `created` row when Venue Staff save an unavailable period and one `ended_early` row (with `previous_end_at`) when they end it early, each with the period, its reason, the Venue Staff member (`actor_user_id`, `ON DELETE SET NULL`) and the time. `period_id` has no foreign key, so history outlives its period; rows are removed only with their venue (`ON DELETE CASCADE`). The application only inserts; no database trigger blocks a direct `UPDATE` or `DELETE`. The seed gives every blocked sample period a `created` row with no person (shown as "Not recorded"), as the migration does for existing ones. Its venue-change notices (`venue_unavailable_impact`, `venue_timing_impact`, `venue_capacity_impact`) reuse SPM-137's `notifications.related_booking_id`, so apply 029 first. For an existing volume, apply `backend/migrations/030_spm125_venue_unavailability_history.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-157 (`event_audit_log` in `001_schema.sql`, its triggers in `003_functions_triggers.sql`) adds the append-only `event_audit_log` table and the triggers that fill it from `events` (submission, status, coordinator), `venue_bookings` (event bookings and holds only; blockouts stay with SPM-125), `equipment_requests` (a deferred trigger records a new request at commit with its items), `equipment_reservations` (releases), `event_registrations`, `event_safety_checks` (deferred, so the outcome's feedback items are the reason), `event_safety_resets`, `event_comments` (clarifications), `safety_check_feedback_items` (the coordinator's response), `completion_records` (deferred, with its issues) and `notifications` (only the SPM-125 venue-change notices, which name the affected booking); registration settings changes come from the `events` trigger. The author comes from the transaction-local setting `app.actor_id`, which the backend sets for a signed-in request; without it, or for a change made by another trigger, the entry is the system's, and `actor_name` keeps the person's display name at the time. `UPDATE` and `DELETE` on the table raise `event_audit_log is append-only`, except the clean-up by `events_audit_cleanup` after an event row is deleted (there is deliberately no foreign key, so recording never locks the event row). On first apply it loads earlier records once (only into an empty table); entries whose author was not recorded have `actor_kind = 'unrecorded'`. For an existing volume, apply `backend/migrations/034_spm157_event_audit_log.sql` once (after 032 and 033) with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.

SPM-134 (`001_schema.sql`) adds the nullable `venue_bookings.hold_reminder_sent_at`, set by the scheduler in the same transaction that writes the Coordinator's 48-hour expiry reminder so each tentative hold is reminded exactly once; the migration is idempotent and has no backfill (an active hold already within 48 hours of its expiry is reminded on the first run after it, and a hold past its expiry never is). The reminder, expired, released and converted notices need no schema change: `notifications.type` has no constraint and `related_booking_id` (SPM-137) already links a hold. For an existing volume, apply `backend/migrations/036_spm134_hold_expiry_notifications.sql` once with `psql -v ON_ERROR_STOP=1 -f <path>`; fresh databases get the column from `database/postgresql/init/001_schema.sql`.

SPM-172 (`001_schema.sql`) adds the nullable `notifications.related_equipment_request_id` (`ON DELETE CASCADE`, references `equipment_requests`) and a partial index on it, so an equipment request decision notice (`equipment_request_reserved`, `equipment_request_cannot_provide`) can link to one request. For an existing volume, apply `backend/migrations/035_spm172_equipment_decision_notification.sql` once (after 034) with `psql -v ON_ERROR_STOP=1 -f <path>`; it is idempotent.
