# Backend

NestJS backend service for the IS212 G5 T2 workspace.

This service was scaffolded with the official Nest CLI using npm and strict TypeScript settings. It exposes a health check, PostgreSQL-backed authentication, and RBAC services for protected endpoints.

## Authentication endpoint

The cookie-based API never returns password hashes or session tokens:

- `POST /api/auth/login` accepts `{ "email", "password" }`, creates an
  eight-hour server-side session, and sets an HTTP-only `SameSite=Lax` cookie.
- `GET /api/auth/me` reads that cookie and returns the authenticated user identity
  and roles.
- `POST /api/auth/logout` revokes the persisted session and clears the
  cookie.

The local database seeds one account per role. All use password
`P@55w0rd` and are strictly for local development:

| Role | Email |
| --- | --- |
| Organiser | `organiser@local.connectsphere.test` |
| Coordinator | `coordinator@local.connectsphere.test` |
| Venue Staff | `venue.staff@local.connectsphere.test` |
| Tech Support | `tech.support@local.connectsphere.test` |
| Attendee | `attendee@local.connectsphere.test` |

Sessions are opaque random values. PostgreSQL retains only their SHA-256
digests in `auth_sessions`; passwords are verified with bcrypt through the
PostgreSQL `pgcrypto` extension. Configure `AUTH_COOKIE_NAME`,
`AUTH_COOKIE_SECURE`, and `AUTH_SESSION_TTL_HOURS` in `.env`.
Keep `AUTH_COOKIE_SECURE=false` only for local HTTP; set it to `true`
when serving HTTPS.

## Authorization

Route-owning modules must apply `AuthenticationMiddleware` to protected
controllers. The app module currently applies it only to `AuthController`.
The current events controller is therefore not session-protected. When the
middleware is applied to a controller, it:

- Leaves public `GET /` and `GET /healthz` requests alone.
- Requires a valid session cookie for that protected controller's non-public routes.
- Resolves the account identity and normalized roles from PostgreSQL.
- Attaches the authenticated user to `request.currentUser`.

`RbacRepository` reads PostgreSQL `roles`, `resources`, and `role_permissions` rows and builds composable permission predicates for resource queries. Protected resource repositories should include the predicate and ownership condition in the same `SELECT`, `INSERT`, `UPDATE`, or `DELETE` statement.

Auth code is organized by responsibility:

| Path | Purpose |
| --- | --- |
| `src/config/auth.config.ts` | Authentication session environment parsing and validation. |
| `src/auth/authentication/` | Session authentication, login/logout API, and request middleware. |
| `src/auth/authorization/` | RBAC permission and ownership checks. |
| `src/auth/models/` | Shared auth user, role, permission, and public-route models. |

## Database Access

`DatabaseModule` owns the shared PostgreSQL pool through `DatabaseService`.
Services and repositories inject `DatabaseService` instead of creating their
own `pg.Pool` instances. The shared pool sets connection, idle, and query
timeouts and is closed through Nest module shutdown hooks.

Use `DatabaseService.query()` for single SQL statements and `DatabaseService.transaction()` for multi-step insert/update/upsert/delete flows that must commit or roll back together. Keep table-specific SQL, joins, and domain rules inside repositories rather than adding generic CRUD methods to `DatabaseService`.

Required runtime configuration:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used for RBAC lookups. |
| `AUTH_COOKIE_NAME` | Name of the HTTP-only session cookie. |
| `AUTH_COOKIE_SECURE` | Set `true` when the backend is served over HTTPS. |
| `AUTH_SESSION_TTL_HOURS` | Session lifetime; defaults to `8`, maximum `168`. |

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
npm run test:cov
npm run test:e2e
npm run build
```

The monorepo test workflow runs `scripts/ci/unit-test.sh`, which delegates to
`npm run test:cov` and writes a local V8 coverage report to `coverage/`.

## Branch Flow

Start new work from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

No deployment command is configured for this repository.

## Local event requests

Set `DATABASE_URL` to the local PostgreSQL connection and
`DEMO_ORGANISER_ENABLED=true` for the local sample. Compose supplies both
through `.env.example`. `FRONTEND_ORIGIN` defaults to `http://localhost:5173`
for CORS. The complete local schema and optional fictional seed live in
`database/postgresql/init/001_schema.sql` and `002_seed_data.sql`.

