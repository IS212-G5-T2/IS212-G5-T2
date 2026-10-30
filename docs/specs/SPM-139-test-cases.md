# SPM-139: Configure Event Registration Period and Capacity - Test Cases

| Field | Value |
|---|---|
| Story | SPM-139 Configure Event Registration Period and Capacity (Event Coordinator) |
| Total test cases | 50 (AC1: 6, AC2: 4, AC3: 3, AC4: 5, AC5: 4, AC6: 4, AC7: 4, AC8: 5, AC9: 9, AC10: 3, Cross-cutting: 3) |
| By tier | Happy Path 11, Sad Path 12, Boundary 5, Cross-Cutting 11, Variation 11 |
| ID prefix | CONFIG-REG, numbered by AC and lettered by case. The -A case of every AC is its Happy Path; the tier is stated in each table |
| Created By | Wei Zhi (Claude-assisted) |
| Date Created | 27 Oct 2026 |
| Version | 2.0 (rebuilt from the revised ACs of SPM-139; replaces v1.1) |
| Default status | Not Executed |
| Related | SPM-61, SPM-99, SPM-138 (depend on this story); SPM-136 (cancelled events); SPM-135 and SPM-148 (status rules); SPM-120 (withdrawal) |

---

## 0. Pre-Generation Checkpoint

### Confidence Tier: Medium

The revised ACs fix the status gate, the two time rules, the capacity type and the switch-off behaviour. The endpoint, the boundary at the start time, whether enabling needs every field, the behaviour of a switched-off event with a waiting list, and the removed-entry status label are not stated. They are flagged `[Rn]` in the affected cases.

### What changed from v1.1

| Area | v1.1 | v2.0 |
|---|---|---|
| Status rule | Cancelled and Rejected blocked; Completed left open [R2] | Only Approved, Planning and Confirmed allowed (AC4); Completed, Submitted, Under Review, Cancelled and Rejected blocked |
| Change after saving | Separate AC6 | Part of AC4 (change allowed in the three statuses) |
| Time rules | Closing after opening and closing before start in one AC (AC4) | Split: AC5 (closing after opening) and AC6 (closing after start) |
| Capacity type | AC5 | AC7, same rule |
| Minimum capacity | AC7 | AC8, same rule |
| Waiting list promotion | AC8 | AC9, same rule |
| Switch-off behaviour | Covered only in AC1 variation | Separate AC10: Confirmed keep their place; waiting list entries removed |

### Missing Inputs (estimated and flagged)

| Input | Status | Value used in these cases |
|---|---|---|
| Closing exactly at the event start | Not specified (AC6 says 'closes after the event starts') | Accepted [R3] |
| Opening time in the past | Not specified | Accepted [R4] |
| Fields required to turn registration on | Not specified | Opening, closing and capacity [R6] |
| Capacity range | Positive whole number (AC7); upper bound not stated | 1 to 2147483647 (estimated) [R5] |
| Behaviour on a switched-off event with a waiting list | Not specified | Recorded, not asserted [R6] |
| Notification on waiting list removal | Not specified | Recorded, not asserted [R8] |
| API paths, field names, error codes | Not specified | Estimated from existing registration endpoints [R1] |
| Error message wording | Not specified | Placeholder keys MSG-CFG-xx |

### Assumptions

| ID | Assumption | Affects |
|---|---|---|
| R1 | Settings are read with `GET /api/events/:id/registration-settings` and saved with `PUT` on the same path. Fields: `registrationEnabled`, `registrationOpensAt`, `registrationClosesAt`, `capacity` | All |
| R2 | Validation order: authentication, assigned Coordinator, event status (only Approved, Planning, Confirmed allowed; others return HTTP 409 MSG-CFG-09), field validation, capacity against Confirmed | AC1, AC4 |
| R3 | Closing time must be on or before the event start, so a closing time exactly equal to the start is valid | AC6 |
| R4 | An opening time in the past is valid and opens registration immediately | AC2 |
| R5 | Capacity is a whole number from 1 up to 2147483647 (estimated). Surrounding spaces are trimmed; numeric strings follow the API convention | AC7 |
| R6 | Registration is off by default. Turning it on requires opening time, closing time and capacity. Switching it off keeps saved values. Behaviour of a switched-off event with a waiting list is recorded, not asserted | AC1, AC9 |
| R8 | Minimum capacity = Confirmed registrations; Waitlisted, Withdrawn and Cancelled are not counted. Entries removed by switching off show the status label Removed; no notification is asserted | AC8, AC10 |
| R9 | Capacity increase and promotion of the earliest waitlisted Attendees (join time) are saved in one transaction. Promotion uses the SPM-138 rules; notifications are in-app only | AC9 |
| R10 | Concurrent changes are protected by a shared transaction or lock and by optimistic locking (HTTP 409 on a stale save) | AC4, AC8, AC9 |
| R11 | Only the assigned Coordinator can read or change settings. Lead (not assigned), Organiser and Attendee get 403; no token gets 401 | AC1 |

### Message Catalogue (placeholders; assert on key if wording differs)

| Key | Text | HTTP |
|---|---|---|
| MSG-CFG-01 | "Registration settings saved." | 200 |
| MSG-CFG-02 | "Registration closing time must be after the opening time." | 422 |
| MSG-CFG-03 | "Registration must close on or before the event start time." | 422 |
| MSG-CFG-04 | "Set the registration period and capacity before turning registration on." | 422 |
| MSG-CFG-05 | "Capacity must be a positive whole number." | 400 or 422 |
| MSG-CFG-07 | "Capacity cannot be lower than the number of Confirmed registrations (50)." | 422 |
| MSG-CFG-09 | "Registration details can only be set while the event is Approved, Planning or Confirmed." | 409 |
| MSG-CFG-10 | "These settings were changed elsewhere. Reload and try again." | 409 |
| MSG-02 / MSG-08 | Registration not yet open / no permission (existing) | 422 / 403 |

### Open Questions for PO

