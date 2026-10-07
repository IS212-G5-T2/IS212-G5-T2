# Changelog

## Unreleased

- SPM-122: added venue detail controls to review, confirm, cancel, and end
  unavailable periods, with an affected-booking list after saving.
- SPM-46: a reassigned event shows a "Reassigned" label and "from <coordinator>"
  on its card, and the assigned coordinator sees "Reassigned to you from
  <coordinator> on <date>" on the event page.
  A previous coordinator sees why they can no longer open the event. The
  coordinator's notification panel is now headed "Assignment updates" (it also
  lists events reassigned away).

- SPM-124 venue schedule periods now always display their start and end times,
  including multi-day periods. Changing venue detail routes immediately clears
  the previous venue while the replacement record loads.
- SPM-47: added the Lead's Reassign Events page (`/lead/reassign`): assigned
  events soonest first with their current coordinator and a "Coordinator
  unavailable" label, a picker showing availability and workload (current and
  unavailable coordinators disabled), confirmation, and a refresh after a
  refusal. The Lead sees coordinator-unavailable notices on the Assignment Queue
  page; coordinators see reassignments to and away from them.

- SPM-123: added the Event Coordinator Lead role and its Assignment Queue page
  (`/lead/queue`): unassigned requests, coordinators with availability and active
  count (fewest first), assign with confirmation, unavailable coordinators shown
  but not selectable. A refused assignment reloads the queue as well as the
  coordinators. Coordinators see new assignments on their events page, refreshed
  on focus and every 30 seconds. Removed the unused store `assignCoordinator`.
- The download now saves under the server's UTF-8 `filename*` when present (so an accented event name is kept), falling back to the plain `filename`.

- Added a registrations modal to the event detail page (SPM-63 UI improvement): the People card has a "View registrations" button for the assigned coordinator or owning organiser only. The modal (title "Registrations (N)") shows "N of capacity spots registered · K available", the registration period and event time in Singapore time and "No waitlist"; a search box (name, email or phone, 150 ms debounce) and a Filter of All / Registered today / Indicated special requirements (Singapore day); expandable registration cards (name, email, date; one open at a time, with contact number, registered-at and status); "No registrations yet" and "No registrations match your criteria" states; and "Export as CSV" / "Export as PDF" through the existing server exports (the full report, not narrowed by search or filter). It loads and refreshes every 5 seconds only while open, and closes from the x button, Escape or the backdrop. A waitlist is not shown (Release 1 has no waitlist). The report page now shares its export logic through `useReportExport`. The "View Registrations" link from the event list page was removed: you now reach registrations only from the event detail page.

- Added the registration report page for organisers and coordinators (SPM-63) at `/events/:id/registrations/report`: heading "{event} - Registration Report", "N Attendees Registered (N / capacity)" and "K spots available", a table of name, email, contact number, registration date (Singapore time) and status, "Export as CSV" and "Export as PDF" buttons (authenticated download under the server's filename, disabled while downloading, errors shown in the page), and the empty state "No registrations yet". The report refreshes every 5 seconds without user action, replacing the rows, and polling stops on leaving the page, changing event, 401 (back to login) and 403 (rows cleared, "You do not have access to this event's registrations." shown). Event cards now have a "View Registrations" link for the assigned coordinator or owning organiser only. Added `apiBaseUrl()` to `utils/api.ts`. Added a re-runnable mutation check (`scripts/testing/mutation/spm63.mutants.mjs`).

- Added a re-runnable mutation check for the SPM-120 withdraw UI (`scripts/testing/mutation`) and tests for the dialog's Escape-while-pending and double-activation paths, unexpected withdrawal failures, a failed reload after a 409, and Withdraw on a cancelled event. Tests and tooling only; no behaviour change.

- Fixed the withdrawn card's footer saying "Registration closed on <date>" with a future date for a cancelled event. It now says "Registration is closed." until the close time has actually passed, as the main registration card already does (SPM-120).
- Fixed September showing as "Sept" in Singapore date-times: `formatSgtDateTime` now uses a fixed three-letter month table, so every date reads like "4 Sep 2026, 09:05". Removed the unused `formatWithdrawnAt`.
- Added attendee withdrawal on the registration card (SPM-120): a "Withdraw" button for an active registration before the event starts, an accessible confirmation dialog (event name, consequences, Cancel focused first, focus trap, Escape cancels, backdrop click ignored), a persistent dismissible success banner, a withdrawn card (a "Registration withdrawn" badge, a Registered/Withdrawn timeline in absolute Singapore time, a collapsed "View previous registration details" disclosure, and a "Register again" footer that follows the same open, full, not-yet-open, closed and event-started rules as the Register button, with the form prefilled from the withdrawn registration and a "Registered again for ..." confirmation), and the message "Event has already occurred" once the event has started. Details stay visible after withdrawing; the event's available spots are refetched. A 401 from the withdraw call signs the user out. Added the `vitest-axe` dev dependency for the dialog accessibility test.

- The top bar now has a profile avatar showing the user's initials (e.g. C1 for
  Coordinator 1) that opens a menu with the name, Settings and the light/dark
  switch; coordinators see a green Available or grey Unavailable label there
  instead of their email (SPM-80). Log out moved to the bottom of the sidebar,
  where Settings and the theme switch used to be, and the "Signed in as" text
  was removed.

