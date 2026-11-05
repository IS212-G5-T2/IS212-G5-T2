# Database changelog

Changes to the local database assets in `database/`. Newest first.

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
