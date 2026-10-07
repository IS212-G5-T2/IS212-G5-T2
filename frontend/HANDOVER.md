# Frontend handover

## Current state

This directory is the front-facing application. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

My Events and My drafts rely on backend Firebase UID ownership. API requests carry the Firebase token, account changes remount page state and clear cached events. Legacy demo-owned rows require explicit ownership migration.

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- The repository test workflow discovers `scripts/ci/unit-test.sh`; this
  frontend entrypoint installs dependencies and runs `npm run test:cov`.
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
- Requires `frontend/.env` with `VITE_FIREBASE_*` values — see `.env.example` and the Firebase Authentication section in `README.md`.
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

## Event planning (SPM-97, SPM-49, SPM-85)

- `EventDetailPage` fetches `GET /events/:id/planning` only for `approved`,
  `planning` and `confirmed` events, and only for the owning organiser or the
  assigned coordinator. It re-fetches every `PLANNING_REFRESH_MS` (15 s, in
  `src/utils/planning.ts`), skipping refreshes while the tab is hidden, and
  merges the returned event into the store so the details card stays current.
- Role checks on this page use `hasRole(currentUser, …)`, not
  `currentUser.role`: accounts can hold several roles (e.g. organiser +
  coordinator) and `role` is only the primary display role. The backend
  authorises on every role, so the UI must too. `isOwner` (draft
  edit/submit), the support-staff gate and the attendee section still use the
  primary role; they are outside SPM-49 and should be reviewed separately.
- `PlanningInformationPanel` is the read-only region named "Planning
  information". It renders no controls of any kind (SPM-97 AC4); organisers
  get nothing else.
- Assigned coordinators additionally get `PlanningUpdateForm` and
  `FlaggedChangeReview`. The form is **not** remounted on `lastUpdatedAt`.
  It always shows the authoritative event: after a save it resets to the
  event the server returned (for a flagged-only save that is the unchanged
  event), and when the parent passes a newer event it takes the new values for
  untouched fields while keeping edits in progress. Pending proposals are
  passed in as `pendingChanges`, shown under their field, and the field is
  disabled until resolved (the server refuses a second change to it anyway).
- Field badges follow the server's `editableFields` modes: "Applies
  immediately" (`direct`), "Review if it affects bookings" (`conditional`,
  with the rule from `describeCondition` and, once edited, a prediction from
  `satisfiesCondition`) and "Needs review" (`needs_review`). The prediction
  mirrors the backend's compatibility rules (`backend/HANDOVER.md` rules 6, 8
  and 15); the server's response is authoritative.
- The form uses `noValidate` and its own required-field checks so error copy is
  consistent ("Event name is required."); the backend repeats every check.
- Layout, facility and accessibility option lists in `src/utils/planning.ts`
  mirror `backend/src/events/event-input.ts`; keep them in sync.
- Business rules and assumptions (impact-based field policy, per-booking
  resolution, turnaround buffer) are documented in `backend/HANDOVER.md`.
- Tests (case IDs and last run in
  `docs/test-cases/SPM-49_SPM-85_SPM-97_Test-Cases.md`):
  `pages/EventDetailPage.planning.test.tsx` (organiser and coordinator flows,
  multi-role accounts, authoritative values after a save, lifecycle, polling,
  hidden tab, failures), `components/domain/PlanningUpdateForm.test.tsx`,
  `FlaggedChangeReview.test.tsx`, `PlanningInformationPanel.test.tsx` and
  `utils/planning.test.ts`. There is no Playwright test of the planning workflow yet.
