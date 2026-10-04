# SPM-97 / SPM-49 / SPM-85 — Event planning test cases

Repo-side index of the automated tests for **SPM-97** (Organiser views event information), **SPM-49** (Coordinator updates event information) and **SPM-85** (Review and resolve flagged event changes). The full case specifications (pre-conditions, steps, test data, expected results) are kept in Confluence under the same case IDs; this file lets a reader of the repository find the automation for each case and see the last recorded run.

Case IDs: `EVENT-VIEW-*` = SPM-97, `EVENT-UPDATE-*` = SPM-49, `EVENT-FLAG-*` = SPM-85. A suffix `-BND-n` is a boundary case and `-SEC-n` a security / robustness case. Every test name starts with its case ID, so `npx vitest run -t EVENT-FLAG-07-A` finds every test of a case.

## Running

```sh
# Backend unit tests (mocked repository) — no database needed
cd backend && npx vitest run src/events/event-update-input.spec.ts src/events/event-impact.spec.ts src/events/event-planning.service.spec.ts

# Backend integration tests (real repository, real SQL) — needs a DISPOSABLE PostgreSQL database.
# The spec applies database/postgresql/init/001_schema.sql and 007_*.sql itself.
cd backend && TEST_DATABASE_URL=postgresql://spm:spm@localhost:5432/spm_test npm run test:e2e -- src/events/event-planning.e2e-spec.ts

# Frontend component / page / helper tests
cd frontend && npx vitest run src/pages/EventDetailPage.planning.test.tsx src/components/domain/PlanningUpdateForm.test.tsx src/components/domain/FlaggedChangeReview.test.tsx src/components/domain/PlanningInformationPanel.test.tsx src/utils/planning.test.ts
```

Without `TEST_DATABASE_URL` the integration suite is skipped, not failed.

## Last recorded run

Run on a local Linux machine (Node 22, PostgreSQL 16) on 4 Oct 2026, not yet in CI. Replace this block with the CI run once the branch is pushed.

| Suite | Tests | Result |
| --- | --- | --- |
| `event-planning.service.spec.ts` | 91 | PASS |
| `event-update-input.spec.ts` | 57 | PASS |
| `event-impact.spec.ts` | 28 | PASS |
| `event-planning.e2e-spec.ts` (PostgreSQL) | 11 | PASS |
| `EventDetailPage.planning.test.tsx` | 24 | PASS |
| `PlanningUpdateForm.test.tsx` | 27 | PASS |
| `FlaggedChangeReview.test.tsx` | 17 | PASS |
| `PlanningInformationPanel.test.tsx` | 15 | PASS |
| `planning.test.ts` | 27 | PASS |
| **Planning total** | **297** | **PASS** |
| Whole backend suite / whole frontend suite | 622 / 312 | PASS |

Some of the new tests were checked by deliberately breaking the code under test (for example counting cancelled bookings, showing impacts to the organiser, refreshing while the tab is hidden, removing the resolve guard) and confirming a test fails.

## Case index

