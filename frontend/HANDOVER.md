# Frontend handover

## Current state

This directory is the front-facing application. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

SPM-124 gives Venue Staff the persisted `/venue-records` card catalogue and
`/venue-records/:id` detail, with API loading, name/location search, four sortable
fields, venue images, unavailable-period reasons, and upcoming bookings/active holds.
The catalogue defaults to all readable venues and provides an optional My venues filter.
Coordinators, including dual-role users, retain the prior in-memory planning view on
`/venues` and `/venues/:id`. The
new read view depends on SPM-50 venue tables plus backend migration 009, which
stores both event bookings and staff blockouts in `venue_bookings`. The
fresh-volume initializer in this branch creates both and seeds two sample
venues; the
existing browser-only booking actions do not populate the new booking table.

Equipment Availability distinguishes a successful empty inventory from a
failed fetch. `EquipmentCreatePage.playwright.spec.ts` covers the browser
create-to-inventory flow; the backend browser harness removes its uniquely
named equipment fixture afterward.

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

## Venue records (SPM-50)

`src/pages/venues/VenueCreatePage/` owns the Venue Staff creation form and its
component tests. The page sends a validated venue payload through the shared
store, shows backend field/form errors, and redirects successful creation to
the venue catalogue with a confirmation message.
Setup and turnaround are required, non-negative whole-minute durations.
Operating information is a required multiline field distinct from the required
operating schedule: selected days plus a start and end time. Retain all four
values in the API payload.
The form does not request an identifier; the saved response supplies the UUID
generated by PostgreSQL.
The form is a two-page flow: venue details (including one scalar location) and the existing accessibility
checkboxes come first; controlled facilities, room layouts, and an optional
image of at most 5 MB come second. Venue and event image inputs share
`src/utils/uploads.ts`; venue options live in `src/utils/venueOptions.ts` and
must stay aligned with the backend/database lookup seeds.
Duplicate name/location pairs are enforced by PostgreSQL and returned as
field-level errors; the form already routes those errors back to Venue details.
The backend remains the authorization and persistence authority.

## SPM-63 registration report

`RegistrationReportPage` (route `/events/:id/registrations/report`, inside the authenticated shell but deliberately without a role guard) shows the report to whoever the server allows; a 403 shows MSG-08 and no data, so an attendee is never redirected to the attendee view. `useRegistrationReport` owns the 5 s polling (replace, never append; stop on unmount, event change, 401, 403; keep rows through a transient failure; no overlapping requests). The export buttons call `downloadReportExport` (a credentialed `fetch`, not `api()`, because the body is a file) and save the Blob under the `Content-Disposition` filename, which needs the backend's CORS `exposedHeaders`. The report is reached from the People card on the event detail page (the former "View Registrations" link on `EventListPage` was removed); `canViewRegistrationReport` only decides whether to offer it, and the server enforces access. Wording and date formats in `utils/registrationReport.ts` mirror `backend/src/registrations/report-format.ts` and differ from the SPM-61/62 formatter on purpose (no comma after the year). Mutation check: `node scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs`.

### Registrations modal (People card)

`RegistrationsModal` opens from a "View registrations" button in the People card of `EventDetailPage` (shown by `canViewRegistrationReport`; the server still enforces access). It is mounted only while open, so `useRegistrationReport` fetches and polls only then. It reuses the report endpoints and `useReportExport`, so CSV/PDF are the server's full report under the server's filename (not narrowed by the modal's search/filter). The "Indicated special requirements" filter matches rows whose `specialRequirements` is present; the backend report includes it only when the attendee gave one. The backend runs from a compiled Docker image (no file watching), so after a backend change run `docker compose up -d --build backend` in `docker-compose/`. A waitlist filter is not built: Release 1 has a hard capacity limit (the modal states "No waitlist"). "Registered today" compares Singapore calendar days. Icons are inline SVG (Tabler is not installed).
