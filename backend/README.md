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

SPM-128 provisions the `SAFETY_OFFICER` role and local account through migration `028_spm128_safety_officer_role.sql`; SPM-129 uses that role for the authenticated `GET /api/safety-officer/queue`, `GET /api/safety-officer/queue/:eventId`, and `POST /api/safety-officer/queue/:eventId/decision` routes. The queue contains Planning events with a pending safety check and arrangements that pass the shared planning checklist. Event detail includes venue capacity and known restrictions, event requirements, and reserved equipment. Decisions are `approved`, `rejected`, or `changes_needed`; rejection requires `reason: string`. Request changes accepts explicit `changes: string[]`, storing each nonblank entry as a separate coordinator-resolvable feedback item; legacy `reason: string` remains accepted as one item and is never split on newlines. Missing or blank feedback is refused before any decision is written. A coordinator resolves each feedback item through the existing checklist; the safety check cannot be re-requested until all items are resolved. Fresh databases receive the role/account from `database/postgresql/init/002_seed_data.sql`.

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

The event request form reads supported facility and accessibility labels/values from `GET /api/venues/options`. Event creation validates both selections against the same venue schemas used by venue creation and comparison. Room layouts follow the venue schema too (`LAYOUTS` in `src/events/dto/event-input.ts` is `roomLayoutNames`), so every layout the Create Event form offers is accepted. The same lists validate `PATCH /planning` and change requests, and every event form loads its choices from `GET /api/venues/options` (SPM-156). `backend/migrations/027_spm156_retire_legacy_event_options.sql` rewrites stored event, change-request and draft lists to the current values (`Wheelchair ramps` and `Step-free access` become `Wheelchair access`, `PA System` becomes `AV System`, other retired values are removed), using the `accessibility_features` and `facilities` reference tables as the current lists. Side effects: the SPM-135 safety trigger resets the safety check of every event the migration rewrites, so those checks must be requested again; flagged changes still awaiting review are not rewritten (confirming one that proposes a retired value writes it back). Migrations 026 and 027 each run as one transaction; `docker-compose/README.md` has the read-only queries that list the events 027 will rewrite and the pending flagged changes it leaves.

