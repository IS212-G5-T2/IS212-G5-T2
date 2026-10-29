# SPM-97 / SPM-49 / SPM-85 — Event planning test cases

Repo-side index of the automated tests for **SPM-97** (Organiser views event information), **SPM-49** (Coordinator updates event information) and **SPM-85** (Review and resolve flagged event changes). The full case specifications (pre-conditions, steps, test data, expected results) are kept in Confluence under the same case IDs; this file lets a reader of the repository find the automation for each case and see the last recorded run.

Case IDs: `EVENT-VIEW-*` = SPM-97, `EVENT-UPDATE-*` = SPM-49, `EVENT-FLAG-*` = SPM-85. A suffix `-BND-n` is a boundary case and `-SEC-n` a security / robustness case. Every test name starts with its case ID, so `npx vitest run -t EVENT-FLAG-07-A` finds every test of a case.

## Running

```sh
# Backend unit tests (mocked repository) — no database needed
cd backend && npx vitest run src/events/planning

# Backend integration tests (real repository, real SQL) — needs a DISPOSABLE PostgreSQL database.
# The spec applies database/postgresql/init/001_schema.sql and 026_spm156_direct_update_history.sql itself.
# Uses TEST_DATABASE_URL if set, otherwise DATABASE_URL (which the Backend E2E CI job provides).
cd backend && TEST_DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-planning.e2e-spec.ts

# HTTP route tests (real AppModule, session-cookie auth, real PostgreSQL) — uses DATABASE_URL
cd backend && DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- test/events-planning.http.e2e-spec.ts

# Frontend component / page / helper tests
cd frontend && npx vitest run src/features/events/pages/detail/EventDetailPage.planning.test.tsx src/features/events/pages/detail/planning src/utils/planning.test.ts
```

File paths: the backend planning code moved to `backend/src/events/planning/` (`event-planning.service.ts`, `event-planning.repository.ts`, `event-planning.controller.ts`, `dto/event-update-input.ts`, `helpers/event-impact.ts`). Older rows below name the files without that folder.

Locally, with neither `TEST_DATABASE_URL` nor `DATABASE_URL` set, the integration suite is skipped. In CI (`CI` is set) a missing database **fails** the suite instead, so a green pipeline cannot hide these tests being skipped. Both suites run in the Backend E2E Tests job.

## Last recorded run

Run on a local Linux machine (Node 22, PostgreSQL 16) on 7 Oct 2026, after the review fixes (impact-based flagging, multi-role coordinators, authoritative form values), not yet in CI. Replace this block with the CI run once the branch is pushed.

| Suite | Tests | Result |
| --- | --- | --- |
| `event-planning.service.spec.ts` | 106 | PASS |
| `event-update-input.spec.ts` | 57 | PASS |
| `event-impact.spec.ts` | 43 | PASS |
| `events-planning.e2e-spec.ts` (PostgreSQL) | 12 | PASS |
| `EventDetailPage.planning.test.tsx` | 30 | PASS |
| `PlanningUpdateForm.test.tsx` | 39 | PASS |
| `FlaggedChangeReview.test.tsx` | 17 | PASS |
| `PlanningInformationPanel.test.tsx` | 15 | PASS |
| `planning.test.ts` | 41 | PASS |
| `events-planning.http.e2e-spec.ts` (HTTP + PostgreSQL) | 6 | PASS |
| **Planning total** | **366** | **PASS** |
| Whole backend suite / whole frontend suite | 652 / 344 | PASS |

Some of the new tests were checked by deliberately breaking the code under test (for example counting cancelled bookings, showing impacts to the organiser, refreshing while the tab is hidden, removing the resolve guard) and confirming a test fails. For the review fixes: restoring the old "anything booked ⇒ review" rule fails 8 tests (including EVENT-UPDATE-05-B attendance 80 → 70 with a 200-seat venue); checking the primary role instead of `hasRole` fails EVENT-UPDATE-01-D; not resetting the form after a save fails both EVENT-FLAG-01-E page tests; remounting the form on `lastUpdatedAt` fails the EVENT-UPDATE-05-A confirmation test.

## Case index

