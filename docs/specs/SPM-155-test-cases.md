# SPM-155: Request Cancellation of My Event (Organiser) - Test Cases

| Field | Value |
|---|---|
| Story | SPM-155 Request Cancellation of My Event (Event Organiser) |
| Total test cases | 30 (AC1: 8, AC2: 6, AC3: 7, AC4: 5, AC5: 4) |
| By tier | Happy Path 6, Sad Path 7, Boundary 2, Cross-Cutting 4, Variation 11 |
| ID prefix | CANCEL-REQUEST, numbered by AC and lettered by case. The -A case of every AC is its Happy Path; the tier is stated in each table |
| Created By | Wei Zhi (Claude-assisted) |
| Date Created | 27 Oct 2026 |
| Version | 1.0 |
| Default status | Not Executed |
| Related | SPM-136 (Cancel an Event), SPM-123 (assignment), SPM-135, SPM-153, SPM-29 (notifications), SPM-94, SPM-48 |

---

## 0. Pre-Generation Checkpoint

### Confidence Tier: Medium

The ACs are clear on who can do what and on the two outcomes. Which statuses count as eligible, how an unassigned event is handled, whether a reason can be given, who is notified of the decision, and what happens when the event changes while a request is pending are not stated. They are flagged `[Sn]` in the affected cases.

### Missing Inputs (estimated and flagged)

| Input | Status | Value used in these cases |
|---|---|---|
| Eligible statuses | 'Not yet Completed or Cancelled' | Submitted, Under Review, Approved, Planning and Confirmed; Draft excluded; Rejected recorded [S3] |
| Reason text | Not specified | Optional, 0 to 500 characters (estimated) [S1] |
| Request on an unassigned Submitted event | Not specified | Allowed; stays pending until a Coordinator is assigned [S4] |
| Notifications of the decision | Not specified | Not asserted [S7] |
| API paths and error codes | Not specified | `POST /api/events/:id/cancellation-requests`; `POST /api/cancellation-requests/:id/decision`; 409 for conflicts [S1] |
| Error message wording | Not specified | Placeholder keys MSG-CR-xx; assert on key if wording differs |

### Assumptions

| ID | Assumption | Affects |
|---|---|---|
| S1 | The Organiser files a request with `POST /api/events/:id/cancellation-requests` (optional `reason`, 0 to 500 characters). The latest request is read with `GET /api/events/:id/cancellation-requests`. The Coordinator decides with `POST /api/cancellation-requests/:id/decision` and `{ "decision": "accept" | "decline" }` | All |
| S2 | One pending request per event at a time. After a decline the Organiser may file a new request. Earlier requests stay listed | AC1, AC2 |
| S3 | Eligible event statuses are Submitted, Under Review, Approved, Planning and Confirmed. Draft is not eligible (not submitted). Rejected follows the literal AC wording and is recorded for PO sign-off | AC1 |
| S4 | A request on an unassigned Submitted event is allowed and stays pending; only the assigned Coordinator can decide it once assigned | AC1, AC3 |
| S5 | The Organiser sees the request status (pending, accepted, declined) with dates on the event page and event list. An accepted request shows the event as Cancelled | AC2 |
| S6 | Acceptance runs the same cancellation as SPM-136: status Cancelled, bookings, holds and reservations released, registrations and waiting list Cancelled, in-app notifications | AC4 |
| S7 | Decline changes nothing on the event. Notifications of a decision to the Organiser, and of a new request to the Coordinator, are not stated and are not asserted | AC5 |
| S8 | A decision can be made once; later decisions return HTTP 409 | AC3 |
| S9 | Only the submitting Organiser can request cancellation; only the assigned Coordinator can decide. Lead (not assigned), other Organisers and Attendees get 403; no token gets 401 | AC1, AC3 |
| S10 | If the event becomes Completed while a request is pending, acceptance is refused. The final status of the request is recorded, not asserted | AC3 |
| S11 | If the Coordinator cancels the event directly while a request is pending, the request cannot be decided afterwards. Its final status is recorded, not asserted | AC3 |

### Message Catalogue (placeholders; assert on key if wording differs)