1. AC9: confirm that a capacity increase moves the earliest waitlisted Attendees automatically (decided on the PO's behalf).
2. AC6: may registration close exactly at the event start time? (R3)
3. AC1: must opening time, closing time and capacity all be set before registration is turned on? (R6)
4. AC9 and AC10: what happens to the waiting list when registration is switched off, and does the Attendee get a notice? (R6, R8)
5. AC2: is an opening time in the past allowed? AC7: is there an upper limit on capacity? (R4, R5)

---

## 1. Shared Test Fixtures and Conventions

`T` = start of the test run, SGT. "T+1d 09:00" means the next calendar day at 09:00 SGT. Clone fixtures before tests that change state.

### Common Pre-Conditions (apply to every case)

| ID | Pre-condition |
|---|---|
| CP-1 | Database initialised with schema and the seed fixtures below; state-changing cases run on a clone |
| CP-2 | Backend reachable at the staging or local `/api` base URL; users authenticated with real JWTs (not mocked) |
| CP-3 | Controllable clock (fake timers or test clock) for cases that state a clock |
| CP-4 | In-app notifications readable via `GET /notifications/me`; mail catcher running to confirm no email is sent |
| CP-5 | All times entered and displayed in SGT, stored in UTC |

### Named Test Data

SET-OK = `{ "registrationEnabled": true, "registrationOpensAt": "T+1d 09:00", "registrationClosesAt": "T+10d 23:59", "capacity": 50 }` for an event that starts T+20d 18:00 SGT (EVT-901).

### Events

| Key | Name | Detail |
|---|---|---|
| EVT-901 | Community Forum | Planning; COO-01 / ORG-01; starts T+20d 18:00-21:00; no registration settings; Main Hall (venue capacity 100) |
| EVT-902 | Open Lab Day | Planning; enabled; T-1d to T+10d 23:59; capacity 10; Confirmed ATT-01 to ATT-05; Withdrawn ATT-09, ATT-10 |
| EVT-903 | Gala Waitlist Night | Planning; enabled and open; capacity 5 full (ATT-01, ATT-02, ATT-03, ATT-11, ATT-12 Confirmed); waiting list ATT-04 (1), ATT-05 (2), ATT-06 (3) |
| EVT-904 | Tech Showcase | Planning; enabled; capacity 5; 3 Confirmed; empty waiting list |
| EVT-905 | Old Workshop | Cancelled; saved settings |
| EVT-906 | Declined Request | Rejected |
| EVT-907 | Student Mixer | Approved |
| EVT-909 | Orientation Talk | Confirmed |
| EVT-911 | Other Team Event | Planning; assigned COO-02 |
| EVT-912 | Reopen Fair | Planning; closing passed at T-1d; waiting list entries removed at close |
| EVT-1201 | Campus Fair | Submitted; COO-01 assigned |
| EVT-1202 | Alumni Lunch | Under Review; COO-01 assigned |
| EVT-1203 | Past Seminar | Completed; COO-01 assigned |

### Users

| Key | Role |
|---|---|
| COO-01 Daniel Koh, COO-02 Evelyn Goh | Event Coordinators |
| LEAD-01 Priya Nair | Event Coordinator Lead |
| ORG-01 Farid Rahman | Event Organiser |
| ATT-01 Alice Tan, ATT-04 Dev Patel, ATT-05 Eva Chua, ATT-06 Farah Aziz, ATT-07 Gary Ong, ATT-09 to ATT-12; ATT-100 to ATT-599 (scale case) | Attendees |

---

## 2. Test Case Matrix

| Ticket ID | Acceptance Criteria | Test Case ID | Related Code Module |
|---|---|---|---|
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.controller.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-B | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/registration-window.ts; frontend/src/components/EventDetail/RegistrationSection.tsx |
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-C | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-D | backend/src/auth/auth.middleware.ts; backend/src/registrations/registration-settings.controller.ts |
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-E | backend/src/registrations/registration-settings.validation.ts; frontend/src/components/EventDetail/RegistrationSettingsForm.tsx |
| SPM-139 | I can turn registration on or off for an event assigned to me | CONFIG-REG-01-F | backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSection.tsx |
| SPM-139 | I can set the registration opening and closing date and time | CONFIG-REG-02-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | I can set the registration opening and closing date and time | CONFIG-REG-02-B | backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSettingsForm.tsx |
| SPM-139 | I can set the registration opening and closing date and time | CONFIG-REG-02-C | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-window.ts |
| SPM-139 | I can set the registration opening and closing date and time | CONFIG-REG-02-D | backend/src/registrations/registration-settings.validation.ts; frontend/src/components/EventDetail/RegistrationSettingsForm.tsx |
| SPM-139 | I can set the maximum number of Attendees who can register | CONFIG-REG-03-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSection.tsx |
| SPM-139 | I can set the maximum number of Attendees who can register | CONFIG-REG-03-B | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | I can set the maximum number of Attendees who can register | CONFIG-REG-03-C | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I can set or change registration details only while Approved, Planning or Confirmed | CONFIG-REG-04-A | backend/src/registrations/registration-settings.service.ts |
| SPM-139 | I can set or change registration details only while Approved, Planning or Confirmed | CONFIG-REG-04-B | backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSettingsForm.tsx |
| SPM-139 | I can set or change registration details only while Approved, Planning or Confirmed | CONFIG-REG-04-C | backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSection.tsx |
| SPM-139 | I can set or change registration details only while Approved, Planning or Confirmed | CONFIG-REG-04-D | backend/src/registrations/registration-settings.service.ts; backend/src/events/status.service.ts |
| SPM-139 | I can set or change registration details only while Approved, Planning or Confirmed | CONFIG-REG-04-E | backend/src/registrations/registration-settings.controller.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | I receive an error if the registration closing time is not after the opening time | CONFIG-REG-05-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if the registration closing time is not after the opening time | CONFIG-REG-05-B | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if the registration closing time is not after the opening time | CONFIG-REG-05-C | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-settings.controller.ts |
| SPM-139 | I receive an error if the registration closing time is not after the opening time | CONFIG-REG-05-D | backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if registration closes after the event starts | CONFIG-REG-06-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if registration closes after the event starts | CONFIG-REG-06-B | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if registration closes after the event starts | CONFIG-REG-06-C | backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if registration closes after the event starts | CONFIG-REG-06-D | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-settings.controller.ts |
| SPM-139 | I receive an error if the registration capacity is not a positive whole number | CONFIG-REG-07-A | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if the registration capacity is not a positive whole number | CONFIG-REG-07-B | frontend/src/components/EventDetail/RegistrationSettingsForm.tsx; backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I receive an error if the registration capacity is not a positive whole number | CONFIG-REG-07-C | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-settings.controller.ts |
| SPM-139 | I receive an error if the registration capacity is not a positive whole number | CONFIG-REG-07-D | backend/src/registrations/registration-settings.validation.ts |
| SPM-139 | I cannot reduce the registration capacity below the number of Confirmed registrations | CONFIG-REG-08-A | backend/src/registrations/registration-settings.service.ts; frontend/src/components/EventDetail/RegistrationSettingsForm.tsx |
| SPM-139 | I cannot reduce the registration capacity below the number of Confirmed registrations | CONFIG-REG-08-B | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/waitlist.service.ts |
| SPM-139 | I cannot reduce the registration capacity below the number of Confirmed registrations | CONFIG-REG-08-C | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | I cannot reduce the registration capacity below the number of Confirmed registrations | CONFIG-REG-08-D | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | I cannot reduce the registration capacity below the number of Confirmed registrations | CONFIG-REG-08-E | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-A | backend/src/registrations/promotion.service.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-B | backend/src/registrations/promotion.service.ts; frontend/src/components/EventDetail/RegistrationSection.tsx |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-C | backend/src/registrations/promotion.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-D | backend/src/registrations/promotion.service.ts; backend/src/registrations/waitlist.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-E | backend/src/notifications/notifications.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-F | backend/src/registrations/promotion.service.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-G | backend/src/registrations/promotion.service.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-H | backend/src/registrations/promotion.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-139 | Capacity increase moves the earliest waitlisted Attendees into new spots | CONFIG-REG-09-I | backend/src/registrations/promotion.service.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | Switching off keeps registered Attendees and removes waiting list entries | CONFIG-REG-10-A | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/waitlist.service.ts |
| SPM-139 | Switching off keeps registered Attendees and removes waiting list entries | CONFIG-REG-10-B | backend/src/registrations/registration-settings.service.ts; backend/src/registrations/waitlist.service.ts |
| SPM-139 | Switching off keeps registered Attendees and removes waiting list entries | CONFIG-REG-10-C | backend/src/registrations/registration-settings.service.ts; backend/src/notifications/notifications.service.ts |
| SPM-139 | Saved settings drive Attendee-facing behaviour | CONFIG-REG-11-A | frontend/src/components/EventDetail/RegistrationSection.tsx; backend/src/registrations/registration-window.ts; backend/src/registrations/registrations.service.ts |
| SPM-139 | Registration capacity is independent of venue capacity | CONFIG-REG-11-B | backend/src/registrations/registration-settings.validation.ts; backend/src/registrations/registration-settings.service.ts |
| SPM-139 | Server-controlled fields are ignored | CONFIG-REG-11-C | backend/src/registrations/registration-settings.controller.ts; backend/src/registrations/registration-settings.service.ts |

---

## 3. Detailed Test Cases

### CONFIG-REG-01-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-A |
| Related AC | AC1 — Turn registration on or off for an event assigned to me (assumption R1) |
| Test Scenario | Verify that the assigned Coordinator can turn registration on by saving a period and capacity. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated with COORDINATOR role and assigned to EVT-901<br>- EVT-901 status Planning; starts T+20d 18:00 SGT; no registration settings |
| Test Steps | 1. Sign in as COO-01 → dashboard loads<br>2. Open /events/EVT-901/planning → Registration settings shows Disabled<br>3. Switch Registration to Enabled, enter opening T+1d 09:00, closing T+10d 23:59 and capacity 50 → no field errors<br>4. Click Save → HTTP 200 and MSG-CFG-01<br>5. Reload and call GET /api/events/EVT-901/registration-settings → values equal SET-OK |
| Test Data | **Event:** EVT-901 Community Forum<br>**SET-OK:** `{ "registrationEnabled": true, "registrationOpensAt": "T+1d 09:00", "registrationClosesAt": "T+10d 23:59", "capacity": 50 }`<br>**User:** COO-01 |
| Expected Result | - HTTP 200; MSG-CFG-01 shown<br>- After reload the form shows Enabled with the saved period and capacity |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.controller.test.ts<br>frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-01-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-B |
| Related AC | AC1 — Turn registration on or off for an event assigned to me Related: EVENT-REG-01-C |
| Test Scenario | Verify that switching registration off hides Register from Attendees and keeps the saved period and capacity. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 Planning; enabled; window T-1d to T+10d 23:59; capacity 10; Confirmed ATT-01 to ATT-05<br>- COO-01 assigned; ATT-06 authenticated |
| Test Steps | 1. Sign in as COO-01 and switch Registration to Disabled → Save → HTTP 200<br>2. Call GET registration-settings → registrationEnabled false; period and capacity unchanged<br>3. As ATT-06 open /events/EVT-902 → no Register button; text that registration is not available<br>4. Send POST /api/events/EVT-902/registrations as ATT-06 → HTTP 422<br>5. Check ATT-01 to ATT-05 → still Confirmed |
| Test Data | **Event:** EVT-902 Open Lab Day<br>**Change:** registrationEnabled true to false<br>**Users:** COO-01, ATT-06 |
| Expected Result | - Settings saved; period and capacity kept<br>- Register hidden; direct POST refused<br>- ATT-01 to ATT-05 remain Confirmed |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts<br>frontend/tests/components/RegistrationSection.test.tsx |

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

### CONFIG-REG-01-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-C |
| Related AC | AC1 — Turn registration on or off for an event assigned to me (assumption R6) |
| Test Scenario | Verify that an event with no registration settings has registration off. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 clone Planning with no settings; ATT-06 authenticated |
| Test Steps | 1. Call GET registration-settings as COO-01 → registrationEnabled false; no period or capacity<br>2. As ATT-06 open /events/EVT-901 → no Register button<br>3. Send POST /api/events/EVT-901/registrations as ATT-06 → HTTP 422 |
| Test Data | **Event:** EVT-901 clone<br>**User:** ATT-06 Farah Aziz |
| Expected Result | - Registration off by default; Register hidden; direct POST refused |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-01-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-D |
| Related AC | AC1 — Turn registration on or off for an event assigned to me (assumption R11) |
| Test Scenario | Verify that only the Coordinator assigned to the event can read or change its registration settings. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 assigned to COO-01<br>- Sessions for COO-02, LEAD-01 (not assigned), ORG-01, ATT-01 |
| Test Steps | Subtest A: COO-02 sends GET and PUT on EVT-901 → HTTP 403 MSG-08<br>Subtest B: LEAD-01 sends the same → HTTP 403<br>Subtest C: ORG-01 sends the same → HTTP 403<br>Subtest D: ATT-01 sends the same → HTTP 403<br>Subtest E: no token → HTTP 401<br>Call GET as COO-01 → settings unchanged |
| Test Data | **Body:** SET-OK |
| Expected Result | - A to D: HTTP 403; E: HTTP 401<br>- Settings unchanged; the settings section is not shown to A to D |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/auth/auth.middleware.test.ts<br>backend/tests/registrations/registration-settings.controller.test.ts |

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

### CONFIG-REG-01-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-E |
| Related AC | AC1 — Turn registration on or off for an event assigned to me (assumption R6) |
| Test Scenario | Verify that registration cannot be turned on until the opening time, closing time and capacity are all set. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 clone Planning with no settings; COO-01 authenticated |
| Test Steps | Subtest A: enable with opening and closing but no capacity → HTTP 422 MSG-CFG-04 naming capacity<br>Subtest B: enable with no opening → HTTP 422 MSG-CFG-04 naming the opening time<br>Subtest C: enable with no closing → HTTP 422 MSG-CFG-04 naming the closing time<br>Subtest D: save disabled with all three empty → HTTP 200<br>After A to C: GET settings → nothing saved |
| Test Data | **Body base:** SET-OK with the named field omitted per subtest |
| Expected Result | - A to C refused with the missing field named; D accepted |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts<br>frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-01-F

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-01-F |
| Related AC | AC1 — Turn registration on or off for an event assigned to me |
| Test Scenario | Verify that turning registration back on restores the saved settings and Attendee behaviour. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone disabled with its saved period and capacity 10; ATT-06 authenticated |
| Test Steps | 1. Sign in as COO-01 → Registration settings shows the saved period and capacity<br>2. Switch to Enabled → Save → HTTP 200<br>3. Call GET → values equal those before switching off<br>4. As ATT-06 open /events/EVT-902 → Register shown; 5 of 10 places taken |
| Test Data | **Event:** EVT-902 clone<br>**User:** COO-01, ATT-06 |
| Expected Result | - Settings equal the pre-switch values; Register available again |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts<br>frontend/tests/components/RegistrationSection.test.tsx |

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

### CONFIG-REG-02-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-02-A |
| Related AC | AC2 — Set the registration opening and closing date and time |
| Test Scenario | Verify that the Coordinator can set and save the opening and closing date and time. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning with no settings; starts T+20d 18:00 SGT |
| Test Steps | 1. Open the Registration settings → form empty<br>2. Enter opening T+1d 09:00, closing T+10d 23:59 and capacity 50 → no field errors<br>3. Click Save → HTTP 200 and MSG-CFG-01<br>4. Reload → the same values are shown in SGT<br>5. Call GET → values equal the saved ones; closing is before the start |
| Test Data | **Opens:** T+1d 09:00 SGT<br>**Closes:** T+10d 23:59 SGT<br>**Capacity:** 50 |
| Expected Result | - Saved and shown back correctly |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx<br>backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-02-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-02-B |
| Related AC | AC2 — Set the registration opening and closing date and time |
| Test Scenario | Verify that times entered in SGT are stored in UTC and shown back in SGT across a date boundary. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone with start moved to 2026-12-01 18:00 SGT |
| Test Steps | 1. Enter opening 2026-11-11 00:30 SGT and closing 2026-11-20 23:59 SGT; Save → HTTP 200<br>2. Query the DB → opening stored as 2026-11-10T16:30:00Z<br>3. Reload → UI shows 11 Nov 2026 00:30 SGT<br>4. Call GET → UTC value returned |
| Test Data | **Opens:** 2026-11-11 00:30 SGT (2026-11-10T16:30:00Z)<br>**Closes:** 2026-11-20 23:59 SGT |
| Expected Result | - DB in UTC; UI and API consistent with SGT |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-02-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-02-C |
| Related AC | AC2 — Set the registration opening and closing date and time (assumption R4) |
| Test Scenario | Verify that an opening time in the past is accepted and registration opens immediately. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning; ATT-06 authenticated |
| Test Steps | 1. Save opening T-1h, closing T+10d 23:59, capacity 50 → HTTP 200<br>2. As ATT-06 open /events/EVT-901 → Register and the closing date shown |
| Test Data | **Opens:** T-1h SGT<br>**Closes:** T+10d 23:59 SGT |
| Expected Result | - Save accepted; registration open at once |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-02-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-02-D |
| Related AC | AC2 — Set the registration opening and closing date and time |
| Test Scenario | Verify that missing or invalid date and time values are rejected and the other values are kept. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone; registration set to Enabled in the form |
| Test Steps | Subtest A: clear the opening time and Save → error on opening; capacity and closing kept<br>Subtest B: clear the closing time and Save → error on closing; opening and capacity kept<br>Subtest C: PUT with opening 'not-a-date' → HTTP 400 naming registrationOpensAt<br>Subtest D: PUT with opening '2026-13-45T25:61' → HTTP 400 naming registrationOpensAt<br>After each subtest → nothing saved |
| Test Data | **Base:** SET-OK with the named value cleared or replaced |
| Expected Result | - Field-specific errors; nothing saved; values retained in the form |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts<br>frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-03-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-03-A |
| Related AC | AC3 — Set the maximum number of Attendees who can register Related: SPM-99, EVENT-REG-01-A |
| Test Scenario | Verify that the capacity is saved and shown on the event page as available places. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone with a valid period |
| Test Steps | 1. Enter capacity 50 → Save → HTTP 200<br>2. Reload and call GET → capacity 50<br>3. As ATT-06 open /events/EVT-901 → 50 places in total, 50 available |
| Test Data | **Capacity:** 50 |
| Expected Result | - Capacity saved and shown as 50 total, 50 available |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSection.test.tsx<br>backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-03-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-03-B |
| Related AC | AC3 — Set the maximum number of Attendees who can register (assumption R5) |
| Test Scenario | Verify the smallest and a very large valid capacity, and that a capacity of 1 fills after one registration. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clones with 0 Confirmed registrations; ATT-06 and ATT-07 authenticated |
| Test Steps | Subtest A: save capacity 1 → HTTP 200<br>Subtest B: save capacity 100000 → HTTP 200<br>Subtest C: ATT-06 registers on the capacity-1 event → Confirmed; ATT-07 opens the event → full with Join Waiting List |
| Test Data | **Capacities:** 1, 100000 |
| Expected Result | - A and B saved; C shows the event full after one registration |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-03-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-03-C |
| Related AC | AC3 — Set the maximum number of Attendees who can register |
| Test Scenario | Verify that a save with an invalid closing time is refused as a whole, so the capacity is not partly saved. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone with saved capacity 10 and closing T+10d 23:59 |
| Test Steps | 1. Send PUT with capacity 80 and opening equal to closing → HTTP 422 MSG-CFG-02<br>2. Call GET → capacity still 10; closing unchanged |
| Test Data | **Body:** `{ "registrationEnabled": true, "registrationOpensAt": "T+5d 09:00", "registrationClosesAt": "T+5d 09:00", "capacity": 80 }` |
| Expected Result | - Refused as a whole; nothing saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-04-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-04-A |
| Related AC | AC4 — Set or change registration details only while Approved, Planning or Confirmed Related: SPM-135 (Confirmed) and SPM-148 (Planning) |
| Test Scenario | Verify that the Coordinator can set registration details on an event in each allowed status. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 assigned to EVT-907 (Approved), EVT-901 clone (Planning), EVT-909 (Confirmed) |
| Test Steps | Subtest A: save SET-OK on EVT-907 → HTTP 200<br>Subtest B: save SET-OK on EVT-901 clone → HTTP 200<br>Subtest C: save SET-OK on EVT-909 → HTTP 200<br>After each: GET → values equal SET-OK |
| Test Data | **Body:** SET-OK |
| Expected Result | - All three accepted and saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-04-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-04-B |
| Related AC | AC4 — Set or change registration details only while Approved, Planning or Confirmed |
| Test Scenario | Verify that registration details cannot be set on an event in any status other than Approved, Planning or Confirmed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 assigned to EVT-1201 (Submitted, unassigned to COO-01 until set), EVT-1202 (Under Review), EVT-1203 (Completed), EVT-905 (Cancelled), EVT-906 (Rejected) |
| Test Steps | Subtest A to E: open each event's Registration settings → read-only or hidden; no Save<br>Subtest F: send PUT with SET-OK to each event → HTTP 409 MSG-CFG-09<br>After all: GET each event → saved values unchanged |
| Test Data | **Body:** SET-OK |
| Expected Result | - Every status outside the three refused; nothing saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts<br>frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-04-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-04-C |
| Related AC | AC4 — Set or change registration details only while Approved, Planning or Confirmed |
| Test Scenario | Verify that the Coordinator can change the period and capacity after saving, in Planning and in Confirmed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone Planning, enabled; EVT-909 clone Confirmed, enabled; COO-01 authenticated |
| Test Steps | 1. On EVT-902 clone change the closing time to T+15d 23:59 → Save → HTTP 200<br>2. On EVT-909 clone change capacity from 50 to 60 → Save → HTTP 200<br>3. GET both → new values returned<br>4. Check the existing Confirmed registrations → unchanged |
| Test Data | **Changes:** closing T+10d to T+15d (Planning); capacity 50 to 60 (Confirmed) |
| Expected Result | - Both changes saved; existing registrations unchanged |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-04-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-04-D |
| Related AC | AC4 — Set or change registration details only while Approved, Planning or Confirmed Related: CANCEL-EVENT-07-A |
| Test Scenario | Verify that an event cancelled while the Coordinator is editing its registration settings cannot be saved. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 clone Planning; COO-01 has the settings form open with a change ready<br>- Cancellation of the same event by ORG-01 (SPM-136) runs first |
| Test Steps | 1. ORG-01 cancels the event → HTTP 200<br>2. COO-01 clicks Save on the open form → refused<br>3. GET the event → status Cancelled; settings unchanged |
| Test Data | **Change:** capacity 50 to 60 |
| Expected Result | - Save refused with MSG-CFG-09; no settings change after cancellation |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-04-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-04-E |
| Related AC | AC4 — Set or change registration details only while Approved, Planning or Confirmed (assumption R2) |
| Test Scenario | Verify that the backend enforces the status rule when the UI is bypassed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 token with valid JWT; EVT-1201 (Submitted), EVT-1203 (Completed) and EVT-905 (Cancelled) with saved settings S0 |
| Test Steps | 1. Send PUT with SET-OK to each event<br>2. Read each event's settings |
| Test Data | **Body:** SET-OK |
| Expected Result | - HTTP 409 MSG-CFG-09 for each; settings equal S0 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.controller.test.ts |

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

### CONFIG-REG-05-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-05-A |
| Related AC | AC5 — Error if the closing time is not after the opening time Related: CONFIG-REG-05-B, 05-C |
| Test Scenario | Verify that a closing time after the opening time is accepted, and that the earlier error clears once corrected. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning; capacity 50 entered; Registration set to Enabled |
| Test Steps | 1. Enter opening T+5d 09:00 and closing T+5d 09:00 → Save → error MSG-CFG-02 shown; nothing saved<br>2. Correct closing to T+5d 11:00 → the error clears<br>3. Click Save → HTTP 200 and MSG-CFG-01<br>4. Call GET registration-settings → closing T+5d 11:00 |
| Test Data | **Opens:** T+5d 09:00 SGT<br>**Closes:** T+5d 11:00 SGT (corrected) |
| Expected Result | - Error clears on correction; save accepted; GET returns the corrected closing time |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx<br>backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-05-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-05-B |
| Related AC | AC5 — Error if the closing time is not after the opening time |
| Test Scenario | Verify that the form rejects a closing time that equals or is before the opening time, and keeps the entered values. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning; capacity 50 entered; Registration set to Enabled |
| Test Steps | Subtest A: opening T+5d 09:00 and closing T+5d 09:00 → Save → error MSG-CFG-02 on closing<br>Subtest B: closing changed to T+4d 09:00 → Save → error MSG-CFG-02<br>After each: typed dates and capacity kept; nothing saved; Save available to correct |
| Test Data | **Event starts:** T+20d 18:00 SGT |
| Expected Result | - Both rejected with MSG-CFG-02; nothing saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-05-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-05-C |
| Related AC | AC5 — Error if the closing time is not after the opening time |
| Test Scenario | Verify that the backend refuses a closing time not after the opening time when the UI is bypassed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 token; EVT-901 clone Planning |
| Test Steps | 1. Send PUT with closing equal to opening → HTTP 422 MSG-CFG-02<br>2. Send PUT with closing before opening → HTTP 422 MSG-CFG-02<br>3. GET settings → unchanged |
| Test Data | **Bodies:** closing = opening; closing < opening |
| Expected Result | - Both refused with the field named |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-05-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-05-D |
| Related AC | AC5 — Error if the closing time is not after the opening time |
| Test Scenario | Verify that a closing time one minute after the opening time is accepted. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning |
| Test Steps | 1. Save opening T+5d 10:00 and closing T+5d 10:01 → HTTP 200<br>2. Save opening T+5d 10:00 and closing T+5d 10:00 → HTTP 422 MSG-CFG-02 |
| Test Data | **Pairs:** 10:00 / 10:01 (accepted); 10:00 / 10:00 (refused) |
| Expected Result | - One minute after is accepted; equal is refused |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-06-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-06-A |
| Related AC | AC6 — Error if registration closes after the event starts Related: CONFIG-REG-06-B, 06-C |
| Test Scenario | Verify that a closing time before the event start is accepted and saved. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning; event starts T+20d 18:00 SGT |
| Test Steps | 1. Enter opening T+1d 09:00, closing T+10d 23:59 and capacity 50 → Save → HTTP 200 and MSG-CFG-01<br>2. Reload → closing T+10d 23:59 shown<br>3. Call GET registration-settings → closing equals the saved value, before the event start |
| Test Data | **Closes:** T+10d 23:59 SGT (before start T+20d 18:00) |
| Expected Result | - Saved with no start-time error |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx<br>backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-06-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-06-B |
| Related AC | AC6 — Error if registration closes after the event starts |
| Test Scenario | Verify that the form rejects a closing time after the event start and keeps the entered values. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning; event starts T+20d 18:00 SGT; opening T+1d 09:00; capacity 50 |
| Test Steps | Subtest A: closing T+20d 18:30 → Save → error MSG-CFG-03 on closing<br>Subtest B: closing T+25d 09:00 → Save → error MSG-CFG-03<br>After each: values kept; nothing saved |
| Test Data | **Closing:** T+20d 18:30 and T+25d 09:00 |
| Expected Result | - Both rejected with MSG-CFG-03; nothing saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-06-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-06-C |
| Related AC | AC6 — Error if registration closes after the event starts (assumption R3) |
| Test Scenario | Verify the exact boundary: closing at 17:59 and at the start is accepted; one minute after the start is refused. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clones; event starts T+20d 18:00 SGT |
| Test Steps | Subtest A: closing T+20d 17:59 → HTTP 200<br>Subtest B: closing T+20d 18:00 (equal to start) → HTTP 200 [R3]<br>Subtest C: closing T+20d 18:01 → HTTP 422 MSG-CFG-03 |
| Test Data | **Closing:** 17:59, 18:00, 18:01 |
| Expected Result | - A and B accepted; C refused |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-06-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-06-D |
| Related AC | AC6 — Error if registration closes after the event starts |
| Test Scenario | Verify that the backend enforces the start-time rule when the UI is bypassed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 token; EVT-901 clone Planning |
| Test Steps | 1. Send PUT with closing T+20d 18:30 → HTTP 422 MSG-CFG-03<br>2. Send PUT with closing T+25d 09:00 → HTTP 422 MSG-CFG-03<br>3. GET settings → unchanged |
| Test Data | **Bodies:** closing after start |
| Expected Result | - Both refused; settings unchanged |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-07-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-07-A |
| Related AC | AC7 — Error if the capacity is not a positive whole number (assumption R5) |
| Test Scenario | Verify that a positive whole number is accepted, with surrounding spaces trimmed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone with a valid period |
| Test Steps | Subtest A: enter '25' → Save → HTTP 200; capacity 25<br>Subtest B: enter ' 25 ' → Save → HTTP 200; capacity 25 after trimming<br>Subtest C: enter '1000' → Save → HTTP 200; capacity 1000 |
| Test Data | **Inputs:** '25', ' 25 ', '1000' |
| Expected Result | - All three saved |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-07-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-07-B |
| Related AC | AC7 — Error if the capacity is not a positive whole number |
| Test Scenario | Verify that the form rejects capacity values that are not positive whole numbers and keeps the other values. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clone Planning with saved capacity 50 and a valid period |
| Test Steps | Subtest A: capacity empty → Save → error MSG-CFG-05 on capacity<br>Subtest B: 0 → MSG-CFG-05<br>Subtest C: -5 → MSG-CFG-05<br>Subtest D: 2.5 → MSG-CFG-05<br>Subtest E: 'abc' → MSG-CFG-05<br>Subtest F: '12abc' → MSG-CFG-05<br>Subtest G: spaces only → MSG-CFG-05<br>After each: saved capacity still 50; other values kept |
| Test Data | **Inputs:** empty, 0, -5, 2.5, abc, 12abc, spaces |
| Expected Result | - Each rejected with a field error; saved capacity stays 50 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + RTL) | Registration Settings Service | frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-07-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-07-C |
| Related AC | AC7 — Error if the capacity is not a positive whole number (assumption R5) |
| Test Scenario | Verify that the backend rejects invalid capacity types when the UI is bypassed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 token; EVT-901 clone with saved capacity 50 |
| Test Steps | 1. Send PUT with capacity 0, -1, 2.5, "abc" and null, one at a time → HTTP 400 or 422 MSG-CFG-05 each<br>2. Send PUT with capacity "10" (numeric string) → follow the API convention; record the result<br>3. Send PUT with capacity 1000 as a JSON number → HTTP 200<br>4. After each rejected request → capacity still 50 |
| Test Data | **Values:** 0, -1, 2.5, "abc", null, "10", 1000 |
| Expected Result | - Invalid values refused; the numeric string result is recorded [R5] |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-07-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-07-D |
| Related AC | AC7 — Error if the capacity is not a positive whole number (assumption R5) |
| Test Scenario | Verify the smallest valid capacity and the largest storable capacity. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-901 clones with 0 Confirmed registrations |
| Test Steps | Subtest A: capacity 0 → rejected MSG-CFG-05<br>Subtest B: capacity 1 → accepted<br>Subtest C: capacity 2147483647 → accepted<br>Subtest D: capacity 2147483648 → rejected with HTTP 400 or 422, not a 500 |
| Test Data | **Values:** 0, 1, 2147483647 (integer maximum, estimated [R5]), 2147483648 |
| Expected Result | - 0 and 2147483648 refused; 1 and 2147483647 accepted |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-08-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-08-A |
| Related AC | AC8 — Cannot reduce capacity below the number of Confirmed registrations (assumption R8) |
| Test Scenario | Verify that the capacity can be reduced to the Confirmed count, or to any value above it. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone: capacity 10; 5 Confirmed (ATT-01 to ATT-05); Withdrawn ATT-09, ATT-10 |
| Test Steps | 1. Change capacity to 5 → Save → HTTP 200; event shows full<br>2. Change capacity to 8 → Save → HTTP 200; event shows 3 places left<br>3. Call GET registration-settings and count Confirmed → capacity 8; Confirmed 5 |
| Test Data | **Confirmed:** 5 (Withdrawn excluded)<br>**Capacities:** 5, 8 |
| Expected Result | - Both reductions saved; no registration affected |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Integration (Jest + Supertest, Jest + RTL) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts<br>frontend/tests/components/RegistrationSettingsForm.test.tsx |

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

