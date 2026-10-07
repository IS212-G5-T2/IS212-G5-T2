# Local Database Changelog

This records the evolution of the local PostgreSQL initializer. Base and
additive scripts under `postgresql/init/` describe the fresh-volume state;
existing databases must use backend migrations for upgrades.

## 2026-10-05 - SPM-124 venue schedule

- Copied the SPM-50 venue schema and lookup seeds into the fresh-volume
  initializer so a clean Compose volume creates the venue catalogue tables.
- Added idempotent fresh-volume initialization for one `venue_bookings` table
  containing event reservations and staff blockouts. Existing volumes use
  backend migration 009 after the copied SPM-50 migrations 005–008; it moves
  any earlier `venue_unavailability` rows into that table.
- Added two local sample venue records with illustrative images and a short
  blockout booking so the card catalogue has visible records in a fresh
  development database.

## 2026-09-22 - Two-file initializer consolidation

- Combined every extension, table, column, constraint, and index into
  `postgresql/init/001_schema.sql`.
- Combined RBAC, development accounts, role assignments, health-check data,
  and the fictional event into `postgresql/init/002_seed_data.sql`.
- Removed the incremental initializer files after retaining their resulting
  schema in the two consolidated files.

## Prior schema evolution retained in the consolidated schema

- **SPM-36:** Added the `events` table, submitted-event validation, and the
  fictional Community Welcome Evening sample record.
- **Local authentication / SPM-30:** Added `roles`, `resources`,
  `role_permissions`, `users`, `user_roles`, and `auth_sessions`, including
  local-only development accounts and RBAC permissions.
- **SPM-39:** Added event coordinator fields, `event_comments`, notifications,
  and clarification-resolution state (`resolved`).
- **SPM-38:** Retired `Under_Review` as an event status. The final lifecycle is
  `Submitted`, `Approved`, or `Rejected`.
- **SPM-83:** Added `events.rejection_reason`; rejected events require a
  10–500-character reason. The persistent notification table supports the
  organiser-facing rejection workflow.
- **SPM-50:** Added venue catalogue with one scalar location per venue, controlled accessibility choices, and
  their relation, including non-negative whole-minute setup and turnaround
  durations and database-generated venue UUIDs; existing databases use
  `backend/migrations/005_venues.sql`. Facilities and room layouts are stored
  in controlled lookup/junction tables instead of venue array columns, and an
  optional one-to-one venue image stores validated upload metadata/data URL.
  A normalized unique index prevents duplicate venue name/location pairs
  without replacing the database-generated UUID identity. Fresh venues also
  require `owner_user_id` referencing the local `users` table. Existing volumes
  add it through `backend/migrations/008_venue_owner_user_id.sql`; older rows
  with unknown owners remain unassigned.

## Upgrade history

This changelog does not replace migrations. A pre-existing database should
apply the backend migration sequence for the features it lacks—particularly
`backend/migrations/003_event_rejection.sql` followed by
`004_allow_rejected_event_status.sql` for the final rejection lifecycle.
Git history retains the original incremental changes and their commits.

## SPM-120 - Withdrawal timestamp

- Added `postgresql/init/007_spm120_withdraw_registration.sql`: nullable `withdrawn_at timestamptz` on `event_registrations`, written by the backend from its injected clock. Additive and idempotent; existing volumes must apply it manually because init scripts only run on an empty volume. The `UNIQUE (event_id, attendee_id)` constraint is unchanged (a withdrawn row is reactivated, not duplicated).

## SPM-61 - Registration detail columns

- Added `postgresql/init/004_spm61_event_registration.sql`: nullable `full_name`, `email`, `contact_number` and `special_requirements` on `event_registrations`. Additive and idempotent; existing volumes must apply it manually because init scripts only run on an empty volume.
- Added `postgresql/init/005_spm61_dev_seed_fixes.sql` (local data only): points the seeded events at the real coordinator accounts (002 used the literal ids `coordinator1`/`coordinator2`, which matched no user) and gives Alumni Networking Night and Inclusive Arts Workshop an open registration window. Idempotent; apply manually to existing volumes.

## SPM-80 - Coordinator availability

- Added `users.is_available boolean NOT NULL DEFAULT true` to `postgresql/init/001_schema.sql`: a coordinator's own setting for whether they can take new event assignments. It never changes events already assigned to them.
- Added `postgresql/init/007_spm80_coordinator_availability.sql` so existing volumes can add the column without a reset. Additive and idempotent; apply it manually because init scripts only run on an empty volume. Every existing account starts as available.

## Coordinator + Venue Staff account roles (SPM-123)

- `002_seed_data.sql` now gives COORDINATOR and VENUE_STAFF to
  `coordinator_venuestaff@connectsphere.test` ("Coor_Venue"). The roles were
  still pointed at the old `organiser_coordinator@connectsphere.test` email,
  so a fresh volume created Coor_Venue with no roles.
- Organiser + Coordinator is not a valid role combination. Volumes created
  before 2026-09-22 may still hold the old `organiser_coordinator` ("Org_Coor")
  account. Reassign or delete any requests it is assigned as coordinator, then
  remove it and re-run the seed to restore Coor_Venue's roles:

  ```sql
  DELETE FROM notifications
   WHERE recipient_id = (SELECT id::text FROM users WHERE email = 'organiser_coordinator@connectsphere.test');
  DELETE FROM users WHERE email = 'organiser_coordinator@connectsphere.test';
  ```

## SPM-123 - Event Coordinator Lead

- `002_seed_data.sql` adds role 6 `COORDINATOR_LEAD` (read/update on Event, read on Event Review) and one account, `lead@connectsphere.test` ("Coordinator Lead", password `P@55w0rd`), which holds only that role.
- Added `postgresql/init/008_spm123_coordinator_lead.sql` to add the role, permissions and account to existing volumes. Idempotent; apply it manually.
- `README.md` verification counts updated to 6 roles, 11 resources and 30 role permission rows (the extra resource is SPM-50's).
