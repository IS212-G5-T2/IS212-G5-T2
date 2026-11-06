# ConnectSphere E2E Test Suite

## Limits of This Pass

- The Week 2 brief, Week 4 brief, and clarification Excel sheets are not in the repository. Every flow is sourced from **Repository** (code, routes, DB constraints). Requirement IDs appear only where code comments cite them.
- The route map, role model, navigation config, login page, DB status constraints, and backend endpoint list were read. Not every component was read, so flows marked **[confirm label]** use labels that have not been verified in the UI.
- This is a condensed first pass. Each flow lists its key steps. Splitting them further to one action per step is the next pass.

---

## Application Overview

**Application purpose:** A university event-management platform. Organisers propose events, a Coordinator Lead assigns each event to a Coordinator, Coordinators book venues and equipment, venue staff and tech support approve or reserve those resources, a Safety Officer reviews safety arrangements, and attendees register for approved events.

### User Roles

Source: `frontend/src/types/index.ts` and `navConfig.ts`.

| Role | Label | Landing Page |
|---|---|---|
| organiser | Event Organiser | /events |
| coordinator | Event Coordinator | /events |
| attendee | Attendee | /events |
| venue_staff | Venue Staff | /events |
| tech_support | Technical Support Staff | /events |
| coordinator_lead | Event Coordinator Lead | /lead/queue |
| safety_officer | Safety Officer | /safety/events |

A user may hold several roles (`roles[]`). Navigation is the union of their roles.

### Main Modules and Routes

- **Auth:** `/login`, Log out, `/settings`
- **Events:** `/events`, `/events/create`, `/events/:id`, `/events/:id/edit`, `/requests` (My Drafts), `/events/:id/registrations/report`, `/events/:id/change-requests`
- **Lead:** `/lead/queue`, `/lead/reassign`
- **Safety:** `/safety/events`
- **Venues:** `/venues/create`, `/venues/:id`, `/venue-records`, `/venue-records/:id`, `/venue-records/:id/edit`, `/bookings`
- **Equipment:** `/equipment/requests`, `/equipment/requests/create`, `/equipment/requests/:requestId/update`, `/equipment`, `/equipment/inventory`, `/equipment/availability`, `/equipment/audit-trail`, `/equipment/create`, `/equipment/:id/edit`

### Key Business Rules

Source: DB constraints and code.

- Event status values: `Submitted`, `Approved`, `Rejected`, `Planning`, `Confirmed`, `Completed`, `Cancelled`.
- Registration status values: `Registered`, `Withdrawn`, `Cancelled`, `Waitlisted`, `Removed`.
- Equipment request status values: `Pending Review`, `Reserved`, `Unavailable`, `Cannot Provide`, `Cancelled`.
- Venue booking status values: `pending`, `approved`, `rejected`, `blocked`, `released`, `cancelled`.
- Safety arrangement status values: `pending`, `changes_needed`, `approved`, `rejected`.
- Rejected events require a rejection reason of 1 to 2000 characters.
- Only the owning Organiser may edit an event (`RequireEventOwner`). The server decides ownership for registration reports and change requests, and returns 404 or MSG-08 on refusal.
- Duplicate registrations return MSG-05. Registration-window violations return MSG-01 or MSG-02. Success returns MSG-11.

### Requirements vs. Implementation Mismatches

1. The Week 2 and Week 4 briefs and clarification sheets are absent from the repo, so requirement traceability cannot be verified.
2. Event status `Draft` exists only in the drafts table (`Draft`/`Submitted`), not in the events table, so "draft" is a separate lifecycle.
3. Two registration report routes and an `/venues/availability` redirect exist. The redirect is intentional per code comments.

---

## Flow 1: Successful Login by a Valid User

- **User role:** Any (example: organiser)
- **User objective:** Sign in and reach the role's landing page.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions**
- Account exists with email `[test account email]` and password `[test password]`, role organiser.
- Browser has no active session.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open http://localhost:5173/login (or the deployed URL plus `/login`). | Page shows "ConnectSphere" heading, "Sign in to manage events, venues, and bookings.", fields "Email" and "Password", and button "Log in". |
| 2 | Click the "Email" field. | Field receives focus; no error shown. |
| 3 | Enter `[test account email]` into the "Email" field. | Value is visible in the field. |
| 4 | Click the "Password" field and enter `[test password]`. | Value is masked. |
| 5 | Click "Log in". | Button label changes to "Signing in…" and is disabled while the request runs. |
| 6 | Wait for the request to finish. | Browser navigates to `/events` and the "My Events" navigation item is visible. |

