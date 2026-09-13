# Backend

NestJS backend service for the IS212 G5 T2 workspace.

This service uses NestJS, npm and strict TypeScript. It exposes the starter endpoint and PostgreSQL-backed event request drafts.

## Setup

Install dependencies:

Use Node.js 24 LTS for the NestJS tooling and checks.

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

## Event request drafts

Set `DATABASE_URL` in the backend process environment and run `node scripts/migrate.mjs` before using drafts. For the shared local PostgreSQL container, a backend running on the host uses `postgres://spm:spm_dev_password@localhost:5432/spm`; a backend inside Compose uses host `postgres`. These are local development credentials. The migration is owned by this service at `migrations/001_event_requests.sql`; it creates the table and index without resetting existing data.

Draft list/read/save endpoints require no authentication. They use the shared anonymous workspace in `src/event-requests/draft-workspace.ts`. Anyone using this instance can reopen and edit its anonymous drafts. Caller-provided identity headers do not select an owner. Later authentication integration must supply verified ownership and restore organisation isolation.

| Endpoint | Contract |
| --- | --- |
| `GET /event-requests` | Lists requests in the shared anonymous workspace, newest save first. |
| `GET /event-requests/:id` | Returns a request in the anonymous workspace; missing or other-workspace IDs return 404. |
| `PUT /event-requests/:id/draft` | Creates or updates a draft using `{ fields, version, operationId }`. |

The client generates a UUID request ID and operation ID. Creation uses version 0; subsequent saves use the returned version. Retrying an uncertain response must reuse the exact ID, operation ID, version and fields. Conflicting versions or non-draft status return 409. Missing fields are accepted and normalised to empty strings or null. The response contains `id`, `organisationId`, `organiserId`, `status`, `fields`, `version`, `createdAt` and `updatedAt`. Ownership, status and timestamps cannot be supplied as editable fields.

Draft fields are `name`, `purpose`, `description`, `startDateTime`, `endDateTime`, `expectedAttendance`, `venueRequirements`, `accessibilityNeeds`, `equipmentRequirements`, `layout` and `registrationEnabled`. Dates remain draft text, attendance is a non-negative integer or null, and registration is boolean or null. Text is limited to 2,000 characters except description (10,000). Submission validation belongs to the submission workflow.

Set `TEST_DATABASE_URL` to a local test database before `npm run test:e2e` to run the PostgreSQL scenarios; without it those scenarios are explicitly skipped. Tests call the real API without authentication and clean up their own request IDs. Authentication and organisation isolation are deferred. Set `FRONTEND_ORIGIN` when using a frontend origin other than `http://localhost:5173`.

Unit tests live beside their source modules as .spec.ts files and are discovered by npm test. Database/API integration tests live beside their module as .e2e-spec.ts files and run with npm run test:e2e, alongside the existing test/ smoke suite. Later Jira stories extend the same module tests.

The pg runtime driver and @types/pg have been restored for draft persistence. Apply migrations with `node scripts/migrate.mjs`.

For the real browser/database test, start `scripts/testing/browser-fixture.mjs` with `NODE_ENV=test` and `TEST_DATABASE_URL` set, then run frontend Playwright with `DRAFT_TEST_API_URL=http://127.0.0.1:3001`. The harness cleans up only its own request IDs on shutdown.
