# Changelog

## 2026-09-12

- Added a starting login page (`/login`) with username/password fields, matching the existing design system.
- Added client-side route protection: unauthenticated visitors are redirected to `/login` and returned to their original destination after signing in.
- Added a "Log out" control to the top nav.
- Sign-in is currently a frontend-only mock (no backend/identity-provider integration yet); any non-empty credentials succeed.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.
