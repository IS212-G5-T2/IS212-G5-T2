# Frontend

This directory contains the React/Vite frontend for the workspace.

## Development

Start from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

Coding agents follow the [global policy](../AGENTS.md) and [frontend-specific rules](AGENTS.md).

Install dependencies:

```sh
npm ci
```

The app uses Tailwind CSS v4. Shared design tokens and the class-based dark-mode
variant are defined in `src/index.css` during the Tailwind build.

Run the development server:

```sh
npm run dev
```

The shared Docker Compose stack can also run the frontend from `docker-compose`:

```sh
cd ../docker-compose
docker compose up --build frontend
```

## Checks

Run the configured frontend checks from this directory:

```sh
npm run lint
npm run build
npm test
```

Venue Staff and Coordinators can open `/venue-records` to browse the shared image-led venue catalogue, then
select **My venues** to narrow it to records they own. They can search the selected
catalogue scope by name or location, sort by name/capacity/location/status,
and click any part of a card to open `/venue-records/:id` for
accessibility, setup and turnaround details plus availability, bookings and
tentative holds. Each card shows counts of bookings and active tentative holds.
The view uses the credentialed backend API configured by
`VITE_API_BASE_URL` (default `http://localhost:8080`). The backend database
must have the SPM-50 venue structure and SPM-124 `venue_bookings` table. This branch's
fresh local database initializer creates them and also seeds two sample venues
from `database/postgresql/init/008_spm124_sample_venues.sql`.
The Coordinator's existing venue-planning and booking view remains at `/venues`
and `/venues/:id`, including for accounts that also hold the Venue Staff role.

No deployment command is configured for this repository.

## Testing

Unit tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/react) and jsdom.
GitHub Actions is configured to run the suite with coverage through
`scripts/ci/unit-test.sh`. Component tests do not replace browser-level checks.

```sh
npm test              # run the suite once
npm run test:watch    # re-run on file changes while developing
npm run test:cov      # run once with a coverage report
```

Test files live alongside the code they cover (for example,
`src/features/account/pages/login/LoginPage.test.tsx` next to its page).
Feature-owned fixtures stay with their feature; `src/test/setup.ts` provides
global setup.

## Source layout

Feature-owned pages, components, tests, API clients, and feature types live in
`src/features/<feature>/`. The current feature groups are `account`, `events`,
`registrations`, `venues`, `bookings`, `equipment`, and `lead`. `src/app/`
owns the route tree; `src/components/` contains shared UI, layout, auth guards,
and application-wide notifications; `src/store/`, `src/types/`, `src/lib/`,
and `src/utils/` hold cross-feature code.
Singapore date parts and calendar-day conversion are shared in
`src/utils/sgtDate.ts`; event registration and registration reports retain their
own display wording. Authentication and API calls use the same API origin helper.
The role-specific notification panels use the shared polling and mark-as-read
hook in `src/components/notifications/`. Assignment and reassignment pages
share the coordinator picker in `src/features/lead/components/`.

Lead workflow pages and their colocated tests live in
`src/features/lead/pages/assignment-queue/` and
`src/features/lead/pages/reassignment/`. The shared Lead API and notifications
remain in the feature's `api/` and `components/` folders. Their public routes are
`/lead/queue` and `/lead/reassign`.
Attendee registration rules live in `src/features/events/lib/registration.ts`
because the event detail workflow owns its form and status controls;
`src/features/registrations/` owns the registration report and export workflow.
Approval and rejection component cases share
`src/features/events/pages/detail/EventDetailPage.decision.test.tsx`; their
store action cases share `src/store/useAppStore.decisions.test.ts`. Other event
detail suites stay separate by workflow.

The standard Vitest command loads `vitest.config.ts`, which selects both
`src/**/*.test.ts` and `src/**/*.test.tsx`. Playwright specs use their separate
browser runner.

## Authentication

