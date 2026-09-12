# Changelog

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.

## 2026-09-12

- Added a `/login` page connected to Firebase Authentication (Email/Password provider): email + password sign-in via the Firebase JS SDK, session persistence via `onAuthStateChanged`, route protection for all other pages, and a "Log out" control in the top nav.
- Added `.env.example` documenting the required `VITE_FIREBASE_*` config values and `src/lib/firebase.ts` for SDK initialization.
- Added `firebase` as a dependency.