| Case | Story / AC | Scenario | Automated by | Result |
| --- | --- | --- | --- | --- |
| EVENT-VIEW-01-A | SPM-97 AC1 | Organiser views planning information once the event is Approved or Planning | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-01-B | SPM-97 AC1 | No planning information before approval (409); page makes no request; other roles never load it | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-01-C | SPM-97 AC1 | A Confirmed event is viewable by organiser and coordinator but read-only; edits refused | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-01-SEC-1 | SPM-97 AC1 | Only the owning organiser / assigned coordinator may view; others get 404, 403 or 401 | `event-planning.service.spec.ts` | PASS |
| EVENT-VIEW-02-A | SPM-97 AC2 | Current venues, equipment and booking details shown live; other events' bookings never exposed; malformed response handled | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-03-A | SPM-97 AC3 | Field with a booking-conflict change shows "Change pending"; impact detail hidden from the organiser | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-03-B | SPM-97 AC3 | Booked venue that became unavailable shows "Replacement venue required" | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-04-A | SPM-97 AC4 | Organiser cannot edit: read-only view, no controls, writes refused | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-VIEW-05-A | SPM-97 AC5 | View updates automatically after the coordinator resolves a change | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `planning.test.ts` | PASS |
| EVENT-VIEW-05-B | SPM-97 AC5 | Automatic refresh pauses while the tab is hidden and resumes when visible | `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-VIEW-05-C | SPM-97 AC5 | A failed refresh keeps the last data and shows an alert | `EventDetailPage.planning.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-UPDATE-01-A | SPM-49 AC1 | Assigned coordinator views current information (form pre-filled) | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-01-B | SPM-49 AC1 | Unassigned coordinator cannot view or update | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx` | PASS |
| EVENT-UPDATE-01-C | SPM-49 AC1 | Updates refused outside Approved/Planning | `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-02-A | SPM-49 AC2 | Fields labelled "Applies immediately" or "Needs review" | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx`, `planning.test.ts` | PASS |
| EVENT-UPDATE-03-A | SPM-49 AC3 | Coordinator updates fields; only changed fields are sent (trimmed, lists, dates) | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `PlanningUpdateForm.test.tsx`, `planning.test.ts` | PASS |
| EVENT-UPDATE-04-A | SPM-49 AC4 | Blank required field / bad value shows an error and saves nothing; server errors shown, input kept | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-04-B | SPM-49 AC4 | Invalid dates and empty updates rejected | `event-update-input.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-04-BND-1 | SPM-49 AC4 | Field length and attendance boundaries | `event-update-input.spec.ts` | PASS |
| EVENT-UPDATE-04-C | SPM-49 AC3 | Values identical to the stored ones are ignored, not applied or flagged | `event-planning.service.spec.ts` | PASS |
| EVENT-UPDATE-04-SEC-1 | SPM-49 AC4 | Unknown and server-controlled fields rejected | `event-update-input.spec.ts` | PASS |
| EVENT-UPDATE-05-A | SPM-49 AC5 | Fields not affecting bookings apply immediately | `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-UPDATE-06-A | SPM-49 AC6 | Last-updated time shown | `event-planning.service.spec.ts`, `PlanningUpdateForm.test.tsx`, `PlanningInformationPanel.test.tsx` | PASS |
| EVENT-FLAG-01-A | SPM-85 AC1 | Date/time, attendance, layout, facilities, equipment flagged "Needs Review" when a booking exists; one open review per field; date move assessed as one | `event-update-input.spec.ts`, `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `PlanningUpdateForm.test.tsx` | PASS |
| EVENT-FLAG-01-B | SPM-85 AC1 | An equipment arrangement alone triggers review | `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-01-C | SPM-85 AC1 | Nothing booked: the same changes apply immediately | `event-update-input.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-01-D | SPM-85 AC1 | Cancelled / unavailable / released bookings hold nothing and do not force review | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-02-A | SPM-85 AC2 | Current vs proposed value with impacted bookings; manual requirements and equipment re-checks | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-02-B | SPM-85 AC2 | Setup/turnaround conflicts included | `event-impact.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-02-BND-1 | SPM-85 AC2 | Boundaries of the turnaround buffer and overlap | `event-impact.spec.ts` | PASS |
| EVENT-FLAG-02-C | SPM-85 AC2 | A change that does not move the booking (attendance, layout, facilities) is not blamed for a gap that already existed | `event-impact.spec.ts`, `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-03-A | SPM-85 AC3 | Reject keeps the original value and clears the impact assessment | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx` | PASS |
| EVENT-FLAG-04-A | SPM-85 AC4 | Confirm applies the proposed value immediately; saving and failure states | `event-planning.service.spec.ts`, `EventDetailPage.planning.test.tsx`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-04-B | SPM-85 AC4 | Confirming one half of a date move may not leave the end before the start | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-04-SEC-1 | SPM-85 AC4 | Guards on resolving (state, decision, assignment) and transactions | `event-planning.service.spec.ts` | PASS |
| EVENT-FLAG-04-SEC-2 | SPM-85 AC4 | Simultaneous confirms apply and record once | `event-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-05-A | SPM-85 AC5 | History: original → confirmed value, coordinator, timestamp, status | `event-planning.service.spec.ts`, `FlaggedChangeReview.test.tsx`, `planning.test.ts` | PASS |
| EVENT-FLAG-05-B | SPM-85 AC5 | Owning organiser may read the history; other users may not | `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL) | PASS |
| EVENT-FLAG-06-A | SPM-85 AC6 | Impacted bookings listed per venue booking | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `FlaggedChangeReview.test.tsx` | PASS |
| EVENT-FLAG-07-A | SPM-85 AC7 | Each booking decided independently; change closes once every impacted booking is decided | `event-impact.spec.ts`, `event-planning.service.spec.ts`, `event-planning.e2e-spec.ts` (PostgreSQL), `FlaggedChangeReview.test.tsx` | PASS |

Where a case lists several suites, each covers a different layer: `event-update-input` / `impact` are pure rules, `service` is the business logic with a mocked repository, `e2e` is the same logic against PostgreSQL, and the frontend suites cover the page, form, review panel, information panel and helpers.

## Assumptions behind the expected results

The full list, with the reasoning, is `backend/HANDOVER.md` → "Rules and assumptions". The ones that decide an expected result, and that the team should confirm, are:

1. **Planning phase.** `Approved` and `Planning` events can be viewed and edited; `Confirmed` events can be viewed but nobody can edit them; any other status returns 409.
2. **Field policy.** Event name, purpose, description and accessibility needs always apply immediately. Date/time, attendance, venue requirements (layout + facilities) and equipment requirements apply immediately while nothing is booked, and are flagged "Needs Review" once an *active* venue booking or equipment arrangement exists.
3. **Active bookings.** Venue bookings that are `Unavailable` or `Cancelled`, and equipment that is `Unavailable`, `Cancelled` or `Released`, hold nothing: they do not force a review and are not assessed.
4. **Turnaround buffer.** 30 minutes between two events' bookings at one venue; exactly 30 is allowed, touching bookings conflict. **Confirm the figure.**
5. **Per-booking decisions (SPM-85 AC7).** An event field has one value, so a decision for one booking leaves the change at "Needs Review" and leaves other bookings untouched; once every impacted booking is decided the change closes as *Applied* if all were confirmed, otherwise *Rejected*. **Confirm this reading of AC7.**
6. **Layout and facilities** cannot be checked automatically (venue data is not stored yet), so every active booking is listed for a manual check.
7. **One open review per field**, and values identical to the stored value are ignored.
8. **Privacy.** The organiser sees that a change is pending, but never the impact detail, which names other organisers' events.
9. **Live updates.** The frontend polls every 15 seconds while the tab is visible; there is no push channel.
10. **Placeholders.** `venue_bookings` and `equipment_reservations` are minimal placeholder tables until the venue-booking and equipment stories land.

## Not covered by automated tests

- No browser (Playwright) test of the organiser–coordinator workflow end to end.
- No test of an update racing a decision on the same event. Two simultaneous decisions on one change are covered (`EVENT-FLAG-04-SEC-2`); two independent protections each prevent a double record (the locked event row and the guarded `UPDATE ... WHERE status = 'Needs Review'`), and the test fails only if both are removed.
- No test of the migration path onto a database that already holds other branches' tables; `007` was applied by hand to the supported combinations (see `AI_USAGE.md`).
- Real-time push updates (out of scope; see assumption 9).