### CONFIG-REG-08-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-08-B |
| Related AC | AC8 — Cannot reduce capacity below the number of Confirmed registrations Related: JOIN-WAITLIST-03-B |
| Test Scenario | Verify that the capacity cannot go below the Confirmed count, and that Waitlisted entries do not count toward that minimum. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone: capacity 5 full (5 Confirmed); 3 Waitlisted |
| Test Steps | Subtest A: save capacity 4 → HTTP 422 MSG-CFG-07 stating the minimum 5; capacity stays 5<br>Subtest B: save capacity 5 → HTTP 200; waiting list unchanged; no promotions |
| Test Data | **Confirmed:** 5; **Waitlisted:** 3 (excluded) |
| Expected Result | - 4 refused; 5 accepted and waiting list unchanged |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-08-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-08-C |
| Related AC | AC8 — Cannot reduce capacity below the number of Confirmed registrations |
| Test Scenario | Verify the minimum is enforced when the UI is bypassed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 token; EVT-902 clone with 5 Confirmed |
| Test Steps | 1. Send PUT with capacity 4 → HTTP 422 MSG-CFG-07; settings unchanged<br>2. Send PUT with capacity 5 → HTTP 200 |
| Test Data | **Bodies:** capacity 4, capacity 5 |
| Expected Result | - Refused below 5; accepted at 5 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-08-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-08-D |
| Related AC | AC8 — Cannot reduce capacity below the number of Confirmed registrations (assumption R10) |
| Test Scenario | Verify that a capacity reduction and a registration arriving together never leave Confirmed above capacity. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone: capacity 10; 5 Confirmed; ATT-06 authenticated |
| Test Steps | 1. Send together: PUT capacity 5 and ATT-06's POST /registrations<br>2. Read the final capacity and Confirmed count<br>3. Repeat 20 times |
| Test Data | **Requests:** PUT capacity 5; ATT-06 registration |
| Expected Result | - Every run: Confirmed not above capacity; one of the two requests is refused |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts (concurrency) |

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