| Key | Text | HTTP |
|---|---|---|
| MSG-CR-01 | "Cancellation request sent to your Event Coordinator." | 201 |
| MSG-CR-02 | "This event can no longer be cancelled." | 409 |
| MSG-CR-03 | "You already have a pending cancellation request for this event." | 409 |
| MSG-CR-04 | "Cancellation request accepted. {eventName} is cancelled." | 200 |
| MSG-CR-05 | "Cancellation request declined." | 200 |
| MSG-CR-06 | "This request has already been decided." | 409 |
| MSG-CN-04 | "This event has been cancelled and its arrangements cannot be changed." (SPM-136) | 409 |
| MSG-08 | "You do not have permission to perform this action." (existing) | 403 |

### Open Questions for PO

1. AC1: is a Rejected event eligible for a cancellation request, as the AC wording allows? (S3)
2. AC1: what happens to a request on an unassigned Submitted event? (S4)
3. AC3: who is notified of a new request and of the decision? (S7)
4. AC3: what happens to a pending request when the event becomes Completed or is cancelled directly? (S10, S11)
5. AC1: is a reason required or optional, and how long may it be? (S1)
6. AC4: confirm that acceptance has all the effects of SPM-136 (release, notifications, registrations). (S6)

---

## 1. Shared Test Fixtures and Conventions

`T` = start of the test run, SGT. In automation use `futureIso(days, hour)` and `inputDate(days)` helpers. "T+1d 09:00" means the next calendar day at 09:00 SGT. Clone fixtures before tests that change state.

### Common Pre-Conditions (apply to every case)

| ID | Pre-condition |
|---|---|
| CP-1 | Database initialised with schema and the seed fixtures below; state-changing cases run on a clone |
| CP-2 | Backend reachable at the staging or local `/api` base URL; users authenticated with real JWTs (not mocked) |
| CP-3 | Controllable clock (fake timers or test clock) available for cases that state a clock |
| CP-4 | In-app notifications readable via `GET /notifications/me`; mail catcher running to confirm no email is sent |
| CP-5 | All times entered and displayed in SGT, stored in UTC |

### Named Test Data

REQ-OK = `{ "reason": "No longer needed" }` for an event submitted by ORG-01.


### Validation Constraints (backend truth, from the ACs and flagged estimates)

| Rule | Source |
|---|---|
| Request allowed only if the event is not Completed or Cancelled | AC1 |
| Request must come from the Organiser who submitted the event | AC1 |
| Decision by the assigned Coordinator only | AC3 |
| Declined request: status and arrangements unchanged | AC5 |
| Reason up to 500 characters | Estimated [S1] |

### Events

| Key | Name | Detail |
|---|---|---|
| EVT-1101 | Student Mixer | Submitted; unassigned; ORG-01 |
| EVT-1102 | Alumni Dinner | Under Review; COO-01 / ORG-01 |
| EVT-1103 | Hack Night | Approved; COO-01 / ORG-01 |
| EVT-1104 | Career Fair | Planning; COO-01 / ORG-01; VB-1104 Pending with tentative hold expiring T+2d 12:00 |
| EVT-1105 | Annual Gala Dinner | Confirmed; COO-01 / ORG-01; VB-1105a Main Hall and VB-1105b Breakout Room 1 Approved; EQ-1105 Projector x2 Reserved; ATT-01 to ATT-03 Confirmed; ATT-04 Waitlisted |
| EVT-1106 | Past Seminar | Completed; ORG-01 |
| EVT-1107 | Old Workshop | Cancelled; ORG-01 |
| EVT-1108 | Declined Request | Rejected; ORG-01 |
| EVT-1109 | Draft Concert | Draft; ORG-01 |
| EVT-1110 | Other Team Event | Planning; COO-02 / ORG-02 |
| EVT-1111 | Past Gala | Confirmed; ended T-3h; COO-01 / ORG-01 (used to complete the event while a request is pending) |

### Users

| Key | Role |
|---|---|
| ORG-01 Farid Rahman, ORG-02 Grace Lim | Event Organisers |
| COO-01 Daniel Koh, COO-02 Evelyn Goh | Event Coordinators |
| LEAD-01 Priya Nair | Event Coordinator Lead |
| ATT-01 to ATT-04 (ATT-01 Alice Tan, ATT-04 Dev Patel) | Attendees |

