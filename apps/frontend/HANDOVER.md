# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- Add a real unit-test entrypoint if CI is expanded to run application tests.

## Authentication (Firebase)

- `/login` (`src/pages/LoginPage.tsx`) is backed by Firebase Authentication (Email/Password provider) via `src/lib/firebase.ts`, `login`/`logout`/`setAuthUser` actions in `useAppStore`, and `isAuthenticated`/`authLoading` driven by Firebase's `onAuthStateChanged` (subscribed once in `App.tsx`).
- All other routes are gated by `src/components/auth/RequireAuth.tsx`.
- Requires `apps/frontend/.env` with `VITE_FIREBASE_*` values — see `.env.example` and the Firebase Authentication section in `README.md`.
- Signed-in Firebase users are mapped to app role `attendee`; there is no role-selection UI or backend role lookup yet.