- `POST /api/events`: JSON fields `name`, `purpose`, `description`, `startDateTime`, `endDateTime`, `expectedAttendance`, `layout`, `facilities`, `accessibility`, `equipmentNeeds`, `submissionKey` (UUID v4).
- `GET /api/events`: lists the fixed local demo organiser's events, newest first.
- `GET /api/events/:id`: returns full details or 404.

Name, purpose, start/end times and positive integer attendance are required. Times are ISO UTC strings; end must follow start. Requests receive field-specific 400 errors. The server owns the organiser and status; SQL stores `Submitted`, mapped to `submitted` in the frontend contract. A unique organiser/submission key prevents duplicate retries. Optional text and selection fields have size/value limits.

Firebase handles user accounts for `/auth/me`, but the event API does not yet
use the authenticated Firebase user. Its demo identity is explicitly local-only;
integrate server-side Firebase identity and RBAC before shared or production
use. Email delivery and Save Draft are deferred.

Event unit tests live beside their implementation:
`src/events/event-input.spec.ts` covers validation and
`src/events/events.service.spec.ts` covers persistence behavior with mocked
database calls. They run through `npm test`. There is no committed
database-container E2E test for the event endpoints.

## Clarification/amendment requests (SPM-39)

Coordinators can open a clarification/amendment thread with the event's
Organiser. Unlike the events endpoints above, these routes are protected by
`FirebaseAuthenticationMiddleware` and use the real authenticated Firebase
`uid`/`roles` for ownership checks.

- `POST /api/events/:id/clarifications`: Coordinator opens a clarification.
  Requires `Authorization: Bearer <Firebase ID token>` for a user with the
  `COORDINATOR` role whose uid matches the event's `coordinator_id`. Body:
  `{ "message": string }` (rejected with 400 if blank/whitespace-only).
  Notifies the Organiser. Does not change the event's status — "Under Review"
  was retired as a distinct status (SPM-38 follow-up); only `Submitted` and
  `Approved` remain.
- `GET /api/events/:id/comments`: full chronological clarification/reply
  thread. Restricted to the event's Organiser or its assigned Coordinator.
- `POST /api/events/:id/clarifications/:clarificationId/reply`: Organiser
  replies, clearing that clarification's `awaitingReply` flag. Restricted to
  a user with the `ORGANISER` role whose uid matches the event's
  `organiser_id`.

See `HANDOVER.md` for known gaps: no endpoint yet assigns `coordinator_id`,
and `EventsService`'s hardcoded demo-organiser identity means the reply
endpoint's ownership check only matches events whose `organiser_id` is a real
Firebase uid.

Unit tests: `src/clarifications/clarification-input.spec.ts` and
`src/clarifications/clarifications.service.spec.ts`. E2E test:
`test/clarifications.e2e-spec.ts`, run through `npm run test:e2e` against a
real PostgreSQL database and the Firebase Auth Emulator.

## Request rejection (SPM-83)

Apply `migrations/003_event_rejection.sql`, then `migrations/004_allow_rejected_event_status.sql`, after the existing events and clarification schema (including its notifications table). Fresh local databases receive the final SPM-38/83 status and reason constraints directly from `database/postgresql/init/001_schema.sql`. This preserves existing rows; do not reset volumes.

- `POST /api/events/:id/reject` accepts `{ "reason": "..." }`. It requires the verified COORDINATOR assigned to a Submitted event. The trimmed reason must be 10–500 characters, contain at least three words, and include letters. It returns the updated event, including `rejectionReason`.
- Rejection locks the event and commits Rejected status, reason and an organiser-addressed in-app notification in one transaction. A concurrent/stale decision returns 409; another coordinator's assignment returns 403. Failures roll back all writes.
- `GET /api/notifications` returns only the verified ORGANISER's rejection notifications. `POST /api/notifications/:id/read` marks only that recipient's notification read.
Notifications are persistent in-app messages, not email. The frontend checks for them on sign-in, focus and every 30 seconds. In local demo mode they are addressed to the existing fixed demo organiser. Build with `npm run build`; use configured Firebase coordinator and organiser accounts to verify the live workflow.