---

## 2. Test Case Matrix

| Ticket ID | Acceptance Criteria | Test Case ID | Related Code Module |
|---|---|---|---|
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-A | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-B | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-C | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-D | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-E | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-F | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-G | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC1 — Request cancellation of an event I submitted that is not yet Completed or Cancelled | CANCEL-REQUEST-01-H | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-A | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-B | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-C | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-D | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-E | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC2 — See whether my cancellation request is pending, accepted or declined | CANCEL-REQUEST-02-F | frontend/src/components/EventDetail/CancellationRequestPanel.tsx; frontend/src/pages/OrganiserEventList.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-A | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-B | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-C | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-D | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-E | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-F | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC3 — The assigned Event Coordinator can accept or decline the request | CANCEL-REQUEST-03-G | frontend/src/components/EventDetail/CancellationDecisionPanel.tsx; backend/src/events/cancellation-request.controller.ts; backend/src/events/cancellation-request.service.ts; backend/src/auth/auth.middleware.ts |
| SPM-155 | AC4 — Accepted request changes the event status to Cancelled | CANCEL-REQUEST-04-A | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts; backend/src/equipment/reservation.service.ts; backend/src/registrations/registrations.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-155 | AC4 — Accepted request changes the event status to Cancelled | CANCEL-REQUEST-04-B | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts; backend/src/equipment/reservation.service.ts; backend/src/registrations/registrations.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-155 | AC4 — Accepted request changes the event status to Cancelled | CANCEL-REQUEST-04-C | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts; backend/src/equipment/reservation.service.ts; backend/src/registrations/registrations.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-155 | AC4 — Accepted request changes the event status to Cancelled | CANCEL-REQUEST-04-D | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts; backend/src/equipment/reservation.service.ts; backend/src/registrations/registrations.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-155 | AC4 — Accepted request changes the event status to Cancelled | CANCEL-REQUEST-04-E | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts; backend/src/equipment/reservation.service.ts; backend/src/registrations/registrations.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-155 | AC5 — Declined request leaves the event's status and arrangements unchanged | CANCEL-REQUEST-05-A | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts |
| SPM-155 | AC5 — Declined request leaves the event's status and arrangements unchanged | CANCEL-REQUEST-05-B | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts |
| SPM-155 | AC5 — Declined request leaves the event's status and arrangements unchanged | CANCEL-REQUEST-05-C | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts |
| SPM-155 | AC5 — Declined request leaves the event's status and arrangements unchanged | CANCEL-REQUEST-05-D | backend/src/events/cancellation-request.service.ts; backend/src/events/status.service.ts; backend/src/venues/booking.service.ts |

---

## 3. Detailed Test Cases

