# Local Database Changelog

This records the evolution of the local PostgreSQL initializer. The two files
under `postgresql/init/` intentionally describe only the final fresh-volume
state; existing databases must use backend migrations for upgrades.

## Unreleased - SPM-97 / SPM-49 / SPM-85 event planning

- Added `postgresql/init/007_spm49_spm85_spm97_event_planning.sql`, an additive,
  idempotent initializer (same pattern as `dev`'s `003`-`006`; numbered `007` so
  it runs after them). It can also be applied by hand to an existing volume.
- Widened `events_status_check` to add `Planning`, as a superset of `dev`'s list
  (`Submitted`, `Approved`, `Rejected`, `Planning`, `Confirmed`, `Completed`,
  `Cancelled`).
- Added placeholder `venue_bookings` and `equipment_reservations` tables, to be
  taken over by the venue-booking and equipment-reservation stories.
- Added `event_flagged_changes` (pending review and change history) with a
  partial unique index allowing one pending change per event field.

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
