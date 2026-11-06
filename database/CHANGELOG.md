# Database changelog

Changes to the local database assets in `database/`. Newest first.

## Init consolidated into three files (branch `refactor/consolidate-init-schema`)

`postgresql/init/` had drifted to 44 files, several sharing a numeric prefix, and had stopped being the "one complete schema script and one complete seed-data script" described in `database/README.md`. It is now three files, in this order:

- `001_schema.sql`: every table, column, constraint and index in its final state, declared directly (no `ALTER`). Column order matches the previous end state, so a `pg_dump --schema-only` of a fresh database is unchanged.
- `002_seed_data.sql`: all seed data, reference and sample. Still idempotent (`ON CONFLICT`-guarded inserts, conditional updates).
- `003_functions_triggers.sql`: every function and trigger, in its final form, with exactly one definition per name. It runs after the seed on purpose: the safety-check triggers delete `event_safety_checks` rows when an event, booking or equipment row changes, and the audit triggers write `event_audit_log` entries, so creating them before the seed would change the seed data.

The other 41 files (and `003_event_drafts.sql`, now part of `001`) are deleted; Git history records how the schema evolved. Test-case IDs and the reason a sample row exists were kept in comments (for example `VEN-BKG-01-B`).

**Fresh volumes only.** These files can no longer upgrade an existing database: `CREATE ... IF NOT EXISTS` skips a table that already exists, so a folded column never arrives. That was already the stated policy; existing volumes use `backend/migrations/` or are recreated (`test-db.sh down && up`, or `docker compose down -v`).

Differences from the previous end state, all accepted:

1. **`venues_owner_user_id_required` is now a validated constraint.** `037_spm185_schema_parity_constraints.sql` added it `NOT VALID` to mirror `backend/migrations/008`; `CREATE TABLE` cannot express `NOT VALID`. `pg_constraint.convalidated` is `true` here and `false` in a migrated database. The rule enforced on every insert and update is identical and no seeded row violates it. This is the only schema difference; SPM-194 retires `backend/migrations/`.
2. **Five `SPM-149 Seed:` events carry current option values.** `027_spm156_retire_legacy_event_options.sql` ran before `036_spm149_coordinator_sample_events.sql`, so events `...0402`, `...0409`, `...0410`, `...0414` and `...0415` kept the retired `Step-free access` / `Quiet room` values on a fresh database. They are seeded as `Wheelchair access` (402, 409, 415) and no accessibility need (410, 414). No test asserts the old values.
3. **`event_audit_log` holds 80 rows, not 91.** Seed rows no longer fire the audit triggers, so the 14 `coordinator_assigned` entries and the other live entries that `036` produced are gone. The one-time load of earlier records at the end of `003` (the AC11 load, into an empty log only) is kept, so every seeded event still has history: 44 `submitted`, 2 `status_changed`, 7 `safety_check_requested`, 3 `safety_check_approved`, 12 `booking_requested`, 1 `hold_requested` and 11 `equipment_requested`. Delete that block in `003` if a fresh database should start with an empty log.

Dropped as unreachable on a fresh volume: the duplicate `COORDINATOR_LEAD` and `SAFETY_OFFICER` role inserts (already in the main `002` role, permission and account inserts), the `UPDATE`s that renamed legacy option values and fixed coordinator ids and registration windows (the rows are now seeded correctly), the `031` backfill (it only touches rows whose safety check is `changes_needed` or `rejected`, and no seed row is), the `psql` `\gset`/`\if` guard around the SPM-56 fixture (its column always exists now), and the `to_regclass('event_drafts')` guards.

Supporting changes: five backend suites no longer read the deleted `022_spm55_booking_special_request.sql`; `events-planning.e2e-spec.ts` no longer replays `026_spm156_direct_update_history.sql`; `venue-impact.e2e-spec.ts` restores the final `venue_bookings` status and kind constraints inline instead of replaying three init files; the SPM-135/136 trigger mutants are re-anchored on `003_functions_triggers.sql`.

## SPM-187: browser-test event seed removed

- Deleted `postgresql/init/028_spm120_withdrawal_browser_test.sql`, a committed fixed-id event for the SPM-120 withdrawal Playwright spec. The spec now builds its own Confirmed, at-capacity event (with the venue booking, equipment confirmation and safety check the readiness rule needs) per test through `backend/scripts/testing/browser-fixtures.mjs`, so fresh databases no longer carry it. Existing volumes keep the row until recreated; nothing else reads it.

## SPM-149: sample event seed data matches event statuses

- Added `postgresql/init/036_spm149_coordinator_sample_events.sql`: sample events for `coordinator1`, `coordinator2`, `coordinator3` and `coordinator_venuestaff`, covering Submitted (some unassigned for the Lead queue), Approved, Planning, Confirmed and Rejected. Confirmed events have an approved venue booking, reserved equipment or a "no equipment needed" confirmation, and an approved safety check. Idempotent (`ON CONFLICT DO NOTHING`).
- `postgresql/init/002_seed_data.sql`: `Community Welcome Evening` and `Inclusive Arts Workshop` changed from `Confirmed` to `Approved`, since neither has a venue or equipment. The 036 script applies the same change to existing volumes.
- `postgresql/init/028_spm120_withdrawal_browser_test.sql`: the Confirmed SPM-120 browser-test event now has an approved venue booking (Sample Birch Lecture Hall), a confirmed "no equipment needed" state and an approved safety check, so it meets the readiness rule. Its status stays Confirmed, which the withdrawal Playwright spec and registration rely on.
- `postgresql/demo/demo_seed.sql` (commit `d37475bd` on this branch, cherry-picked from `eb613f2b`): demo event 26 (Community Health Fair) is now `Planning`, not `Confirmed`. Its venue overlaps the deliberate venue-unavailable period, so it does not meet the readiness rule; Planning shows the coordinator that item. Its registrations were removed because Planning events take none. The venue-unavailable notification for it is kept. Re-run on a demo-seeded database: the seed exits 0 twice, and the readiness check passes for all 12 Confirmed events.
- Added `postgresql/checks/confirmed_readiness.sql`, which fails and names any Confirmed event that does not meet the readiness rule. It lives outside `init/`. `.github/workflows/tests.yml` runs it after PostgreSQL starts, before the backend E2E tests.
- `036`: the Projector reservation for event 411 is named `Projector 4K`, so the cancel-event tests (which count `Projector` stock) keep their totals.
- `database/README.md` documents the new script.
