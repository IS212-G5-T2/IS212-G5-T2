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
Coordinators can check an event date and time from the venue detail. Calendar
view uses a navigable Singapore-time week/day grid with hourly rows, time-sized
booking, hold, unavailable, free, setup-buffer, and turnaround-buffer entries;
List view shows the same schedule records as date-grouped cards. Free periods
are based on bookings, active holds, unavailable periods, and setup/turnaround
buffers; no venue operating-hours schedule is used.
Coordinators can switch between the calendar and list schedule views, review booking/hold/blockout conflicts,
review capacity, facility, accessibility and layout suitability, add optional special requests, and submit a booking request only when suitability and the requested range are clear. My Bookings shows API-backed requests, supports cancelling one request with an explicit last-active-booking confirmation, and links affected/cancelled bookings to venue search for a replacement. The check
includes the venue's configured setup and turnaround buffers; active holds show
their expiry time and expired holds are omitted by the API. Submission posts to
`POST /api/venues/:id/booking-requests`, which rechecks the live schedule and
returns a booking reference only after the pending request is persisted.
In My Bookings, Pending tentative holds are identified as not active, while
approved holds show Active or expired state with the exact expiry returned by
`GET /api/venues/bookings/mine`.
When Search Venues is opened from an event, the catalogue includes a **Back to event** link.
The view uses the credentialed backend API configured by
`VITE_API_BASE_URL` (default `http://localhost:8080`). The backend database
must have the SPM-50 venue structure and SPM-124 `venue_bookings` table. This branch's
fresh local database initializer creates them and also seeds two sample venues
from `database/postgresql/init/008_spm124_sample_venues.sql`.
The Coordinator's existing venue-planning and booking view remains at `/venues`
and `/venues/:id`, including for accounts that also hold the Venue Staff role.

## Equipment requests (SPM-57)

Coordinators use `/equipment/requests` to review submitted equipment requests.
The prominent **Create Equipment Request** action opens `/equipment/requests/create`,
where they can choose an assigned Approved, Planning, or Confirmed event and
submit one or more items. The create form displays the event name, date, time,
and expected attendance; item rows include required nonblank equipment name,
type, and positive whole-number quantity. Equipment names are trimmed before
submission. An event can have only one equipment request; after submission,
changes must use the existing request. A successful submission returns to My
Equipment Requests with an accessible confirmation dialog showing the request
reference and Pending Review status; the dialog remains open until **OK** is
clicked.
Beside a Pending Review request, **Update Event** opens a separate, prefilled
`/equipment/requests/:requestId/update` page. Saving replaces the request items
in place and preserves its ID and reference. An update confirmation dialog
shows that same reference and closes only when **OK** is clicked. Updates are unavailable after the
event is Confirmed. Technical Support uses `/equipment/requests` for the Pending
Review queue. The pages use the credentialed API client for
`POST /api/equipment/requests`, `PUT /api/equipment/requests/:requestId`,
`GET /api/equipment/requests`, `GET /api/equipment/requests/eligible-events`,
and `GET /api/equipment/requests/review-queue`.

No deployment command is configured for this repository.

The event request form loads facility and accessibility labels and submitted
values from `GET /api/venues/options`. The form shows loading, empty, and
retryable error states and blocks progression while the options request is
unresolved or has failed. Event submission values are validated against the
same backend venue schemas.

## Testing

Unit tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/react) and jsdom.
GitHub Actions is configured to run the suite with coverage through
`scripts/ci/unit-test.sh`. Component tests do not replace browser-level checks.

```sh
npm test              # run the suite once
npm run test:watch    # re-run on file changes while developing
npm run test:cov      # run once with a coverage report
npm run test:tz       # run the date-sensitive tests under TZ=UTC, Asia/Singapore and America/Los_Angeles
```

`npm run test:tz` (`scripts/testing/tz-matrix.mjs`) runs the tests that assert SGT or calendar-date text in each of
three host time zones and exits non-zero if any zone fails. The SGT formatter pins `Asia/Singapore`, so the output
must not depend on the host zone. Run it after changing a date helper or a date assertion. To run one zone by hand,
set the variable yourself, for example `TZ=America/Los_Angeles npx vitest run src/features/events/lib/registration.test.ts`.

Test files live alongside the code they cover (for example,
`src/features/account/pages/login/LoginPage.test.tsx` next to its page).
Feature-owned fixtures stay with their feature; `src/test/setup.ts` provides
global setup.

