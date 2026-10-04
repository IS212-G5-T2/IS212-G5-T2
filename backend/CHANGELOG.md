# Backend changelog

## Unreleased

- Added authenticated venue creation and catalogue APIs for SPM-50, including
  RBAC enforcement, field-level validation, atomic PostgreSQL persistence, and
  required non-negative setup/turnaround durations in whole minutes. Venue IDs
  are database-generated UUIDs rather than staff-entered values. Facilities
  and room layouts now resolve through lookup/junction tables, and one optional
  image of at most 5 MB is validated and stored with the venue transaction.
  Normalized venue name/location pairs are unique and duplicate attempts return
  a field-level conflict.

- Attendees can now see only CONFIRMED events (not Approved). Approved is internal workflow state. Registration now compares directly against the confirmed status, and attendee visibility reflects this distinction.

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