### CONFIG-REG-08-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-08-E |
| Related AC | AC8 — Cannot reduce capacity below the number of Confirmed registrations Related: WITHDRAW-EVENT-REG-05-C |
| Test Scenario | Verify that the reduction check uses the current Confirmed count, after a registration is withdrawn. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-902 clone: capacity 10; 5 Confirmed; ATT-01 withdraws (SPM-120) so Confirmed becomes 4 |
| Test Steps | 1. ATT-01 withdraws → Confirmed 4<br>2. COO-01 sets capacity 4 → HTTP 200<br>3. COO-01 sets capacity 3 → HTTP 422 MSG-CFG-07 stating the minimum 4 |
| Test Data | **Confirmed after withdrawal:** 4 |
| Expected Result | - Minimum follows the live Confirmed count |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-09-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-A |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots Related: JOIN-WAITLIST-08-A |
| Test Scenario | Verify that increasing capacity moves the earliest waitlisted Attendees into the new spots. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone Planning, enabled and open; capacity 5 full (ATT-01, ATT-02, ATT-03, ATT-11, ATT-12); waiting list ATT-04 (1), ATT-05 (2), ATT-06 (3)<br>- COO-01 authenticated |
| Test Steps | 1. Change capacity from 5 to 7 → Save → HTTP 200<br>2. Open registration details of ATT-04, ATT-05 and ATT-06<br>3. Read the event page and Confirmed count |
| Test Data | **Change:** capacity 5 to 7 (two new spots) |
| Expected Result | - ATT-04 and ATT-05 Confirmed; ATT-06 Waitlisted at position 1<br>- Confirmed 7 of 7; event full |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts<br>backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-09-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-B |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots |
| Test Scenario | Verify that when the increase is larger than the waiting list, everyone waitlisted is moved in and the spare spots are open for registration. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone as CONFIG-REG-09-A; ATT-07 authenticated with no entry |
| Test Steps | 1. Change capacity from 5 to 12 → Save → HTTP 200<br>2. Open registration details of ATT-04, ATT-05 and ATT-06<br>3. Open /events/EVT-903 as ATT-07 |
| Test Data | **Change:** capacity 5 to 12; 3 waitlisted |
| Expected Result | - ATT-04, ATT-05, ATT-06 Confirmed; waiting list empty<br>- 8 of 12 taken; ATT-07 sees Register, not Join Waiting List |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts |

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

