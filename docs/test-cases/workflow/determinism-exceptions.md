# Determinism exceptions

A hit from `ai/scripts/test-workflow/scan-determinism.mjs` (sleeps, timers, polling loops, wall-clock time, random values) in a test file is allowed only when a row here covers it. `Max` is the number of hits the row covers in each matching file; extra hits are unjustified and block gate G4. Prefer removing the cause to adding a row. See `ai/docs/test-workflow.md` section 5 (G4).

| ID | File | Pattern | Max | Class | Reason |
|---|---|---|---|---|---|
| DX-06 | backend/test/equipment-update.e2e-spec.ts | random-id | 1 | isolation-id | The UUID is used only to create a unique test account email, avoiding collisions across repeated runs against the shared disposable test database; assertions do not depend on its value. |
| DX-07 | backend/test/equipment-requests.e2e-spec.ts | random-id | 3 | isolation-id | UUIDs are used only for unique fixture account emails, event IDs, and the isolated legacy-migration schema in the PostgreSQL test database; assertions use returned IDs and never depend on UUID values. |
| DX-01 | backend/test/events-*.e2e-spec.ts | random-id | 6 | isolation-id | The value is a unique fixture key (user email, event id, submission key, venue location) or an id that must not exist (the 404 cases). No assertion depends on its value. Fresh ids keep suites independent on the shared PostgreSQL database; fixed ids would collide on re-runs. |
| DX-02 | frontend/src/features/events/pages/detail/EventDetailPage.test.tsx | new-Date | 3 | fixture-date | A fixture helper from an earlier story builds the event around the current time. The SPM-135 venue-text tests do not read or assert its dates. Replace with a fixed date when the helper is next changed. |
| DX-03 | frontend/src/features/events/pages/list/EventCard.test.tsx | new-Date | 3 | fixture-date | Same helper pattern as DX-02, from an earlier story. |
| DX-04 | backend/test/events-confirm.e2e-spec.ts | poll-loop | 1 | bounded-poll | CONFIRM-EVENT-04-B (B, deterministic). The confirm request runs on the application's own connection, so a test cannot hold it with a promise gate or barrier. The only observable sign that it is blocked behind the competing change is PostgreSQL's lock wait in pg_stat_activity. The loop is bounded (200 x 10 ms) and the test asserts that the wait was observed, so a missed wait fails the test instead of passing silently. |
| DX-05 | backend/test/events-confirm.e2e-spec.ts | setTimeout | 1 | bounded-poll | The 10 ms pause inside the loop covered by DX-04. |