### CANCEL-REQUEST-01-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-A |
| Related AC | AC1 (assumption S1) |
| Test Scenario | Verify that the Organiser can request cancellation of an Approved event they submitted. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 (Farid Rahman) authenticated with ORGANISER role<br>- EVT-1103 (Hack Night) status Approved; submitted by ORG-01; assigned to COO-01; no cancellation requests |
| Test Steps | 1. Sign in as ORG-01 → dashboard loads<br>2. Open /events/EVT-1103 → Request Cancellation action shown<br>3. Click Request Cancellation, enter the reason 'No longer needed' and submit → POST /api/events/EVT-1103/cancellation-requests sent<br>4. Inspect the response → HTTP 201; status pending; MSG-CR-01<br>5. Reload and call GET /api/events/EVT-1103 → status still Approved |
| Test Data | **Event:** EVT-1103 Hack Night; Approved<br>**Body:** `{ "reason": "No longer needed" }`<br>**User:** ORG-01 |
| Expected Result | - HTTP 201 with a request in status pending; MSG-CR-01 shown<br>- Event status remains Approved; venue, equipment and registrations unchanged<br>- DB: one cancellation request row for EVT-1103 by ORG-01 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-B |
| Related AC | AC1 (assumption S3) |
| Test Scenario | Verify that a cancellation request can be made for each eligible submitted status. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1102 (Under Review), EVT-1104 (Planning), EVT-1105 (Confirmed; two venues, equipment, registrations); no existing requests |
| Test Steps | Subtest A: request cancellation of EVT-1102 → HTTP 201 pending<br>Subtest B: request cancellation of EVT-1104 → HTTP 201 pending<br>Subtest C: request cancellation of EVT-1105 → HTTP 201 pending<br>After each subtest: read the event, its bookings, equipment and registrations → unchanged |
| Test Data | **Events:** EVT-1102, EVT-1104, EVT-1105<br>**Body:** `{ "reason": "No longer needed" }` |
| Expected Result | - All three requests are created as pending<br>- No event status, booking, hold, reservation or registration changes |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-C |
| Related AC | AC1 Related: CANCEL-EVENT-03-B |
| Test Scenario | Verify that a Completed or Cancelled event cannot be the subject of a cancellation request. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1106 Completed and EVT-1107 Cancelled, both submitted by ORG-01 |
| Test Steps | Subtest A: open EVT-1106 → no Request Cancellation action<br>Subtest B: open EVT-1107 → no Request Cancellation action<br>Subtest C: send POST /cancellation-requests for EVT-1106 and EVT-1107 → HTTP 409 MSG-CR-02<br>Query the DB → no request rows |
| Test Data | **Events:** EVT-1106, EVT-1107<br>**Body:** `{ "reason": "No longer needed" }` |
| Expected Result | - No action in the UI; the API refuses both requests with MSG-CR-02<br>- No request rows created |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-D |
| Related AC | AC1 (assumption S3) |
| Test Scenario | Verify the status boundaries around the AC wording: a Rejected event and an unsubmitted Draft. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1108 Rejected and EVT-1109 Draft, both owned by ORG-01 |
| Test Steps | Subtest A: request cancellation of EVT-1108 (Rejected) → record the result<br>Subtest B: request cancellation of EVT-1109 (Draft) → HTTP 409 or 404<br>Query the DB for request rows |
| Test Data | **Events:** EVT-1108 Rejected, EVT-1109 Draft |
| Expected Result | - A: the AC wording ('not yet Completed or Cancelled') allows it, so HTTP 201 pending is expected; record the actual behaviour and confirm with PO [S3]<br>- B: refused, because a Draft has not been submitted; no request row |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-E |
| Related AC | AC1 (assumption S9) |
| Test Scenario | Verify that only the Organiser who submitted the event can request its cancellation. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1103 submitted by ORG-01; sessions for ORG-02, COO-01, ATT-01 |
| Test Steps | Subtest A: ORG-02 sends POST /cancellation-requests for EVT-1103 → HTTP 403 (or 404)<br>Subtest B: COO-01 sends the same → HTTP 403<br>Subtest C: ATT-01 sends the same → HTTP 403<br>Subtest D: no token → HTTP 401<br>Subtest E: open EVT-1103 as ORG-02 and COO-01 → no Request Cancellation action<br>Query the DB → no request rows |
| Test Data | **Event:** EVT-1103<br>**Body:** `{ "reason": "No longer needed" }` |
| Expected Result | - Refused for A to D; no request rows<br>- The action is shown only to ORG-01 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-F

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-F |
| Related AC | AC1 (assumption S2) |
| Test Scenario | Verify that a second request cannot be created while one is pending, including simultaneous submissions. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1103 clone with no requests<br>- One pending request created in step 1 |
| Test Steps | 1. Send POST /cancellation-requests for EVT-1103 → HTTP 201 pending<br>2. Send the same request again → HTTP 409 MSG-CR-03<br>3. On a fresh clone send 5 parallel identical requests → one HTTP 201 and four HTTP 409<br>4. Double-click Submit in the UI on a fresh clone → one request |
| Test Data | **Event:** EVT-1103 clone<br>**Body:** `{ "reason": "No longer needed" }` |
| Expected Result | - Only one pending request exists per event<br>- The UI disables Submit after the first click |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-G

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-G |
| Related AC | AC1 (assumption S4) |
| Test Scenario | Verify the request for a Submitted event that has no Coordinator assigned yet. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1101 (Student Mixer) Submitted and unassigned; COO-01 and LEAD-01 authenticated |
| Test Steps | 1. ORG-01 requests cancellation of EVT-1101 → HTTP 201 pending<br>2. LEAD-01 and COO-01 try to accept the request → HTTP 403 (not assigned)<br>3. LEAD-01 assigns EVT-1101 to COO-01 (SPM-123) → assignment saved<br>4. COO-01 opens EVT-1101 → the pending request is visible and can be decided |
| Test Data | **Event:** EVT-1101<br>**Body:** `{ "reason": "No longer needed" }` |
| Expected Result | - The request stays pending until a Coordinator is assigned<br>- Nobody but the assigned Coordinator can decide it [S4] |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-01-H

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-01-H |
| Related AC | AC1 (assumption S1) |
| Test Scenario | Verify the optional reason: empty, at its limit, over its limit and with script text. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; EVT-1103 clones with no requests; limit is an estimate [S1] |
| Test Steps | Subtest A: no reason → HTTP 201<br>Subtest B: a reason of 500 characters → HTTP 201<br>Subtest C: a reason of 501 characters → HTTP 400 or 422 with a field error<br>Subtest D: reason '<script>alert(1)</script>' → stored and shown as plain text; no script runs |
| Test Data | **Reason limit (estimated):** 0 to 500 characters |
| Expected Result | - A and B accepted; C rejected with nothing saved<br>- D displays literally; no script runs |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationRequestPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-A |
| Related AC | AC2 Related: TRACK-EVENT-STATUS-01-A |
| Test Scenario | Verify that the Organiser sees a pending request on the event page and in the event list. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 authenticated; pending cancellation request on EVT-1103 created today |
| Test Steps | 1. Open /events/EVT-1103 → request status 'Pending' with the request date<br>2. Open the Organiser event list → EVT-1103 row shows a pending cancellation indicator<br>3. Call GET /api/events/EVT-1103/cancellation-requests → latest request with status pending |
| Test Data | **Event:** EVT-1103; request status pending |
| Expected Result | - Pending is shown in both places and in the API<br>- The event status itself is still Approved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-B |
| Related AC | AC2 |
| Test Scenario | Verify that the Organiser sees Accepted after the Coordinator accepts. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1105 (clone); ORG-01 has the event page open |
| Test Steps | 1. COO-01 accepts the request → HTTP 200<br>2. ORG-01 reloads the event page and list → request status 'Accepted'; event status Cancelled<br>3. Call GET cancellation-requests → status accepted with the decision date |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - The request shows Accepted and the event shows Cancelled in the page, the list and the API |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-C |
| Related AC | AC2 |
| Test Scenario | Verify that the Organiser sees Declined after the Coordinator declines. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1105 (clone); ORG-01 has the event page open |
| Test Steps | 1. COO-01 declines the request → HTTP 200<br>2. ORG-01 reloads the event page and list → request status 'Declined'; event status unchanged<br>3. Call GET cancellation-requests → status declined with the decision date |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - The request shows Declined; the event keeps its status (Confirmed) |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-D |
| Related AC | AC2 Related: TRACK-EVENT-STATUS-01-C |
| Test Scenario | Verify that an Organiser cannot see the cancellation request status of another Organiser's event. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1103 (ORG-01); sessions for ORG-02 and ATT-01 |
| Test Steps | 1. ORG-02 calls GET /api/events/EVT-1103/cancellation-requests → HTTP 403 (or 404); no data<br>2. ATT-01 calls the same → HTTP 403<br>3. Call with no token → HTTP 401<br>4. Open /events/EVT-1103 as ORG-02 → no request status shown |
| Test Data | **Event:** EVT-1103<br>**Users:** ORG-02, ATT-01 |
| Expected Result | - No request data is exposed to anyone except ORG-01 and the assigned Coordinator |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-E |
| Related AC | AC2 (assumption S2) |
| Test Scenario | Verify that after a declined request the Organiser can request again and sees the latest status with earlier ones kept. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone with one Declined request |
| Test Steps | 1. ORG-01 sends a new request → HTTP 201 pending<br>2. Open the event page → current request Pending; the earlier Declined request still listed<br>3. Coordinator accepts the new request → page shows Accepted |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - The newest request is shown as current; the Declined request remains in the list<br>- Only one request is pending at a time |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-02-F

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-02-F |
| Related AC | AC2 Related: TRACK-EVENT-STATUS-04-A, 04-B |
| Test Scenario | Verify that a refresh or a new session shows the latest request status. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- ORG-01 has /events/EVT-1103 open showing Pending |
| Test Steps | 1. COO-01 declines the request<br>2. ORG-01 reloads the page → Declined<br>3. Open the event in a new tab and after logging out and in → Declined<br>4. Inspect response headers → Cache-Control no-store |
| Test Data | **Event:** EVT-1103 clone |
| Expected Result | - Every reload and new session shows Declined; no stale Pending from a cache |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.controller.test.ts<br>frontend/tests/pages/OrganiserEventList.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-A |
| Related AC | AC3 (assumption S1) |
| Test Scenario | Verify that the assigned Coordinator can see and accept a pending cancellation request. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated and assigned to EVT-1105 (clone; Confirmed); pending request from ORG-01 |
| Test Steps | 1. Sign in as COO-01 and open /events/EVT-1105 → the pending cancellation request is shown with its reason<br>2. Click Accept → POST /api/cancellation-requests/{id}/decision sent<br>3. Inspect the response → HTTP 200 and MSG-CR-04<br>4. Read the request → status accepted; decidedBy COO-01; decision time set |
| Test Data | **Request:** pending on EVT-1105 clone<br>**Body:** `{ "decision": "accept" }`<br>**User:** COO-01 |
| Expected Result | - HTTP 200; request status accepted with decider and time recorded<br>- The event becomes Cancelled (see CANCEL-REQUEST-04-A) |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-B |
| Related AC | AC3 |
| Test Scenario | Verify that the assigned Coordinator can decline a pending cancellation request. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 assigned to EVT-1105 (clone); pending request from ORG-01 |
| Test Steps | 1. Open /events/EVT-1105 as COO-01 → pending request shown<br>2. Click Decline → POST /api/cancellation-requests/{id}/decision sent<br>3. Inspect the response → HTTP 200 and MSG-CR-05<br>4. Read the request → status declined; decidedBy COO-01 |
| Test Data | **Body:** `{ "decision": "decline" }`<br>**User:** COO-01 |
| Expected Result | - HTTP 200; request status declined with decider and time recorded<br>- The event status is unchanged (see CANCEL-REQUEST-05-A) |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-C |
| Related AC | AC3 |
| Test Scenario | Verify that only the assigned Coordinator can decide a request. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1105 (clone), assigned to COO-01<br>- Sessions for COO-02 (not assigned), LEAD-01 (not assigned), ORG-01 (requester), ATT-01 |
| Test Steps | Subtest A: COO-02 sends decision accept → HTTP 403 MSG-08<br>Subtest B: LEAD-01 sends decision accept → HTTP 403<br>Subtest C: ORG-01 sends decision accept for their own request → HTTP 403<br>Subtest D: ATT-01 sends the same → HTTP 403<br>Subtest E: no token → HTTP 401<br>After all subtests: read the request and the event → pending; status unchanged |
| Test Data | **Body:** `{ "decision": "accept" }` |
| Expected Result | - No one other than COO-01 can decide<br>- The Decision controls are not shown to A to D |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-D |
| Related AC | AC3 |
| Test Scenario | Verify that a request that has already been decided cannot be decided again. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clones with one Accepted and one Declined request |
| Test Steps | 1. Send decision decline on the Accepted request → HTTP 409 MSG-CR-06<br>2. Send decision accept on the Declined request → HTTP 409 MSG-CR-06<br>3. Read both requests and events → unchanged |
| Test Data | **Bodies:** `{ "decision": "decline" }`, `{ "decision": "accept" }` |
| Expected Result | - Both refused; the first decision stands; the event status is unchanged |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-E |
| Related AC | AC3 |
| Test Scenario | Verify that simultaneous accept and decline requests produce one decision. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1105 clone; COO-01 token |
| Test Steps | 1. Fire together: 3 accept and 3 decline requests → exactly one HTTP 200 and five HTTP 409<br>2. Read the request and the event → one final status; event status matches it<br>3. Check notifications and history → no duplicates |
| Test Data | **Requests:** 3 accept + 3 decline |
| Expected Result | - One decision only; the event is Cancelled only if the winning decision is accept<br>- No duplicate notifications or history rows |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-F

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-F |
| Related AC | AC3 (assumption S10) Related: COMPLETE-EVENT-02-F |
| Test Scenario | Verify the decision when the event is Completed while the request is pending. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1111 clone (Past Gala): Confirmed; ended T-3h; assigned to COO-01; submitted by ORG-01; pending cancellation request |
| Test Steps | 1. COO-01 marks the event as Completed (SPM-153) → HTTP 200<br>2. COO-01 sends decision accept on the pending request → HTTP 409 MSG-CR-02<br>3. Read the request and the event → record the request status; event stays Completed |
| Test Data | **Event:** EVT-1111 Past Gala; Confirmed; ended T-3h; pending request |
| Expected Result | - Acceptance is refused; the event is not cancelled<br>- The final status of the pending request is recorded for PO sign-off [S10] |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-03-G

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-03-G |
| Related AC | AC3 (assumption S11) Related: CANCEL-EVENT-01-A |
| Test Scenario | Verify the pending request when the Coordinator cancels the event directly. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- Pending request on EVT-1105 clone; COO-01 authenticated |
| Test Steps | 1. COO-01 cancels EVT-1105 directly (SPM-136) → HTTP 200<br>2. Read the pending request → record its status<br>3. Send decision accept on it → HTTP 409 |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - The event is Cancelled once; no second cancellation or duplicate notifications<br>- Final request status recorded for PO sign-off [S11] |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>frontend/tests/components/CancellationDecisionPanel.test.tsx |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-04-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-04-A |
| Related AC | AC4 Related: CANCEL-EVENT-03-A |
| Test Scenario | Verify that accepting a request changes the event status to Cancelled everywhere it is shown. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 assigned to EVT-1105 (clone; Confirmed); pending request from ORG-01 |
| Test Steps | 1. COO-01 accepts the request → HTTP 200<br>2. Open the planning page, the Coordinator queue and ORG-01's event list → status Cancelled<br>3. Reload each; query the DB → Cancelled |
| Test Data | **Event:** EVT-1105 clone; Confirmed to Cancelled |
| Expected Result | - Badge Cancelled in all three views, before and after reload<br>- DB status Cancelled |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>backend/tests/events/cancel.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-04-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-04-B |
| Related AC | AC4 (assumption S6) Related: CANCEL-EVENT-04-A, 05-A, 06-A, 08-A |
| Test Scenario | Verify that accepting a request triggers the same cancellation effects as SPM-136. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone Confirmed: VB-1105a and VB-1105b Approved; EQ-1105 Projector x2 Reserved; ATT-01 to ATT-03 Confirmed; ATT-04 Waitlisted; pending request |
| Test Steps | 1. COO-01 accepts the request → HTTP 200<br>2. Query bookings and equipment → released<br>3. Query registrations and waiting list → Cancelled<br>4. Check notifications for ORG-01, COO-01, ATT-01 to ATT-04 → one each |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - Venue bookings and holds and equipment reservations are released<br>- Registrations and waiting list entries show Cancelled; recipients notified once |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>backend/tests/events/cancel.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-04-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-04-C |
| Related AC | AC4 Related: CANCEL-EVENT-04-C |
| Test Scenario | Verify that a failure during cancellation leaves the request pending and the event unchanged. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone with a pending request<br>- Fault injected into the equipment release |
| Test Steps | 1. COO-01 accepts the request → HTTP 500 with a generic message and no stack trace<br>2. Query the request, event, bookings and notifications → request pending; status Confirmed; bookings unchanged; no notifications<br>3. Remove the fault and accept again → HTTP 200 |
| Test Data | **Fault:** stub throws in reservation.service.ts |
| Expected Result | - No half-cancelled event; the retry succeeds |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>backend/tests/events/cancel.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-04-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-04-D |
| Related AC | AC4 |
| Test Scenario | Verify that acceptance cancels the event from each eligible status. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 assigned to EVT-1102 (Under Review), EVT-1103 (Approved), EVT-1104 (Planning, with hold), EVT-1105 (Confirmed); each has a pending request (clones) |
| Test Steps | Subtest A to D: accept the request on each event → HTTP 200<br>Read each event → status Cancelled |
| Test Data | **Events:** EVT-1102, EVT-1103, EVT-1104, EVT-1105 |
| Expected Result | - Every event becomes Cancelled; the active hold on EVT-1104 is released |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>backend/tests/events/cancel.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-04-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-04-E |
| Related AC | AC4 Related: CANCEL-EVENT-07-A |
| Test Scenario | Verify that a cancelled event accepts no further requests, decisions or arrangement changes. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone cancelled through an accepted request |
| Test Steps | 1. ORG-01 sends a new cancellation request → HTTP 409 MSG-CR-02<br>2. COO-01 sends a decision on the old request → HTTP 409 MSG-CR-06<br>3. COO-01 changes a venue booking → HTTP 409 MSG-CN-04 |
| Test Data | **Event:** EVT-1105 clone (Cancelled) |
| Expected Result | - All three refused; the event remains Cancelled |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts<br>backend/tests/events/cancel.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-05-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-05-A |
| Related AC | AC5 |
| Test Scenario | Verify that declining a request leaves the event's status and arrangements unchanged. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone Confirmed: VB-1105a and VB-1105b Approved; EQ-1105 Projector x2 Reserved; ATT-01 to ATT-03 Confirmed; ATT-04 Waitlisted; pending request<br>- Snapshot of the event, bookings, reservations and registrations |
| Test Steps | 1. COO-01 declines the request → HTTP 200<br>2. Read the event, bookings, equipment and registrations → equal the snapshot |
| Test Data | **Event:** EVT-1105 clone<br>**Body:** `{ "decision": "decline" }` |
| Expected Result | - Status stays Confirmed; both venue bookings stay Approved; reservations stay Reserved<br>- Registrations and the waiting list entry are unchanged<br>- The request status is declined |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-05-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-05-B |
| Related AC | AC5 Related: MONITOR-QUEUE-08-A |
| Test Scenario | Verify that declining does not disturb a Planning event with an active tentative venue hold. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1104 clone Planning with VB-1104 Pending and a tentative hold expiring T+2d 12:00; pending request |
| Test Steps | 1. COO-01 declines the request → HTTP 200<br>2. Read the event and the hold → status Planning; hold still active with the same expiry<br>3. Open the Coordinator queue → hold shown as active |
| Test Data | **Event:** EVT-1104 clone |
| Expected Result | - Status, booking and hold are unchanged; the hold expiry time is not reset or released |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-05-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-05-C |
| Related AC | AC5 (assumption S7) |
| Test Scenario | Verify that declining sends no cancellation notices and writes no status change. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1105 clone with a pending request; ATT-01 to ATT-04 with zero unread notifications |
| Test Steps | 1. COO-01 declines the request → HTTP 200<br>2. Check notifications of ATT-01 to ATT-04 → none<br>3. Read the status history → no new row |
| Test Data | **Event:** EVT-1105 clone |
| Expected Result | - No cancellation notification to Attendees or the waiting list<br>- No status history row |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---

### CANCEL-REQUEST-05-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CANCEL-REQUEST-05-D |
| Related AC | AC5 Related: CONFIRM-EVENT-01-A |
| Test Scenario | Verify that the event continues its normal lifecycle after a declined request. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-1104 clone Planning with arrangements complete; declined request |
| Test Steps | 1. COO-01 confirms the event (SPM-135) → HTTP 200<br>2. ORG-01 sends a new cancellation request → HTTP 201 pending |
| Test Data | **Event:** EVT-1104 clone |
| Expected Result | - The event becomes Confirmed; a new request can be made after a declined one |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Event Service | backend/tests/events/cancellation-request.service.test.ts |

Automation status: proposed; the test file(s) above are not yet written.

**Test case results**

| Item | Description |
|---|---|
| Actual Result | Not executed |
| Pass/Fail | Not executed |
| Test bodies | Not executed |
| Executed By | |
| Date of Execution | |

---
