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

Local-only account credentials and roles are listed in
[database/README.md](../database/README.md#local-login-data); do not reuse them
outside development.

Sessions are opaque random values. PostgreSQL retains only their SHA-256
digests in `auth_sessions`; passwords are verified with bcrypt through the
PostgreSQL `pgcrypto` extension. Configure `AUTH_COOKIE_NAME`,
`AUTH_COOKIE_SECURE`, and `AUTH_SESSION_TTL_HOURS` in `.env`.
Keep `AUTH_COOKIE_SECURE=false` only for local HTTP; set it to `true`
when serving HTTPS.

## Authorization

Route-owning modules must apply `AuthenticationMiddleware` to protected
controllers. The app module applies it to authenticated event, clarification,
and venue routes. When the middleware is applied to a controller, it:

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
| `src/auth/types/` | Shared auth user, role, permission, and public-route types. |

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

Set `DATABASE_URL` to the local PostgreSQL connection. Compose supplies it
through `.env.example`. Every event route needs a signed-in session; there is
no shared demo identity. `FRONTEND_ORIGIN` defaults to `http://localhost:5173`
for CORS. The complete local schema and optional fictional seed live in
`database/postgresql/init/001_schema.sql` and `002_seed_data.sql`.

- `POST /api/events`: JSON fields `name`, `purpose`, `description`, `startDateTime`, `endDateTime`, `expectedAttendance`, `layout`, `facilities`, `accessibility`, `equipmentNeeds`, `submissionKey` (UUID v4).
- `GET /api/events` and `GET /api/events/:id` return requests visible to the
  signed-in account. Drafts use `/api/requests`. Submission leaves a request
  unassigned until the Event Coordinator Lead assigns it.

The server derives ownership from the session, not client-supplied identity.
Existing rows created with the old fixed demo identity remain inaccessible
under session scoping; migrate ownership only after verifying the real owner.
Submitted requests use the stored `Submitted` status and a unique
organiser/submission key to protect retries. Email delivery is deferred.

## Equipment records

Technical Support users can create and list equipment through `POST /api/equipment`
and `GET /api/equipment`; `GET /api/equipment/locations` returns distinct saved
locations for the create form. Equipment requests require a non-blank name and
location, predefined type and maintenance status, and a whole-number quantity
from 1 through `2,147,483,647` (the PostgreSQL `integer` maximum).

Availability is separate from maintenance status. Marking equipment
unavailable and writing its audit entry happen in one transaction; a failed
audit insert rolls the availability change back. `GET /api/equipment` excludes
unavailable records unless `includeUnavailable=true` is requested.

## Venue records (SPM-50)

`POST /api/venues` requires a valid local session and the RBAC `Venue:create`
permission (granted to `VENUE_STAFF`). It accepts a venue name, one scalar location,
positive integer capacity, non-empty facilities and layouts, optional
accessibility features, separate operating information and operating
days with valid daily start/end times, and non-negative
whole-minute setup and turnaround durations. Facilities and layouts must match
the controlled lookup values; an optional image must be an image data URL no
larger than 5 MB. Successful requests persist the venue, its normalized
relationships, optional image, and the authenticated Venue Staff account ID
(`venues.owner_user_id`) atomically and return
the saved record with `Venue created successfully.` PostgreSQL generates the
venue UUID; the server derives ownership from the verified session, never from
request fields. Missing or invalid fields
return field-specific `400` errors. A case-insensitive, trimmed name/location
pair must be unique; duplicates return a field-level `409` conflict while the
UUID remains the stable identifier.

Apply `migrations/005_venues.sql` followed by
`migrations/006_venue_operating_information.sql`, then
`migrations/007_venue_operating_schedule.sql`, then
`migrations/008_venue_owner_user_id.sql` to existing databases. The owner
migration leaves historical venues with unknown ownership unassigned, while
requiring an owner for new rows and enforcing a foreign key to `users(id)`.
Fresh local databases
receive the tables through `database/postgresql/init/001_schema.sql`. Unit
coverage lives in `src/venues/*.spec.ts`; the optional PostgreSQL integration
test is `test/venues.e2e-spec.ts` and runs with `DATABASE_URL`.

### Venue Staff catalogue (SPM-124)

`GET /api/venues` and `GET /api/venues/:id` require `Venue:read` and return the
shared catalogue to every authorized reader. `GET /api/venues?mine=true` narrows
the list to venues whose `owner_user_id` matches the verified session; no client
owner ID is accepted. Responses include venue fields, image,
current and scheduled staff blockouts, approved bookings, and active pending
holds. A booking is marked affected when a blockout overlaps its occupied
setup-to-turnaround period. Apply migration `009_venue_availability.sql` after
migrations 005–008 for existing databases; fresh local initialization includes
the schedule and sample venues.

### Mark venue unavailable (SPM-122)

Venue Staff can `POST /api/venues/:id/unavailable-periods` with ISO date-times
`start`, `end`, and a required free-text `reason`. The response contains the
saved `period` and `affectedBookings`, including setup and turnaround overlaps.
The end time must be later than the current server time. A period that has
already started can be saved if it is still in progress. The affected list
contains current and upcoming bookings, including their setup and turnaround
time; elapsed bookings are omitted.
Existing bookings and events are unchanged.
`POST /api/venues/:id/unavailable-periods/:periodId/end` shortens one active period
to the server clock time. `GET /api/venues/:id` exposes current and scheduled
periods with reasons and a `current` flag for the early-end control.

## Clarification/amendment requests (SPM-39)

Coordinators can open a clarification/amendment thread with the event's
Organiser. Like other protected routes, these use the verified local session
and check the account against the event's assigned coordinator or owner.

- `POST /api/events/:id/clarifications`: Coordinator opens a clarification.
  Requires the `COORDINATOR` role and an account matching the event's
  `coordinator_id`. Body:
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

The Lead assigns coordinators through `/api/lead/queue/:eventId/assign`.
`test/clarifications.e2e-spec.ts` exercises the HTTP/session/PostgreSQL path
with a dedicated test database.

## Request decisions (SPM-83 and SPM-40)

Apply `migrations/003_event_rejection.sql`, then `migrations/004_allow_rejected_event_status.sql`, after the existing events and clarification schema (including its notifications table). Fresh local databases receive the final SPM-38/83 status and reason constraints directly from `database/postgresql/init/001_schema.sql`. This preserves existing rows; do not reset volumes.

- `POST /api/events/:id/reject` accepts `{ "reason": "..." }`. It requires the verified COORDINATOR assigned to a Submitted event. The trimmed reason must be 10–500 characters, contain at least three words, and include letters. It returns the updated event, including `rejectionReason`.
- `POST /api/events/:id/approve` takes no body. It requires the verified COORDINATOR assigned to a Submitted event and returns the updated event with status `approved`.
- Approval locks the event and commits Approved status plus an organiser-addressed `approval` notification in one transaction. Any later attempt to approve or move the same request through this decision endpoint returns 409, preserving the forward-only status transition.
- Rejection locks the event and commits Rejected status, reason and an organiser-addressed in-app notification in one transaction. A concurrent/stale decision returns 409; another coordinator's assignment returns 403. Failures roll back all writes.
- `GET /api/notifications` returns only the verified ORGANISER's approval and rejection notifications. `POST /api/notifications/:id/read` marks only that recipient's notification read.
Notifications are persistent in-app messages, not email. The frontend checks
for them on sign-in, focus, and every 30 seconds. Identity and recipient
scoping come from the local session.

## Registration report and exports

The report and CSV/PDF exports all use `RegistrationsService.getReport`, so
the owning organiser and assigned coordinator share one access rule. CSV
formula neutralisation applies only to exported cells; stored values and the
JSON report remain unchanged. The PDF embeds
`assets/fonts/NotoSans-Regular.ttf` (SIL OFL); keep that asset in the Docker
image. The font does not cover CJK glyphs, and large reports rely on PDFKit
page wrapping. Integration checks require a dedicated PostgreSQL database and
`npm run test:e2e`; the report mutation check is
`node scripts/mutation/run.mjs --mutants spm63.mutants.mjs` with `DATABASE_URL`.