**Final pass criteria**
- URL is `/events`, the page shows the signed-in user's name, and navigation shows "My Events", "My Drafts", "Create Event".
- Reloading the page keeps the user signed in (session restored).

**Automation suitability:** Yes. Reason: deterministic form and redirect.
**Assumptions, gaps, or conflicts:** Exact name shown in the header not verified.

---

## Flow 2: Login Rejected for Invalid Credentials

- **User role:** Any
- **User objective:** Be told the credentials are wrong and not get into the app.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions**
- Account exists. The password `WrongPass123` is not its password.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open /login. | Login form is shown with empty "Email" and "Password" fields. |
| 2 | Enter `[test account email]` into "Email". | Value visible. |
| 3 | Enter `WrongPass123` into "Password". | Value masked. |
| 4 | Click "Log in". | Red alert (role="alert") appears above the fields with text "Invalid email or password". User stays on /login. Button returns to "Log in". |

**Final pass criteria**
- URL remains `/login`. No navigation items are shown. No session is created.

**Automation suitability:** Yes. Reason: fixed server message.
**Assumptions, gaps, or conflicts:** Exact text is the backend string in `auth.service.ts`. The UI may display it verbatim.

---

## Flow 3: Login Blocked by Empty Required Fields

- **User role:** Any
- **User objective:** Get clear feedback when fields are missing.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** No account data needed.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open /login. | Empty form. |
| 2 | Click "Log in" without entering anything. | No request is sent. Under "Email": "Email is required." Under "Password": "Password is required." |
| 3 | Enter `[test account email]` into "Email" and click "Log in". | "Email is required." clears. "Password is required." remains. |

**Final pass criteria**
- User is still on /login. No session created.

**Automation suitability:** Yes. Reason: client-side validation.
**Assumptions, gaps, or conflicts:** None.

---

## Flow 4: Log Out

- **User role:** Any signed-in role
- **User objective:** End the session.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Signed in as organiser.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | From any page, locate the user menu in the app shell. | User name and role label are shown. |
| 2 | Click "Log out". | Session ends. Browser goes to /login. |
| 3 | Press the browser Back button. | Browser stays on /login or redirects back to /login. Protected pages (e.g. /events) do not load. |

**Final pass criteria**
- Navigating to /events shows the login page. The server session is invalidated (`POST /api/auth/logout`).

**Automation suitability:** Yes. Reason: deterministic.
**Assumptions, gaps, or conflicts:** Exact location of "Log out" in the shell not verified.

---

## Flow 5: Unauthorised Role Is Denied a Restricted Route

- **User role:** attendee
- **User objective:** Confirm an attendee cannot open coordinator-only pages.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Signed in as attendee.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as attendee (Flow 1 steps, attendee credentials). | Landing on /events. Navigation shows "Browse Events" only. |
| 2 | Enter `/venues` in the address bar and press Enter. | Page does not show venue data. User is redirected away from /venues (RequireRole). Final location is not /venues. |
| 3 | Enter `/equipment` in the address bar and press Enter. | Same behaviour. No equipment data displayed. |

**Final pass criteria**
- No restricted page content is shown to the attendee. Attendee remains in the app.

**Automation suitability:** Yes. Reason: route guard.
**Assumptions, gaps, or conflicts:** Redirect target not verified. Check `RequireRole` for the exact fallback.

---

## Flow 6: Organiser Creates and Submits an Event

- **User role:** organiser
- **User objective:** Propose an event for approval.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Signed in as organiser.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Create Event" in the navigation. | Page `/events/create` opens with the event creation form. |
| 2 | Enter the event title, date/time, and details **[confirm labels in UI]**. | Each value is visible in its field. |
| 3 | Click "Save" to save a draft. | Draft appears under "My Drafts" (`/requests`) with status `Draft`. |
| 4 | Open the draft and click "Submit Request" **[confirm label]**. | Draft status becomes `Submitted`. Event appears in "My Events" with status `Submitted`. |

**Final pass criteria**
- Event exists with status `Submitted`, owned by the organiser, and visible in "My Events".

**Automation suitability:** Partial. Reason: form field labels not fully verified.
**Assumptions, gaps, or conflicts:** Field-by-field validation rules need the form component.

