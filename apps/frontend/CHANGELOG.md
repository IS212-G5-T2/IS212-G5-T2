# Changelog

## Unreleased

- Added opt-in Firebase Auth Emulator support for local development. The shared
  Compose stack now supplies the emulator connection and a safe `demo-is212`
  project ID.

## 2026-09-13

- Added a Vitest + React Testing Library unit-test setup (`vite.config.ts` `test` block, `src/test/setup.ts`) and `npm test` / `npm run test:watch` / `npm run test:coverage` scripts.
- Added unit tests for `LoginPage` (`src/pages/LoginPage.test.tsx`): field validation, successful sign-in for each seeded Firebase account, redirect-to-original-page behaviour, submit-button loading/disabled state, and every mapped Firebase Auth error message (wrong password, invalid credential, user not found, invalid email, disabled account, too many requests, network failure, unrecognized code, non-Firebase error).
- Added `src/test/fixtures/authUsers.ts` documenting the seeded Firebase Authentication test accounts, and `src/pages/testUtils.tsx` with a shared `renderLoginPage()` helper.
- Documented the test setup and seeded accounts in `README.md` and `HANDOVER.md`.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.

## 2026-09-12

- Added a `/login` page connected to Firebase Authentication (Email/Password provider): email + password sign-in via the Firebase JS SDK, session persistence via `onAuthStateChanged`, route protection for all other pages, and a "Log out" control in the top nav.
- Added `.env.example` documenting the required `VITE_FIREBASE_*` config values and `src/lib/firebase.ts` for SDK initialization.
- Added `firebase` as a dependency.