### SPM-51 venue mutation checks

Frontend mutation IDs use the `FE-Bxx` namespace, separate from backend
`Bxx` IDs. Each mutant in `scripts/testing/mutation/spm51.mutants.mjs` maps to
one or more exact frontend test titles in its `kills` metadata; the test
comments point back to those mutant IDs. The runner verifies those test titles
exist and prints the mappings with each result.

Run the full frontend SPM-51 mutation set from this directory:

```sh
node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs
node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs --list
node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs --only FE-B06,FE-B07
```

Record the date, branch and commit, exact command, complete runner summary,
per-mutant outcomes, and skipped or failed suites in the SPM-51 evidence record.
Only `killed` is evidence that a mutant was caught. `SURVIVED`, `MISAPPLIED`,
`SKIPPED`, and `ERROR` are distinct outcomes; skipped suites exit 3 and failed
mutation processes exit 4, so neither can be reported as a successful run.

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
required venue details, including one location, operating information (for
example, public-holiday closures), and setup/turnaround durations in whole
minutes, then continue to a second page to select facilities and room layouts.
`operatingInformation` is the venue's only operating data. Operating days and
opening/closing times are not stored, and no compatibility schedule is created.
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
them at `/equipment/availability`. Each inventory row has an Edit action for
changing its name, type, location, quantity available, and maintenance status
at `/equipment/:id/edit`; saving confirms the change and records it in the
shared equipment audit trail. Quantity must be a whole number from 1
through `2,147,483,647`; the create form prevents values outside that database
range before it sends the request. The location combobox accepts either a
saved location or new free text.

The equipment update API and editor checks live beside their feature code.
Run their fault-injection checks from this directory with
`node scripts/testing/mutation/run.mjs --mutants spm118.mutants.mjs`.

## Rejecting requests (SPM-83)

Coordinators land on Pending Requests with the Submitted filter selected. Open an assigned request, choose **Review Event**, then select Reject. The decision requires a trimmed 10–500-character reason with at least three words and letters; invalid input blocks submission. The saved request displays Rejected and its recorded reason, leaves the Submitted pending view, and remains available through the Rejected filter.

Organisers receive persistent rejection notifications above their main content, with the reason in a separate block and a View request link. Notifications refresh on sign-in, focus and every 30 seconds; read state survives reload. Show all includes previously read notifications. Delivery is in-app, not email. Existing databases require backend migrations 003_event_rejection.sql and 004_allow_rejected_event_status.sql.

## Approving requests (SPM-40)

Coordinators open an assigned Submitted request, choose **Review Event**, select **Approve**, and submit the decision without a reason. A successful decision changes the request to Approved, so it leaves the default Submitted pending list and the review controls disappear. The backend accepts only `Submitted → Approved`; stale, repeated, or backward decisions are rejected.

Organisers receive a persistent approval confirmation in the shared **Request decisions** panel with a link back to the event. Approval and rejection notifications refresh and persist read state through the same API.

## Waitlist (SPM-138)

When an event is full and open for registration, the attendee's event page offers Join Waitlist (`POST /api/events/:id/waitlist`) instead of Register. The page states the full event, the availability and the closing date, and shows the waiting indicator and the owner's own position once on the list. The confirmation banner is built from the event name and the response position. The waitlist rules and copy live in `src/features/events/lib/registration.ts` (`registrationUiState`, `WAITLIST_MESSAGES`) and the controls in `src/features/events/pages/detail/registration/WaitlistPanel.tsx`. Tests: `npm test` (the `*.waitlist.test.tsx` and `waitlist.test.ts` files). The in-app promotion bell and the cancel flow are not built yet (SPM-136 and the bell story).

## Registration report

The authenticated report route `/events/:id/registrations/report` relies on
the backend's access check; a 403 displays an error rather than redirecting
the viewer. The People-card modal mounts only while open and shares the report
fetch/polling and CSV/PDF export hooks. Exports use the server's full report
and filename, even when the modal view is filtered. Polling stops when the
viewer leaves, changes events, or loses access. Release 1 has no waitlist.

## Coordinator queue (SPM-48)

