# SPM-39, SPM-61, SPM-62, SPM-63, SPM-120: Test Case Matrix and Test Case Details

Written for: the story owner (Wei Zhi Tan), to review before anything is published to Confluence. Nothing has been written to Confluence or Jira.

Branch: `chore/SPM-145-Audit-test-cases-registration-and-clarification` (uncommitted changes on top of `b5f470a`). Generated 2026-10-12 from the test code, with results from the runs in section 1.

## 0. How to read this

- **Test case ID:** the ID in the test name or in its enclosing `describe`. A test with two IDs (for example `EVENT-REG-03-A / EVENT-REG-04-A`) counts for each ID.
- **AC:** the Jira acceptance criterion the ID covers. The AC number is the ID's family number, for every story: `EVENT-REG-NN` (SPM-61), `VIEW-REG-DET-NN` (SPM-62), `VIEW-REG-INFO-NN` (SPM-63), `WITHDRAW-EVENT-REG-NN` (SPM-120) and `REQ-CLAR-NN` (SPM-39). The IDs were renumbered on 2026-10-12 so this holds (see section 7). Tests with no ID are listed as unmapped.
- **Level:** Unit (backend `.spec.ts`, and frontend lib and hook tests); Integration (PostgreSQL e2e, `.e2e-spec.ts`); Component (jsdom, `.test.tsx`).
- **Result:** Pass means the test passed in the run listed in section 1. A Playwright spec is marked Not run.
- **Gap:** no automated test carries that AC's ID. **Unmapped:** a test with no ID, which the matrix cannot link to an AC.

## 1. Runs behind the results

