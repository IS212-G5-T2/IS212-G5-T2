# Local Database Changelog

This records the evolution of the local PostgreSQL initializer. The two files
under `postgresql/init/` intentionally describe only the final fresh-volume
state; existing databases must use backend migrations for upgrades.

## 2026-10-01 - Sample events owned by real accounts (SPM-123 branch)

- The five sample events in `002_seed_data.sql` used placeholder people
  (`current-user` as organiser, `coordinator1`/`coordinator2` as text
  coordinator ids), so no real account could see them. They now belong to
  `organiser1@connectsphere.test` and are assigned to `coordinator1` (Welcome
  Evening, Alumni Night), `coordinator2` (Innovation Expo, Sports Day) and
  `coordinator3` (Arts Workshop), looked up by email.
- Re-running the seed now updates only those organiser/coordinator columns on
  existing sample rows, so it fixes older volumes without touching status or
  other local edits.

## 2026-10-01 - Coordinator + Venue Staff account roles (SPM-123 branch)

- `002_seed_data.sql` now gives COORDINATOR and VENUE_STAFF to
  `coordinator_venuestaff@connectsphere.test` ("Coor_Venue"). The roles were
  still pointed at the old `organiser_coordinator@connectsphere.test` email,
  so a fresh volume created Coor_Venue with no roles.
- Organiser + Coordinator is not a valid role combination. Volumes created
  before 2026-09-22 may still hold the old `organiser_coordinator` ("Org_Coor")
  account; remove it, then re-run the seed to restore Coor_Venue's roles:

  ```sql
  DELETE FROM notifications
   WHERE recipient_id = (SELECT id::text FROM users WHERE email = 'organiser_coordinator@connectsphere.test');
  DELETE FROM users WHERE email = 'organiser_coordinator@connectsphere.test';
  ```

  Any requests it was assigned as coordinator must be reassigned or deleted
  first.

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

## Upgrade history

This changelog does not replace migrations. A pre-existing database should
apply the backend migration sequence for the features it lacks—particularly
`backend/migrations/003_event_rejection.sql` followed by
`004_allow_rejected_event_status.sql` for the final rejection lifecycle.
Git history retains the original incremental changes and their commits.