| Case | Story / AC | Scenario | Automated by | Result |
| --- | --- | --- | --- | --- |
| EVENT-VIEW-01-A | SPM-97 AC1 | Organiser views planning information once the event is Approved or Planning | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-01-B | SPM-97 AC1 | No planning information before approval (409); page makes no request; other roles never load it | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-01-C | SPM-97 AC1 | A Confirmed event is viewable by organiser and coordinator but read-only; edits refused | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-01-SEC-1 | SPM-97 AC1 | Only the owning organiser / assigned coordinator may view; others get 404, 403 or 401 | `event-planning.service.spec.ts` | PASS |
| EVENT-VIEW-02-A | SPM-97 AC2 | Current venues, equipment and booking details shown live; other events' bookings never exposed; malformed response handled | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-03-A | SPM-97 AC3 | Field with a booking-conflict change shows "Change pending"; impact detail hidden from the organiser | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-03-B | SPM-97 AC3 | Booked venue that became unavailable shows "Replacement venue required" | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-04-A | SPM-97 AC4 | Organiser cannot edit: read-only view, no controls, writes refused | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-05-A | SPM-97 AC5 | View updates automatically after the coordinator resolves a change | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-05-B | SPM-97 AC5 | Automatic refresh pauses while the tab is hidden and resumes when visible | `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-05-C | SPM-97 AC5 | A failed refresh keeps the last data and shows an alert | `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-UPDATE-01-A | SPM-49 AC1 | Assigned coordinator views current information (form pre-filled) | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-01-B | SPM-49 AC1 | Unassigned coordinator cannot view or update | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-UPDATE-01-C | SPM-49 AC1 | Updates refused outside Approved/Planning | `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-01-D | SPM-49 AC1 | A user holding several roles (e.g. organiser + coordinator) who is the assigned coordinator gets the editing UI; holding the role without the assignment does not | `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-UPDATE-02-A | SPM-49 AC2 | Fields labelled by mode: always direct, conditional (with its condition) or needs review; modes reflect which arrangements exist | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-02-B | SPM-49 AC2 | Conditional fields state their rule (time window, capacity, removals only) and predict whether an edited value will apply immediately or go to review | `PlanningUpdateForm.test.tsx`, `planning.test.ts` | PASS |
| EVENT-UPDATE-03-A | SPM-49 AC3 | Coordinator updates fields; only changed fields are sent (trimmed, lists, dates) | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx`, `planning.test.ts` | PASS |
| EVENT-UPDATE-04-A | SPM-49 AC4 | Blank required field / bad value shows an error and saves nothing; server errors shown, input kept | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-04-B | SPM-49 AC4 | Invalid dates and empty updates rejected | `event-update-input.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-04-BND-1 | SPM-49 AC4 | Field length and attendance boundaries | `event-update-input.spec.ts` | PASS |
| EVENT-UPDATE-04-C | SPM-49 AC3 | Values identical to the stored ones are ignored, not applied or flagged | `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-04-SEC-1 | SPM-49 AC4 | Unknown and server-controlled fields rejected | `event-update-input.spec.ts` | PASS |
| EVENT-UPDATE-05-A | SPM-49 AC5 | Fields not affecting bookings apply immediately | `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-05-B | SPM-49 AC3, AC5 | Booking-sensitive changes that stay compatible with every existing booking/arrangement apply immediately even though bookings exist (attendance within capacity, time inside the booked window, facility removal, equipment change with only a venue booked, attendance with only equipment) | `event-impact.spec.ts`, `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `PlanningUpdateForm.test.tsx`, `planning.test.ts` | PASS |
| EVENT-UPDATE-06-A | SPM-49 AC6 | Last-updated time shown | `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-FLAG-01-A | SPM-85 AC1 | Date/time, attendance, layout, facilities, equipment changes flagged "Needs Review" when incompatible with an existing booking/arrangement; compatible fields in the same update still apply; one open review per field (even for a compatible value); date move assessed as one | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-FLAG-01-B | SPM-85 AC1 | An equipment arrangement alone triggers review of a change that affects it (equipment requirements, a longer event) | `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-01-C | SPM-85 AC1 | Nothing booked: the same changes apply immediately | `event-update-input.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-01-D | SPM-85 AC1 | Cancelled / unavailable / released bookings hold nothing and do not force review | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-01-E | SPM-85 AC1, SPM-49 AC1 | After a flagged save the form shows the authoritative current value, the proposal separately, and locks the field so it cannot be resubmitted | `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-FLAG-02-A | SPM-85 AC2 | Current vs proposed value with impacted bookings; manual requirements and equipment re-checks | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-02-B | SPM-85 AC2 | Moving outside a booking's held window is a `window` conflict, plus any setup/turnaround clash | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-02-BND-1 | SPM-85 AC2 | Boundaries of the turnaround buffer and overlap | `event-impact.spec.ts` | PASS |
| EVENT-FLAG-02-C | SPM-85 AC2 | A change that does not move the booking outside its held window (attendance, layout, facilities, a time inside the window) is not blamed for a gap that already existed | `event-impact.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-03-A | SPM-85 AC3 | Reject keeps the original value and clears the impact assessment | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx` | PASS |
| EVENT-FLAG-04-A | SPM-85 AC4 | Confirm applies the proposed value immediately; saving and failure states | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-04-B | SPM-85 AC4 | Confirming one half of a date move may not leave the end before the start | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-04-SEC-1 | SPM-85 AC4 | Guards on resolving (state, decision, assignment) and transactions | `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-04-SEC-2 | SPM-85 AC4 | Simultaneous confirms apply and record once | `events-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-05-A | SPM-85 AC5 | History: original → confirmed value, coordinator, timestamp, status | `event-planning.service.spec.ts`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-05-B | SPM-85 AC5 | Owning organiser may read the history; other users may not | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-06-A | SPM-85 AC6 | Impacted bookings listed per venue booking; only the bookings a change is incompatible with are marked impacted | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `FlaggedChangeReview.test.tsx` | PASS |
| EVENT-FLAG-07-A | SPM-85 AC7 | Each booking decided independently; change closes once every impacted booking is decided | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL), `FlaggedChangeReview.test.tsx` | PASS |

Where a case lists several suites, each covers a different layer: `event-update-input` / `impact` are pure rules, `service` is the business logic with a mocked repository, `e2e` is the same logic against PostgreSQL, and the frontend suites cover the page, form, review panel, information panel and helpers.

### Supporting cases added by SPM-142 (unit test coverage)

Added on 11 Oct 2026 to bring the planning files to 100% line and branch coverage in the unit/component run. Each is a supporting case under the story's existing AC, recorded on the matching Confluence case page and story matrix. SPM-85 AC numbers here follow the current Jira story (8 ACs: AC2 = when a change needs review, AC4 reject, AC5 confirm, AC6 history, AC7 per-venue listing, AC8 per-booking decisions); rows in the case index above still use the earlier numbering (AC3 reject, AC4 confirm, AC5 history, AC6 per venue, AC7 per booking).

| Case | Story / AC | Scenario | Automated by |
| --- | --- | --- | --- |
| EVENT-VIEW-01-SEC-2 | SPM-97 AC1 (update part: SPM-49 AC1) | A well-formed event id that does not exist answers "not found" to the view and to an update | `event-planning.service.spec.ts` |
| EVENT-VIEW-02-E | SPM-97 AC2 | An approved event with no coordinator yet is shown with no coordinator | `event-planning.service.spec.ts` |
| EVENT-VIEW-02-F | SPM-97 AC2 | Event rows are returned with ISO UTC times; missing coordinator and registration values and a missing event are handled | `event-planning.repository.spec.ts` |
| EVENT-VIEW-02-G | SPM-97 AC2 | Venue bookings (with neighbours) and equipment arrangements are mapped with ISO times; the proposed window is passed or sent as null | `event-planning.repository.spec.ts` |
| EVENT-VIEW-02-H | SPM-97 AC2 | No room layout recorded shows a dash | `PlanningInformationPanel.test.tsx` |
| EVENT-VIEW-05-D | SPM-97 AC5 | Shared page path, run as the assigned coordinator: a planning load that fails without a message shows a general refresh alert | `EventDetailPage.planning.test.tsx` |
| EVENT-VIEW-05-E | SPM-97 AC5 | Shared page path, run as the assigned coordinator: a refresh updates only this event in the shared event list | `EventDetailPage.planning.test.tsx` |
| EVENT-UPDATE-01-E | SPM-49 AC1 | An unreadable stored date opens as an empty date input (the toLocalInput guard is tested directly; the render test checks what the coordinator sees) | `PlanningUpdateForm.test.tsx` |
| EVENT-UPDATE-01-SEC-1 | SPM-49 AC1 (decision part: SPM-85 AC4, AC5) | No session: update and decision refused (401) before any read; an owner who also holds the coordinator role but is not assigned has the update refused (404) and nothing written | `event-planning.service.spec.ts` |
| EVENT-UPDATE-02-C | SPM-49 AC2 | A field with no edit policy from the server shows no badge | `PlanningUpdateForm.test.tsx` |
| EVENT-UPDATE-04-D | SPM-49 AC4 | Text fields: null required field is "required"; numbers, lists, objects and a null optional field are "Enter valid text." | `event-update-input.spec.ts` |
| EVENT-UPDATE-04-E | SPM-49 AC4 | A room layout outside the allowed list is refused | `event-update-input.spec.ts` |
| EVENT-UPDATE-04-F | SPM-49 AC4 | Facilities / accessibility: non-list, unknown option, non-text entry, or more entries than the allowed vocabulary, refused (input validation matching event creation) | `event-update-input.spec.ts` |
| EVENT-UPDATE-04-G | SPM-49 AC4 | A start or end sent as a number or null is reported as required | `event-update-input.spec.ts` |
| EVENT-UPDATE-04-H | SPM-49 AC4 | Server errors for the facility and accessibility lists are each shown directly under their own list; a refusal with no field errors marks no field | `PlanningUpdateForm.test.tsx` |
| EVENT-UPDATE-04-SEC-2 | SPM-49 AC4 | The repository writes only whitelisted columns, as parameters, and always stamps `updated_at` | `event-planning.repository.spec.ts` |
| EVENT-UPDATE-05-C | SPM-49 AC5 | A missing or cleared start time is predicted to need review | `planning.test.ts`, `PlanningUpdateForm.test.tsx` |
| EVENT-UPDATE-05-D | SPM-49 AC5 | "Removals only" with a missing proposed or current facility list | `planning.test.ts` |
| EVENT-FLAG-01-F | SPM-85 AC1, AC6 | Defensive fallback: the proposer is recorded by name, else email, else "Coordinator" | `event-planning.service.spec.ts` |
| EVENT-FLAG-01-G | SPM-85 AC1 | A flagged change is stored as JSON; a concurrent duplicate (23505) is a conflict naming the field; other errors pass through | `event-planning.repository.spec.ts` |
| EVENT-FLAG-04-C | SPM-85 AC4, AC5 | Resolving a change that is no longer pending is refused as already resolved | `event-planning.repository.spec.ts` |
| EVENT-FLAG-04-SEC-3 | SPM-85 AC4, AC5 | A decision request with no body or a non-object body is refused | `event-planning.service.spec.ts` |
| EVENT-FLAG-04-SEC-4 | SPM-85 AC4, AC5 | Nested work shares one transaction; event and change rows are locked only inside it | `event-planning.repository.spec.ts` |
| EVENT-FLAG-04-SEC-5 | SPM-85 AC4, AC5 | A malformed change id is "not found" without a query | `event-planning.repository.spec.ts` |
| EVENT-FLAG-05-C | SPM-85 AC6 | Defensive: a resolved change without resolver or time (prevented by `event_flagged_changes_resolution_check`) still appears in history with blank details | `event-planning.service.spec.ts` |
| EVENT-FLAG-05-D | SPM-85 AC6 | Flagged-change rows are mapped with and without resolution details; found and not-found lookups | `event-planning.repository.spec.ts` |
| EVENT-FLAG-07-B | SPM-85 AC8 | A per-booking decision updates that booking's entry only; a decision without a booking closes the change | `event-planning.repository.spec.ts` |

`event-planning.repository.spec.ts` stubs the database, so it proves the TypeScript around the SQL (connection choice, locking, column whitelist, error mapping, row mapping), not the SQL; `test/events-planning.e2e-spec.ts` proves the SQL against PostgreSQL.

**Left uncovered in the unit run, with reasons**

- `event-planning.service.ts` lines 727 and 750–751, the `default` branch of the editable-field `switch`: unreachable. Direct fields return before the `switch`, and every `review_if_impacting` field has its own `case`.
- `event-planning.service.ts` line 93 and `event-planning.repository.ts` line 167: the `typeof X === "undefined" ? Object : X` branch the TypeScript compiler emits for decorator parameter metadata on `@Injectable()` classes, not code in the source file.
- `EventDetailPage.tsx` lines 138 and 154, `if (!id) return` in `loadPlanning` / `loadHistory`: unreachable. The page is only routed at `/events/:id`, and planning is loaded only once the event with that id is found.
- Other uncovered branches in `EventDetailPage.tsx` belong to other stories and are left to their owners (see SPM-141).

### HTTP route tests

`backend/test/events-planning.http.e2e-spec.ts` drives `GET/PATCH /api/events/:id/planning`, `POST .../changes/:changeId/resolve` and `GET .../history` through the real `AppModule`, `AuthenticationMiddleware` (session cookies from `/api/auth/login`) and PostgreSQL. These IDs are repo-side; add matching Confluence cases if the team wants them tracked there.

| Case | Covers | What it proves | Result |
| --- | --- | --- | --- |
| EVENT-UPDATE-HTTP-01 | SPM-49 AC1, SPM-97 AC4 | Every planning route returns 401 without a session; nothing saved | PASS |
| EVENT-UPDATE-HTTP-02 | SPM-49 AC1, AC3, AC6 | Assigned coordinator PATCH applies immediately; next GET shows the value and a later `lastUpdatedAt` | PASS |
| EVENT-UPDATE-HTTP-03 | SPM-97 AC4 | Owning organiser gets a read-only view and 403 on PATCH | PASS |
| EVENT-UPDATE-HTTP-04 | SPM-49 AC1 | Unassigned coordinator gets 404 on GET and PATCH | PASS |
| EVENT-UPDATE-HTTP-05 | SPM-49 AC4 | Identity fields in the body are rejected (400); identity comes only from the session | PASS |
| EVENT-UPDATE-HTTP-06 | SPM-49 AC3/AC5, SPM-85 AC1/AC3/AC5 | Compatible attendance applies despite a booking; incompatible is flagged; resolve route confirms; history records both (the direct update since SPM-156) | PASS |
| EVENT-UPDATE-HTTP-07 | SPM-49 AC5, AC6 (SPM-156) | An update on an Approved event appears in `GET .../history` for the coordinator and the owning organiser, with the same time as `updatedAt` | PASS |

Removing `EventPlanningController` from the authentication middleware's routes fails 5 of these 6 tests.

### Cases added by SPM-156 (change history for updates applied immediately)

Defect: an update the coordinator applied immediately was saved but never written to the change history, because history was built only from flagged changes. It showed on every update to an Approved event (nothing is booked yet, so every update applies immediately) and on direct updates to Planning events. Fix: each field applied immediately is recorded as an Applied `direct_update` row in the same transaction (migration 026), the history response carries `kind`, the form and history list say "Updated directly" / "Last changed" instead of "confirmed", and the owning organiser sees the history read-only.

| Case | Story / AC | Scenario | Automated by |
| --- | --- | --- | --- |
| EVENT-UPDATE-07-A | SPM-49 AC3, AC5, AC6 | Update on an Approved event: one Applied history entry per changed field (field, old and new value, coordinator, time equal to `updatedAt`); every AC5 field group; a refused update records nothing; a failed history write fails the whole update | `event-planning.service.spec.ts`, `event-planning.repository.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) |
| EVENT-UPDATE-07-B | SPM-49 AC5, SPM-85 AC6 | Planning event with bookings: the compatible change is recorded directly, the flagged one only once confirmed or rejected; nothing changed or everything flagged writes no direct entry | `event-planning.service.spec.ts`, `events-planning.e2e-spec.ts` (PostgreSQL) |
| EVENT-UPDATE-07-C | SPM-49 AC5, SPM-85 AC6 | History tells a direct update ("Updated directly", "Last changed by") from a reviewed change ("Applied"/"Rejected", "Last change confirmed/rejected by") | `event-planning.service.spec.ts`, `ChangeHistoryList.test.tsx`, `PlanningUpdateForm.test.tsx`, `planning.test.ts` |
| EVENT-UPDATE-07-D | SPM-97 AC2 (SPM-156) | The owning organiser sees the Change History card read-only, including direct updates; no empty card when nothing is recorded | `EventDetailPage.planning.test.tsx` |
| EVENT-UPDATE-07-SEC-1 | SPM-156 | The database refuses a direct update that is not Applied, a flagged change to a field that cannot affect a booking, and an unknown kind | `events-planning.e2e-spec.ts` (PostgreSQL) |

