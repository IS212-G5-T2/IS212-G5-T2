# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

My Events and My drafts rely on backend Firebase UID ownership. API requests carry the Firebase token, account changes remount page state and clear cached events. Legacy demo-owned rows require explicit ownership migration.

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- The repository test workflow discovers `scripts/ci/unit-test.sh`; this
  frontend entrypoint installs dependencies and runs `npm run test:coverage`.
  Keep the command and the CI workflow aligned.

## Testing

- Test runner: Vitest. `vite.config.ts` defines the jsdom environment and
  global setup at `src/test/setup.ts`; `vitest.config.ts` currently narrows
  standard discovery to `.test.tsx` files.
- `src/pages/LoginPage.test.tsx` covers `/login`: empty/whitespace-only field validation, successful sign-in for every seeded account in `src/test/fixtures/authUsers.ts`, redirect-back-to-original-page behaviour, the pending/disabled submit state, and every mapped Firebase error code in `getAuthErrorMessage` (wrong password, invalid credential, user not found, invalid email, disabled account, too many requests, network failure, unrecognized code, and non-Firebase errors).
- The Firebase Auth SDK (`signInWithEmailAndPassword`/`signOut` from `firebase/auth`) is mocked in that test file so the suite never makes a real network call; `@/lib/firebase`'s `getAuthErrorMessage` mapping runs unmocked so the tests catch regressions in the actual message copy.
- `src/pages/testUtils.tsx` provides a `renderLoginPage()` helper that wraps `LoginPage` in a `MemoryRouter` with dummy `/` and `/events` destinations, so redirects after sign-in can be asserted against rendered screens instead of router internals.

## Authentication (Firebase)

- `/login` (`src/pages/LoginPage.tsx`) is backed by Firebase Authentication (Email/Password provider) via `src/lib/firebase.ts`, `login`/`logout`/`setAuthUser` actions in `useAppStore`, and `isAuthenticated`/`authLoading` driven by Firebase's `onAuthStateChanged` (subscribed once in `App.tsx`).
- All other routes are gated by `src/components/auth/RequireAuth.tsx`.
- Requires `apps/frontend/.env` with `VITE_FIREBASE_*` values — see `.env.example` and the Firebase Authentication section in `README.md`.
- Signed-in Firebase users are mapped from their Firebase custom `roles` claim
  to supported application roles. The merged mock-profile switcher in `TopNav`
  is not compatible with real Firebase authorization and must not be treated as
  an authorization mechanism.
- `scripts/ci/unit-test.sh` installs dependencies and runs the Vitest component interaction tests.

## Event requests

The create/list/detail pages call the real local API and forward the current
Firebase ID token as a Bearer credential; other existing store actions remain
prototype behavior. Draft and event APIs verify that token and enforce ownership
using its Firebase UID. The app starts in light mode. Save Draft is implemented;
email delivery remains deferred.
The API maps stored Submitted status to the existing lowercase frontend status
type.