### CONFIG-REG-09-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-C |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots |
| Test Scenario | Verify that nobody is moved and nobody is notified when capacity increases with an empty waiting list. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-904 clone: capacity 5; 3 Confirmed; empty waiting list |
| Test Steps | 1. Change capacity to 8 → Save → HTTP 200<br>2. Check notifications for all attendees<br>3. Open the event page → 5 places available |
| Test Data | **Change:** capacity 5 to 8 |
| Expected Result | - No promotion; no notifications; places available shows 5 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts |

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

### CONFIG-REG-09-D

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-D |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots Related: JOIN-WAITLIST-07-A |
| Test Scenario | Verify that spots go to the waitlist in join order, not in attendee id order. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone; waiting list ATT-06 (joined first), ATT-04, ATT-05 |
| Test Steps | 1. Change capacity from 5 to 6 → Save → HTTP 200<br>2. Read the three statuses and positions |
| Test Data | **Join order:** ATT-06, ATT-04, ATT-05 |
| Expected Result | - ATT-06 Confirmed; ATT-04 position 1; ATT-05 position 2 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts |

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

### CONFIG-REG-09-E

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-E |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots (assumption R9) Related: JOIN-WAITLIST-09-A |
| Test Scenario | Verify that only the moved Attendees receive a notification, once each, and no email is sent. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone; all attendees with zero unread notifications; mail catcher empty |
| Test Steps | 1. Change capacity from 5 to 7 → Save → HTTP 200<br>2. Within 10 s check notifications for ATT-04, ATT-05, ATT-06, ATT-01 and ATT-07<br>3. Inspect the mail catcher |
| Test Data | **Moved:** ATT-04, ATT-05 |
| Expected Result | - ATT-04 and ATT-05 each have one notification; the others have none; no email |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/notifications/notifications.service.test.ts |

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