---

## Flow 7: Organiser Edits an Event They Own

- **User role:** organiser
- **User objective:** Change details of their own event.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Organiser owns event `[event name]`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Go to "My Events" and click `[event name]`. | `/events/:id` shows event details. |
| 2 | Click "Edit" **[confirm label]**. | `/events/:id/edit` opens with fields pre-filled. |
| 3 | Change the title to `[new title]`. Click "Save". | Saved. Detail page shows `[new title]`. |
| 4 | Log in as a different organiser and open `/events/:id/edit`. | Access denied (RequireEventOwner). |

**Final pass criteria**
- Title persisted. Non-owner blocked.

**Automation suitability:** Yes. Reason: clear server ownership rule.
**Assumptions, gaps, or conflicts:** Some events may require a change request instead (Flow 16).

---

## Flow 8: Coordinator Lead Assigns an Event to a Coordinator

- **User role:** coordinator_lead
- **User objective:** Assign a submitted event to a Coordinator.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Signed in as coordinator_lead. Event `[event name]` has status `Submitted` and no coordinator. A Coordinator account exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as coordinator_lead. | Lands on `/lead/queue`. Navigation shows "Assignment Queue" and "Reassign Events". |
| 2 | Click "Assignment Queue". | Queue lists `[event name]`. |
| 3 | Select `[event name]`. | Event detail or assignment panel opens. |
| 4 | Select `[coordinator name]` from the coordinator dropdown **[confirm label]**. | Selection shown. |
| 5 | Click "Assign" **[confirm label]**. | Event leaves the queue. Event shows the assigned coordinator. |

**Final pass criteria**
- Event has the coordinator. Visible in that coordinator's "Events" list.

**Automation suitability:** Yes. Reason: queue-to-assignment transition.
**Assumptions, gaps, or conflicts:** Button text unverified.

---

## Flow 9: Coordinator Lead Reassigns an Event

- **User role:** coordinator_lead
- **User objective:** Move an assigned event to another Coordinator.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is assigned to `[coordinator A]`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Reassign Events". | `/lead/reassign` opens, listing assigned events. |
| 2 | Select `[event name]`, then choose `[coordinator B]`. | Selection shown. |
| 3 | Click "Reassign" **[confirm label]**. | Event shows `[coordinator B]`. `[coordinator A]` no longer sees it. |

**Final pass criteria**
- Assignment persisted. History entry exists (`POST /api/lead/events/:eventId/reassign`).

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 10: Event Approved

- **User role:** coordinator_lead / organiser
- **User objective:** Move a submitted event forward to `Approved`.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is `Submitted`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as the approving role (confirm which role approves: `POST /api/events/:id/approve`). | Event detail shows status `Submitted`. |
| 2 | Click "Approve" **[confirm label]**. | Status becomes `Approved`. |

**Final pass criteria**
- Status is `Approved` and appears with that status in the list.

**Automation suitability:** Yes. Reason: status transition.
**Assumptions, gaps, or conflicts:** Approving role not confirmed from UI.

---

## Flow 11: Event Rejected With a Reason

- **User role:** approving role
- **User objective:** Reject a submitted event with a reason.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is `Submitted`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `[event name]`. | Detail shows status `Submitted`. |
| 2 | Click "Reject" **[confirm label]**. | Reason field appears. |
| 3 | Leave the reason empty and click confirm. | Error shown. Status stays `Submitted`. |
| 4 | Enter `[reason text, 1 to 2000 characters]` and confirm. | Status becomes `Rejected`. Reason is shown on the event. |

**Final pass criteria**
- Status `Rejected`. Reason saved (`rejection_reason`, 1 to 2000 characters).

**Automation suitability:** Yes. Reason: constraint is in the database.
**Assumptions, gaps, or conflicts:** Reason field labels not verified.

---

## Flow 12: Attendee Registers for an Event

- **User role:** attendee
- **User objective:** Register for an open event.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Attendee account. Event `[event name]` is `Approved` or later, with registration open.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as attendee. Click "Browse Events". | Event list is shown. |
| 2 | Click `[event name]`. | Event detail with a registration action. |
| 3 | Click the register action **[confirm label]**. | Success message MSG-11 is shown. Status `Registered`. |
| 4 | Click the register action again. | Duplicate message MSG-05. No second registration. |

**Final pass criteria**
- One registration row with status `Registered`.

