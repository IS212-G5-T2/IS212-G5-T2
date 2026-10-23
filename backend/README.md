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

## Event planning (SPM-97, SPM-49, SPM-85)

The event request form reads supported facility and accessibility labels/values from `GET /api/venues/options`. Event creation validates both selections against the same venue schemas used by venue creation and comparison.

Routes (all behind `AuthenticationMiddleware`; the service checks role, ownership/assignment and event status):

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/events/:id/planning` | Owning organiser (read-only), assigned coordinator | Event information, venue bookings, equipment, pending changes, and for the coordinator each field's edit mode (`direct`, `conditional` with its condition, or `needs_review`) |
| `PATCH /api/events/:id/planning` | Assigned coordinator | Update fields. A change that stays compatible with every existing venue booking and equipment arrangement applies immediately; only an incompatible change is flagged "Needs Review", listing just the arrangements it affects |
| `POST /api/events/:id/planning/changes/:changeId/resolve` | Assigned coordinator | `{ decision: 'confirm' \| 'reject', bookingId? }` |
| `GET /api/events/:id/planning/history` | Owning organiser, assigned coordinator | Resolved changes, newest first |

Rules, assumptions and the placeholder tables behind this are in `HANDOVER.md`; test cases are indexed in `../docs/test-cases/SPM-49_SPM-85_SPM-97_Test-Cases.md`.

```sh
# Unit tests for the rules (mocked repository)
npx vitest run src/events/planning/dto/event-update-input.spec.ts src/events/planning/helpers/event-impact.spec.ts src/events/planning/event-planning.service.spec.ts

# Integration tests against real SQL. Use a disposable database: the spec applies
# database/postgresql/init/001_schema.sql to it. Uses TEST_DATABASE_URL,
# else DATABASE_URL; skipped locally when neither is set, fails in CI when neither is set.
TEST_DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-planning.e2e-spec.ts