| Suite | Command | Result |
|---|---|---|
| Backend unit | `cd backend && npx vitest run` | 1135 passed (two runs, plus one shuffled run) |
| Backend lint | `npm run lint` | exit 0 |
| Backend e2e, story suites | `npx vitest run --config ./vitest.config.e2e.ts test/registrations*.e2e-spec.ts test/clarifications.e2e-spec.ts` (PostgreSQL `spm_audit_e2e`) | 124 passed, 1 todo (two identical runs) |
| Backend e2e, full | same config, all files | 245 passed, 11 failed, 1 todo. The 11 failures are SPM-37 drafts (another owner's story, not edited) |
| Frontend unit | `cd frontend && npx vitest run` | 911 passed, 1 todo (normal and shuffled) |
| Frontend Playwright | `EventDetailPage.withdraw.playwright.spec.ts` | **Not run** (needs the browser harness and a running app) |

The 1 todo in the e2e suite is `EVENT-REG-01-C [B]` (manual close), which the repo spec records as blocked, because the events schema has no `manual_close_at` field.


## 2. Summary

| Story | ACs | ACs with at least one ID-tagged test | Tests with an ID | Tests with no ID |
|---|---|---|---|---|
| SPM-39 | 5 | 5 of 5 (AC1, AC2, AC3, AC4, AC5) | 22 | 59 |
| SPM-61 | 5 | 5 of 5 (AC1, AC2, AC3, AC4, AC5) | 79 | 36 |
| SPM-62 | 4 | 4 of 4 (AC1, AC2, AC3, AC4) | 14 | 9 |
| SPM-63 | 6 | 6 of 6 (AC1, AC2, AC3, AC4, AC5, AC6) | 127 | 31 |
| SPM-120 | 6 | 6 of 6 (AC1, AC2, AC3, AC4, AC5, AC6) | 78 | 3 |

Counts come from the test code: `it`/`test` titles plus the enclosing `describe` ID. A count is a test body, not a run result.

## 3. Traceability matrix per story

Every automated test listed here passed in the latest runs (section 1). The Playwright spec was not run.

### SPM-39: Request clarification or amendment (Coordinator)

| AC | Acceptance criterion (Jira) | Test case ID(s) | Level | File(s) | Result |
|---|---|---|---|---|---|
| AC1 | I can send a clarification or amendment request to the Event Organiser on an event request assigned to me | `REQ-CLAR-01-A` x3 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | Pass |
| AC2 | I see an error and cannot send a blank or whitespace-only clarification message | `REQ-CLAR-01-B` x6, `REQ-CLAR-01-C` x4 | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarification-input.spec.ts, clarifications.e2e-spec.ts, clarifications.service.spec.ts | Pass |
| AC3 | My clarification message is added to the event's comment history with my name and a timestamp | `REQ-CLAR-02-A` x4 | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | Pass |
| AC4 | I can see the full chronological history of comments and clarifications on the event request | `REQ-CLAR-02-A` x4 | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | Pass |
| AC5 | I see a clear indicator when a clarification request is awaiting the Organiser's reply | `REQ-CLAR-02-B` x4 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | Pass |
| cross-cutting / extra | Authentication, role, ownership, extra cases | `REQ-CLAR-03` x2 | Component (jsdom), Integration (PostgreSQL) | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts | Pass |
| unmapped | Tests with no test case ID (section 6) | 59 tests | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarification-input.spec.ts, clarifications.controller.spec.ts, clarifications.e2e-spec.ts, clarifications.repository.spec.ts, clarifications.service.spec.ts | Pass |

### SPM-61: Register for an Event

| AC | Acceptance criterion (Jira) | Test case ID(s) | Level | File(s) | Result |
|---|---|---|---|---|---|
| AC1 | I can see the registration button only if the registration period is open | `EVENT-REG-01-A` x4, `EVENT-REG-01-B` x3, `EVENT-REG-01-BND-1` x19, `EVENT-REG-01-C` | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registration-window.spec.ts, registration.test.ts, registrations.e2e-spec.ts, registrations.service.spec.ts | Pass |
| AC2 | I see an error message if I try to register after the period has closed | `EVENT-REG-02-A` x5, `EVENT-REG-02-B`, `EVENT-REG-02-BND-1` x17 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registration-window.spec.ts, registration.test.ts, registrations.e2e-spec.ts, registrations.service.spec.ts | Pass |
| AC3 | I can enter my details and submit my registration | `EVENT-REG-03-A` x5, `EVENT-REG-03-B` x4, `EVENT-REG-03-BND-1` x7, `EVENT-REG-03-D` x2 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registration.test.ts, registrations.e2e-spec.ts, registrations.service.spec.ts, validation.spec.ts | Pass |
| AC4 | I receive a confirmation message upon successful registration | `EVENT-REG-04-A` x3 | Component (jsdom), Integration (PostgreSQL) | RegistrationSection.test.tsx, registrations.e2e-spec.ts | Pass |
| AC5 | I cannot register twice for the same event | `EVENT-REG-05-A` x6, `EVENT-REG-05-B`, `EVENT-REG-05-C` x5 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registrations.e2e-spec.ts, registrations.service.spec.ts | Pass |
| cross-cutting / extra | Authentication, role, ownership, extra cases | `EVENT-REG-03-SEC-1` x6, `EVENT-REG-05-SEC-1` x10 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, ReportTable.test.tsx, registrations.e2e-spec.ts, registrations.service.spec.ts, validation.spec.ts | Pass |
| unmapped | Tests with no test case ID (section 6) | 36 tests | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.registration.test.tsx, EventListPage.test.tsx, RegistrationSection.test.tsx, registration.test.ts, registrations.e2e-spec.ts, useAppStore.registration.test.ts | Pass |

### SPM-62: View Registration Details (Attendee)

| AC | Acceptance criterion (Jira) | Test case ID(s) | Level | File(s) | Result |
|---|---|---|---|---|---|
| AC1 | I can access my registration information from my dashboard | `VIEW-REG-DET-01-A` x3 | Unit | registrations.service.spec.ts | Pass |
| AC2 | I can see my current registration status (Confirmed, Cancelled, etc.) | `VIEW-REG-DET-02-A` x4 | Component (jsdom), Unit | EventListPage.test.tsx, RegistrationSection.test.tsx, registrations.service.spec.ts | Pass |
| AC3 | I can see my registration details | `VIEW-REG-DET-03-A` x2, `VIEW-REG-DET-03-B`, `VIEW-REG-DET-03-C` | Component (jsdom), Unit | RegistrationSection.test.tsx, registrations.service.spec.ts | Pass |
| AC4 | I can view my registration at any time before or after the event | `VIEW-REG-DET-04-A` x2, `VIEW-REG-DET-04-B` | Component (jsdom), Unit | RegistrationSection.test.tsx, registrations.service.spec.ts | Pass |
| unmapped | Tests with no test case ID (section 6) | 9 tests | Component (jsdom) | EventDetailPage.registration.test.tsx, RegistrationSection.test.tsx | Pass |

### SPM-63: View Registration Information (Organiser & Coordinator)

| AC | Acceptance criterion (Jira) | Test case ID(s) | Level | File(s) | Result |
|---|---|---|---|---|---|
| AC1 | I can view a registration report for my event | `VIEW-REG-INFO-01-A` x3, `VIEW-REG-INFO-01-A-ERR`, `VIEW-REG-INFO-01-B` x2, `VIEW-REG-INFO-01-B-POLL`, `VIEW-REG-INFO-01-B-RACE`, `VIEW-REG-INFO-01-C` x3, `VIEW-REG-INFO-01-C-BOTH`, `VIEW-REG-INFO-01-D`, `VIEW-REG-INFO-01-E`, `VIEW-REG-INFO-01-F`, `VIEW-REG-INFO-01-G`, `VIEW-REG-INFO-01-H` | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.registrationsModal.test.tsx, RegistrationReportPage.test.tsx, RegistrationsModal.test.tsx, registrations.report.e2e-spec.ts, report-access.spec.ts | Pass |
| AC2 | The report displays total number of registered attendees | `VIEW-REG-INFO-02-A` x6, `VIEW-REG-INFO-02-A-BND` x5, `VIEW-REG-INFO-02-B` x4 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, ReportHeader.test.tsx, registrations.report.e2e-spec.ts, registrations.service.spec.ts, report-format.spec.ts | Pass |
| AC3 | The report displays attendee names, emails, and registration dates | `VIEW-REG-INFO-03-A` x3, `VIEW-REG-INFO-03-A-BND` x4, `VIEW-REG-INFO-03-A-NULL` x3, `VIEW-REG-INFO-03-SEARCH`, `VIEW-REG-INFO-03-SPECIAL`, `VIEW-REG-INFO-03-TODAY`, `VIEW-REG-INFO-03-TODAY-BND` | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationsModal.test.tsx, ReportTable.test.tsx, registrationReport.test.ts, registrations.report.e2e-spec.ts, registrations.service.spec.ts, report-format.spec.ts | Pass |
| AC4 | I can export the report as CSV or PDF | `VIEW-REG-INFO-04-A` x11, `VIEW-REG-INFO-04-A-BND` x2, `VIEW-REG-INFO-04-A-BUSY`, `VIEW-REG-INFO-04-A-FMT`, `VIEW-REG-INFO-04-A-SPECIAL`, `VIEW-REG-INFO-04-B` x5, `VIEW-REG-INFO-04-B-LONG`, `VIEW-REG-INFO-04-B-PAGES`, `VIEW-REG-INFO-04-C` x4, `VIEW-REG-INFO-04-D` x6, `VIEW-REG-INFO-04-E` x5, `VIEW-REG-INFO-04-E-BND`, `VIEW-REG-INFO-04-E-INT` x3, `VIEW-REG-INFO-04-E-ISO` | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, ReportTable.test.tsx, export.service.spec.ts, registrationReport.test.ts, registrations.report.e2e-spec.ts, report-format.spec.ts | Pass |
| AC5 | I cannot access registration reports for events I don't manage | `VIEW-REG-INFO-05-A` x10, `VIEW-REG-INFO-05-A-FMT`, `VIEW-REG-INFO-05-A-NULL` x2, `VIEW-REG-INFO-05-A-ROLE` x2, `VIEW-REG-INFO-05-B` x2, `VIEW-REG-INFO-05-B-ROLE`, `VIEW-REG-INFO-05-C`, `VIEW-REG-INFO-05-C-TOKEN`, `VIEW-REG-INFO-05-D` x5, `VIEW-REG-INFO-05-D-ORDER`, `VIEW-REG-INFO-05-F` | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.registrationsModal.test.tsx, RegistrationReportPage.test.tsx, registrationReport.test.ts, registrations.report.e2e-spec.ts, registrations.service.spec.ts, report-access.spec.ts | Pass |
| AC6 | The report shows real-time updates of new registrations | `VIEW-REG-INFO-06-A` x2, `VIEW-REG-INFO-06-A-BLIP`, `VIEW-REG-INFO-06-A-CACHE`, `VIEW-REG-INFO-06-A-INFLIGHT`, `VIEW-REG-INFO-06-A-REVOKE`, `VIEW-REG-INFO-06-A-SESSION`, `VIEW-REG-INFO-06-A-UNMOUNT`, `VIEW-REG-INFO-06-B` x2, `VIEW-REG-INFO-06-B-REREG` | Component (jsdom), Integration (PostgreSQL) | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts | Pass |
| unmapped | Tests with no test case ID (section 6) | 31 tests | Component (jsdom), Unit | RegistrationsModal.test.tsx, export.service.spec.ts, registrationReport.download.test.ts, useRegistrationReport.test.ts, useReportExport.test.ts | Pass |

### SPM-120: Withdraw Registration

| AC | Acceptance criterion (Jira) | Test case ID(s) | Level | File(s) | Result |
|---|---|---|---|---|---|
| AC1 | I can access a withdraw option from my registration details | `WITHDRAW-EVENT-REG-01-A`, `WITHDRAW-EVENT-REG-01-B` | Component (jsdom) | RegistrationSection.test.tsx | Pass |
| AC2 | I receive a confirmation prompt showing the event name and withdrawal consequences | `WITHDRAW-EVENT-REG-02-A`, `WITHDRAW-EVENT-REG-02-B` x8 | Component (jsdom) | WithdrawalConfirmation.a11y.test.tsx, WithdrawalConfirmation.test.tsx | Pass |
| AC3 | I can confirm or cancel the withdrawal action | `WITHDRAW-EVENT-REG-03-A` x4, `WITHDRAW-EVENT-REG-03-B` x2, `WITHDRAW-EVENT-REG-03-STATE-1` | Component (jsdom), Integration (PostgreSQL), Unit | WithdrawalConfirmation.test.tsx, registrations.service.spec.ts, registrations.withdraw.e2e-spec.ts, registrations.withdraw.spec.ts | Pass |
| AC4 | I cannot withdraw once the event has started | `WITHDRAW-EVENT-REG-04-A` x2, `WITHDRAW-EVENT-REG-04-C` x3, `WITHDRAW-EVENT-REG-04-D` | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, event-start.spec.ts, registrations.withdraw.e2e-spec.ts | Pass |
| AC5 | Upon successful withdrawal, my registration status changes to "Withdrawn" | `WITHDRAW-EVENT-REG-05-A` x3, `WITHDRAW-EVENT-REG-05-C` x5, `WITHDRAW-EVENT-REG-05-D` x4, `WITHDRAW-EVENT-REG-05-E` x2, `WITHDRAW-EVENT-REG-05-F`, `WITHDRAW-EVENT-REG-05-STATE-1` x2 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.withdraw.test.tsx, RegistrationSection.test.tsx, registration.test.ts, registrations.withdraw.e2e-spec.ts, registrations.withdraw.spec.ts | Pass |
| AC6 | I receive a confirmation message on screen that my withdrawal was processed | `WITHDRAW-EVENT-REG-06-A` | Component (jsdom) | WithdrawalConfirmation.test.tsx | Pass |
| cross-cutting / extra | Authentication, role, ownership, extra cases | `WITHDRAW-EVENT-REG-07-A` x2, `WITHDRAW-EVENT-REG-07-B` x3, `WITHDRAW-EVENT-REG-07-INT-1`, `WITHDRAW-EVENT-REG-07-INT-2`, `WITHDRAW-EVENT-REG-07-INT-5`, `WITHDRAW-EVENT-REG-07-STATE-1`, `WITHDRAW-EVENT-REG-08-A`, `WITHDRAW-EVENT-REG-CAP-01` x2, `WITHDRAW-EVENT-REG-CARD-01` x2, `WITHDRAW-EVENT-REG-CARD-02`, `WITHDRAW-EVENT-REG-CARD-03`, `WITHDRAW-EVENT-REG-CARD-04` x4, `WITHDRAW-EVENT-REG-CARD-05`, `WITHDRAW-EVENT-REG-CARD-06` x3, `WITHDRAW-EVENT-REG-CARD-07` x3, `WITHDRAW-EVENT-REG-CARD-08`, `WITHDRAW-EVENT-REG-CARD-09`, `WITHDRAW-EVENT-REG-CARD-10` x2, `WITHDRAW-EVENT-REG-CARD-11`, `WITHDRAW-EVENT-REG-CARD-12`, `WITHDRAW-EVENT-REG-CARD-13` x3 | Component (jsdom), E2E (Playwright, not run), Integration (PostgreSQL), Unit | EventDetailPage.withdraw.playwright.spec.ts, EventDetailPage.withdraw.test.tsx, RegistrationSection.test.tsx, WithdrawnRegistrationStatus.test.tsx, registrations.withdraw.e2e-spec.ts, registrations.withdraw.spec.ts | Pass |
| unmapped | Tests with no test case ID (section 6) | 3 tests | Component (jsdom) | EventDetailPage.registration.test.tsx, RegistrationSection.test.tsx | Pass |


## 4. Test case details (generated from the code)

One row per test case ID. The title is the first test's name in the code. Tests counts every test body with that ID. Pre-conditions, steps and data are in the test code; the SPM-39 cards in section 5 are written out in full.

### SPM-39: Request clarification or amendment (Coordinator)

| Test case ID | Title (from code) | AC | Level | File(s) | Tests |
|---|---|---|---|---|---|
| `REQ-CLAR-01-A` | accepts a valid message and flags it awaiting reply, without changing event status | AC1 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | 3 |
| `REQ-CLAR-01-B` | rejects a blank message without opening a transaction | AC2 | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarification-input.spec.ts, clarifications.e2e-spec.ts, clarifications.service.spec.ts | 6 |
| `REQ-CLAR-01-C` | rejects a whitespace-only message without opening a transaction | AC2 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.clarifications.test.tsx, clarification-input.spec.ts, clarifications.e2e-spec.ts, clarifications.service.spec.ts | 4 |
| `REQ-CLAR-02-A` | REQ-CLAR-02-A: returns the thread in repository order with author, role, timestamp and flags | AC3, AC4 | Component (jsdom), Integration (PostgreSQL), Unit | ClarificationThread.test.tsx, EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | 4 |
| `REQ-CLAR-02-B` | accepts a valid message and flags it awaiting reply, without changing event status | AC5 | Component (jsdom), Integration (PostgreSQL), Unit | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts, clarifications.service.spec.ts | 4 |
| `REQ-CLAR-03` | REQ-CLAR-03: Event Coordinator cannot request clarification on an event assigned to another Coordinator | not in SPM-39 ACs (extra) | Component (jsdom), Integration (PostgreSQL) | EventDetailPage.clarifications.test.tsx, clarifications.e2e-spec.ts | 2 |

### SPM-61: Register for an Event

| Test case ID | Title (from code) | AC | Level | File(s) | Tests |
|---|---|---|---|---|---|
| `EVENT-REG-01-A` | event detail reports registrationOpen=true | AC1 | Component (jsdom), Integration (PostgreSQL) | RegistrationSection.test.tsx, registrations.e2e-spec.ts | 4 |
| `EVENT-REG-01-B` | a window opening at 2026-10-20 10:00 SGT -> 422 registration_not_open with the opening time, no INSERT | AC1 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registrations.e2e-spec.ts, registrations.service.spec.ts | 3 |
| `EVENT-REG-01-BND-1` | [A] 1s before open: closed | AC1 | Integration (PostgreSQL), Unit | registration-window.spec.ts, registration.test.ts, registrations.e2e-spec.ts, registrations.service.spec.ts | 19 |
| `EVENT-REG-01-C` | 01-C[A] closed by time: no button, closed text | AC1 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `EVENT-REG-02-A` | a clock exactly at the closing instant -> 422 registration_closed, no INSERT (close is exclusive) | AC2 | Integration (PostgreSQL), Unit | registrations.e2e-spec.ts, registrations.service.spec.ts | 5 |
| `EVENT-REG-02-B` | keeps the form and values, shows MSG-01 after the 422 | AC2 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `EVENT-REG-02-BND-1` | [A] 1s before open: closed | AC2 | Integration (PostgreSQL), Unit | registration-window.spec.ts, registration.test.ts, registrations.e2e-spec.ts | 17 |
| `EVENT-REG-03-A` | inserts one Registered row with the submitted details and returns the confirmation message | AC3 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registrations.e2e-spec.ts, registrations.service.spec.ts | 5 |
| `EVENT-REG-03-B` | [B] non-object body %j -> 400 | AC3 | Component (jsdom), Unit | RegistrationSection.test.tsx, registration.test.ts, validation.spec.ts | 4 |
| `EVENT-REG-03-BND-1` | [A] fullName 1 and 100 characters pass, 101 fails | AC3 | Unit | registration.test.ts, validation.spec.ts | 7 |
| `EVENT-REG-03-D` | a body with an unknown key (status) -> 400 validation_error and no transaction opened | AC3 | Integration (PostgreSQL), Unit | registrations.e2e-spec.ts, registrations.service.spec.ts | 2 |
| `EVENT-REG-03-SEC-1` | [A] keeps HTML and SQL text literally | cross-cutting (auth/role) | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, ReportTable.test.tsx, registrations.e2e-spec.ts, validation.spec.ts | 6 |
| `EVENT-REG-04-A` | creates a registration and returns MSG-06 | AC4 | Component (jsdom), Integration (PostgreSQL) | RegistrationSection.test.tsx, registrations.e2e-spec.ts | 3 |
| `EVENT-REG-05-A` | an existing Registered row -> 409 already_registered, no INSERT and no capacity check | AC5 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationSection.test.tsx, registrations.e2e-spec.ts, registrations.service.spec.ts | 6 |
| `EVENT-REG-05-B` | five simultaneous POSTs -> one 201 and four 409 | AC5 | Integration (PostgreSQL) | registrations.e2e-spec.ts | 1 |
| `EVENT-REG-05-C` | capacity 3 with 2 taken (N-1) -> the registration succeeds | AC5 | Integration (PostgreSQL), Unit | registrations.e2e-spec.ts, registrations.service.spec.ts | 5 |
| `EVENT-REG-05-SEC-1` | an Organiser (not an Attendee) -> 403 Attendee access required, nothing read or written | cross-cutting (auth/role) | Integration (PostgreSQL), Unit | registrations.e2e-spec.ts, registrations.service.spec.ts | 10 |

### SPM-62: View Registration Details (Attendee)

| Test case ID | Title (from code) | AC | Level | File(s) | Tests |
|---|---|---|---|---|---|
| `VIEW-REG-DET-01-A` | VIEW-REG-DET-01-A: the lookup is scoped to this event and this caller (own registration only) | AC1 | Unit | registrations.service.spec.ts | 3 |
| `VIEW-REG-DET-02-A` | VIEW-REG-DET-02-A: a Registered row -> status "registered" with the event name and the stored details | AC2 | Component (jsdom), Unit | EventListPage.test.tsx, RegistrationSection.test.tsx, registrations.service.spec.ts | 4 |
| `VIEW-REG-DET-03-A` | VIEW-REG-DET-03-A: special requirements present -> shown; a legacy row with NULL details -> blank name and email, no requirements (ASSUMPTION A-NULL) | AC3 | Component (jsdom), Unit | RegistrationSection.test.tsx, registrations.service.spec.ts | 2 |
| `VIEW-REG-DET-03-B` | AC3 omits contact number and special requirements rows when absent | AC3 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `VIEW-REG-DET-03-C` | AC3 falls back to attendeeName when fullName is absent on older records | AC3 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `VIEW-REG-DET-04-A` | VIEW-REG-DET-04-A: the lookup keeps Completed and Cancelled events visible | AC4 | Component (jsdom), Unit | RegistrationSection.test.tsx, registrations.service.spec.ts | 2 |
| `VIEW-REG-DET-04-B` | shows full registration details for a cancelled event | AC4 | Component (jsdom) | RegistrationSection.test.tsx | 1 |

### SPM-63: View Registration Information (Organiser & Coordinator)

| Test case ID | Title (from code) | AC | Level | File(s) | Tests |
|---|---|---|---|---|---|
| `VIEW-REG-INFO-01-A` | VIEW-REG-INFO-01-A: the assigned coordinator is allowed | AC1 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts, report-access.spec.ts | 3 |
| `VIEW-REG-INFO-01-A-ERR` | VIEW-REG-INFO-01-A-ERR: a failed first load offers a retry | AC1 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-01-B` | VIEW-REG-INFO-01-B: switching events returns each event\ | AC1 | Component (jsdom), Integration (PostgreSQL) | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts | 2 |
| `VIEW-REG-INFO-01-B-POLL` | VIEW-REG-INFO-01-B-POLL: after switching events only the new event is polled | AC1 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-01-B-RACE` | VIEW-REG-INFO-01-B-RACE: a late response for the previous event is ignored | AC1 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-01-C` | VIEW-REG-INFO-01-C: the owning organiser is allowed | AC1 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts, report-access.spec.ts | 3 |
| `VIEW-REG-INFO-01-C-BOTH` | VIEW-REG-INFO-01-C-BOTH: a dual-role user is allowed when either rule holds | AC1 | Unit | report-access.spec.ts | 1 |
| `VIEW-REG-INFO-01-D` | VIEW-REG-INFO-01-D: opens modal on button click and closes on x button | AC1 | Component (jsdom) | EventDetailPage.registrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-01-E` | VIEW-REG-INFO-01-E: a click inside the modal does not close it | AC1 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-01-F` | VIEW-REG-INFO-01-F: the close button closes the modal | AC1 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-01-G` | VIEW-REG-INFO-01-G: Escape closes the modal | AC1 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-01-H` | VIEW-REG-INFO-01-H: a click on the backdrop closes the modal | AC1 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-02-A` | capacity 3 with 2 Registered rows -> totalConfirmed 2 and availableSpots 1 | AC2 | Component (jsdom), Integration (PostgreSQL), Unit | ReportHeader.test.tsx, registrations.report.e2e-spec.ts, registrations.service.spec.ts, report-format.spec.ts | 6 |
| `VIEW-REG-INFO-02-A-BND` | VIEW-REG-INFO-02-A-BND: one attendee is singular | AC2 | Component (jsdom), Integration (PostgreSQL), Unit | ReportHeader.test.tsx, registrations.report.e2e-spec.ts, report-format.spec.ts | 5 |
| `VIEW-REG-INFO-02-B` | VIEW-REG-INFO-02-B: a new registration is counted on the next request | AC2 | Component (jsdom), Integration (PostgreSQL) | RegistrationReportPage.test.tsx, ReportHeader.test.tsx, registrations.report.e2e-spec.ts | 4 |
| `VIEW-REG-INFO-03-A` | VIEW-REG-INFO-03-A: a row with special requirements carries them into the report | AC3 | Component (jsdom), Integration (PostgreSQL), Unit | ReportTable.test.tsx, registrations.report.e2e-spec.ts, registrations.service.spec.ts | 3 |
| `VIEW-REG-INFO-03-A-BND` | VIEW-REG-INFO-03-A-BND: September is abbreviated "Sep" | AC3 | Integration (PostgreSQL), Unit | registrationReport.test.ts, registrations.report.e2e-spec.ts, report-format.spec.ts | 4 |
| `VIEW-REG-INFO-03-A-NULL` | VIEW-REG-INFO-03-A-NULL: a legacy row with no detail columns is reported with blank text and no special requirements (ASSUMPTION A-NULL) | AC3 | Component (jsdom), Integration (PostgreSQL), Unit | ReportTable.test.tsx, registrations.report.e2e-spec.ts, registrations.service.spec.ts | 3 |
| `VIEW-REG-INFO-03-SEARCH` | VIEW-REG-INFO-03-SEARCH: filters by name, email and phone, with 150ms debounce | AC3 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-03-SPECIAL` | VIEW-REG-INFO-03-SPECIAL: filters to attendees with indicated special requirements | AC3 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-03-TODAY` | VIEW-REG-INFO-03-TODAY: filters to attendees registered today and combines with search | AC3 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-03-TODAY-BND` | VIEW-REG-INFO-03-TODAY-BND: treats the day boundary as Singapore time | AC3 | Component (jsdom) | RegistrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-04-A` | VIEW-REG-INFO-04-A: the body is exactly the header and the three rows | AC4 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, export.service.spec.ts, registrationReport.test.ts, registrations.report.e2e-spec.ts, report-format.spec.ts | 11 |
| `VIEW-REG-INFO-04-A-BND` | VIEW-REG-INFO-04-A-BND: the filename does not change with the generation date | AC4 | Integration (PostgreSQL), Unit | registrationReport.test.ts, registrations.report.e2e-spec.ts | 2 |
| `VIEW-REG-INFO-04-A-BUSY` | VIEW-REG-INFO-04-A-BUSY: the export buttons are disabled while downloading | AC4 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-04-A-FMT` | VIEW-REG-INFO-04-A-FMT: an unknown export format is rejected with 400 | AC4 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-04-A-SPECIAL` | VIEW-REG-INFO-04-A-SPECIAL: special requirements reach the report, the CSV and the PDF | AC4 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-04-B` | VIEW-REG-INFO-04-B: a same-day event reads "9 Oct 2026 18:00-21:00 SGT" | AC4 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts, report-format.spec.ts | 5 |
| `VIEW-REG-INFO-04-B-LONG` | VIEW-REG-INFO-04-B-LONG: a 100-character name and non-ASCII letters are not truncated | AC4 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-04-B-PAGES` | VIEW-REG-INFO-04-B-PAGES: 80 attendees run onto a second page with the headings repeated | AC4 | Unit | export.service.spec.ts | 1 |
| `VIEW-REG-INFO-04-C` | VIEW-REG-INFO-04-C: an empty report is the header row only | AC4 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, ReportTable.test.tsx, export.service.spec.ts, registrations.report.e2e-spec.ts | 4 |
| `VIEW-REG-INFO-04-D` | VIEW-REG-INFO-04-D: "Smith, John" is wrapped in quotes | AC4 | Integration (PostgreSQL), Unit | export.service.spec.ts, registrations.report.e2e-spec.ts | 6 |
| `VIEW-REG-INFO-04-E` | VIEW-REG-INFO-04-E: a SQL payload is written literally | AC4 | Component (jsdom), Integration (PostgreSQL), Unit | ReportTable.test.tsx, export.service.spec.ts, registrations.report.e2e-spec.ts | 5 |
| `VIEW-REG-INFO-04-E-BND` | VIEW-REG-INFO-04-E-BND: "%s" is not altered | AC4 | Unit | export.service.spec.ts | 1 |
| `VIEW-REG-INFO-04-E-INT` | VIEW-REG-INFO-04-E-INT: the formula payload is neutralised and then quoted | AC4 | Unit | export.service.spec.ts | 3 |
| `VIEW-REG-INFO-04-E-ISO` | VIEW-REG-INFO-04-E-ISO: the report passed in is not mutated | AC4 | Unit | export.service.spec.ts | 1 |
| `VIEW-REG-INFO-05-A` | the assigned coordinator gets the report | AC5 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts, registrations.service.spec.ts, report-access.spec.ts | 10 |
| `VIEW-REG-INFO-05-A-FMT` | VIEW-REG-INFO-05-A-FMT: an unassigned coordinator asking for an unknown format still gets 403 | AC5 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-05-A-NULL` | VIEW-REG-INFO-05-A-NULL: an unassigned event is not viewable by a coordinator | AC5 | Unit | registrationReport.test.ts, report-access.spec.ts | 2 |
| `VIEW-REG-INFO-05-A-ROLE` | VIEW-REG-INFO-05-A-ROLE: a coordinator whose id matches the organiser column is refused | AC5 | Unit | report-access.spec.ts | 2 |
| `VIEW-REG-INFO-05-B` | VIEW-REG-INFO-05-B: an organiser who does not own the event is refused | AC5 | Integration (PostgreSQL), Unit | registrations.report.e2e-spec.ts, report-access.spec.ts | 2 |
| `VIEW-REG-INFO-05-B-ROLE` | VIEW-REG-INFO-05-B-ROLE: an organiser whose id matches the coordinator column is refused | AC5 | Unit | report-access.spec.ts | 1 |
| `VIEW-REG-INFO-05-C` | VIEW-REG-INFO-05-C: query-parameter identity is ignored and each denial is logged once | AC5 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-05-C-TOKEN` | VIEW-REG-INFO-05-C-TOKEN: a manager with a foreign identity in the query still gets their own report | AC5 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-05-D` | VIEW-REG-INFO-05-D: an attendee is refused | AC5 | Component (jsdom), Integration (PostgreSQL), Unit | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts, report-access.spec.ts | 5 |
| `VIEW-REG-INFO-05-D-ORDER` | VIEW-REG-INFO-05-D-ORDER: unknown and malformed event ids are 404 before any 403 | AC5 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-05-F` | VIEW-REG-INFO-05-F: a non-owning organiser does not see the button | AC5 | Component (jsdom) | EventDetailPage.registrationsModal.test.tsx | 1 |
| `VIEW-REG-INFO-06-A` | VIEW-REG-INFO-06-A: a new registration is visible to the organiser immediately, twice in a row | AC6 | Component (jsdom), Integration (PostgreSQL) | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts | 2 |
| `VIEW-REG-INFO-06-A-BLIP` | VIEW-REG-INFO-06-A-BLIP: a transient failure keeps the rows and the next poll recovers | AC6 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-06-A-CACHE` | VIEW-REG-INFO-06-A-CACHE: the %s is sent with Cache-Control no-store | AC6 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |
| `VIEW-REG-INFO-06-A-INFLIGHT` | VIEW-REG-INFO-06-A-INFLIGHT: no new request while one is still pending | AC6 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-06-A-REVOKE` | VIEW-REG-INFO-06-A-REVOKE: a 403 while polling clears the rows and stops polling | AC6 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-06-A-SESSION` | VIEW-REG-INFO-06-A-SESSION: a 401 while polling redirects to login and stops | AC6 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-06-A-UNMOUNT` | VIEW-REG-INFO-06-A-UNMOUNT: no requests after the page is closed | AC6 | Component (jsdom) | RegistrationReportPage.test.tsx | 1 |
| `VIEW-REG-INFO-06-B` | VIEW-REG-INFO-06-B: a withdrawal removes the row immediately for the organiser | AC6 | Component (jsdom), Integration (PostgreSQL) | RegistrationReportPage.test.tsx, registrations.report.e2e-spec.ts | 2 |
| `VIEW-REG-INFO-06-B-REREG` | VIEW-REG-INFO-06-B-REREG: registering again after a withdrawal puts the attendee back once, at the new date | AC6 | Integration (PostgreSQL) | registrations.report.e2e-spec.ts | 1 |

### SPM-120: Withdraw Registration

| Test case ID | Title (from code) | AC | Level | File(s) | Tests |
|---|---|---|---|---|---|
| `WITHDRAW-EVENT-REG-01-A` | WITHDRAW-EVENT-REG-01-A: a future registered event offers an enabled Withdraw button | AC1 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-01-B` | WITHDRAW-EVENT-REG-01-B: a started event has no Withdraw control and no dialog | AC1 | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-02-A` | WITHDRAW-EVENT-REG-02-A: clicking Withdraw opens the prompt and sends nothing | AC2 | Component (jsdom) | WithdrawalConfirmation.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-02-B` | WITHDRAW-EVENT-REG-02-B: dialog semantics and button names | AC2 | Component (jsdom) | WithdrawalConfirmation.a11y.test.tsx | 8 |
| `WITHDRAW-EVENT-REG-03-A` | a body of {} withdraws the caller\ | AC3 | Component (jsdom), Integration (PostgreSQL), Unit | WithdrawalConfirmation.test.tsx, registrations.service.spec.ts, registrations.withdraw.e2e-spec.ts | 4 |
| `WITHDRAW-EVENT-REG-03-B` | WITHDRAW-EVENT-REG-03-B: Cancel closes the prompt with no request and no change | AC3 | Component (jsdom) | WithdrawalConfirmation.test.tsx | 2 |
| `WITHDRAW-EVENT-REG-03-STATE-1` | issues one UPDATE with [id, caller uid, clock instant], guarded on Registered, and answers 200 data | AC3 | Unit | registrations.withdraw.spec.ts | 1 |
| `WITHDRAW-EVENT-REG-04-A` | WITHDRAW-EVENT-REG-04-A: nothing can start a withdrawal for a started event | AC4 | Component (jsdom) | RegistrationSection.test.tsx | 2 |
| `WITHDRAW-EVENT-REG-04-C` | WITHDRAW-EVENT-REG-04-C (unit): is false one second before the start | AC4 | Unit | event-start.spec.ts | 3 |
| `WITHDRAW-EVENT-REG-04-D` | a %s event that starts in the future -> 200 and Withdrawn | AC4 | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-05-A` | WITHDRAW-EVENT-REG-05-A / 06-B: exact literals | AC5 | Component (jsdom), Unit | RegistrationSection.test.tsx, registration.test.ts | 3 |
| `WITHDRAW-EVENT-REG-05-C` | keeps the row and details, sets status and withdrawn_at, and leaves other registrations alone | AC5 | Component (jsdom), Integration (PostgreSQL) | EventDetailPage.withdraw.test.tsx, registrations.withdraw.e2e-spec.ts | 5 |
| `WITHDRAW-EVENT-REG-05-D` | A (also 08-A A): 3 parallel requests -> one 200 and two 422 "already been withdrawn" | AC5 | Component (jsdom), Integration (PostgreSQL) | RegistrationSection.test.tsx, registrations.withdraw.e2e-spec.ts | 4 |
| `WITHDRAW-EVENT-REG-05-E` | A: the API instant and the stored UTC value both equal the injected clock | AC5 | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 2 |
| `WITHDRAW-EVENT-REG-05-F` | reactivates the withdrawn row and clears withdrawn_at | AC5 | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-05-STATE-1` | a Withdrawn row on a future event -> 422 and no UPDATE issued | AC5 | Unit | registrations.withdraw.spec.ts | 2 |
| `WITHDRAW-EVENT-REG-06-A` | WITHDRAW-EVENT-REG-06-A (A): pending state, then a persistent dismissible success banner | AC6 | Component (jsdom) | WithdrawalConfirmation.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-07-A` | 07-A A: ATT-03 withdrawing ATT-01\ | cross-cutting | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 2 |
| `WITHDRAW-EVENT-REG-07-B` | 07-B (= 07-A B): no session -> 401 "Missing session" and the row stays Registered | cross-cutting | Component (jsdom), Integration (PostgreSQL) | EventDetailPage.withdraw.test.tsx, registrations.withdraw.e2e-spec.ts | 3 |
| `WITHDRAW-EVENT-REG-07-INT-1` | 07-INT-1 (authentication before body): no session and a bad body -> 401, not 400 | cross-cutting | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-07-INT-2` | 07-INT-2 (body before ownership): a non-owner with a bad body -> 400, not 404 | cross-cutting | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-07-INT-5` | 07-INT-5 (state before event start): the owner of a withdrawn registration on a past event -> already withdrawn | cross-cutting | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-07-STATE-1` | a lookup that finds no row for this caller -> 404, scoped to the caller, no UPDATE issued | cross-cutting | Unit | registrations.withdraw.spec.ts | 1 |
| `WITHDRAW-EVENT-REG-08-A` | B: 5 parallel requests -> one 200, four 422, zero 5xx, state set once | cross-cutting | Integration (PostgreSQL) | registrations.withdraw.e2e-spec.ts | 1 |
| `WITHDRAW-EVENT-REG-CAP-01` | withdrawing from a full event frees the spot, persists across a reload, and the attendee can register again | legacy (superseded) | Component (jsdom), E2E (Playwright, not run) | EventDetailPage.withdraw.playwright.spec.ts, EventDetailPage.withdraw.test.tsx | 2 |
| `WITHDRAW-EVENT-REG-CARD-01` | renders the withdrawn badge, both timeline entries and an enabled Register again button | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 2 |
| `WITHDRAW-EVENT-REG-CARD-02` | does not render the old relative timestamp line or a plain Register button | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-03` | is collapsed by default and shows ID, name, email and contact number once opened | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-04` | shows the availability footer and calls the handler once per click | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 4 |
| `WITHDRAW-EVENT-REG-CARD-05` | shows 'This event is full.' and hides the button | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-06` | not yet open: shows the opening time, no button | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 3 |
| `WITHDRAW-EVENT-REG-CARD-07` | exactly at registrationClosesAt: closed, no button | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 3 |
| `WITHDRAW-EVENT-REG-CARD-08` | shows the Singapore date and time even when the UTC day differs | legacy (superseded) | Component (jsdom) | WithdrawnRegistrationStatus.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-09` | WITHDRAW-EVENT-REG-CARD-09: an active registration is unaffected by the withdrawn-card redesign | legacy (superseded) | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-10` | WITHDRAW-EVENT-REG-CARD-10: opens a form prefilled from the withdrawn registration and hides the footer | legacy (superseded) | Component (jsdom) | RegistrationSection.test.tsx | 2 |
| `WITHDRAW-EVENT-REG-CARD-11` | WITHDRAW-EVENT-REG-CARD-11: re-registering replaces the withdrawn card with the new registration | legacy (superseded) | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-12` | WITHDRAW-EVENT-REG-CARD-12: a refused re-registration shows the server message and changes nothing | legacy (superseded) | Component (jsdom) | RegistrationSection.test.tsx | 1 |
| `WITHDRAW-EVENT-REG-CARD-13` | WITHDRAW-EVENT-REG-CARD-13: a 409 on re-register reloads the registration and closes the form | legacy (superseded) | Component (jsdom) | RegistrationSection.test.tsx | 3 |


## 5. SPM-39 test case cards (updated)

These cards replace the earlier SPM-39 document. Changes: file paths now point at the real locations; counts reflect the repo (e2e 9 tests, frontend 8); the error text matches the code ("Clarification message is required", the approved production change); REQ-CLAR-02-B now has a Coordinator view, an e2e test, and a design note; the "real-time update" is removed (there is none, by design); REQ-CLAR-03 is labelled as an extra case.

Design, confirmed with the PO: the indicator is "Pending" until a clarification is resolved. A reply does not clear it. There is no real-time update; the page shows the state it loads.

### REQ-CLAR-01-A: Valid clarification submission

| Item | Description |
|---|---|
| AC | AC1: a Coordinator can send a clarification or amendment request to the Event Organiser on an event request assigned to them |
| Scenario | A Coordinator submits a valid clarification on an event assigned to them. The event status does not change, and a comment entry is added with the Coordinator's name and a timestamp. The organiser is notified. |
| Pre-conditions | Event EVT-1001 is assigned to `coordinator_jane` (role COORDINATOR) and has status `Submitted`. The Coordinator is signed in. |
| Steps | 1. Open EVT-1001. 2. Type "Please confirm expected attendance — form shows 0." 3. Click Send. 4. Check the response. 5. Check the event status. 6. Check the thread. |
| Test data | Message: "Please confirm expected attendance — form shows 0." Coordinator: `coordinator_jane`. Event: EVT-1001. |
| Expected | Response 201. Status stays `Submitted`. One thread entry with the Coordinator's name and a timestamp. One notification to the organiser. No other event field changes. |
| Level | Integration (e2e) and Component (page) |
| Automated in | `backend/test/clarifications.e2e-spec.ts` (`REQ-CLAR-01-A`); `frontend/src/features/events/pages/detail/EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-01-A`); `backend/src/clarifications/clarifications.service.spec.ts` (accepts a valid message, unit) |
| Result | Pass |

### REQ-CLAR-01-B: Blank message rejected

| Item | Description |
|---|---|
| AC | AC2: the Coordinator sees an error and cannot send a blank or whitespace-only clarification message |
| Scenario | A blank message is refused with an error. Nothing is sent, and no entry is added. |
| Pre-conditions | As REQ-CLAR-01-A. |
| Steps | 1. Open EVT-1001. 2. Leave the message empty. 3. Click Send. 4. Read the error. 5. Check the status and thread. |
| Test data | Message: "" (empty). |
| Expected | Error text **"Clarification message is required"**. No request is sent. Status stays `Submitted`. No entry is added. |
| Level | Component (page and component), Integration (e2e), Unit (service, DTO) |
| Automated in | `frontend/src/features/events/pages/detail/ClarificationThread.test.tsx` (blank draft); `EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-01-B`); `backend/test/clarifications.e2e-spec.ts` (`REQ-CLAR-01-B`); `clarifications.service.spec.ts`, `dto/clarification-input.spec.ts` |
| Result | Pass |

### REQ-CLAR-01-C: Whitespace-only message rejected

| Item | Description |
|---|---|
| AC | AC2 |
| Scenario | A message of only spaces, tabs and newlines is refused, as for an empty one. |
| Steps | As REQ-CLAR-01-B, with the message " \n\t ". |
| Expected | As REQ-CLAR-01-B. |
| Level | Component, Integration, Unit |
| Automated in | `EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-01-C`); `ClarificationThread.test.tsx`; `backend/test/clarifications.e2e-spec.ts` (`REQ-CLAR-01-C`); `clarifications.service.spec.ts`; `dto/clarification-input.spec.ts` |
| Result | Pass |

### REQ-CLAR-02-A: Chronological history with attribution

| Item | Description |
|---|---|
| AC | AC3 (name and timestamp on the entry), AC4 (full chronological history) |
| Scenario | The thread shows every entry in order, each with its author's name, role, message and timestamp. Clarifications are visibly different from replies. |
| Pre-conditions | EVT-1002 has three entries: an organiser comment at 09:00, a Coordinator clarification at 09:15 and an organiser reply at 10:30. The viewer is the organiser or the assigned Coordinator. |
| Steps | 1. Open EVT-1002. 2. Open the thread. 3. Check the order, names, roles, timestamps and labels. |
| Expected | Three entries in chronological order (09:00, 09:15, 10:30). Each shows author name, role and timestamp. The clarification is labelled as one. Timestamps are shown in SGT. |
| Level | Component, Integration, Unit. The unit test checks that the service keeps the repository's order and maps every field with literal values. The SQL ordering (`ORDER BY created_at ASC`) is checked in the repository unit test and the e2e test. |
| Automated in | `backend/test/clarifications.e2e-spec.ts` (`REQ-CLAR-02-A`); `EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-02-A`); `clarifications.service.spec.ts` (`REQ-CLAR-02-A: returns the thread in repository order...`); `clarifications.repository.spec.ts` (`listComments`) |
| Result | Pass |

### REQ-CLAR-02-B: Awaiting-reply indicator

| Item | Description |
|---|---|
| AC | AC5: the Coordinator sees a clear indicator while a clarification awaits the Organiser's reply |
| Scenario | The indicator is shown while the clarification is open. It stays after the Organiser replies, and clears only when the clarification is resolved. This is the same rule in the backend (`awaiting_reply` is cleared only by resolve) and in the UI ("Pending" until resolved). |
| Pre-conditions | EVT-1003 has one open clarification from the Coordinator. |
| Steps (Organiser view) | 1. Open EVT-1003 as the Organiser. 2. Check the "Pending" badge. 3. Reply. 4. Check the badge again. |
| Steps (Coordinator view) | 1. Open EVT-1003 as the Coordinator who raised it. 2. Check the badge. |
| Steps (backend) | 1. Create the clarification (awaiting reply true). 2. Both parties read the thread: awaiting true, resolved false. 3. The Organiser replies. 4. Both parties read the thread again: still awaiting, still open. 5. Resolve. 6. Read: awaiting false, resolved true. |
| Expected | Organiser view: "Pending" shown, and still shown after the reply. Coordinator view: "Pending (1)" shown, with no "Answered". Backend: awaiting reply stays true until resolve, for both parties. |
| Level | Component (both views), Integration (backend state) |
| Automated in | `frontend/src/features/events/pages/detail/EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-02-B (Organiser view)`, `REQ-CLAR-02-B (Coordinator view)`); `backend/test/clarifications.e2e-spec.ts` (`REQ-CLAR-02-B`); `clarifications.service.spec.ts` (flag set on the new comment) |
| Result | Pass |
| Not covered | No real-time update (intentional). No WebSocket code. The page shows the state it loads. |

### REQ-CLAR-03 (extra, not in the SPM-39 document)

| Item | Description |
|---|---|
| Scenario | A Coordinator who is not assigned to an event cannot request a clarification on it. |
| Automated in | `clarifications.e2e-spec.ts` (`REQ-CLAR-03`); `EventDetailPage.clarifications.test.tsx` (`REQ-CLAR-03`); `clarifications.service.spec.ts` (`rejects a coordinator not assigned to the event`) |
| Result | Pass |


## 6. Unmapped tests (no test case ID)

These tests have no ID in their name or describe block, so the matrix cannot link them to an AC. Each needs an ID, or a decision that it is supporting coverage only.

### SPM-39 (59 tests)

**clarifications.controller.spec.ts** (1)

- L35: passes the session user to the service

**clarifications.service.spec.ts** (29)

- L144: rejects a clarification request when the event status disallows it
- L157: rejects a coordinator not assigned to the event, with no DB mutation
- L169: rejects a caller without the COORDINATOR role even if uid matches
- L182: returns not found for an unknown event
- L191: returns not found for a malformed event id without querying
- L202: rejects a blank reply without opening a transaction
- L212: notifies the assigned coordinator when the organiser replies
- L252: allows the assigned coordinator to reply and notifies the organiser
- L286: rejects a reply from someone who is neither the organiser nor the assigned coordinator
- L298: rejects a reply targeting a clarification that does not exist on this event
- L309: rejects a reply to an already-resolved clarification
- L325: marks the clarification resolved and notifies the organiser when the coordinator resolves it
- L346: allows the organiser to resolve and notifies the assigned coordinator
- L365: rejects a resolve from someone who is neither the organiser nor the assigned coordinator
- L375: rejects resolving a clarification that does not exist on this event
- L386: is idempotent when the clarification is already resolved
- L459: returns the thread for the organiser
- L470: rejects a coordinator not assigned to the event
- L479: rejects an unrelated authenticated user
- L494: still rejects an unassigned coordinator asking for clarification
- L504: still rejects a non-owning organiser and an unassigned coordinator reading the thread
- L517: still rejects a non-owning organiser replying on an assigned event
- L531: reply: a malformed clarification id -> 404 "Clarification request not found.", no transaction
- L540: reply: an unknown event -> 404 "Event not found.", no comment inserted
- L550: resolve: a malformed clarification id -> 404, no transaction
- L560: resolve: an unknown event -> 404 "Event not found.", nothing resolved
- L571: resolve: an already-resolved clarification missing from the thread -> 404, nothing written
- L584: listComments: an unknown event -> 404 "Event not found."
- L594: the author name falls back to the email, then to the uid, when no name is set

**clarification-input.spec.ts** (5)

- L27: rejects a missing message field
- L33: rejects a non-string message
- L39: rejects a message over the length limit
- L45: trims and accepts a valid message
- L51: surfaces the caller-supplied error text

**clarifications.repository.spec.ts** (9)

- L41: reads the event by id and returns its first row
- L49: returns undefined for an unknown event
- L56: locks the event row inside the caller transaction
- L67: scopes the lookup to this event and to clarification rows only, and locks it
- L82: stores the author name, role, message and awaiting flag, with a generated id, and returns the new row
- L112: generates a different id for each comment
- L126: marks the clarification resolved and clears awaiting_reply (AC5: only a resolve clears the flag)
- L139: stores the recipient, type, message and related event in order, with a generated id
- L161: reads the event thread in chronological order (AC4): ORDER BY created_at ASC

**clarifications.e2e-spec.ts** (3)

- L408: returns 403 when someone unrelated to the event replies
- L429: returns 403 when someone unrelated to the event resolves a clarification
- L449: returns 401 when authentication is missing

**ClarificationThread.test.tsx** (11)

- L69: shows the server's message when the clarification is rejected with an ApiError
- L82: shows the fallback text when the clarification fails with a non-API error
- L95: a blank reply shows the reply error and sends nothing
- L107: shows the server's message for a rejected reply, and the fallback for any other failure
- L122: shows the reply fallback text when a reply fails with a non-API error
- L140: shows the server's message when resolving fails with an ApiError, and the button recovers
- L156: shows the resolve fallback text when resolving fails with a non-API error
- L180: the Pending filter hides resolved clarifications and All shows them again
- L195: shows the pending empty message when nothing is pending, and the general one when there are no clarifications
- L217: labels each clarification with its author's role
- L224: renders nothing for a user who cannot ask or reply and there is no thread

**EventDetailPage.clarifications.test.tsx** (1)

- L281: both organiser and coordinator can resolve a clarification, which hides the reply button and marks it Answered

### SPM-61 (36 tests)

**registrations.e2e-spec.ts** (4)

- L101: lists a Confirmed event and accepts a registration for it
- L110: does not list an Approved event to attendees
- L117: hides an Approved event: detail 404, POST 404, no registration row
- L125: reports myRegistrationStatus per attendee in the browse list

**registration.test.ts** (4)

- L93: formats a UTC instant as SGT
- L101: formats as 12 Mar 2027, 23:59 in SGT
- L118: counts calendar days in SGT, not UTC
- L122: matches the design example of 163 days

**EventDetailPage.registration.test.tsx** (12)

- L85: shows a safe not-found state for a nonexistent attendee event
- L105: does not expose a restricted event when the attendee API request is denied
- L145: shows an attendee every core event-information field
- L172: keeps attendee event information consistent after a refresh
- L223: does not offer registration controls to a different role
- L252: shows the closing heading and Register button while registration is open
- L260: informs attendee that registration through website is not enabled when registrationEnabled is false
- L279: renders safe fallbacks when optional description and venue data are absent
- L293: hides registration information when its window timestamps are absent
- L314: shows the configured registration opening and closing times in SGT
- L341: shows Registration closed with the closing date and no availability
- L418: treats zero remaining registration spots as full

**RegistrationSection.test.tsx** (7)

- L108: State 1: open, closes in more than 1 day
- L117: uses the singular for 1 day
- L123: State 2: open, closes today (same SGT calendar day)
- L131: State 3: closed shows Closed on, drops Available, hides Register
- L140: not yet open shows the opening time and hides Register
- L146: uses the singular for 1 spot
- L382: shows MSG-04 and a manual Retry that resubmits

**EventListPage.test.tsx** (4)

- L71: EVE-CRE-01-A opens the Event Request form from Event Planning
- L90: EVE-CRE-07-B shows a submitted event under My Events
- L109: lets coordinators view rejected requests through the Rejected status filter
- L153: LEAD-ASN-09-M shows the coordinator's new-assignment panel on the events page

**useAppStore.registration.test.ts** (5)

- L26: retries a transient failure with exponential backoff
- L40: does not retry a 4xx error
- L46: clears a stale local registration when the server has none
- L56: does not retry a failed POST
- L62: refuses to send for a non-attendee

### SPM-62 (9 tests)

**EventDetailPage.registration.test.tsx** (1)

- L131: shows a request error instead of stale event details when loading fails

**RegistrationSection.test.tsx** (8)

- L784: shows '1 spot' in the singular when one place is left before registration opens
- L790: omits the Closes row before opening when no closing time is set
- L797: omits the Opens row while open when no opening time is set
- L804: omits the Closes row for a full event with no closing time
- L811: omits the Closed on row for a closed event with no closing time
- L818: a second submit while the first is in flight does not post again
- L835: moves focus to the error summary when the server names no invalid field
- L846: shows the server's validation message when the answer carries no field errors

### SPM-63 (31 tests)

**export.service.spec.ts** (7)

- L109: removes path separators, colons, quotes and control characters; converts to lowercase and replaces spaces with underscores
- L115: falls back to "event" when the name has no usable characters
- L120: builds a Content-Disposition with an ASCII fallback and a UTF-8 filename*
- L317: writes the special requirements in their own column
- L329: quotes special requirements that contain a comma, a quote or a line break
- L344: neutralises a formula typed into the special requirements
- L356: shows the special requirements column and text in the PDF

**RegistrationsModal.test.tsx** (11)

- L47: shows the count in the title and the capacity, period and waitlist summary
- L59: shows the access-refused message and no registrations on a 403
- L71: expands a card to show details and collapses it again
- L94: keeps a single card expanded at a time
- L181: shows 'No registrations yet' when there are none
- L192: downloads the CSV and the PDF through the server export
- L207: shows an export failure without closing the modal
- L269: shows a dash for the closing time when only the opening time is set
- L276: shows a dash for the opening time when only the closing time is set
- L283: shows a dash for an attendee with no contact number
- L295: shows the load error with a Retry that loads the report again

**useRegistrationReport.test.ts** (2)

- L28: shows the generic load message when the first load fails with a non-Error value
- L37: a 401 that arrives after the page has closed does not end the session

**useReportExport.test.ts** (4)

- L29: saves the file when the download succeeds
- L39: a 401 ends the session
- L46: a 403 keeps the session and shows the server's message
- L55: shows the generic failure text when the thrown value is not an Error

**registrationReport.download.test.ts** (7)

- L22: requests the export for the chosen format with the session cookie
- L31: uses the filename from the Content-Disposition header
- L43: falls back to <event id>_registrations.<format> when the header is absent
- L51: reports a network failure as a connection message
- L59: answers a 5xx with the service-unavailable message and keeps the status
- L70: shows the server's message for a 4xx answer with a JSON body
- L81: falls back to 'Request failed.' for a 4xx answer whose body is not JSON

### SPM-120 (3 tests)

**EventDetailPage.registration.test.tsx** (2)

- L202: registers through the server and offers no withdraw control
- L232: does not let an attendee withdraw another attendee's registration

**RegistrationSection.test.tsx** (1)

- L860: closes the dialog on a conflict even when the reload also fails


## 7. Gaps, derived mappings and notes

**Gaps in automated traceability**
- **Tests with no test case ID** (section 6). The largest groups: SPM-39 (59, mostly the clarification unit specs and some frontend tests), SPM-61 (36, mostly the registration validation and window unit specs), SPM-63 (31, mostly the report export and access unit specs), SPM-62 (9, the frontend `RegistrationSection` tests titled "SPM-62 AC4" but not ID-tagged), SPM-120 (3). These need IDs before they can be linked to an AC.
- **SPM-61 capacity tests (`EVENT-REG-05-C`) have no Jira AC.** The SPM-61 ACs don't include a capacity rule; the tests cover it as a hard limit. They are tagged AC5 (no duplicates), which is only partly right. Needs a PO decision: add a capacity AC, or move these tests to supporting coverage.
- **SPM-63 modal search and filters (`VIEW-REG-INFO-03-SEARCH`, `-03-SPECIAL`, `-03-TODAY`, `-03-TODAY-BND`) are not in the six SPM-63 ACs.** The `03` tag implies AC3 (names, emails, dates), which overstates them. Needs a PO decision.
- **SPM-62 IDs were renumbered on 2026-10-12** so the number is the AC: `-01` access (own registration only), `-02` status, `-03` details, `-04` visible after the event. The earlier numbers did not match their content. The AC4 test (`VIEW-REG-DET-04-A`) was added at backend level.
- **Legacy fixture labels (not counted toward any AC):** `REG-9001`, `REG-9002`, `REG-9007` and `REG-9011` in the e2e suites. These are former Confluence labels and do not follow the `<FEATURE>-<AC#>-<suffix>` convention.
- **Modal close tests** (`VIEW-REG-INFO-01-E` to `-01-H`) were renumbered under AC1, since closing the modal is part of viewing the report.

**Not checked in this matrix**
- The Confluence test case pages. The matrix was built from the code. No Confluence page was read or compared, so ID agreement with Confluence is unverified.
- The Playwright spec `EventDetailPage.withdraw.playwright.spec.ts` (1 test) was not run.
- The Jira ACs are used as read on 2026-10-12. Changes since then are not reflected.

**Open PO questions that affect results**
- A-NULL: blank display for NULL legacy detail columns (`VIEW-REG-INFO-03-A-NULL`, `VIEW-REG-DET-02-A`).
- SPM-62 AC2 "Cancelled" registration status: no such status exists in the schema.
- Unbounded registration window: a missing open or close time is allowed by the server.

**Action items before publishing**
1. Decide the 147 unmapped tests: give each an ID, or record it as supporting coverage only.
2. Confirm the SPM-62 mapping.
3. Decide the three PO questions above.
4. Read the Confluence test case pages and compare the IDs, then update the matrix.
