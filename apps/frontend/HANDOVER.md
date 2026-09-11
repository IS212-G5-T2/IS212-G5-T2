# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- Add a real unit-test entrypoint if CI is expanded to run application tests.
- `npm run lint` currently fails with "ESLint couldn't find a configuration file" — there is no `.eslintrc*` in this directory yet even though `eslint` is a dependency. This is pre-existing and not caused by the login page work; a future task should add an ESLint config.

## Authentication (starting state)

- `/login` is a real route (`src/pages/LoginPage.tsx`) with username/password fields, backed by `login`/`logout` actions and an `isAuthenticated` flag in `useAppStore`.
- All routes except `/login` are gated by `src/components/auth/RequireAuth.tsx`, which redirects unauthenticated visitors to `/login` and returns them to their original destination afterwards.
- `login()` is currently a **mock**: any non-empty username/password succeeds and signs the user in with role `attendee` (matching the `feature/spm-30-attendee-login` branch scope). There is no backend/identity-provider call yet — see the C4 diagram in the root `README.md`, which already models an external identity provider the frontend is expected to authenticate against.
- No role selection exists at login; every mock sign-in becomes an `attendee`. Signing in as another role still relies on the pre-existing placeholder user until real role-aware authentication is implemented.
- Next steps for a real implementation: wire `login()` to the actual identity provider/backend auth endpoint, handle real error responses (vs. the current generic failure message), decide how role is derived from the authenticated identity, and add persistence (e.g. session/token storage) so refreshing the page doesn't sign the user out.