Run on a local Linux machine (Node 22, PostgreSQL 16 with init 001 to 026) on 29 Oct 2026: backend unit (all suites), backend E2E (all suites) and the frontend event and utils suites PASS. The new 07-A/07-B/07-C service tests fail on `dev` before the fix.

## Assumptions behind the expected results

The full list, with the reasoning, is `backend/HANDOVER.md` → "Rules and assumptions". The ones that decide an expected result, and that the team should confirm, are:

1. **Planning phase.** `Approved` and `Planning` events can be viewed and edited; `Confirmed` events can be viewed but nobody can edit them; any other status returns 409.
2. **Field policy (impact-based).** Event name, purpose, description and accessibility needs always apply immediately. Date/time, attendance, venue requirements (layout + facilities) and equipment requirements apply immediately when the new value stays compatible with every active venue booking and equipment arrangement, and are flagged "Needs Review" only when incompatible with at least one. Compatible means: attendance within each booked capacity; a time inside the window each booking holds (and the event's current window when equipment is reserved); facilities only removed; equipment requirements changed while no equipment is reserved. **Confirm in Jira** that this is the intended reading of "does not affect bookings" (SPM-49 AC3/AC5) rather than "nothing is booked".
   - **Open requirement conflict (blocks sign-off of EVENT-UPDATE-05-B / EVENT-FLAG-01-A).** SPM-49 AC3/AC5 (Jira and Confluence) and the Confluence SPM-85 matrix support this impact-based rule, but the current **Jira SPM-85 AC1** says the listed fields are "Needs Review" whenever bookings or arrangements exist. The implementation and tests follow the impact-based reading. The tests do not settle the requirement; the product owner must update one source so they agree. Proposed Jira SPM-85 AC1 wording: *"Given an event has existing venue bookings or equipment arrangements, when the coordinator changes the date/time, expected attendance, venue requirements or equipment requirements, then the change is flagged 'Needs Review' only if it is incompatible with at least one active booking or arrangement; compatible changes are applied immediately (SPM-49 AC5)."* If the team instead keeps the stricter Jira wording, `event-impact.ts`, `utils/planning.ts` and the EVENT-UPDATE-05-B tests must change.
3. **Active bookings.** Venue bookings that are `Unavailable` or `Cancelled`, and equipment that is `Unavailable`, `Cancelled` or `Released`, hold nothing: they do not force a review and are not assessed.
4. **Turnaround buffer.** 30 minutes between two events' bookings at one venue; exactly 30 is allowed, touching bookings conflict. **Confirm the figure.**
5. **Per-booking decisions (SPM-85 AC7).** An event field has one value, so a decision for one booking leaves the change at "Needs Review" and leaves other bookings untouched; once every impacted booking is decided the change closes as *Applied* if all were confirmed, otherwise *Rejected*. **Confirm this reading of AC7.**
6. **Layout and added facilities** cannot be checked automatically (venue data is not stored yet), so every active booking is listed for a manual check. Equipment-requirement changes likewise list every active reservation. Each booking is assumed to cover the whole event; an event split across time slots would make every time change need review. **Confirm.**
7. **One open review per field**, and values identical to the stored value are ignored.
8. **Privacy.** The organiser sees that a change is pending, but never the impact detail, which names other organisers' events.
9. **Live updates.** The frontend polls every 15 seconds while the tab is visible; there is no push channel.
10. **Bookings and placeholders.** Venue bookings come from SPM-124's `venue_bookings` table (statuses mapped as described in `backend/HANDOVER.md`); `equipment_reservations` is still a minimal placeholder until the equipment story lands.

## Not covered by automated tests

- No browser (Playwright) test of the organiser–coordinator workflow end to end. The HTTP route suite above covers the real controller and authentication path; the remaining gap is the browser UI against a live backend (existing `*.playwright.spec.ts` files run manually via `backend/scripts/testing/run-browser.mjs`, not in CI).
- No test of an update racing a decision on the same event. Two simultaneous decisions on one change are covered (`EVENT-FLAG-04-SEC-2`); two independent protections each prevent a double record (the locked event row and the guarded `UPDATE ... WHERE status = 'Needs Review'`), and the test fails only if both are removed.
- No test of the migration path onto a database that already holds other branches' tables; `007` was applied by hand to the supported combinations (see `AI_USAGE.md`).
- Real-time push updates (out of scope; see assumption 9).
- The form's "will apply / will need review" prediction mirrors the backend rules in `utils/planning.ts`; the two are tested separately, not against each other, so a rule change must be made in both.