**Automation suitability:** Yes. Reason: defined messages.
**Assumptions, gaps, or conflicts:** Exact message text in `registrations/helpers/messages.ts`.

---

## Flow 13: Attendee Registration Blocked Outside the Window

- **User role:** attendee
- **User objective:** See why registration is refused when the window is closed.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event registration window is closed or not yet open.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the event detail page. | Registration action is shown but disabled, or shows the window message. |
| 2 | Attempt to register. | MSG-01 or MSG-02 is displayed. No record is created. |

**Final pass criteria**
- No registration row exists.

**Automation suitability:** Yes. Reason: server rule.
**Assumptions, gaps, or conflicts:** Which of MSG-01/MSG-02 applies per case is in `messages.ts`.

---

## Flow 14: Attendee Withdraws a Registration

- **User role:** attendee
- **User objective:** Cancel their own registration.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Attendee has status `Registered` for `[event name]`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `[event name]`. | Status `Registered` shown. |
| 2 | Click "Withdraw" **[confirm label]**. | Confirmation appears. |
| 3 | Confirm. | Status becomes `Withdrawn`. |

**Final pass criteria**
- Registration row status `Withdrawn` (`POST /api/registrations/:registrationId/withdraw`).

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** Confirmation text unverified.

---

## Flow 15: Waitlist Join When Fully Booked

- **User role:** attendee
- **User objective:** Join the waitlist for a full event.
- **Priority:** Medium
- **Requirement source:** Repository

**Preconditions:** Event is fully booked. Attendee is not registered.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the full event. | Waitlist option is shown. |
| 2 | Click the waitlist action **[confirm label]**. | Status `Waitlisted`. |

**Final pass criteria**
- Registration row status `Waitlisted`.

**Automation suitability:** Yes. Reason: backend endpoint exists.
**Assumptions, gaps, or conflicts:** Promotion to `Registered` is a separate flow not yet written.

---

## Flow 16: Organiser Requests an Event Change and It Is Approved

- **User role:** organiser / coordinator
- **User objective:** Change an approved event through a formal request.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is `Confirmed`. Organiser owns it.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `/events/:id/change-requests`. | Change request page opens. |
| 2 | Submit a change request `[change details]`. | Request appears with status "Needs Review". |
| 3 | Log in as the assigned coordinator and open the same page. | Request visible. "Request changes" or approve action is available. |
| 4 | Click the approve action **[confirm label]**. | Request status becomes "Applied". |

**Final pass criteria**
- Event fields updated. Change request status "Applied".

**Automation suitability:** Yes. Reason: clear status model.
**Assumptions, gaps, or conflicts:** Approve/deny labels unverified.

---

## Flow 17: Event Cancellation Request and Decision

- **User role:** organiser / coordinator
- **User objective:** Cancel an event through a request and decision.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is `Confirmed` or `Planning`.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `[event name]`. | Event detail. |
| 2 | Click "Cancellation Request" **[confirm label]**. | Cancellation request form opens. |
| 3 | Enter a reason and submit. | Request pending. |
| 4 | Log in as the decision maker and click "Confirm Event" or the cancel decision **[confirm label]**. | Event status `Cancelled`. |

**Final pass criteria**
- Event status `Cancelled`. Registrations marked `Cancelled`.

**Automation suitability:** Partial. Reason: decision role unclear.
**Assumptions, gaps, or conflicts:** Who decides cancellation requests is not confirmed.

---

## Flow 18: Venue Staff Creates a Venue

- **User role:** venue_staff
- **User objective:** Add a new venue.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Signed in as venue_staff.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Create Venue". | `/venues/create` opens. |
| 2 | Enter venue name and capacity **[confirm labels]**. Click "Save". | Venue saved. Visible in "Venue Records". |

**Final pass criteria**
- Venue row exists, owned by venue_staff.

**Automation suitability:** Yes. Reason: standard create.
**Assumptions, gaps, or conflicts:** Field list unverified.

---

## Flow 19: Coordinator Books a Venue and Venue Staff Approves

- **User role:** coordinator / venue_staff
- **User objective:** Reserve a venue for an assigned event.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Coordinator has assigned event `[event name]`. Venue `[venue name]` is available.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | As coordinator, open "Venue Records" and select `[venue name]`. | Venue detail with availability. |
| 2 | Click the booking request action **[confirm label]** (`POST /api/venues/:id/booking-requests`). | Booking status `pending`. |
| 3 | Log in as venue_staff. Open "Booking Requests". | Pending booking listed. |
| 4 | Click "Approve arrangement" **[confirm label]**. | Booking status `approved`. |