### CONFIG-REG-09-F

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-F |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots (assumption R9) |
| Test Scenario | Verify that a failure while moving Attendees rolls back the capacity change. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone; fault injected into the promotion step (stub throws) |
| Test Steps | 1. Change capacity from 5 to 7 → Save → HTTP 500, generic message, no stack trace<br>2. Query capacity, waiting list and notifications → capacity 5; nobody moved; no notification<br>3. Remove the fault and repeat → HTTP 200; ATT-04 and ATT-05 moved |
| Test Data | **Fault:** promotion.service.ts |
| Expected Result | - No partial change; retry succeeds |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts (fault injection) |

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

### CONFIG-REG-09-G

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-G |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots Related: JOIN-WAITLIST-08-D |
| Test Scenario | Verify that waitlisted Attendees get the new spots before a direct registrant can. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone capacity 5 full; waiting list ATT-04 (1), ATT-05 (2), ATT-06 (3); ATT-07 with no entry |
| Test Steps | 1. Send together: PUT capacity 7 and ATT-07's POST /registrations<br>2. Repeat with ATT-07 posting right after the save returns<br>3. Read statuses and Confirmed count |
| Test Data | **Requests:** PUT capacity 7; ATT-07 registration |
| Expected Result | - ATT-04 and ATT-05 get the spots in both runs; ATT-07 refused with registration_full; Confirmed never above 7 |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts (concurrency) |

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

