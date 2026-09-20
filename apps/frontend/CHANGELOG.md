# Changelog

## Unreleased

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
