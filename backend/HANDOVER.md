# Backend handover

## Current State

`backend` is a NestJS backend service generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`, and `/healthz` returns a simple health payload.

`AuthModule` provides PostgreSQL-backed session authentication middleware and database-backed RBAC helpers. Route-owning modules apply `AuthenticationMiddleware` to protected controllers; it validates the HTTP-only session cookie and attaches the authenticated user to `request.currentUser`.

`RbacRepository` reads the existing local database tables: `roles`, `resources`, and `role_permissions`. Its composable permission predicate is intended to be embedded in resource SQL alongside ownership conditions, so authorization and the data operation can execute in one database request. Runtime configuration requires `DATABASE_URL` plus optional `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`, and `AUTH_SESSION_TTL_HOURS` overrides.

Auth source is split by responsibility: `src/config/auth.config.ts` parses and
validates session environment settings; `src/auth/authentication` owns login,
logout, session lookup, and middleware; `src/auth/authorization` owns
RBAC/ownership services; and `src/auth/models` owns shared auth types.

Authentication uses `users`, `user_roles`, and `auth_sessions`, seeded together
in `database/postgresql/init/001_schema.sql` and seeded by `002_seed_data.sql`. Sessions are opaque
HTTP-only cookies whose SHA-256 digests are persisted. The frontend uses
`/api/auth/login`, `/api/auth/me`, and `/api/auth/logout`.

`DatabaseModule` centralizes PostgreSQL access. Services and repositories inject
`DatabaseService` instead of creating new pools so connection limits, timeouts,
and shutdown behavior stay consistent. Use `query()` for single statements and
`transaction()` for multi-step writes that need shared commit/rollback handling.
The generated starter endpoint currently returns `Hello World!`.
The events controller/service validates and persists submitted requests in
PostgreSQL. Drafts and events use Firebase UID ownership; submission retains the owner. Email delivery is deferred.

## Continuity Notes

Legacy demo-owned records are retained but cannot be safely attributed to a Firebase account. Do not expose or auto-claim them; migrate only after explicit confirmation of the actual owner. My drafts and My Events must remain scoped to the verified UID.

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `frontend/`.
- Reuse `FirebaseAuthenticationMiddleware` for token verification and
  `RbacRepository` for composable resource-query permission checks instead of
  duplicating RBAC SQL in controllers. Draft and event controllers apply this middleware and require the ORGANISER role.
- Use `DatabaseService` for PostgreSQL queries; do not instantiate `pg.Pool`
  inside feature services or repositories.
- Keep Firebase `roles` claim values aligned with the RBAC seed values: `ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, and `ATTENDEE`.
- Reuse `AuthenticationMiddleware` for session verification and `RbacRepository`
  for composable resource-query permission checks instead of
  duplicating RBAC SQL in controllers. The current event controller has not
  yet been wired to this middleware.
- Use `DatabaseService` for new PostgreSQL queries; do not instantiate
  `pg.Pool` inside feature repositories. Migrate the current event pool as part
  of hardening that endpoint.