Routes (all behind `AuthenticationMiddleware`; the service checks role, ownership/assignment and event status):

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/events/:id/planning` | Owning organiser (read-only), assigned coordinator | Event information, venue bookings, equipment, pending changes, and for the coordinator each field's edit mode (`direct`, `conditional` with its condition, or `needs_review`) |
| `PATCH /api/events/:id/planning` | Assigned coordinator | Update fields. A change that stays compatible with every existing venue booking and equipment arrangement applies immediately; only an incompatible change is flagged "Needs Review", listing just the arrangements it affects |
| `POST /api/events/:id/planning/changes/:changeId/resolve` | Assigned coordinator | `{ decision: 'confirm' \| 'reject', bookingId? }` |
| `GET /api/events/:id/planning/history` | Owning organiser, assigned coordinator | Change history, newest first: changes applied immediately (`kind: 'direct_update'`) and changes applied by approving a change request (`kind: 'change_request'`), both always `Applied` (SPM-156), and flagged changes once confirmed or rejected (`kind: 'booking_conflict'`); each entry carries `proposedBy` (the organiser for a change request) and `resolvedBy` |

Every change applied without review is written to `event_flagged_changes` through `EventPlanningRepository.recordAppliedChanges`, in the same transaction as the event update, so history and `lastUpdatedAt` agree (SPM-156; needs `backend/migrations/026_spm156_direct_update_history.sql`): an Applied `direct_update` row for each field the coordinator applies immediately, and an Applied `change_request` row for each field whose value changes when the coordinator approves an SPM-65 change request (that approval is also kept in `event_change_request_audit`). A denied request records nothing. The rules behind this are documented in the header comments of `src/events/planning/event-planning.service.ts` and `event-planning.repository.ts`; test cases are indexed in `../docs/test-cases/SPM-49_SPM-85_SPM-97_Test-Cases.md`.

SPM-181: when a saved change moves the start or end of the event (a direct edit, a flagged change the coordinator confirms, or an approved change request), every `Registered` or `Waitlisted` attendee gets one unread `EventRescheduled` notification in the same transaction: `"<event name>" has been rescheduled. It now runs <start> to <end> (SGT).`, stamped with the time the change was applied. Withdrawn, Removed and Cancelled entries get none, and neither does a flagged or rejected change, a name change or any other field. The one writer is `src/events/planning/event-reschedule-notice.ts`; attendees read and mark it read through `GET /api/notifications` and `POST /api/notifications/:id/read`.

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

`POST /api/events/:id/status-change` with `{ "targetStatus": "Cancelled", "confirmed": true }` cancels an event. Only the assigned coordinator may cancel a Submitted, Approved, Planning or Confirmed event; the submitting organiser is refused. `confirmed` must be the boolean `true` (anything else: 400 `CANCEL_NOT_CONFIRMED`). Other refusals: 403 `FORBIDDEN` for anyone else, 409 `EVENT_NOT_CANCELLABLE` for any other status, and 409 `EVENT_CANCELLED` for every arrangement change on a cancelled event (`src/events/cancelled-guard.ts`). Reversing a cancellation is refused (422). Identity comes from the session only.

The cancellation runs in one transaction: lock and re-check the event, compare-and-set `Cancelled` (stamped with the injected clock), write `event_status_history`, write one `EventCancelled` notification per recipient (organiser, assigned coordinator, Registered attendees), then run every releaser in `src/events/cancel/release.registry.ts`. Releasers live with their tables: venue bookings and holds (`src/venues/release`), equipment reservations (`src/equipment/release`) and registrations (`src/registrations/release`). Withdrawn registrations are never touched and there is no waiting-list promotion.

Schema: `backend/migrations/011_spm136_cancel_event.sql` (the same file is `database/postgresql/init/017_spm136_cancel_event.sql` for fresh volumes). It is idempotent and adds `events.cancelled_by`/`cancelled_at`, the `released` venue booking status, `released_at` columns, `event_registrations.cancellation_reason`, and the once-only `EventCancelled` index. Notifications are readable by organisers and coordinators, and attendees read their own `WaitlistPromoted`, `EventCancelled` and `EventRescheduled` notices (SPM-181), through `GET /api/notifications`.

```sh
npx vitest run src/events/cancel src/events/cancelled-guard.spec.ts
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-cancel.e2e-spec.ts test/events-cancelled-guard.e2e-spec.ts
node scripts/mutation/run.mjs --mutants spm136.mutants.mjs   # scratch copy only; needs DATABASE_URL
```


## Request cancellation of my event (SPM-155)

The submitting Organiser asks the assigned Coordinator to cancel their event; the request never changes the event.

| Route | Who | Behaviour |
|---|---|---|
| `POST /api/events/:id/cancellation-requests` | The submitting Organiser | Body `{ "reason"?: string }` (strict: any other key is 400 `INVALID_REQUEST`). The reason is trimmed, 0 to 500 code points (spaces only is stored as null; more than 500 is 422 `INVALID_REASON`; not text is 400). 201 `{ request, message }` with the MSG-CR-01 text. 403 `FORBIDDEN` for anyone else, 409 `EVENT_NOT_CANCELLABLE` unless the event is Submitted, Approved, Planning or Confirmed (SPM-136's set; a Draft owned by the caller is also 409), 409 `CANCELLATION_REQUEST_PENDING` while one is pending (the event row lock and the unique index on `pending_key` settle simultaneous requests to one). |
| `GET /api/events/:id/cancellation-requests` | The owner or the assigned Coordinator | Newest first, `Cache-Control: no-store`. Each request has the stored `status` (`pending`, `accepted`, `declined`) and a derived `displayStatus` (a pending request on a Completed or Cancelled event is `closed` with `closedNote`; nothing is written). 403 for anyone else. |
| `GET /api/cancellation-requests` | Organiser or Coordinator | The caller's latest request on each of their events (the event-list indicator), `no-store`. |
| `POST /api/cancellation-requests/:id/decision` | The Coordinator assigned now | Body `{ "decision": "accept" \| "decline" }` (400 `INVALID_DECISION`). Order: 403 (an unknown or malformed request id gets the same 403 as another user's request, so ids cannot be probed), 400, 409 `CANCELLATION_REQUEST_DECIDED`, 409 `EVENT_NOT_CANCELLABLE`, then a compare-and-set on `status = 'pending'`. Accept runs the request update and `CancelEventService.cancelInTransaction` (all SPM-136 effects and notifications) in one transaction, so a failure rolls both back; decline changes only the request. A decline writes no history, arrangement or hold change and no notice to anyone except the Organiser's SPM-162 outcome notice; on accept the Organiser gets that outcome notice instead of EventCancelled. |

Schema: `backend/migrations/028_spm155_cancellation_requests.sql` (the same file is `database/postgresql/init/028_spm155_cancellation_requests.sql` for fresh volumes); idempotent. Tests: `npx vitest run src/events/cancellation-requests src/events/cancel`; `DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/cancellation-requests.e2e-spec.ts`; fault injection `node scripts/mutation/run.mjs --mutants spm155.mutants.mjs`.

SPM-162: either decision also writes one notification for the event's Organiser in the same transaction (`cancellation_request_accepted`: `Your cancellation request for "<event name>" was accepted. The event is cancelled.`; `cancellation_request_declined`: `... was declined. The event keeps its current status.`), stamped with the decision time and linked to the event. On accept the Organiser does not also get `EventCancelled` (the attendees and the Coordinator do); a direct Coordinator cancellation is unchanged. Only an Organiser's `GET /api/notifications` and `POST /api/notifications/:id/read` handle the two types. No schema change.

## Coordinator queue (SPM-48)

`GET /api/coordinator/queue[?status=planning,submitted]` returns the signed-in coordinator's queue: every event assigned to them (the same records as `GET /api/events` for a coordinator, `coordinator_id` = session uid), each with a `queue` object. Unassigned requests stay in the Lead's queue (SPM-123), drafts live in `event_drafts` and never appear, and an event reassigned away leaves the queue (SPM-47 AC6). Coordinator role only: no session 401, any other role 403 "Coordinator access required.". `status` is optional: one status or a comma-separated list of the seven terms, any case; an unknown value (including `Under Review` and `draft`) is 400 "Unknown status filter: <value>.". Served with `Cache-Control: no-store` (AC4).

`queue` is `{ safety, holds[], unavailableVenues[], actions[], needsAction }`, derived by the pure rules in `src/events/queue/queue-indicators.ts` with the injected clock:

| Field | Rule |
|---|---|
| `safety` | `AWAITING_CHECK`, `CHANGES_REQUESTED`, `CLEARED` as SPM-94 (`deriveSafetyIndicator`); `REJECTED` for a rejected arrangement (AC7); `RESET` when the check was reset (for example by an approved change, SPM-65 AC8) and not requested again (AC6). None on Completed, Cancelled or Rejected events. |
| `holds` | Each pending booking with `hold_expires_at`: `{ venueName, expiresAt, state }` (`venueName` is the venue's name, plus its location in brackets when another of the event's venues has the same name), `ACTIVE` until the expiry instant and `EXPIRED` from it on (AC8). |
| `unavailableVenues` | Venues of active bookings (approved, or pending with no hold or a live hold) that a Venue Staff unavailable period overlaps, counting the venue's setup time before and turnaround time after the booking (SPM-122 AC7, SPM-54 AC2). The rule is `src/events/venue-unavailable.ts`, shared with the venue summary and Confirm readiness, so all three agree (AC9). The flag clears when the affected booking is cancelled or the period is ended early; booking a replacement alone does not clear it. Listed once per venue (by id), named like `holds`. |
| `actions` | Why the event needs the coordinator (AC5): `AWAITING_REVIEW` (Submitted), `SAFETY_CHANGES_REQUESTED`, `SAFETY_REJECTED`, `SAFETY_RESET`, `VENUE_UNAVAILABLE`, `HOLD_EXPIRED`. `needsAction` is true when there is at least one. |

Schema: `backend/migrations/023_spm48_safety_rejected.sql` (mirrored as `database/postgresql/init/023_spm48_safety_rejected.sql`) adds `rejected` to `event_safety_checks.status`; it is idempotent. SPM-130 will write rejections; the coordinator re-requests a rejected check through `POST /api/events/:id/safety-check/request`.

```sh
npx vitest run src/events/queue
DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/coordinator-queue.e2e-spec.ts
```

### Real-database (e2e) suites

The `test/*.e2e-spec.ts` suites run against a real PostgreSQL database and are skipped when `DATABASE_URL` is not set. Many of them replay migrations from `migrations/` in `beforeAll`, so they run DDL against whatever database `DATABASE_URL` points at. Use a dedicated, disposable test database rather than your working `spm` database:

```sh
# Create a test database and build it like a fresh volume (the files in database/postgresql/init, in order).
psql postgresql://spm:<password>@localhost:5432/postgres -c 'CREATE DATABASE spm_test'
for f in ../database/postgresql/init/*.sql; do psql postgresql://spm:<password>@localhost:5432/spm_test -q -v ON_ERROR_STOP=1 -f "$f"; done

DATABASE_URL=postgresql://spm:<password>@localhost:5432/spm_test npm run test:e2e -- test/venues.e2e-spec.ts
```

A database built from `database/postgresql/init` alone lacks some tables (for example `event_drafts`, created by `migrations/001_event_drafts.sql`), so also apply `migrations/*.sql` before running the suites.

Use `localhost:5432` normally. If you also have PostgreSQL installed on your machine, it can take over `localhost:5432` from the Docker `spm-local` container (you'll see `role "spm" does not exist`); in that case, use your machine's LAN IP (`ipconfig getifaddr en0` on macOS) or stop the local PostgreSQL. The venue migrations 009 and 011 are order-safe (SPM-170): replaying them never narrows the `venue_bookings_status_check` or `venue_bookings_kind_check` that migration 019 widened, so the venue suites also run on a database that already holds `released` or `cancelled` bookings. A new migration that rewrites a constraint a later migration widens should follow the same pattern.

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
locations for the create form. Create and update accept `activeQuantity`,
`underMaintenanceQuantity`, and `retiredQuantity` as non-negative whole numbers.
Their sum must be from 1 through `2,147,483,647` (the PostgreSQL `integer`
maximum) and is returned as `quantity`. Responses include the three source
counts. Legacy payloads containing `quantity` and `maintenanceStatus` remain
accepted only when none of the status-count fields are supplied, and are
normalized into the matching single status bucket. Requests mixing the legacy
fields with any status-count field are rejected as ambiguous.

Technical Support can update name, type, location, and all three status counts
through `PUT /api/equipment/:id`. The inventory row and its audit snapshot,
including the status counts, commit in one transaction; unchanged submissions
return `No changes were made.` and do not add an audit entry. A single
`maintenanceStatus` is returned only when all units occupy one status; mixed
records return it as `null`. The SPM-119 `isAvailable` value remains the manual
availability flag, so consumers that show whether any stock is usable should
combine it with `activeQuantity > 0`.
Existing databases must apply `migrations/011_equipment_record_updates.sql`;
fresh local databases include the final audit constraint and Equipment update
permission in the initializer. Existing databases must also apply
`migrations/015_spm113_equipment_status_quantities.sql` to add and backfill the
three status quantities on equipment and audit snapshots. The migration keeps
old quantities and history in the former status bucket and can be safely rerun.

Run the SPM-118 equipment update fault-injection checks from this directory
with `node scripts/mutation/run.mjs --mutants spm118.mutants.mjs`.

Availability is separate from maintenance status. Marking equipment
unavailable and writing its audit entry happen in one transaction; a failed
audit insert rolls the availability change back. `GET /api/equipment` excludes
unavailable records unless `includeUnavailable=true` is requested.

### Event-window equipment availability (SPM-113)

`GET /api/equipment/availability?startDateTime=<ISO>&endDateTime=<ISO>` is a
Technical Support-only availability checker; it is intentionally separate from
the inventory route above. The period must be at least one minute and end after
its start. It accepts an optional exact `equipmentType` catalogue value. Results
include Active, Under Maintenance, Retired, Reserved and Available quantities,
plus a reason and the latest overlapping reservation end when applicable.
Only `Reserved` equipment-request lines consume Active stock. Reservations use
half-open interval overlap (`eventStart < requestedEnd` and
`eventEnd > requestedStart`), so an exact boundary touch leaves stock available.
Apply `migrations/016_spm113_availability_lookup.sql` to existing databases
after migration 015 for the supporting lookup index.
Apply `migrations/017_spm113_unique_equipment_names.sql` next: an equipment
name identifies one inventory record because reservations are requested by
name. The migration deliberately stops if legacy duplicate names need a human
data decision.

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

Technical Support approves the stock commitment with
`PATCH /api/equipment/requests/:requestId/reserve`. This atomically changes a
Pending Review request and all of its linked placeholder reservations to
`Reserved`, making it visible to the SPM-113 availability checker.

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

### Venue unavailability impact, history and notifications (SPM-125)

Schema: `backend/migrations/030_spm125_venue_unavailability_history.sql` (the same file is
`database/postgresql/init/030_spm125_venue_unavailability_history.sql` for fresh volumes; idempotent; apply after
SPM-137's 029). It adds the append-only `venue_unavailability_history` table (backfilling a `created` entry, with no
person, for every existing period). The notices link to their booking through SPM-137's
`notifications.related_booking_id`.

- Saving a period writes the period and its `created` history entry, with the Venue Staff member, in one statement;
  ending one early writes the shorter period and its `ended_early` entry (new end, `previousEnd`, person) in one
  statement. Nothing updates or deletes history rows.
- In the same transaction as the save, the Event Coordinator of each affected booking listed by SPM-122 AC7
  (confirmed bookings and active approved holds; pending requests are not listed) gets one
  `venue_unavailable_impact` notice naming the event, venue, period and reason. Each `affectedBookings` item carries
  `coordinatorNotified: true` when its Coordinator was notified; an event with no Coordinator is skipped.
- `PATCH /api/venues/:id` (SPM-121) does the same for its AC8 list (`venue_timing_impact`) and AC9 list
  (`venue_capacity_impact`, with the old and new capacity), for bookings that have not ended; `affectedBookings` and
  `capacityBookings` items carry `coordinatorNotified: true` likewise. The AC9 list includes every pending or
  approved row, but only rows that still hold the venue (the AC8 rule: not an expired tentative hold, and a pending
  row only when it is an active hold or a booking request) are notified.
- When the Lead reassigns an event (SPM-47), the previous Coordinator's unread venue-change notices for that event
  are marked read with their other notices for it (as SPM-137 does for booking decisions), so none is left whose
  View Booking link opens a booking that is no longer theirs.
- `GET /api/notifications` returns these notices to Coordinators with `relatedBookingId`. The Venue Staff member who
  made the change gets no notice (they already see the result, marked `coordinatorNotified`), and Venue Staff still
  have no notification feed (403).
- `GET /api/venues/:id/unavailability-history` (newest first: `action`, `start`, `end`, `previousEnd`, `reason`,
  `changedBy`, `changedAt`) and `GET /api/venues/:id/booking-history` (every booking and hold of the venue, any status
  and time, latest slot first, with `affectedByUnavailablePeriod`) are for Venue Staff only (401 without a session,
  403 for other roles, 404 for an unknown venue).
- The notice wording and the one place that writes these notices is `src/venues/notifications/venue-impact-notifications.ts`.
  Integration tests: `test/venue-impact.e2e-spec.ts` (11 tests; needs `DATABASE_URL` with init 001 to 030; it
  re-applies 019, 029 and 030 itself). Without `DATABASE_URL` the suite is skipped locally with a notice, and in CI a
  missing database fails the run. To run it against a disposable database (see `database/README.md`):

  ```sh
  docker build -t spm-postgresql database/postgresql
  docker run --rm -d --name spm125-test -e POSTGRES_USER=spm -e POSTGRES_PASSWORD=spm_dev_password \
    -e POSTGRES_DB=spm -p 55432:5432 spm-postgresql   # a fresh container runs every init file
  cd backend && DATABASE_URL=postgresql://spm:spm_dev_password@localhost:55432/spm \
    npm run test:e2e -- test/venue-impact.e2e-spec.ts   # expect 11 passed, 0 skipped
  docker rm -f spm125-test
  ```

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

### Booking decision notification (SPM-137)

When Venue Staff approve (`POST /api/venues/bookings/:id/approve`) or reject (`.../reject`) a venue booking request, the
event's Coordinator gets one in-app notification in the top-bar bell. `src/venues/review/booking-decision-notice.ts`
(`notifyBookingDecision`) is the one place that writes it, and `VenuesRepository.approveVenueBooking` /
`rejectVenueBooking` call it inside the decision's own transaction, after the status update and the audit row, so a
decision and its notification are saved together or not at all (a refused, conflicting or lost-race decision writes
nothing, and a failing notification rolls the decision back).

- Types: `venue_booking_approved` and `venue_booking_rejected`. Only a Coordinator's `GET /api/notifications` returns
  them and only a Coordinator can mark them read (`POST /api/notifications/:id/read`); the Organiser's list does not
  include them.
- Recipient: `events.coordinator_id` as read in the decision transaction (the Coordinator assigned at decision time). A
  Coordinator the event was reassigned away from gets nothing for a later decision, and their unread decision notices
  for that event are marked read when the Lead reassigns it (`LeadAssignmentService.reassign` adds the two types to the
  same update that clears the SPM-47 assignment notices; their notices for other events are untouched, SC-SPM137-04).
  The new Coordinator gets nothing for earlier decisions. An event with no Coordinator writes no notification and the decision stands.
- Not notified here: tentative hold requests (`request_kind = 'tentative_hold'`) get the SPM-165 notification below instead; neither goes to the Organiser or by email.
- Message (`venueBookingDecisionMessage` in `src/registrations/helpers/messages.ts`): `Your booking of <venue name> for
  "<event name>" has been approved.` or `... has been rejected.` The booking reference and rejection reason are not in
  it; `created_at` is the decision time from the injected `CLOCK`.
- Link: the notification row carries `related_event_id` and the new nullable `related_booking_id`, and the feed returns it
  as `relatedBookingId` (null for every other type). Existing databases apply
  `backend/migrations/029_spm137_booking_decision_notification.sql` once (idempotent; the same file is
  `database/postgresql/init/029_spm137_booking_decision_notification.sql` for fresh volumes). Deleting a booking removes
  its notification.
- Tests: `src/venues/repository/venues.repository.spec.ts`, `src/venues/venues.service.spec.ts` and
  `src/events/venue-booking-notifications.spec.ts` (`VENUE-BOOK-NOTIF-*`), and `test/venue-booking-decision-notifications.e2e-spec.ts`
  (needs `DATABASE_URL`; it applies the venue migrations and 029 itself, signs in through the real login route and holds the
  venue row lock from a second connection for the race case). Fault-injection check:
  `node scripts/mutation/run.mjs --mutants spm137.mutants.mjs` (scratch copy; needs `DATABASE_URL`).

### Tentative hold decision notification (SPM-165)

Deciding a tentative hold request (`request_kind = 'tentative_hold'`) uses the same flow as SPM-137: the same
`notifyBookingDecision` call inside the decision transaction, the same recipient rule (the Coordinator assigned at
decision time, read in the transaction), the same `related_event_id` and `related_booking_id` link, and no new
migration (`notifications.type` has no constraint). Only the request kind changes the result:

- Types: `tentative_hold_approved` and `tentative_hold_rejected` (Coordinator feed and mark-read allow-list only). A
  booking request still writes `venue_booking_approved` / `venue_booking_rejected`; a hold never does.
- Message (`tentativeHoldDecisionMessage` in `src/registrations/helpers/messages.ts`): `Your tentative hold of <venue
  name> for "<event name>" has been approved.` or `... has been rejected.` The hold expiry and rejection reason are on
  the hold the notification links to, not in the text.
- Reassignment: the Lead's reassignment also marks the previous Coordinator's unread hold notices for that event read.
- Tests: the `VENUE-HOLD-NOTIF-*` cases in `src/venues/repository/venues.repository.spec.ts`,
  `src/events/tentative-hold-notifications.spec.ts`, `src/lead/lead-assignment.service.spec.ts` and
  `test/tentative-hold-decision-notifications.e2e-spec.ts` (needs `DATABASE_URL`). Fault-injection check:
  `node scripts/mutation/run.mjs --mutants spm165.mutants.mjs`.

### Tentative hold requests (SPM-159)

The same `POST /api/venues/:id/booking-requests` endpoint accepts the optional
`request_kind: "tentative_hold"` discriminator. The event's scheduled start
and end and the venue's current setup and turnaround buffers are read by the
server; clients do not supply or override them. Submission creates a Pending
`venue_bookings` row and does not activate a hold. Venue Staff approval changes
the row to `approved` and sets `hold_expires_at` to 14 days (336 hours) after
approval. Ordinary booking conflict checks count an approved, unexpired
tentative hold; pending, rejected, cancelled, and expired tentative holds do
not block. Pending ordinary booking requests keep the existing SPM-54 conflict
behavior. An approved ordinary booking continues to block without a hold
expiry. `GET /api/venues/bookings/pending` returns `requestKind`,
`holdExpiresAt`, and `holdExpired` for staff review; `holdExpired` is computed
against the service clock at read time. Tentative holds must be presented as
temporary holds, not confirmed bookings. Expired approved holds do not block a
same-event/venue retry.
`GET /api/venues/bookings/mine` also returns `requestKind`, `holdExpiresAt`,
and `holdExpired` for Coordinator cards so a Pending request is distinguished
from an Active approved hold and an expired approved hold after a fresh list
fetch. `holdExpired` is computed against the service clock when the list is
read.

### Venue Staff hold decisions and expiry processing (SPM-132)

Venue Staff can reject a Pending tentative hold with a trimmed 1–1,000
character reason, convert an approved unexpired hold to a confirmed booking,
or release that hold. Conversion and release lock the owned venue and hold;
the persisted state is rechecked at decision time. The expiry processor marks
each approved tentative hold expired once when `hold_expires_at <= now`; calendar and
conflict reads continue to derive whether the hold is active from that expiry.
The Nest scheduler interval is configurable through
`TENTATIVE_HOLD_EXPIRY_INTERVAL_MS` (default 60000 ms). The product
specification does not define an acceptable maximum processing lag, so the
default is an implementation setting, not a product SLA.

Existing databases apply `backend/migrations/032_spm132_tentative_hold_expiry_processing.sql`
after the current venue migrations. Fresh databases apply the matching
`database/postgresql/init/032_spm132_tentative_hold_expiry_processing.sql`.
The expiry marker is nullable, processed rows carry stored status `expired`, and the migration is safe to rerun. The SPM-132
integration cases are in `test/venues-booking-requests.e2e-spec.ts` and require
`DATABASE_URL`; scheduler unit cases are in
`src/venues/tentative-hold-expiry.scheduler.spec.ts`.

Approval rechecks eligibility and conflicts: the 336-hour lead time is
evaluated again on every hold approval (not only after a venue setup change)
and a refusal returns `409 BOOKING_SLOT_CONFLICT` with the booking still
Pending. Outside the venues module, an approved hold is never a confirmed
booking: `src/events/venue-unavailable.ts` holds the one rule (`approvedHoldState`
and the `*ApprovedHoldSql` fragments). While the expiry is in the future the
hold reads "Hold" and from the expiry instant "Hold expired" (venue summary
`(hold)` / `(hold expired)`, planning status `Hold` / `Hold expired`, event
record `venueHoldState`); neither satisfies the Confirm readiness "Venue
booking approval" item, and an expired hold no longer occupies the venue, counts
as a clashing neighbour, or flags the queue venue-unavailable indicator. The
scheduler persists the terminal `expired` status; expiry notifications belong
to a related story. `test/events-approved-hold.e2e-spec.ts` proves this against PostgreSQL
(`DATABASE_URL` with `database/postgresql/init` 001 to 024).

Migration `024_spm159_tentative_hold_requests.sql` adds `request_kind` and
`reassessment_required` to `venue_bookings`, the request-kind constraint and
pending-hold index, and event-time/setup-change triggers. Existing databases
must apply the migration in sequence; fresh databases receive the mirrored
`database/postgresql/init/024_spm159_tentative_hold_requests.sql`.

Migration `025_spm159_approved_hold_expiry.sql` requires every approved
tentative hold to have `hold_expires_at`; pending holds and ordinary approved
bookings may still have NULL. It checks for existing invalid approved holds
and fails with their count rather than inventing historical expiry times. An
operator must review and resolve those rows explicitly before retrying. Fresh
databases receive the mirrored
`database/postgresql/init/025_spm159_approved_hold_expiry.sql`.

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

## Registration settings (SPM-139)

`GET /api/events/:id/registration-settings` and `PUT /api/events/:id/registration-settings` let only the assigned Event Coordinator read and change an event's registration enabled flag, opening and closing times, and capacity (`src/registrations/settings/`). A PUT is partial: an omitted field keeps its saved value, and an explicit `null` is refused. It must send the `version` the form loaded; a stale version is `409 SETTINGS_CONFLICT`. Times are ISO 8601 with an offset or `Z`. The save runs in one transaction under the event row lock: the waiting list is settled on the old window, the new settings are validated and written, the list is settled on the new window (a shortened closing time or a disable removes it), and capacity that rose promotes the earliest waiting entries (`fillFreeSpots`). Cancelled, rejected and completed events return `409 EVENT_NOT_CONFIGURABLE`. A disabled registration answers attendee registrations with `422 REGISTRATION_DISABLED`.

The migration adds `events.registration_settings_version`: `backend/migrations/024_spm139_registration_settings.sql` for existing databases, `database/postgresql/init/024_spm139_registration_settings.sql` for fresh volumes. Tests: `test/registration-settings.e2e-spec.ts` (needs `DATABASE_URL` with init 001 to 024) and the pure rules in `registration-settings.validation.spec.ts`.

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

## Event audit history (SPM-157)

`GET /api/events/:eventId/history` returns one event's history, oldest first, in up to four sections:
`event` (submission, status changes with approval or rejection and its reason and confirmation, completion and
cancellation worded as such, coordinator assignment and reassignment, clarification requests, replies and resolution,
information updates and flagged change decisions, change requests and outcomes, cancellation requests and decisions,
safety check requests, outcomes and resets, the coordinator's response to each safety feedback item, and the
completion record), `venueBookings` (booking and tentative hold requests, approvals, rejections, cancellations,
releases, returns for review, removals, conversions and expiries, and venue changes that affect the booking, from the
SPM-125 notice), `equipment` (requests with their items, item edits, Reserved, Cannot Provide with the reason, returns
for review, releases) and `registrations` (registration settings, registrations, waiting list joins, promotions,
withdrawals, removals, cancellations). Each entry has
`summary`, optional `subject` (venue, items or attendee), `changes` (`field`, `label`, `from`, `to`; instants as ISO
UTC), optional `reason`, `actor` (`kind` `user`, `system` or `unrecorded` with `name`, "System" or "Not recorded")
and `occurredAt`.

| Caller | Result |
|---|---|
| The Coordinator assigned now | 200, all four sections, `viewer: "coordinator"` (includes entries from before a reassignment) |
| The owning Organiser | 200, `event` and `registrations` only, `viewer: "organiser"` |
| Anyone else, including a previous Coordinator | 403 `FORBIDDEN` |
| Unknown or malformed event id | 404; no session 401 |
| `PUT`, `PATCH`, `DELETE` on `/history` or `/history/:entryId` | 405 with `Allow: GET` |

Recording: `backend/migrations/034_spm157_event_audit_log.sql` (the same file is
`database/postgresql/init/034_spm157_event_audit_log.sql` for fresh volumes; idempotent) adds the append-only
`event_audit_log` table and triggers on `events`, `venue_bookings`, `equipment_requests`, `equipment_reservations`,
`event_registrations`, `event_safety_checks`, `event_safety_resets`, `event_comments`, `safety_check_feedback_items`,
`completion_records` and `notifications` (the three SPM-125 venue-change notice types only), so every code path (and other triggers) is
recorded without calling a helper. The author is the signed-in user: `AuthenticationMiddleware` runs the request
inside `runAsActor` (`src/common/actor-context.ts`) and `DatabaseService` sets the transaction-local
`app.actor_id` after `BEGIN`; a single write made with `query()` for a signed-in user runs in its own transaction for
this. A change made by another trigger (`pg_trigger_depth() > 1`), outside a signed-in request, or by a waiting list
rule (promotion, removal) or a safety check reset is the system's. Flagged changes, change requests and their
outcomes, and cancellation requests are read live from their own tables (`src/events/history/event-history.repository.ts`);
an approved tentative hold whose expiry has passed (SPM-159 `approvedHoldState`, injected `CLOCK`) is shown as
expired by the system. The table has no foreign key to `events` (a foreign key would make each recorded change
lock the event row against other requests' `SELECT ... FOR UPDATE`); `events_audit_cleanup` removes an event's
entries when the event is deleted, and `UPDATE` or any other `DELETE` raises `event_audit_log is append-only`. At
release the migration loads earlier records once (submissions, status history, reassignments, the current safety
check and feedback responses, clarifications, the completion record, booking requests, review decisions and
releases, venue-change notices, equipment requests and releases, registrations); entries
whose author was not recorded have `actor_kind` `unrecorded`.

Tests: `npx vitest run src/events/history src/common/actor-context.spec.ts src/database src/auth/authentication`;
`DATABASE_URL=... npm run test:e2e -- test/event-history.e2e-spec.ts` (needs init 001 to 033; applies 034 itself).
