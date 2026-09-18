# Backend

NestJS backend service for the IS212 G5 T2 workspace.

This service was scaffolded with the official Nest CLI using npm and strict TypeScript settings. It exposes event submission and retrieval endpoints alongside the starter health checks.

## Setup

Install dependencies:

```sh
npm ci
```

Run the development server:

```sh
npm run start:dev
```

The service listens on `PORT` when set, otherwise `3000`.

## Checks

Run local checks from this directory:

```sh
npm run lint
npm test
npm run test:e2e
npm run build
```

The monorepo test workflow runs `scripts/ci/unit-test.sh`, which currently delegates to `npm test`.

## Branch Flow

Start new work from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

No deployment command is configured for this repository.

## Local event requests

Set `DATABASE_URL` to the local PostgreSQL connection and `DEMO_ORGANISER_ENABLED=true` for the local sample. Compose supplies both through `.env.example`. `FRONTEND_ORIGIN` defaults to `http://localhost:5173` for CORS. The events schema and optional fictional seed live in `development/database/postgresql/init/002_events.sql` and `003_sample_events.sql`.

- `POST /api/events`: JSON fields `name`, `purpose`, `description`, `startDateTime`, `endDateTime`, `expectedAttendance`, `layout`, `facilities`, `accessibility`, `equipmentNeeds`, `submissionKey` (UUID v4).
- `GET /api/events`: lists the fixed local demo organiser's events, newest first.
- `GET /api/events/:id`: returns full details or 404.

Name, purpose, start/end times and positive integer attendance are required. Times are ISO UTC strings; end must follow start. Requests receive field-specific 400 errors. The server owns the organiser and status; SQL stores `Submitted`, mapped to `submitted` in the frontend contract. A unique organiser/submission key prevents duplicate retries. Optional text and selection fields have size/value limits.

There is no user-account implementation in this ticket. The demo identity is explicitly enabled only for local development; integrate the teammate's authenticated identity before shared/production use. Email delivery is deferred. Draft saving is described below.

After starting the local stack, run the integration test from the repository root:

```sh
docker compose -f development/local-dev/compose.yaml exec -T backend node --input-type=module - < tests/database/SPM-36/event-request-persistence.e2e-spec.mjs
```

It creates a uniquely identified test event and removes only that record in cleanup.

SPM-36 unit tests are in `src/events/event-input.spec.ts` (pure input validation) and `src/events/events.service.spec.ts` (NestJS service persistence, rollback, retry, retrieval, and local-demo guard). Run them with `npm test`.

## Draft requests (SPM-37)

Apply `migrations/001_event_drafts.sql` after the events schema. With `DATABASE_URL` set, run from this directory:

```sh
node scripts/migrate-drafts.mjs
```

The migration is additive and safe to repeat. It does not reset existing events or old draft tables. Fresh Compose volumes mount this migration automatically; existing databases require the command above.

- `GET /api/requests`: the current demo organiser's draft and previously submitted requests.
- `GET /api/requests/:id`: persisted fields, status, version, eventId and updatedAt; 404 for unavailable IDs.
- `PUT /api/requests/:id`: `{ fields, version, operationId }`; client-generated UUID v4 ID, version 0 for a new draft, otherwise latest saved version. Required submission fields may be empty. Saves retain incomplete date/time and attendance text, choices and attachments. Status is always server-owned.
- `POST /api/requests/:id/submit`: `{ version, startDateTime, endDateTime }`, with UTC ISO timestamps converted from the form's local dates/times. Other event values come from the saved draft. Normal event validation still applies. Creation and draft locking share one PostgreSQL transaction. The submitted event retains the draft's ID; repeated submission returns that event. Later PUTs return 409.

Concurrent saves use row locks plus versions. Retrying the last operation with identical fields returns its existing result without incrementing version; changed payloads cannot reuse the same operationId. Stale saves get 409, and the user must reopen before trying again. Attachments are limited to five files of 1 MB each; JSON requests accept up to 8 MB.

AC7 organisation isolation is deferred by the requester. Demo visitors share the same server-configured organiser; client-supplied identities are ignored. This is not authentication. Integrate the real account/organisation boundary before shared production use.

Use Node 24 LTS for the Nest CLI (Node 23 can fail with ERR_REQUIRE_CYCLE_MODULE). Run `npm test` for unit suites. Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database, then run `npm run test:e2e`; the draft integration suite creates its schema and removes only its own records. Without that variable the database suite is skipped.

For real browser checks, run a backend pointing to the test database and a frontend with VITE_API_BASE_URL pointing at that backend. Set TEST_DATABASE_URL, PLAYWRIGHT_BASE_URL and PLAYWRIGHT_API_URL to those matching endpoints, then run:

```sh
node scripts/testing/run-browser.mjs
```

The harness runs the frontend Playwright suite and cleans its uniquely named records in a finally block. Do not point tests at a different database from the browser backend.