`/login` calls the backend's `/api/auth/login`; session restoration and logout
use `/api/auth/me` and `/api/auth/logout`. Requests include the server-owned,
HTTP-only session cookie. The UI maps the backend's role list into navigation
and route guards, but the backend enforces authorization. Local-only seeded
accounts are documented in [database/README.md](../database/README.md#local-login-data).
Set `VITE_API_BASE_URL` to the backend origin when it is not
`http://localhost:8080`. Login tests mock HTTP calls, not an external identity
provider.

Coordinator assignment is managed through the Lead's assignment queue;
submitting an event leaves it unassigned until the Lead assigns it.

## Event request workflow

My drafts lists only unsubmitted drafts. Once submitted, requests appear under My Events. Create new events from the Create Event action on the planning or events page.

My Events uses the API response scoped to the verified local session account.
Drafts and submitted events are private to their owner; old shared demo records
are not automatically assigned to an account.

Open `/planning` or `/events` and choose Create Event. The light-mode three-step form collects basic information, schedule/venue needs, and equipment needs. Successful submission opens the saved details and shows a confirmation. My Events reloads records from PostgreSQL through the backend API. Dates use the browser's local time zone and are sent as UTC.

In the Compose stack, `VITE_API_BASE_URL` is set to `http://localhost:8080`.
The API helper falls back to `http://localhost:8080` only when that environment
variable is absent. The local session is required for both draft and event
APIs. Save Draft is implemented; email delivery remains deferred.

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` from this directory. SPM-36 page-level component tests live beside `EventCreatePage.tsx` and `EventListPage.tsx` under `src/features/events/pages/`. Tests use Vitest, jsdom, React Testing Library, and user-event; CI invokes `scripts/ci/unit-test.sh`. Component tests are not a substitute for visual browser verification.

## Creating venue records (SPM-50)

Venue Staff can open **Create Venue** from the navigation, enter the
required venue details, including one location, separate operating information
(for example, public-holiday closures) and operating days with a daily start/end
time, plus setup/turnaround
durations in whole minutes, then continue to a second page to select facilities and room layouts.
Accessibility remains a pill-style checkbox group on the first page. Staff may
also attach one optional image of at most 5 MB; the image reader is shared with
event creation/editing. The form rejects missing, negative, fractional, or
non-numeric durations before sending `POST /api/venues`. Venue identifiers are
not entered in the form; the backend returns a database-generated UUID.
The same venue name and location cannot be created twice, ignoring surrounding
spaces and letter case; the form displays the backend's field-level conflict.
Successful responses redirect Venue Staff to **Venue Records** and display a
confirmation there. The backend is authoritative for session and RBAC checks, so the route guard is only a UI
convenience. Component tests live beside the page in
`src/features/venues/pages/create/`.

Accounts with more than one server-granted role receive the combined navigation
for all their roles. Shared destinations appear once, following the primary
role's navigation label and order; role-specific entries such as **Create Venue**
remain available.

## Marking a venue unavailable (SPM-122)

Venue Staff can open a venue in **Venue Records**, choose **Mark unavailable**,
enter start/end date and time with a free-text reason, review, then confirm or
cancel. The existing venue detail shows unavailable periods and reasons; the
save result lists affected bookings. An active period can be ended early after
an explicit confirmation; the server's effective end time is shown afterward. Other
roles can read the venue but cannot use these controls. The backend enforces
authorization; frontend tests live beside the venue-record pages.
If a save fails, the form keeps its values, shows the server error, and lets
staff correct the fields and review again.
The end time must still be in the future; a period already in progress is
allowed while its end remains ahead.
Periods display as separate cards with Active now or Scheduled labels. The form
places date fields side by side on wider screens and stacks them on small screens;
review, success, and error messages appear in separate panels.
## Equipment records

Technical Support can create equipment records at `/equipment/create` and view
them at `/equipment/availability`. Quantity must be a whole number from 1
through `2,147,483,647`; the create form prevents values outside that database
range before it sends the request. The location combobox accepts either a
saved location or new free text.

## Rejecting requests (SPM-83)

Coordinators land on Pending Requests with the Submitted filter selected. Open an assigned request, choose **Review Event**, then select Reject. The decision requires a trimmed 10–500-character reason with at least three words and letters; invalid input blocks submission. The saved request displays Rejected and its recorded reason, leaves the Submitted pending view, and remains available through the Rejected filter.

Organisers receive persistent rejection notifications above their main content, with the reason in a separate block and a View request link. Notifications refresh on sign-in, focus and every 30 seconds; read state survives reload. Show all includes previously read notifications. Delivery is in-app, not email. Existing databases require backend migrations 003_event_rejection.sql and 004_allow_rejected_event_status.sql.

## Approving requests (SPM-40)

Coordinators open an assigned Submitted request, choose **Review Event**, select **Approve**, and submit the decision without a reason. A successful decision changes the request to Approved, so it leaves the default Submitted pending list and the review controls disappear. The backend accepts only `Submitted → Approved`; stale, repeated, or backward decisions are rejected.

Organisers receive a persistent approval confirmation in the shared **Request decisions** panel with a link back to the event. Approval and rejection notifications refresh and persist read state through the same API.

## Registration report

The authenticated report route `/events/:id/registrations/report` relies on
the backend's access check; a 403 displays an error rather than redirecting
the viewer. The People-card modal mounts only while open and shares the report
fetch/polling and CSV/PDF export hooks. Exports use the server's full report
and filename, even when the modal view is filtered. Polling stops when the
viewer leaves, changes events, or loses access. Release 1 has no waitlist.
