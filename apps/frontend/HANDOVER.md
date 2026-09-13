# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- A real unit-test entrypoint now exists (`npm test`, via Vitest + React Testing Library — see the Testing section in `README.md`). If CI is expanded to run application tests, wire `npm test` (and optionally `npm run test:coverage`) into the pipeline; nothing currently runs it automatically.

## Testing

- Test runner: Vitest (`vite.config.ts` has a `test` block: jsdom environment, global setup at `src/test/setup.ts` which loads `@testing-library/jest-dom`).
- `src/pages/__tests__/LoginPage.test.tsx` covers `/login`: empty/whitespace-only field validation, successful sign-in for every seeded account in `src/test/fixtures/authUsers.ts`, redirect-back-to-original-page behaviour, the pending/disabled submit state, and every mapped Firebase error code in `getAuthErrorMessage` (wrong password, invalid credential, user not found, invalid email, disabled account, too many requests, network failure, unrecognized code, and non-Firebase errors).
- The Firebase Auth SDK (`signInWithEmailAndPassword`/`signOut` from `firebase/auth`) is mocked in that test file so the suite never makes a real network call; `@/lib/firebase`'s `getAuthErrorMessage` mapping runs unmocked so the tests catch regressions in the actual message copy.
- `src/pages/__tests__/testUtils.tsx` provides a `renderLoginPage()` helper that wraps `LoginPage` in a `MemoryRouter` with dummy `/` and `/events` destinations, so redirects after sign-in can be asserted against rendered screens instead of router internals.

## Authentication (Firebase)

- `/login` (`src/pages/LoginPage.tsx`) is backed by Firebase Authentication (Email/Password provider) via `src/lib/firebase.ts`, `login`/`logout`/`setAuthUser` actions in `useAppStore`, and `isAuthenticated`/`authLoading` driven by Firebase's `onAuthStateChanged` (subscribed once in `App.tsx`).
- All other routes are gated by `src/components/auth/RequireAuth.tsx`.
- Requires `apps/frontend/.env` with `VITE_FIREBASE_*` values — see `.env.example` and the Firebase Authentication section in `README.md`.
- Signed-in Firebase users are mapped to app role `attendee`; there is no role-selection UI or backend role lookup yet.