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

There is no user-account implementation in this ticket. The demo identity is explicitly enabled only for local development; integrate the teammate's authenticated identity before shared/production use. Email delivery and Save Draft are deferred.

After starting the local stack, run the integration test from the repository root:

```sh
docker compose -f development/local-dev/compose.yaml exec -T backend node --input-type=module - < tests/database/SPM-36/event-request-persistence.e2e-spec.mjs
```

It creates a uniquely identified test event and removes only that record in cleanup.

SPM-36 unit tests are in `src/events/event-input.spec.ts` (pure input validation) and `tests/backend/SPM-36/event-request-service.spec.ts` (NestJS service persistence, rollback, retry, retrieval, and local-demo guard). Run them with `npm test`.