# The same routes through HTTP, session-cookie auth and PostgreSQL
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-planning.http.e2e-spec.ts
```

## Event change requests (SPM-64)

The owning organiser asks for changes to a submitted event; the assigned coordinator decides them (SPM-65, not built yet). A request stores only the proposed values: the event, its bookings and its safety check do not change until a coordinator approves it.

| Route | Who | Purpose |
| --- | --- | --- |
| `POST /api/events/:id/change-requests` | Owning organiser | `{ changes: { <field>: <value> }, reason? }` → 201 with the request (status `Pending`). Permitted fields: `description`, `startDateTime`, `endDateTime`, `expectedAttendance`, `layout`, `facilities`, `accessibility` (special requirements), `equipmentNeeds`. `name` and the organiser fields are refused with their own message; any other field is refused by name. Values follow the same rules as `PATCH /planning`. Only fields that differ from the stored values are kept; none → 400. Allowed while the event is Submitted, Approved, Planning or Confirmed and has not started (else 409 `change_request_closed` / `event_started`). One pending request per event (409 `change_request_pending`, also enforced by a partial unique index). The assigned coordinator gets a `coordinator_change_request` notification; if the event has no coordinator yet, or the Lead reassigns it while the request is pending, the coordinator who receives it gets the same notice from `POST /api/lead/queue/:eventId/assign` or `POST /api/lead/events/:eventId/reassign` (`src/events/change-requests/change-request-notice.ts`), and the previous coordinator's unread notice is marked read. Keys are matched as own properties, so `__proto__`, `constructor` and similar keys in the body are refused by name with a 400. `requiresSafetyCheck` is true when the event has a safety check (a row in `event_safety_checks`, any status), because approving any change resets it; a pending request re-reads this on every list, a decided one keeps the value stored at submission. |
| `GET /api/events/:id/change-requests` | Owning organiser, assigned coordinator | The event's requests, newest first |
| `POST /api/events/:id/change-requests/:requestId/withdraw` | Owning organiser | Withdraw a pending request (SPM-64 AC8). 401 without a session, 403 for non-organisers, 404 for other organisers or a request under another event, 409 `This change request has already been decided.` once it is Approved, Denied, Withdrawn or Closed. The withdrawal is written to the SPM-65 audit log. |
| `GET /api/change-requests[?status=Pending]` | Organiser, coordinator | The caller's requests across their own (organiser) or assigned (coordinator) events, for dashboards |

Anyone else gets 404 for the event, as for `GET /api/events/:id`. Schema: `database/postgresql/init/018_spm64_change_requests.sql`; existing databases apply `backend/migrations/012_spm64_change_requests.sql` once (idempotent).

```sh
npx vitest run src/events/change-requests
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/change-requests.e2e-spec.ts
```

## Change request review (SPM-65)

The assigned coordinator reviews pending requests (`src/events/change-requests/review/`). Anyone but the assigned coordinator gets 404; non-coordinators get 403; no session gets 401.

| Route | Who | Behaviour |
| --- | --- | --- |
| `GET /api/events/:id/change-requests/:requestId/conflicts` | Assigned coordinator | Read-only preview (AC3): `{ requestId, venueBookings[], equipment[], registrations: { registered, waitlisted, details[] }, hasConflicts }`. Uses the SPM-49/85 rules (`assessVenueBookings`, `equipmentImpacts`) on active arrangements only; attendance below the registered count, and a date/time change with registered or waitlisted attendees, are listed under registrations. Writes nothing. |
| `POST /api/events/:id/change-requests/:requestId/approve` | Assigned coordinator | Empty body (anything else → 400). In one transaction: re-validates the values (400 with `errors` if no longer valid, for example a start now in the past), refuses with 409 while an SPM-85 change to the same field awaits review, then applies every field through `EventPlanningRepository.applyFields`. If the event had a safety check, the trigger resets it and the reset reason reads `Change request approved`; a Confirmed event returns to Planning with an `event_status_history` row. Stores the affected bookings and reservations as the request's `recheck` list, writes the audit entry and notifies the organiser (`change_request_approved`). Returns `{ request, eventStatus, safetyCheckReset, registrations }`. 409 `event_started` once the event has started; 409 for Completed/Rejected events; 409 `EVENT_CANCELLED` for a cancelled event. |
| `POST /api/events/:id/change-requests/:requestId/deny` | Assigned coordinator | `{ reason }`, trimmed, 10 to 500 characters (400 otherwise; other keys are refused by name). Leaves the event and its safety check unchanged, writes the audit entry and notifies the organiser (`change_request_denied`, message includes the reason). |
| `POST /api/events/:id/change-requests/:requestId/recheck/:itemId` | Assigned coordinator | Marks one item of an approved request's re-check list as re-checked (`checkedAt`, `checkedBy`). 404 for an unknown item, 409 if already re-checked or the request is not Approved. |
| `GET /api/events/:id/change-requests/audit` | Owning organiser, assigned coordinator | The audit log, newest first: `{ id, changeRequestId, outcome, changes, requestedBy, decidedBy, reason?, decidedAt }`. |

AC11: a pending request is closed automatically when the organiser withdraws it (status `Withdrawn`, via `POST …/withdraw`) or the event is cancelled (status `Closed`, see below). A closed request, like one already approved or denied, cannot be previewed or decided: 409 with `code` `change_request_withdrawn` ("The organiser has withdrawn this change request."), `change_request_closed` ("This change request was closed because the event was cancelled.") or `change_request_decided`. The request row is locked `FOR UPDATE`, so two decisions at once settle to one. Every outcome (Approved, Denied, and also Withdrawn by the organiser and Closed by cancellation) is written to `event_change_request_audit` in the same transaction; that table is append-only (an `UPDATE` raises) and holds one entry per request. It is not delete-protected: no route or query in the application deletes events, change requests or audit entries, but a direct database `DELETE` of an event or change request removes its entries (`ON DELETE CASCADE`), and a direct `DELETE` on the table is not blocked. Cancelling an event (SPM-136) closes its pending request through `release/change-request.releaser.ts` (status `Closed`, decided by `System`, reason "The event was cancelled."). Schema: `database/postgresql/init/019_spm65_change_request_review.sql`; existing databases apply `backend/migrations/013_spm65_change_request_review.sql` once (idempotent).

```sh
npx vitest run src/events/change-requests
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/change-request-review.e2e-spec.ts
```

Conflict details under "Changes Awaiting Review" (`helpers/event-impact.ts`) show times in Singapore time with am/pm (`src/common/sgt-time.ts`). Flagged changes stored before this change keep their original UTC text.

## Cancel an event (SPM-136)

`POST /api/events/:id/status-change` with `{ "targetStatus": "Cancelled", "confirmed": true }` cancels an event. The assigned coordinator or the submitting organiser may cancel a Submitted, Approved, Planning or Confirmed event. `confirmed` must be the boolean `true` (anything else: 400 `CANCEL_NOT_CONFIRMED`). Other refusals: 403 `FORBIDDEN` for anyone else, 409 `EVENT_NOT_CANCELLABLE` for any other status, and 409 `EVENT_CANCELLED` for every arrangement change on a cancelled event (`src/events/cancelled-guard.ts`). Reversing a cancellation is refused (422). Identity comes from the session only.

The cancellation runs in one transaction: lock and re-check the event, compare-and-set `Cancelled` (stamped with the injected clock), write `event_status_history`, write one `EventCancelled` notification per recipient (organiser, assigned coordinator, Registered attendees), then run every releaser in `src/events/cancel/release.registry.ts`. Releasers live with their tables: venue bookings and holds (`src/venues/release`), equipment reservations (`src/equipment/release`) and registrations (`src/registrations/release`). Withdrawn registrations are never touched and there is no waiting-list promotion.

Schema: `backend/migrations/011_spm136_cancel_event.sql` (the same file is `database/postgresql/init/017_spm136_cancel_event.sql` for fresh volumes). It is idempotent and adds `events.cancelled_by`/`cancelled_at`, the `released` venue booking status, `released_at` columns, `event_registrations.cancellation_reason`, and the once-only `EventCancelled` index. Notifications are readable by organisers and coordinators through `GET /api/notifications`; there is no attendee read path yet.

```sh
npx vitest run src/events/cancel src/events/cancelled-guard.spec.ts
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-cancel.e2e-spec.ts test/events-cancelled-guard.e2e-spec.ts
node scripts/mutation/run.mjs --mutants spm136.mutants.mjs   # scratch copy only; needs DATABASE_URL
```

## Coordinator queue (SPM-48)

`GET /api/coordinator/queue[?status=planning,submitted]` returns the signed-in coordinator's queue: every event assigned to them (the same records as `GET /api/events` for a coordinator, `coordinator_id` = session uid), each with a `queue` object. Unassigned requests stay in the Lead's queue (SPM-123), drafts live in `event_drafts` and never appear, and an event reassigned away leaves the queue (SPM-47 AC6). Coordinator role only: no session 401, any other role 403 "Coordinator access required.". `status` is optional: one status or a comma-separated list of the seven terms, any case; an unknown value (including `Under Review` and `draft`) is 400 "Unknown status filter: <value>.". Served with `Cache-Control: no-store` (AC4).

`queue` is `{ safety, holds[], unavailableVenues[], actions[], needsAction }`, derived by the pure rules in `src/events/queue/queue-indicators.ts` with the injected clock:

| Field | Rule |
|---|---|
| `safety` | `AWAITING_CHECK`, `CHANGES_REQUESTED`, `CLEARED` as SPM-94 (`deriveSafetyIndicator`); `REJECTED` for a rejected arrangement (AC7); `RESET` when the check was reset (for example by an approved change, SPM-65 AC8) and not requested again (AC6). None on Completed, Cancelled or Rejected events. |
| `holds` | Each pending booking with `hold_expires_at`: `{ venueName, expiresAt, state }`, `ACTIVE` until the expiry instant and `EXPIRED` from it on (AC8). |
| `unavailableVenues` | Venues of active bookings (approved, or pending with no hold or a live hold) that a Venue Staff unavailable period overlaps, counting the venue's setup time before and turnaround time after the booking (SPM-122 AC7, SPM-54 AC2). The rule is `src/events/venue-unavailable.ts`, shared with the venue summary and Confirm readiness, so all three agree (AC9). The flag clears when the affected booking is cancelled or the period is ended early; booking a replacement alone does not clear it. |
| `actions` | Why the event needs the coordinator (AC5): `AWAITING_REVIEW` (Submitted), `SAFETY_CHANGES_REQUESTED`, `SAFETY_REJECTED`, `SAFETY_RESET`, `VENUE_UNAVAILABLE`, `HOLD_EXPIRED`. `needsAction` is true when there is at least one. |

Schema: `backend/migrations/023_spm48_safety_rejected.sql` (mirrored as `database/postgresql/init/023_spm48_safety_rejected.sql`) adds `rejected` to `event_safety_checks.status`; it is idempotent. SPM-130 will write rejections; the coordinator re-requests a rejected check through `POST /api/events/:id/safety-check/request`.

```sh
npx vitest run src/events/queue
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/coordinator-queue.e2e-spec.ts
```

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

Technical Support can update the same fields through `PUT /api/equipment/:id`.
The update and its audit snapshot commit in one transaction; unchanged
submissions return `No changes were made.` and do not add an audit entry.
Existing databases must apply `migrations/011_equipment_record_updates.sql`;
fresh local databases include the final audit constraint and Equipment update
permission in the initializer.

Run the SPM-118 equipment update fault-injection checks from this directory
with `node scripts/mutation/run.mjs --mutants spm118.mutants.mjs`.

Availability is separate from maintenance status. Marking equipment
unavailable and writing its audit entry happen in one transaction; a failed
audit insert rolls the availability change back. `GET /api/equipment` excludes
unavailable records unless `includeUnavailable=true` is requested.

## Equipment requests (SPM-57)

An assigned Coordinator submits one or more equipment items with
`POST /api/equipment/requests` using `{ eventId, items: [{ equipmentName,
equipmentType, quantity }] }`. Equipment name is required, trimmed, and must be
nonblank following SPM-111 name semantics and the SPM-57 AC3 change record;
maintenance status and location are not request fields. Equipment type must
match the existing equipment catalogue types; quantity is a positive whole
number representable by PostgreSQL `integer`. A successful
request returns its reference and `Pending Review` state. Coordinators read only
their own requests at `GET /api/equipment/requests`; Technical Support reads the
Pending Review queue at `GET /api/equipment/requests/review-queue`.

Cancelled and Rejected events cannot be requested. For an Approved event, the
first equipment request and `Approved` → `Planning` transition/history are
written atomically; later requests in Planning do not repeat the transition.
Beside a Pending Review request, its owner can choose **Update Event** to open
the saved event and item values; saving uses
`PUT /api/equipment/requests/:requestId`, preserves the request ID/reference,
and is refused once the event is Confirmed. Request items own their corresponding
planning reservations, so replacing an item updates only that request's rows.
Fresh databases include these tables in `database/postgresql/init/001_schema.sql`;
existing databases apply `migrations/012_spm57_equipment_requests.sql` and
`migrations/014_spm57_request_reservations.sql`.

## Venue records (SPM-50)

`POST /api/venues` requires a valid local session and the RBAC `Venue:create`
permission (granted to `VENUE_STAFF`). It accepts a venue name, one scalar location,
positive integer capacity, non-empty facilities and layouts, optional
accessibility features, one free-text operating information value, and
non-negative whole-minute setup and turnaround durations. Operating days and
opening-time fields are not part of the venue model; staff provide any relevant
hours or closure information in the free-text operating information value. Facilities and
layouts must match the controlled lookup values; an optional image must be an
image data URL no larger than 5 MB. Successful requests persist the venue, its normalized
relationships, optional image, and the authenticated Venue Staff account ID
(`venues.owner_user_id`) atomically and return
the saved record with `Venue created successfully.` PostgreSQL generates the
venue UUID; the server derives ownership from the verified session, never from
request fields. Missing or invalid fields
return field-specific `400` errors. A case-insensitive, trimmed name/location
pair must be unique; duplicates return a field-level `409` conflict while the
UUID remains the stable identifier. `operatingInformation` is the only
operating data; the backend does not store operating days or opening/closing
times and does not create a compatibility schedule.

Apply `migrations/005_venues.sql` followed by
`migrations/006_venue_operating_information.sql`, then
`migrations/007_venue_operating_schedule.sql`, then
`migrations/008_venue_owner_user_id.sql`, `migrations/009_venue_availability.sql`,
and `migrations/010_remove_venue_operating_schedule.sql` to existing databases,
in that order. Migration 010 removes legacy schedule columns after the
availability migration is installed. The owner
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
setup-to-turnaround period. For an existing database, apply migrations 005–009
in order, then `010_remove_venue_operating_schedule.sql`; fresh local
initialization includes availability and sample venues without operating-hours
columns.

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

## Venue availability and booking requests (SPM-51)

`GET /api/venues/:id` returns confirmed bookings, active tentative holds and
unavailable periods for the venue. Pending holds include `holdExpiresAt`; holds
whose expiry is at or before the server clock are omitted. Coordinators submit
an assigned event's requested interval through
`POST /api/venues/:id/booking-requests` with `{ "eventId", "start", "end" }`,
where start/end are ISO instants. The request is stored as `pending` and the
response includes its booking reference. The backend locks the venue, checks
the fresh schedule against setup/turnaround buffers and blockouts, and returns
409 without inserting when it finds a conflict. Only the event's currently
assigned Coordinator may submit it.

Backend evidence for the booking-request rules is in
`src/venues/availability/booking-request.spec.ts`,
`src/venues/availability/dto/booking-request.spec.ts`, and
`test/venues-booking-requests.e2e-spec.ts`. The schedule schema supports
`rejected` as the declined request status; it has no `cancelled` booking status.
Accordingly, VEN-AVL-02-C's automated schedule assertion checks that pending
requests are tentative and rejected requests are absent, without claiming a
cancelled status exists.

Run SPM-51 fault-injection checks with a PostgreSQL database configured in
`DATABASE_URL`:

```sh
node scripts/mutation/run.mjs --mutants spm51.mutants.mjs
```

The runner prints baseline and per-mutant results with the mapped test evidence;
it does not persist a result report. Exit code `0` means all selected mutants
were killed or marked equivalent, `1` means a non-equivalent mutant survived or
could not be applied exactly once, `2` means setup/baseline validation failed,
and `3` means one or more required suites were skipped because their database
environment was unavailable. A skipped suite is not counted as a kill.

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

## Waitlist (SPM-138)

`POST /api/events/:eventId/waitlist` (body `{}` or none; any key is a 400) joins the waitlist of a full, open event as the signed-in attendee. Waiting entries are rows in `event_registrations` with status `Waitlisted`; a removed entry is `Removed`. Position is derived on read from `(joined_at, waitlist_seq)` and is returned only in the owner's own entry (`waitlistPosition`). A confirmed withdrawal promotes the first entry in the same transaction and writes one `WaitlistPromoted` notification. Registration closing (or a manual close) removes the waiting entries on the next read, on a join or withdrawal, or through `runRegistrationCloseJob`. The cancel releaser `releaseWaitlistForCancelledEvent` is not yet wired (SPM-136).

Existing databases apply `backend/migrations/011_spm138_waitlist.sql` once; fresh volumes get the same change from `database/postgresql/init/017_spm138_waitlist.sql`. The e2e suite is `test/registrations.waitlist.e2e-spec.ts` (needs `DATABASE_URL` with both applied). The fault-injection check is `node scripts/mutation/run.mjs --mutants spm138.mutants.mjs`.

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