- Settings now has an Availability section for coordinators, including
  multi-role accounts such as Coordinator + Venue Staff (SPM-80). It shows the
  saved status, saves Available or Unavailable with a confirmation, and reports
  load or save failures with a retry. Other roles see Settings unchanged.

- Added the SPM-50 Venue Staff creation route and form, including required-field
  feedback, setup/turnaround duration validation, persistent catalogue refresh,
  successful-creation confirmation, and server-generated venue UUIDs with no
  identifier field exposed to staff. The form now separates venue details,
  including one location, from controlled facility/layout selections and supports one optional venue
  image using the event form's shared data-URL upload helper.

- Split the required SPM-50 operating-information textarea from the operating
  schedule controls: selected days plus start and end times.
- Added SPM-111 quantity upper-bound validation, equipment-inventory load
  failure messaging, combobox interaction coverage, and a browser create-to-inventory check.

- Hid the event status progression line (draft → submitted → approved → planning → confirmed → completed) from the attendee event view; it remains visible to organizers and coordinators.
- Redesigned the attendee registration card around five states: opens on [date] SGT, closes in N days, closes today, closed, and fully booked. Dates use one format (12 Mar 2027, 23:59 SGT); N is the SGT calendar-day difference; the Register button appears only while open. The SPM-99 opens/closes/spots rows and "Registration Open/Full" status line are replaced (SPM-61).

- Attendee Browse Events now filters by Upcoming events (default), Registered Events, Past Events and Cancelled (the last three are the attendee's own registrations). Cards keep the status badge and add a Registered badge; Approved events show as Confirmed to attendees (SPM-61).

- Added attendee registration UI (`components/EventDetail/`): details form, confirmation, and server-backed duplicate handling. The Register button is now rendered only while registration is open (closed, not-yet-open and full states show text), the closing instant is exclusive, and the local-only Withdraw button is hidden until a withdraw story ships (SPM-61).

- Corrected the frontend CI unit-test entrypoint to invoke the configured
  `test:cov` coverage script.

- Keep drafts and submitted events private to their verified Firebase owner. Clear cached events and remount account pages when the signed-in user changes.

- Keep submitted events visible in My Events when the local API organiser ID differs from the signed-in Firebase UID. My drafts shows only Draft records.

- The Web SDK retains opt-in Auth Emulator support, but the shared Compose
  stack does not start an emulator; it uses real non-production Firebase
  configuration and CI owns emulator execution.
- Read Firebase custom role claims after sign-in and added role and ownership
  route guards for direct event-management navigation.
- Added the frontend CI unit-test entrypoint and acceptance-path coverage for
  organiser sign-in and assigned coordinator change-request review.
- Added coverage thresholds for the SPM-30 login, Firebase-role mapping, and
  access-control guard paths. The suite must remain green and include all
  intended test-file extensions before those thresholds are treated as met.
- Restricted operational venue, booking, and equipment routes by role, and
  limited attendee registration mutations to the authenticated attendee.

## 2026-09-13

- Added a Vitest + React Testing Library unit-test setup (`vite.config.ts` `test` block, `src/test/setup.ts`) and `npm test` / `npm run test:watch` / `npm run test:coverage` scripts.
- Added unit tests for `LoginPage` (`src/pages/LoginPage.test.tsx`): field validation, successful sign-in for each seeded Firebase account, redirect-to-original-page behaviour, submit-button loading/disabled state, and every mapped Firebase Auth error message (wrong password, invalid credential, user not found, invalid email, disabled account, too many requests, network failure, unrecognized code, non-Firebase error).
- Added `src/test/fixtures/authUsers.ts` documenting the seeded Firebase Authentication test accounts, and `src/pages/testUtils.tsx` with a shared `renderLoginPage()` helper.
- Documented the test setup and seeded accounts in `README.md` and `HANDOVER.md`.
- Added the three-step event submission form, API-backed My Events/details, light-mode startup, and interaction tests.
- Removed the account sign-in label; account support remains a separate ticket.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.

## 2026-09-12

- Added a `/login` page connected to Firebase Authentication (Email/Password provider): email + password sign-in via the Firebase JS SDK, session persistence via `onAuthStateChanged`, route protection for all other pages, and a "Log out" control in the top nav.
- Added `.env.example` documenting the required `VITE_FIREBASE_*` config values and `src/lib/firebase.ts` for SDK initialization.
- Added `firebase` as a dependency.
