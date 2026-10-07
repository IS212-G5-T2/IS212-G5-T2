# Backend changelog

## Unreleased

- Event planning (SPM-97/49/85) now reads SPM-124's `venue_bookings` table
  instead of its own placeholder, which had the same name and broke database
  initialisation once both were merged. Venue name and capacity come from
  `venues`; statuses are mapped as described in `HANDOVER.md`.
- SPM-124 venue reads now use setup and turnaround buffers when determining
  whether an approved booking currently makes a venue unavailable. Removed the
  duplicate venue authentication-middleware registration.
- SPM-47: the Event Coordinator Lead can reassign an assigned event.
  `GET /api/lead/assigned` lists active events with a coordinator (soonest first,
  with the coordinator's availability) and `POST /api/lead/events/:eventId/reassign`
  takes `{ coordinatorId, currentCoordinatorId }`; a stale page, a finished event,
  the same coordinator, or an unavailable or Lead-role coordinator is refused.
  Both coordinators are notified and the original's assignment notice is marked
  read. Marking yourself unavailable with active events now notifies the Lead.

- Changed the SPM-49/SPM-85 update rule from "any booking exists" to impact-based: each date/time, attendance, layout, facilities or equipment change is checked against every active venue booking and equipment arrangement and applied immediately when it stays compatible with all of them (e.g. attendance within capacity, a time inside the booked window, removing facilities, equipment changes with only a venue booked). Only incompatible changes are flagged "Needs Review", and only the affected arrangements are marked impacted. Leaving a booking's held window is reported as a new `window` conflict. A field awaiting review now also refuses compatible changes until resolved. `GET …/planning` reports each field as `direct`, `conditional` (with its condition) or `needs_review`. Rules and assumptions to confirm are in HANDOVER.md (rules 2, 5, 6, 8, 15, 16).
- Added event planning APIs under `/api/events/:id/planning` (SPM-97, SPM-49, SPM-85): the owning organiser reads planning information (venue bookings, equipment, pending changes) read-only; the assigned coordinator updates event information, with fields that affect existing bookings flagged "Needs Review"; flagged changes carry a per-venue-booking impact assessment (overlap, setup/turnaround, capacity) and are confirmed or rejected as a whole or per booking, with a change history. Updates and resolutions are transactional. Assumptions are in HANDOVER.md.

- Fixed impact assessment (SPM-85): a change that does not move the booking in time (attendance, layout, facilities) is no longer reported as an overlap or turnaround conflict because of a gap that already existed. Start and end changes are assessed as before.
- Expanded planning test coverage (SPM-97, SPM-49, SPM-85): `Confirmed` read-only view, inactive bookings, organiser privacy, unchanged values, date halves, per-booking closing rule, history access, transactions, manual requirements checks, and PostgreSQL tests for concurrency, date-move ordering and history access. Documented the test cases in `docs/test-cases/`. No production behaviour changed.

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
- The registration report exports now include every registration detail: a Special Requirements column in the CSV and PDF, between Contact Number and Registration Date (empty when the attendee gave none; CSV-quoted and formula-neutralised like every other cell). The PDF is now A4 landscape so six columns fit. This reverses the earlier decision to leave special requirements out of the files. Removed the unused `sgtCalendarDate` helper (and its tests and the M9 mutant) now that the filename carries no date.

- Removed the `DEMO_ORGANISER_ENABLED` switch and the shared demo identity. The clarification routes (SPM-39) now answer 401 without a session instead of substituting a fake "Demo User" with both roles, and the ownership checks for asking, replying, resolving and reading a thread are strict: the owning organiser (`organiser_id`) or the assigned coordinator (`coordinator_id`) only. `listComments` no longer skips authorization when no user is passed. The flag was also removed from `docker-compose/.env.example`, two test leftovers and the docs. Unchanged on purpose: a coordinator may still reply to or resolve a clarification on an event that has no coordinator assigned yet.

- Changed the registration report (SPM-63): each row now carries `specialRequirements` when the attendee gave any (omitted when empty), so the coordinator's "Indicated special requirements" filter can match. Exports are now named `<event name>_registrations.<csv|pdf>` (replacing `<event id>_registrations_<SGT date>.<ext>`): characters unsafe in a filename (`\ / : * ? " < >` `|` and control characters) become spaces, an empty result becomes `event`, and `Content-Disposition` carries an ASCII `filename` fallback plus the exact UTF-8 name in `filename*`. The CSV and PDF columns are unchanged.

- Added the registration report for organisers and coordinators (SPM-63): `GET /api/events/:eventId/registrations/report` and `GET /api/events/:eventId/registrations/report/export?format=csv|pdf`. One access rule guards all three: the coordinator assigned to the event (`events.coordinator_id`) or the organiser who owns it (`events.organiser_id`), identity from the session only; 401, then 404 "Event not found.", then 403 "You do not have access to this event's registrations." (denials are logged with user id, event id and reason, never attendee data). The report lists Registered (shown as "Confirmed") registrations by registration date then id, with `totalConfirmed`, `availableSpots` and `generatedAt` from the injected clock, as an allowlist; responses are `Cache-Control: no-store`. The CSV is UTF-8 with BOM, RFC 4180, CRLF, and neutralises leading `= + - @ tab CR` at export time only; the PDF (new dependency `pdfkit`, bundled Noto Sans font in `assets/fonts`, copied by the Dockerfile) embeds the font and shows "No registrations to display" when empty. Files are named `<event id>_registrations_<SGT date>.<ext>`. CORS now exposes `Content-Disposition`. Added dev dependency `pdf-parse` for tests, `spm63.mutants.mjs` for the mutation check, and `**/*.fixtures.ts` is excluded from the build.

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