**Final pass criteria**
- Booking `approved`. Visible in the coordinator's "Bookings".

**Automation suitability:** Yes. Reason: lifecycle in code.
**Assumptions, gaps, or conflicts:** Labels taken from the venue page.

---

## Flow 20: Venue Staff Rejects a Booking Request

- **User role:** venue_staff
- **User objective:** Decline a booking.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** A `pending` booking exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open "Booking Requests". Select the pending booking. | Booking detail. |
| 2 | Click "Reject arrangement" **[confirm label]**. | Booking status `rejected`. |

**Final pass criteria**
- Booking `rejected`. Coordinator notified.

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** Notification verification not performed.

---

## Flow 21: Venue Unavailability Period Added and Ended

- **User role:** venue_staff
- **User objective:** Block a venue for a period, then release it.
- **Priority:** Medium
- **Requirement source:** Repository

**Preconditions:** Venue `[venue name]` exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `[venue name]` in "Venue Records". | Venue detail. |
| 2 | Add an unavailable period from `[start]` to `[end]` **[confirm labels]**. | Period listed. |
| 3 | Click "Confirm Early End" on that period **[confirm label]**. | Period ends early. |

**Final pass criteria**
- Period history shows the early end.

**Automation suitability:** Partial. Reason: labels partially verified.
**Assumptions, gaps, or conflicts:** Cancel Early End flow not written.

---

## Flow 22: Tech Support Creates Equipment

- **User role:** tech_support
- **User objective:** Add equipment to inventory.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Signed in as tech_support.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Equipment Inventory". | `/equipment/inventory` opens. |
| 2 | Click the create action. Open `/equipment/create`. | Create form. |
| 3 | Enter name and quantity **[confirm labels]**. Click "Save". | Item in inventory. |

**Final pass criteria**
- Equipment row exists with active status.

**Automation suitability:** Yes. Reason: standard create.
**Assumptions, gaps, or conflicts:** Field list unverified.

---

## Flow 23: Coordinator Requests Equipment; Tech Support Reserves It

- **User role:** coordinator / tech_support
- **User objective:** Obtain equipment for an event.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Equipment item exists. Event is assigned.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | As coordinator, open "Equipment" then `/equipment/requests/create`. | Request editor. |
| 2 | Select the item and quantity. Click "Submit Request" **[confirm label]**. | Request `Pending Review`. |
| 3 | Log in as tech_support. Open "Equipment Requests". | Request listed as `Pending Review`. |
| 4 | Click "Approve & reserve" **[confirm label]**. | Status `Reserved`. |

**Final pass criteria**
- Status `Reserved`. Item shows reservation in "Reservations".

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 24: Tech Support Cannot Provide Requested Equipment

- **User role:** tech_support
- **User objective:** Decline an equipment request.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Request `Pending Review` exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the request in "Equipment Requests". | Request detail. |
| 2 | Click "Confirm cannot provide" **[confirm label]**. | Status `Cannot Provide`. |

**Final pass criteria**
- Status `Cannot Provide` (`PATCH /api/equipment/requests/:requestId/cannot-provide`).

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 25: Safety Officer Reviews an Event and Requests Changes

- **User role:** safety_officer
- **User objective:** Review safety arrangements and request changes.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Event `[event name]` is awaiting safety check. Safety officer account exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as safety_officer. | Lands on `/safety/events`. "Safety Review" visible. |
| 2 | Open `[event name]`. | Event detail with arrangements. |
| 3 | Click "Request changes" **[confirm label]**. Enter comment `[comment]`. Confirm. | Safety status `changes_needed`. |

**Final pass criteria**
- Safety status `changes_needed`. Coordinator sees the feedback.

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 26: Safety Officer Approves an Event

- **User role:** safety_officer
- **User objective:** Approve the safety check.
- **Priority:** Critical
- **Requirement source:** Repository

**Preconditions:** Event awaiting safety check.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the event in `/safety/events`. | Event detail. |
| 2 | Click "Approve arrangement" **[confirm label]**. | Safety status `approved`. |

**Final pass criteria**
- Safety status `approved`. Event can proceed.

