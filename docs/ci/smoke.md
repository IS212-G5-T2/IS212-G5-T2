# Post-delivery smoke test

The `smoke` job in `.github/workflows/delivery.yml` runs after the `package` job. It downloads the
delivery archive, unpacks it, and proves the packaged app works. A failure fails the Delivery run.
Nothing is deployed. Tiers run cheapest first so a unit regression fails in seconds, not after the
browser suite.

| Tier | Command (from `backend/`) | What runs | Needs |
|---|---|---|---|
| 1 Unit | `npm run test:smoke:unit` | 9 spec files, 480 tests, about 1 s | nothing |
| 2 Integration | `npm run test:smoke:integration` | 3 `.e2e-spec.ts` files, 126 tests, about 15 s | disposable PostgreSQL |
| 3 Browser | `npm run test:browser -- --grep @P0` | every `@P0` Playwright test, 52 tests | disposable PostgreSQL, packaged backend and frontend |

What comes from the archive: `backend/dist` (started with `node dist/main` after `npm ci --omit=dev`)
and `frontend/dist` (served by `vite preview`). Tier 3 drives those. Tiers 1 and 2 run the repository's
source at the same commit (vitest imports `src/`), so they prove the logic and SQL, not the compiled files.

## Tier 1: unit tests

Allow-list in `backend/vitest.config.smoke.ts` (`SMOKE_UNIT_SPECS`). The specs themselves are not edited;
the reason for each is the comment beside its entry.

| Spec | Why |
|---|---|
| `src/auth/authentication/auth.service.spec.ts` | Login creates a server-side session; bad credentials do not; logout revokes. |
| `src/auth/authentication/authentication.middleware.spec.ts` | Session cookie becomes the request user; absent, empty or expired sessions are refused. |
| `src/auth/authorization/repository/rbac.repository.spec.ts` | Permission predicate fails closed for denied, missing and malformed rows. |
| `src/venues/repository/venues.repository.spec.ts` | Booking conflict detection: setup/turnaround overlap, one-minute boundaries, a race after the availability read. |
| `src/events/status/status.service.spec.ts` | Status transitions: routing, the Confirmed handler, compare-and-set races, invalid transitions. |
| `src/events/status/readiness.spec.ts` | Safety gate and Confirm readiness: venue, equipment and safety must all be satisfied. |
| `src/events/safety-officer/safety-officer.service.spec.ts` | Safety Officer queue and approve, reject and request-changes decisions. |
| `src/events/cancel/cancel-event.service.spec.ts` | Cancellation transition: authorisation order, cancellable set, transaction and notices. |
| `src/registrations/registrations.service.spec.ts` | Registration capacity math: open/close boundaries, N-1 versus N places, duplicates. |

## Tier 2: backend integration tests

Listed in the `test:smoke:integration` script in `backend/package.json`. It uses `run-e2e.mjs`, which
refuses a database without the disposable marker.

| Spec | Why |
|---|---|
| `test/events-planning-transition.e2e-spec.ts` | Approved to Planning through the booking endpoint, including conflicts, history and parallel requests. |
| `test/events-confirm.e2e-spec.ts` | Planning to Confirmed over HTTP, including the readiness block and assignment authorisation. |
| `test/safety-officer.e2e-spec.ts` | The safety gate end to end: queue, decisions, notifications and refusals. |

Deliberately not chosen:

- `venues-booking-requests.e2e-spec.ts` is 128 tests and replays migrations over the database, which can
  roll the schema back for the browser tier. Booking conflicts are covered by tier 1 and the P0 browser tests.
- `events-planning.e2e-spec.ts` has two failing tests on current `dev` (EVENT-FLAG-06-A and EVENT-VIEW-03-A).
  Reported, not fixed here.

## Tier 3: P0 browser tests

Every test whose title carries `@P0` in `frontend/**/*.playwright.spec.ts`. The selector is a title tag, so
a new P0 test joins the smoke suite by being tagged `@P0`, with no list to update. Count them with:

```sh
cd frontend && PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test --grep @P0 --list
```

The database is recreated between tiers 2 and 3, so the browser tier never inherits tier 2's state.

## Adding or removing a test

- Unit: add or remove the path in `SMOKE_UNIT_SPECS` in `backend/vitest.config.smoke.ts` and in the table above.
- Integration: change the file list in `test:smoke:integration` in `backend/package.json` and the table above.
  Pick files that do not replay migrations (`grep -c "migrations/" backend/test/<file>`).
- Browser: add or remove `@P0` in the test title. Do that only with the test's owner; the tag also marks priority.

## Failure evidence and re-runs

On failure the job uploads `smoke-failure-<run id>-<attempt>` (Playwright report, traces, screenshots,
videos, backend and frontend logs) and prints the database container logs. Every run starts from a clean
runner, a fresh unzip and a freshly built database, so re-running the whole Delivery workflow is safe.

## Run it locally

```sh
export SPM_TEST_DB_PORT=55433 SPM_TEST_DB_CONTAINER=spm-smoke-db
export TEST_DATABASE_URL="$(database/postgresql/scripts/test-db.sh up)"
cd backend && npm run test:smoke:unit && npm run test:smoke:integration
# For tier 3, start dist/main and a static server for frontend/dist, then:
PLAYWRIGHT_SKIP_WEB_SERVER=1 npm run test:browser -- --grep @P0
database/postgresql/scripts/test-db.sh down
```

The frontend bakes `VITE_API_BASE_URL` at build time (default `http://localhost:8080`), so the packaged
frontend only works with a backend on port 8080.
