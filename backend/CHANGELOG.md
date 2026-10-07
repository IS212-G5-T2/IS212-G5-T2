# Backend changelog

## Unreleased

- SPM-47: the Event Coordinator Lead can reassign an assigned event.
  `GET /api/lead/assigned` lists active events with a coordinator (soonest first,
  with the coordinator's availability) and `POST /api/lead/events/:eventId/reassign`
  takes `{ coordinatorId, currentCoordinatorId }`; a stale page, a finished event,
  the same coordinator, or an unavailable or Lead-role coordinator is refused.
  Both coordinators are notified and the original's assignment notice is marked
  read. Marking yourself unavailable with active events now notifies the Lead.

- SPM-123: submitted requests are no longer auto-assigned (SPM-38's round-robin
  and `coordinator-roster.ts` removed). Added the Event Coordinator Lead's
  `GET /api/lead/queue`, `GET /api/lead/coordinators` and
  `POST /api/lead/queue/:eventId/assign` (Lead-only; availability re-checked at
  assignment; assignment notifies the coordinator). Removed the open
  `POST /api/events/:id/assign`. Coordinators can now read their
  `coordinator_assignment` notifications. The coordinator's row is share-locked
  while assigning, and an unassigned request that is no longer Submitted gets
  409 "This event request is no longer awaiting assignment." An account holding
  both COORDINATOR_LEAD and COORDINATOR is refused on the Lead endpoints (403)
  and is never listed or assignable as a coordinator.

- Added a re-runnable mutation check for the SPM-120 withdraw code (`scripts/testing/mutation`) and a recording-client unit spec, `registrations.withdraw.spec.ts`, proving a refused withdrawal issues no UPDATE: the integration suite cannot see that, because the transaction rolls a refusal back. Added integration cases for every non-attendee role, for Confirmed, Cancelled and Completed events, and for a registration with no stored details. Tests and tooling only; no behaviour change.

- Added attendee withdrawal: `POST /api/registrations/:registrationId/withdraw` (SPM-120). Ownership-scoped (another user's or a missing registration is 404 "Registration not found."), refused at or after the event start (422 `event_already_occurred`, "Event has already occurred"), and one compare-and-set `UPDATE` so repeated or concurrent requests give one 200 and the rest 422 `registration_already_withdrawn`. `withdrawn_at` comes from the injected clock and is stored as UTC. The 200 body is the registration plus `message`. `GET .../registrations/me` now returns the latest registration of any status (a withdrawn one is no longer `null`); registering again clears `withdrawn_at`.

- Added PostgreSQL integration coverage for coordinator availability (SPM-80):
  the saved value, untouched event assignments, 400/401/403 through the real
  session middleware. Tightened COOR-AVAIL-02-B so it fails if no query runs.

- Added `GET` and `PUT /api/coordinators/me/availability` (SPM-80): a
  coordinator reads or sets whether they can take new event assignments.
  Coordinator-only, always scoped to the session's own account, and accepts
  only `{ available: true | false }`. Saving never touches `events`, so current
  assignments are unchanged.

- SPM-50 venue creation now stores the authenticated Venue Staff UUID in
  `venues.owner_user_id`. Fresh schemas require the owner; migration 008
  preserves unattributed legacy rows and protects new writes with a foreign
  key and a future-row check.

- Added authenticated venue creation and catalogue APIs for SPM-50, including
  RBAC enforcement, field-level validation, atomic PostgreSQL persistence, and
  required non-negative setup/turnaround durations in whole minutes. Venue IDs
  are database-generated UUIDs rather than staff-entered values. Facilities
  and room layouts now resolve through lookup/junction tables, and one optional
  image of at most 5 MB is validated and stored with the venue transaction.
  Normalized venue name/location pairs are unique and duplicate attempts return
  a field-level conflict.

- Split SPM-50 operating information from the operating schedule in the venue
  creation contract and persistence model. Venue schedules require selected days
  and valid start/end times; migrations 006 and 007 preserve existing records.

- Attendees can now see only CONFIRMED events (not Approved). Approved is internal workflow state. Registration now compares directly against the confirmed status, and attendee visibility reflects this distinction.
- Added SPM-111 equipment API/database integration coverage and reject
  quantities above PostgreSQL's integer maximum before persistence.

- Attendees can now see only CONFIRMED events (not Approved). Approved is internal workflow state. Updated REGISTRABLE_STATUSES and ATTENDEE_VISIBLE_STATUSES to reflect this distinction.

- MSG-02 now formats the opening time as `12 Mar 2027, 23:59 SGT` (24-hour, SGT) to match the frontend (SPM-61).

- Attendees now see and can register for Approved events ("Approved" and "Confirmed" are the same published state), and the attendee event list includes `myRegistrationStatus` (SPM-61).

- Added attendee event registration: `POST /api/events/:eventId/registrations` and `GET /api/events/:eventId/registrations/me` with strict validation, window/duplicate/capacity rules under an event-row lock, an injectable clock, and a server-computed `registrationOpen` on event responses (SPM-61).

- Added assigned-coordinator approval of Submitted event requests, with a forward-only transactional status change and persistent organiser approval notification (SPM-40).
- Added coordinator rejection of Submitted requests with mandatory reasons, transactional organiser notifications, recipient-scoped notification retrieval/read state and a non-destructive schema migration (SPM-83).
- Connected event/draft HTTP routes to verified Firebase ownership; coordinator assignment preserves Submitted status and uses verified identity.

- Enforce Firebase UID ownership on draft and event APIs, including list, direct reads, saves and submission. Reject unauthenticated access and cross-user requests; remove the shared demo identity fallback.
- Added PostgreSQL-backed `/api/auth` login, session introspection, and logout
  endpoints with seeded development role accounts, bcrypt password verification,
  persisted opaque sessions, and HTTP-only cookies.
- Moved authentication environment parsing to `src/config/auth.config.ts` and
  standardized its variables as `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`, and
  `AUTH_SESSION_TTL_HOURS`.

- Added protected `GET /auth/me`, which returns the identity and roles from a
  verified Firebase ID token without exposing credentials or raw claims.
- Updated Firebase Auth Emulator E2E coverage to test the production auth
  endpoint and incorrect-password rejection.
- Added Firebase JWT authentication middleware and database-backed RBAC query helpers for single-request permission and ownership checks.
- Added local Firebase Auth Emulator initialization that uses the shared
  emulator project without requiring application-default or service-account credentials.
- Added validated PostgreSQL event submission and list/detail APIs with
  duplicate retry protection. These endpoints currently use a local demo
  identity and are not Firebase-protected.

- Added NestJS backend scaffold under `backend`.

- Added versioned PostgreSQL draft saving, retry-safe updates, retrieval, and atomic submission with draft locking (SPM-37). Added API/database regression coverage and a browser test cleanup harness. Real organisation authentication remains deferred.
- Draft fields now accept an optional `formStep` so the frontend can resume a draft on the wizard step it was saved on (SPM-37).

- Pinned TypeScript 6.0.3 for Nest CLI compiler API compatibility after checking the locked dependency set during SPM-37 merge resolution.