**Automation suitability:** Yes. Reason: clear transition.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 27: Organiser or Coordinator Views the Registration Report

- **User role:** organiser or assigned coordinator
- **User objective:** See registrations for an event.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event has registrations.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `/events/:id/registrations/report`. | Report with registrations and counts. |
| 2 | Click the export action **[confirm label]**. | File downloads. |

**Final pass criteria**
- Report matches registrations in the database.

**Automation suitability:** Yes. Reason: read-only.
**Assumptions, gaps, or conflicts:** Export format unverified.

---

## Flow 28: Unauthorised User Is Refused the Registration Report

- **User role:** attendee or another organiser
- **User objective:** Confirm the report is protected.
- **Priority:** High
- **Requirement source:** Repository

**Preconditions:** Event owned by a different organiser.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `/events/:id/registrations/report` for another organiser's event. | MSG-08 refusal. No data shown. |

**Final pass criteria**
- No registration data is visible.

**Automation suitability:** Yes. Reason: server rule.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow 29: Clarification Thread on an Event

- **User role:** organiser / coordinator
- **User objective:** Ask and answer a question about an event.
- **Priority:** Medium
- **Requirement source:** Repository

**Preconditions:** Event exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `[event name]`. Find the clarification thread. | Thread shown. |
| 2 | Enter `[question]`. Submit. | Question appears. |
| 3 | Log in as the other role. Reply `[answer]`. | Reply appears. |
| 4 | Click "Resolve" **[confirm label]**. | Thread resolved. |

**Final pass criteria**
- Thread resolved. Visible to both roles.

**Automation suitability:** Yes. Reason: defined endpoints.
**Assumptions, gaps, or conflicts:** Labels unverified.

---

## Flow 30: Mark a Notification as Read

- **User role:** any
- **User objective:** Clear a notification.
- **Priority:** Medium
- **Requirement source:** Repository

**Preconditions:** Unread notification exists.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open the notifications area. | Unread notification shown. |
| 2 | Click the notification. | Marked read (`POST /api/notifications/:id/read`). |

**Final pass criteria**
- Notification no longer unread.

**Automation suitability:** Yes. Reason: simple state.
**Assumptions, gaps, or conflicts:** Notification location unverified.

---

## Flow 31: Coordinator Sets Availability in Settings

- **User role:** coordinator
- **User objective:** Mark availability for assignment.
- **Priority:** Medium
- **Requirement source:** Repository

**Preconditions:** Signed in as coordinator.

**E2E test steps**

| Step | Action | Expected Result |
|---|---|---|
| 1 | Click "Settings". | `/settings` opens with the availability section. |
| 2 | Toggle availability. | Saved. Backend accepts `true` or `false` only. |

**Final pass criteria**
- Availability persisted (`/api/coordinator/me/availability`).

**Automation suitability:** Yes. Reason: simple state.
**Assumptions, gaps, or conflicts:** None identified.

---

## Flow Coverage Summary

| # | Flow | Role | Priority | Source | Status |
|---|---|---|---|---|---|
| 1 | Successful login | Any | Critical | Repository | Implemented but undocumented |
| 2 | Invalid login | Any | High | Repository | Implemented but undocumented |
| 3 | Empty-field login | Any | High | Repository | Implemented but undocumented |
| 4 | Log out | Any | High | Repository | Implemented but undocumented |
| 5 | Attendee denied restricted route | attendee | High | Repository | Implemented but undocumented |
| 6 | Organiser creates and submits event | organiser | Critical | Repository | Clarification needed |
| 7 | Organiser edits own event | organiser | High | Repository | Implemented but undocumented |
| 8 | Lead assigns event | coordinator_lead | Critical | Repository | Implemented but undocumented |
| 9 | Lead reassigns event | coordinator_lead | High | Repository | Implemented but undocumented |
| 10 | Event approved | approver | Critical | Repository | Clarification needed |
| 11 | Event rejected with reason | approver | Critical | Repository | Clarification needed |
| 12 | Attendee registers | attendee | Critical | Repository | Implemented but undocumented |
| 13 | Registration blocked by window | attendee | High | Repository | Implemented but undocumented |
| 14 | Attendee withdraws | attendee | High | Repository | Implemented but undocumented |
| 15 | Waitlist join | attendee | Medium | Repository | Implemented but undocumented |
| 16 | Change request approved | organiser/coordinator | High | Repository | Clarification needed |
| 17 | Cancellation request decided | organiser/coordinator | High | Repository | Clarification needed |
| 18 | Venue Staff creates venue | venue_staff | High | Repository | Implemented but undocumented |
| 19 | Booking requested and approved | coordinator/venue_staff | Critical | Repository | Implemented but undocumented |
| 20 | Booking rejected | venue_staff | High | Repository | Implemented but undocumented |
| 21 | Unavailability added and ended | venue_staff | Medium | Repository | Clarification needed |
| 22 | Tech Support creates equipment | tech_support | High | Repository | Implemented but undocumented |
| 23 | Equipment requested and reserved | coordinator/tech_support | Critical | Repository | Implemented but undocumented |
| 24 | Equipment cannot provide | tech_support | High | Repository | Implemented but undocumented |
| 25 | Safety changes requested | safety_officer | Critical | Repository | Implemented but undocumented |
| 26 | Safety approved | safety_officer | Critical | Repository | Implemented but undocumented |
| 27 | Registration report and export | organiser/coordinator | High | Repository | Implemented but undocumented |
| 28 | Report access refused | attendee/other organiser | High | Repository | Implemented but undocumented |
| 29 | Clarification thread | organiser/coordinator | Medium | Repository | Implemented but undocumented |
| 30 | Notification read | any | Medium | Repository | Implemented but undocumented |
| 31 | Coordinator availability | coordinator | Medium | Repository | Implemented but undocumented |