### CONFIG-REG-09-H

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-H |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots Related: JOIN-WAITLIST-13-A |
| Test Scenario | Verify that a large waiting list is moved in join order within the suggested time. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone capacity 5 full; fixture seeds 500 Waitlisted entries ATT-100 to ATT-599 in ascending join time |
| Test Steps | 1. Change capacity from 5 to 505 → Save → HTTP 200 within 5 s<br>2. Read statuses → all 500 Confirmed in join order; waiting list empty<br>3. Check notifications of ATT-100, ATT-350 and ATT-599 within 60 s → one each |
| Test Data | **Change:** capacity 5 to 505<br>**Targets (suggested):** save under 5 s; notifications within 60 s |
| Expected Result | - All 500 moved in order; targets met |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: E2E / load (Playwright, k6) | Registration Settings Service | e2e/registration-settings-scale.spec.ts<br>k6 load script (proposed) |

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

### CONFIG-REG-09-I

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-09-I |
| Related AC | AC9 — Capacity increase moves the earliest waitlisted Attendees into new spots (assumption R6) |
| Test Scenario | Verify what happens when capacity is increased while registration is switched off or closed. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone with a waiting list ATT-04 (1), ATT-05 (2), ATT-06 (3) |
| Test Steps | Subtest A: EVT-912 (closed; no waiting list) → change capacity 5 to 8 → HTTP 200; no promotion<br>Subtest B: EVT-903 clone switched off with the waiting list kept → change capacity 5 to 7 → HTTP 200; record whether ATT-04 and ATT-05 move [R6] |
| Test Data | **Subtest A:** EVT-912<br>**Subtest B:** EVT-903 clone switched off |
| Expected Result | - A: no promotion. B: result recorded for PO sign-off |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/promotion.service.test.ts |

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