A coordinator's events page is their queue: it reads `GET /api/coordinator/queue` (other roles keep `GET /api/events`) on every visit and on Retry, and opens on **All statuses**; the status filter offers All statuses and each of the seven statuses (Submitted shows the "Pending Requests" heading). Each status badge has its own colour and its text label (`src/components/ui/StatusBadge.tsx`). Queue cards show a **Needs action** marker (its reasons are visually hidden text that screen readers announce, and its hover title), the queue safety state (Awaiting Safety Officer Check, Safety Changes Requested, Safety Arrangement Rejected, Safety Check Reset: Re-request Needed, Safety Check Cleared) in place of the SPM-94 indicator, and venue notes: "Hold active: <venue>, expires <date time> SGT", "Hold expired: …" and "Venue unavailable – alternative arrangements needed: <venue>". A card whose venue became unavailable does not also show "Venue Reserved". The server decides every state; the client only labels it. The status filter resets to All statuses at every login and logout, so the next user on the same browser never inherits it. API client: `src/features/events/api/coordinator-queue-api.ts`; components: `src/features/events/components/QueueIndicators.tsx`; wording: `src/features/events/lib/queueLabels.ts`. The planning page labels a rejected safety check **Rejected** with **Re-Request Safety Check**. Tests: `EventListPage.queue.test.tsx`, `QueueIndicators.test.tsx`, `StatusBadge.test.tsx`.

## Event change requests (SPM-64)

The owning organiser of a Submitted, Approved, Planning or Confirmed event that has not started sees **Request Change** on the event page. It opens `/events/:id/change-requests`, where the organiser changes any of description, date/time, expected attendance, room layout, facilities, accessibility (special requirements) and equipment, with an optional reason; the event name and organiser are shown read-only. Date inputs are Singapore time. After submitting, the page confirms the request and lists every request with its status (Pending review, Approved, Denied with the coordinator's reason, Withdrawn); a pending request can be withdrawn (if it was decided meanwhile, the page shows the server's message and refreshes the request). Past approval the form says that if the event has a safety check, approving the change will require a new one; each pending request shows that note when the event has a safety check. The event page shows the latest request's status, and My Events marks events with a pending request; if those cannot be loaded, My Events says so with a Retry button instead of silently showing no badges. The assigned coordinator sees the request status on the event page (SPM-65 turns a pending one into the review panel described below), and (SPM-65) the request in the Pending Change Requests section at the top of their events page, tagged **New** until they open its review; the change request notice is no longer repeated under Assignment Updates. The route allows organisers and coordinators and leaves ownership to the server (404 otherwise). API client: `src/features/events/api/change-requests-api.ts`; rules: `src/features/events/lib/changeRequests.ts`; components: `src/features/events/pages/change-requests/`.

## Change request review (SPM-65)

The coordinator's events page starts with **Pending Change Requests** for their assigned events (above Assignment Updates), oldest first, a request they have not opened yet tagged **New** (from its unread SPM-64 change request notice; opening the review marks it read), (event, organiser, requested details, submitted time, "Review Change Request" linking to the event page), with "No pending change requests." when there are none; event cards carry the "Change requested: Pending" badge for coordinators too. On the event page, above Update Event Information and Changes Awaiting Review, a pending request shows as **Change Requested by Organiser** with the same review actions as the Change Requests page; after a decision the event reloads. The assigned coordinator sees each pending request's changes (value when requested → requested value; list fields as "+ added" / "− removed"; dates in Singapore time) with a read-only **Conflict check** (venue bookings, equipment reservations, registrations, or "No conflicts with existing bookings or registrations."). **Approve Change** stays disabled until the conflict check has loaded (if it fails, **Retry Conflict Check** loads it again; Deny is still available), then asks for confirmation (and says the safety check will be reset when one exists); **Deny Change** needs a reason of 10 to 500 characters. After a decision the page confirms it, says when the safety check was reset, and an approved request lists the **Arrangements to re-check**, each with **Mark As Re-checked** for the coordinator (read-only for the organiser). A pending request is closed automatically when the organiser withdraws it or the event is cancelled (AC11); if that (or another decision) happened while the coordinator had it open, the server's message is shown and the list reloads, so it can no longer be decided. Both the owner and the assigned coordinator see the **Audit Log**. Closed requests (event cancelled) show their reason; withdrawn ones show Withdrawn. The organiser's Request Decisions panel shows approvals and denials (with the reason) linking to the Change Requests page. Components: `ChangeRequestReview.tsx`, `RecheckList.tsx`, `ChangeRequestAuditLog.tsx` and `pages/list/PendingChangeRequests.tsx`.

Planning values and the "Changes Awaiting Review" times are shown in Singapore time with am/pm (`formatSgtDateTime` in `src/utils/sgtDate.ts`); `npm run test:tz` covers these tests in three host time zones.