All flows use **Requirement source: Repository** because the briefs and clarification sheets are not in the repo.

---

## Smoke Test Pack

1. Flow 1: Successful login
2. Flow 6: Organiser creates and submits event
3. Flow 8: Lead assigns event
4. Flow 12: Attendee registers
5. Flow 19: Booking requested and approved
6. Flow 23: Equipment requested and reserved
7. Flow 25: Safety changes requested
8. Flow 26: Safety approved

---

## Full Regression Execution Order

1. Flows 1 to 5 (auth and access)
2. Flows 6 to 7 (event creation and editing)
3. Flows 8 to 11 (assignment and approval)
4. Flows 12 to 15 (registration)
5. Flows 16 to 17 (change and cancellation)
6. Flows 18 to 21 (venues)
7. Flows 22 to 24 (equipment)
8. Flows 25 to 26 (safety)
9. Flows 27 to 28 (reports)
10. Flows 29 to 31 (clarifications, notifications, settings)

---

## Requirements Gaps and Clarification Questions

1. **The Week 2 brief, Week 4 brief, and clarification Excel sheets are missing from the repository.**
   - Discovered: repository search for `*brief*`, `*clarif*`, `*.xlsx`, `*.docx`, `*.pdf`, `*week*`.
   - Impact: no requirement traceability. Every flow is sourced from the code.
   - Question: Please provide the Week 2 brief, Week 4 brief, and clarification sheets, or confirm where they are stored.

2. **Who approves an event (Flows 10 to 11)?** The approving role is not confirmed in the UI.
   - Question: Which role approves or rejects a submitted event: the Coordinator Lead, the Organiser, or another role?

3. **Who decides a cancellation request (Flow 17)?**
   - Question: Which role decides a cancellation request, and what statuses should the request have?

4. **Exact UI labels and form fields for create/edit flows (Flows 6, 18, 22)** were not verified in the component source.
   - Question: Please confirm the exact field labels and button labels for event, venue, and equipment forms.

5. **Notification delivery (Flows 19 to 20)** was not verified end to end.
   - Question: Should a coordinator receive an in-app notification when a booking is approved or rejected?

---

## Coverage Confirmation

**Covered:** authentication, role-based routing, event create/edit/approve/reject, lead assignment and reassignment, registration and waitlist, change and cancellation requests, venue booking, venue unavailability, equipment request and reservation, safety review, registration report, clarifications, notifications, coordinator availability.

**Not covered in this pass:**
- Password reset and profile editing: no route or UI found in `frontend/src/app/App.tsx`. Not implemented as a flow.
- Event search and filter on `/events`: not inspected in the component source.
- Completion record (`/api/events/:eventId/completion-record`) and event status history (`/status-history`): endpoints exist but flows are not written.
- Waitlist promotion, cancel-early-end, and equipment inventory edit/delete: partially listed but not written.
- Admin/user management: no route found.

These gaps are expected to close once the briefs and clarification sheets are supplied and the components are read in full.