### CONFIG-REG-10-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-10-A |
| Related AC | AC10 — Switching off keeps registered Attendees and removes waiting list entries (assumption R8) Related: JOIN-WAITLIST-11-A |
| Test Scenario | Verify that switching registration off keeps Confirmed Attendees and removes all waiting list entries. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone enabled; capacity 5 full (ATT-01, ATT-02, ATT-03, ATT-11, ATT-12 Confirmed); waiting list ATT-04 (1), ATT-05 (2), ATT-06 (3) |
| Test Steps | 1. COO-01 switches Registration to Disabled → Save → HTTP 200<br>2. Open registration details of ATT-01 and ATT-11 → Confirmed<br>3. Open registration details of ATT-04 → status no longer Waitlisted (label Removed [R8])<br>4. Call GET registration-settings and the event → registrationEnabled false; Confirmed 5 |
| Test Data | **Switch:** enabled to disabled |
| Expected Result | - Confirmed Attendees keep their place; the three waiting list entries are removed<br>- No Register or Join Waiting List for new Attendees |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts<br>backend/tests/registrations/waitlist.service.test.ts |

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

### CONFIG-REG-10-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-10-B |
| Related AC | AC10 — Switching off keeps registered Attendees and removes waiting list entries Related: JOIN-WAITLIST-11-E |
| Test Scenario | Verify that entries removed by switching off are not restored on switching back on, and that a new join goes to the back. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone after switch-off (CONFIG-REG-10-A end state) |
| Test Steps | 1. COO-01 switches Registration back to Enabled → Save → HTTP 200<br>2. Open registration details of ATT-04 → not Waitlisted<br>3. ATT-04 joins the waiting list → position 3 (new join time) |
| Test Data | **Switch:** disabled to enabled |
| Expected Result | - Removed entries not restored; ATT-04 queued at the back |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-10-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-10-C |
| Related AC | AC10 — Switching off keeps registered Attendees and removes waiting list entries (assumption R8) |
| Test Scenario | Verify that switching off leaves cancelled-or-withdrawn history intact and sends no notification to removed entries. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-903 clone with ATT-09 Withdrawn and ATT-04 Waitlisted; ATT-04 zero unread notifications |
| Test Steps | 1. COO-01 switches Registration off → Save → HTTP 200<br>2. Check ATT-09 → still Withdrawn<br>3. Check ATT-04 notifications → record whether a removal notice is sent [R8] |
| Test Data | **Records:** ATT-09 Withdrawn; ATT-04 Waitlisted |
| Expected Result | - Withdrawn record unchanged; removal notice behaviour recorded for PO sign-off |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.service.test.ts |

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

### CONFIG-REG-11-A

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-11-A |
| Related AC | Cross-cutting — Saved settings drive Attendee-facing behaviour (SPM-61, SPM-99, SPM-138) Related: EVENT-REG-01-A to -C |
| Test Scenario | Verify that saved settings drive what Attendees see and can do, across the open and closed periods. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 clone; COO-01 saves enabled settings: opens T+1h, closes T+10d 23:59, capacity 2<br>- ATT-04, ATT-05, ATT-06 authenticated; controllable clock |
| Test Steps | 1. Set clock before opening; ATT-04 opens the event → no Register; opening date shown<br>2. Move clock to T+2h; ATT-04 and ATT-05 register → both Confirmed; 0 of 2 places left<br>3. ATT-06 opens the event → full; Join Waiting List offered<br>4. Move clock past closing; ATT-06 opens the event → 'Registration closed'; no Join Waiting List |
| Test Data | **Window:** opens T+1h; closes T+10d 23:59; capacity 2 |
| Expected Result | - Each stage shows the correct Attendee view |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: E2E / load (Playwright, k6) | Registration Settings Service | e2e/registration-window.spec.ts |

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

### CONFIG-REG-11-B

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-11-B |
| Related AC | Cross-cutting — Registration capacity is independent of venue capacity (review decision) |
| Test Scenario | Verify that registration capacity is not checked against venue capacity. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- EVT-901 clone with Main Hall booked (venue capacity 100); COO-01 authenticated |
| Test Steps | 1. Save registration capacity 500 → HTTP 200<br>2. Save registration capacity 5 → HTTP 200<br>3. Open the event page as ATT-06 → registration capacity shown, not venue capacity |
| Test Data | **Venue capacity:** 100<br>**Registration capacities:** 500, 5 |
| Expected Result | - Both saved with no venue-related error |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.validation.test.ts |

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

### CONFIG-REG-11-C

**Test case details**

| Item | Description |
|---|---|
| Test Case ID | CONFIG-REG-11-C |
| Related AC | Cross-cutting — Server-controlled fields are ignored Related: EVENT-REG-03-D |
| Test Scenario | Verify that the server ignores or rejects client-supplied counts, status and event identifiers. |
| Pre-conditions | - Common pre-conditions CP-1 to CP-5 apply (section 1)<br>- COO-01 authenticated; EVT-902 clone with 5 Confirmed; EVT-911 belongs to COO-02 |
| Test Steps | 1. Send PUT on EVT-902 with extra fields confirmedCount 0, status Cancelled, eventId EVT-911 and capacity 3<br>2. Read EVT-902 and EVT-911 |
| Test Data | **Body:** `{ "confirmedCount": 0, "status": "Cancelled", "eventId": "EVT-911", "capacity": 3 }` |
| Expected Result | - HTTP 400 for unknown fields, or HTTP 422 MSG-CFG-07; EVT-902 status and EVT-911 unchanged |

| Level | Component | Test file(s) |
|---|---|---|
| Planned: Unit (Jest + Supertest) | Registration Settings Service | backend/tests/registrations/registration-settings.controller.test.ts |

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