- Keep account role values aligned with the RBAC seed values: `ORGANISER`,
  `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, and `ATTENDEE`.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- Review the npm audit output from adding Firebase Admin/PostgreSQL dependencies before release hardening.
- No deployment path is configured in this repository.

## Event persistence

`src/events` owns submission validation and the API. Local schema initialization
belongs to `database/`; production migrations remain outside this
ticket. The `DEMO_ORGANISER_ENABLED` switch must be replaced by authenticated
server identity integration before multi-user use. Never trust an organiser ID
or status supplied by the client. Keep the nested TypeScript 5 lock entry when
using local npm 11; Docker npm 10 requires it.

## Coordinator clarification/amendment requests (SPM-39)

`src/clarifications` implements the Coordinator-to-Organiser clarification
thread on an event request, using real Firebase-authenticated identity
(`FirebaseAuthenticationMiddleware` is applied to `ClarificationsController`
in `AppModule.configure()`), unlike `EventsController`. `001_schema.sql`
creates `events.coordinator_id`/`coordinator_name`, `event_comments` (the
clarification/reply thread), and the minimal `notifications` table. The base
local event initializer defines the final `status`
CHECK constraint as `Submitted`/`Approved`/`Rejected` — "Under Review" was
retired as a distinct status, since neither coordinator assignment nor a
clarification request is a meaningful "review started" signal on its own.

Known gaps to close before this is fully production-ready:

- **No endpoint sets `coordinator_id`.** Assigning a coordinator to an event
  is a separate, unticketed feature (today it's mock-only in the frontend
  Zustand store — see `frontend/src/store/useAppStore.ts`'s
  `assignCoordinator`). Until a real assignment endpoint exists,
  `coordinator_id` must be populated directly (e.g., seed data or a manual
  `UPDATE`) for the coordinator-side clarification flow to work against real
  data.
- **`EventsService.identity()` still returns a single hardcoded demo
  organiser** (`DEMO_ORGANISER_ENABLED`) for every caller regardless of the
  real authenticated Firebase user, and every event created today has
  `organiser_id = 'current-user'`. The clarification reply endpoint's
  ownership check (`events.organiser_id === currentUser.uid`) is real and
  correct, but it will only match a real Firebase-authenticated organiser
  once `EventsService` is migrated off that demo identity — see the
  "Event persistence" note above. Until then, only rows seeded/updated with a
  real uid as `organiser_id` can exercise the reply endpoint end-to-end.
- The `notifications` table is new and intentionally minimal (insert +
  per-recipient read), scoped to clarification/clarification-reply events
  only. It does not replace the frontend's broader mock notification system
  in `useAppStore.ts` (approvals, rejections, venue bookings, etc.), which
  remains client-only.
- RBAC's `002_seed_data.sql` seed grants `ORGANISER` only `read` on the "Event
  Review" resource (not `update`), so the Organiser-reply endpoint is
  authorized by a direct `organiser_id` ownership check rather than
  `RbacRepository`'s predicate builder. See the comment in
  `clarifications.service.ts`.

## Rejection integration (SPM-83)

The event, draft, clarification, and rejection routes are protected by Firebase middleware. `EventRejectionsController` adds rejection and rejection-notification endpoints. Only the verified Coordinator assigned to a Submitted request can reject it; only a verified Organiser can retrieve or mark their rejection notifications as read.

For an existing database, apply 003_event_rejection.sql then 004_allow_rejected_event_status.sql after the clarification schema. Fresh volumes receive the final constraints directly from 001_schema.sql. Status, a 10–500-character validated reason, and the recipient notification commit atomically under an event row lock. Notifications/read markers persist in PostgreSQL and are fetched by the organiser UI. Email is outside this contract.

SPM-38's verified Firebase ownership and round-robin coordinator assignment remain in force. Rejection notifications use the verified organiser UID; there is no demo-identity fallback.

## Event planning: view, update and flagged changes (SPM-97, SPM-49, SPM-85)

### Code map

| File | Owns |
| --- | --- |
| `src/events/event-update-input.ts` | Pure validation of a partial update (`validateEventUpdate`) and the per-field edit policy (`FIELD_POLICY`, `classifyUpdate`). |
| `src/events/event-impact.ts` | Pure impact assessment of a proposed change against each venue booking (`assessVenueBookings`, `TURNAROUND_MINUTES`). |
| `src/events/event-planning.service.ts` | Access rules, status gates, apply-vs-flag decision, confirm/reject logic, change history. |
| `src/events/event-planning.repository.ts` | All SQL for the above; `runInTransaction()` via `AsyncLocalStorage`. |
| `src/events/event-planning.controller.ts` | HTTP routes (below), protected by `AuthenticationMiddleware`. |

Tests: `event-update-input.spec.ts`, `event-impact.spec.ts` and `event-planning.service.spec.ts` (mocked repository) pin the business rules; `event-planning.e2e-spec.ts` runs the real repository and service against PostgreSQL when `TEST_DATABASE_URL` is set (`npm run test:e2e`).

### API

| Method and path | Who | Result |
| --- | --- | --- |
| `GET /api/events/:id/planning` | Owning organiser (read-only) or assigned coordinator | `{ event, venueBookings, equipmentArrangements, pendingChanges, readOnly, editableFields, lastUpdatedAt }` |
| `PATCH /api/events/:id/planning` | Assigned coordinator | Body: only the changed fields. Returns `{ event, applied, flagged, updatedAt }`. |
| `POST /api/events/:id/planning/changes/:changeId/resolve` | Assigned coordinator | Body: `{ decision: 'confirm' \| 'reject', bookingId? }`. Returns `{ event, change, closed }`. |
| `GET /api/events/:id/planning/history` | Owning organiser or assigned coordinator | Resolved changes, newest first. |

Error codes follow the existing events module: 401 unauthenticated; 403 wrong role (an organiser calling a write route, any attendee/staff role); 404 malformed id, unknown event, or an event the caller neither owns nor is assigned to (existence is never leaked); 409 wrong lifecycle status, an already-resolved change, or a second pending change to the same field; 400 validation with a per-field `errors` map.

### Rules and assumptions

These were agreed from the Jira stories and the RED test suites; items marked **confirm** are interpretations the team should verify.

1. **Planning phase.** `Approved` and `Planning` events can be viewed and edited; `Confirmed` events can be viewed but are read-only for everyone; any other status returns 409. The transition from `Approved` to `Planning` is owned by the venue-booking story; nothing in this module changes event status.
2. **Field policy.** `name`, `purpose`, `description` and `accessibility` always apply immediately. `startDateTime`, `endDateTime`, `expectedAttendance`, `layout`, `facilities` and `equipmentNeeds` apply immediately while nothing is booked and are flagged "Needs Review" once the event has an active venue booking **or** an active equipment arrangement. "Venue requirements" in the stories maps to `layout` + `facilities`. Accessibility is direct because SPM-85 AC1 does not list it. **Confirm.**
3. **Active bookings.** Venue bookings with status `Unavailable` or `Cancelled`, and equipment arrangements with `Unavailable`, `Cancelled` or `Released`, no longer hold anything, so they neither trigger review nor appear in impact assessments. An `Unavailable` venue booking instead surfaces as a `replacement_venue_required` pending item (SPM-97 AC3).
4. **Validation.** Same rules and limits as event creation. Unknown and server-controlled keys (`id`, `status`, `organiserId`, `coordinatorId`, `venueId`, timestamps, …) are rejected, not ignored. A new end time is checked against the stored start time (and vice versa). Values identical to the stored value are dropped rather than flagged.
5. **One pending change per field.** A field with a change awaiting review cannot be changed again until it is resolved (409). Enforced in the service and by a partial unique index.
6. **Impact assessment.** Each venue booking is assessed independently. A booking's required window follows the event's proposed date/time; a missing edge keeps the booking's current value. Conflicts: `overlap` with another event's booking at the same venue; `turnaround` when the gap is shorter than `TURNAROUND_MINUTES` (30; exactly 30 is fine; touching bookings conflict); `capacity` when attendance exceeds the venue capacity (equal is fine). Layout/facility changes add a `requirements` entry asking the coordinator to re-check the venue by hand, because venue layout/facility data is not stored yet. **Confirm the 30-minute buffer.**
7. **Date/time moves together.** When an update changes both start and end, each field is flagged separately but both are assessed as one move. Confirming one half alone is refused (400) if it would put the end at or before the start.
8. **Equipment.** Date/time and equipment-requirement changes list every active equipment arrangement under `equipmentImpacts` for the coordinator to re-check; availability is not computed here.
9. **Whole-change resolution.** Confirm applies the proposed value immediately and records `Applied`. Reject leaves the event unchanged, records `Rejected` and clears the stored impact assessment.
10. **Per-booking resolution (SPM-85 AC7). Confirm.** With `bookingId`, the decision is stored on that booking's impact entry only; other bookings' entries are untouched and the change stays "Needs Review". When the last impacted booking is decided the change closes: `Applied` (value applied) if every impacted booking was confirmed, otherwise `Rejected`. Rationale: an event field has one value, so it cannot be kept for one venue and dropped for another.
11. **History (SPM-85 AC5).** Each resolved change records original value, proposed value, the value the event ended with (`resolvedValue`), the coordinator's display name, timestamp and status.
12. **Privacy.** The organiser's view of a pending change omits `impacts`/`equipmentImpacts`, because those name other organisers' events. Venue booking neighbours are never returned by the view.
13. **Live updates (SPM-97 AC5).** The backend always reads live data; the frontend polls `GET …/planning` every 15 s. A push channel was out of scope.
14. **Atomicity.** `updateEvent` and `resolveChange` run in one transaction that locks the event row (`FOR UPDATE`), so "apply direct fields + flag the rest" and "apply value + record decision" never half-succeed. The service only wraps work when the repository exposes `runInTransaction`; the unit-test double does not, so those tests run unwrapped.

### Schema and placeholders

Tables come from `database/postgresql/init/007_spm49_spm85_spm97_event_planning.sql` (additive and idempotent; apply to an existing volume with `psql "$DATABASE_URL" -f …`). It also widens `events_status_check` to add `Planning` alongside dev's statuses.

`venue_bookings` and `equipment_reservations` are **minimal placeholders**: no venue-booking or equipment-reservation tables existed on any branch. `venue_id` is free text and the venue's name/capacity are copied onto the booking; equipment is identified by name. When the owning stories land, extend these tables (or point the repository's SQL at theirs) and add foreign keys to `venues`/`equipment` (the latter exists on `dev` from SPM-111). Only `event-planning.repository.ts` needs to change.

### Manual QA

With an `Approved` event assigned to a coordinator, add a booking so review mode turns on:

```sql
UPDATE events SET status = 'Planning' WHERE id = '<event-id>';
INSERT INTO venue_bookings (event_id, venue_id, venue_name, venue_capacity, start_date_time, end_date_time)
SELECT id, 'hall-a', 'Hall A', 100, start_date_time, end_date_time FROM events WHERE id = '<event-id>';
INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status)
VALUES ('<event-id>', 'Projector', 2, 'Reserved');
-- Simulate a lost venue (SPM-97 AC3):
UPDATE venue_bookings SET status = 'Unavailable' WHERE event_id = '<event-id>' AND venue_id = 'hall-a';
```

### Follow-ups

- Notify the organiser when a flagged change is resolved (not required by these stories).
- Replace polling with server push if the planning page becomes long-lived.
- Persist venue layouts/facilities so `requirements` entries can become automatic checks.
