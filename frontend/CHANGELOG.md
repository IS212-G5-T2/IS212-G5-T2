# Changelog

## Unreleased

- Added the SPM-50 Venue Staff creation route and form, including required-field
  feedback, setup/turnaround duration validation, persistent catalogue refresh,
  successful-creation confirmation, and server-generated venue UUIDs with no
  identifier field exposed to staff. The form now separates venue details,
  including one location, from controlled facility/layout selections and supports one optional venue
  image using the event form's shared data-URL upload helper.

- Split the required SPM-50 operating-information textarea from the operating
  schedule controls: selected days plus start and end times.
- Added SPM-111 quantity upper-bound validation, equipment-inventory load
  failure messaging, combobox interaction coverage, and a browser create-to-inventory check.

- Hid the event status progression line (draft → submitted → approved → planning → confirmed → completed) from the attendee event view; it remains visible to organizers and coordinators.
- Redesigned the attendee registration card around five states: opens on [date] SGT, closes in N days, closes today, closed, and fully booked. Dates use one format (12 Mar 2027, 23:59 SGT); N is the SGT calendar-day difference; the Register button appears only while open. The SPM-99 opens/closes/spots rows and "Registration Open/Full" status line are replaced (SPM-61).

- Attendee Browse Events now filters by Upcoming events (default), Registered Events, Past Events and Cancelled (the last three are the attendee's own registrations). Cards keep the status badge and add a Registered badge; Approved events show as Confirmed to attendees (SPM-61).

- Added attendee registration UI (`components/EventDetail/`): details form, confirmation, and server-backed duplicate handling. The Register button is now rendered only while registration is open (closed, not-yet-open and full states show text), the closing instant is exclusive, and the local-only Withdraw button is hidden until a withdraw story ships (SPM-61).

- Corrected the frontend CI unit-test entrypoint to invoke the configured
  `test:cov` coverage script.

- Keep drafts and submitted events private to their verified Firebase owner. Clear cached events and remount account pages when the signed-in user changes.

- Keep submitted events visible in My Events when the local API organiser ID differs from the signed-in Firebase UID. My drafts shows only Draft records.

- The Web SDK retains opt-in Auth Emulator support, but the shared Compose
  stack does not start an emulator; it uses real non-production Firebase
  configuration and CI owns emulator execution.
- Read Firebase custom role claims after sign-in and added role and ownership
  route guards for direct event-management navigation.
- Added the frontend CI unit-test entrypoint and acceptance-path coverage for
  organiser sign-in and assigned coordinator change-request review.
- Added coverage thresholds for the SPM-30 login, Firebase-role mapping, and
  access-control guard paths. The suite must remain green and include all
  intended test-file extensions before those thresholds are treated as met.
- Restricted operational venue, booking, and equipment routes by role, and
  limited attendee registration mutations to the authenticated attendee.

## 2026-09-13

- Added a Vitest + React Testing Library unit-test setup (`vite.config.ts` `test` block, `src/test/setup.ts`) and `npm test` / `npm run test:watch` / `npm run test:coverage` scripts.
- Added unit tests for `LoginPage` (`src/pages/LoginPage.test.tsx`): field validation, successful sign-in for each seeded Firebase account, redirect-to-original-page behaviour, submit-button loading/disabled state, and every mapped Firebase Auth error message (wrong password, invalid credential, user not found, invalid email, disabled account, too many requests, network failure, unrecognized code, non-Firebase error).
- Added `src/test/fixtures/authUsers.ts` documenting the seeded Firebase Authentication test accounts, and `src/pages/testUtils.tsx` with a shared `renderLoginPage()` helper.
- Documented the test setup and seeded accounts in `README.md` and `HANDOVER.md`.
- Added the three-step event submission form, API-backed My Events/details, light-mode startup, and interaction tests.
- Removed the account sign-in label; account support remains a separate ticket.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.

## 2026-09-12

- Added a `/login` page connected to Firebase Authentication (Email/Password provider): email + password sign-in via the Firebase JS SDK, session persistence via `onAuthStateChanged`, route protection for all other pages, and a "Log out" control in the top nav.
- Added `.env.example` documenting the required `VITE_FIREBASE_*` config values and `src/lib/firebase.ts` for SDK initialization.
- Added `firebase` as a dependency.
