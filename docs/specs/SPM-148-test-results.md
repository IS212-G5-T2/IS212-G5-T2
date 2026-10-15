# SPM-148 Event Status Changes from Approved to Planning: build and test results

Status: features and tests written; every suite run once. **Not reviewed:** Test Code Review, Requirement Review, Code Quality Review and the mutation check (Guide 7) were deliberately not run, at the user's instruction. Nothing below is review evidence.

Sources: the pasted SPM-148 prompt (AC text, rules R1 to R12, resolved-spec table 2.6). `docs/prompts/test-code-generation-guide.md` and `docs/specs/SPM-148-test-cases.md` do **not exist in the repository**, so oracles come from the prompt only and the 32 IDs below are the prompt's `PLAN-STATUS-nn-x` list. The Jira story was not re-read.

## Repo differences from the prompt (confidence VERIFIED unless noted)

| Prompt assumption | Repo reality | What was done |
|---|---|---|
| MySQL, `EVT-801`-style ids | PostgreSQL, UUID ids, Nest + Vitest | Fixtures create per-test users, venues and events with the real schema; no shared seed edited |
| Booking endpoint, single and multi-venue | `POST /api/venues/:venueId/booking-requests`, one venue and one slot per request | Transition added inside its transaction (D2 option A). Multi-venue cases Not Automated |
| `StatusChangeService`, history table | `StatusService`; `event_status_history(from_status,to_status,actor_id,created_at)` from SPM-135 | Reused; added `GET /api/events/:eventId/status-history` and 405 handlers |
| Statuses Draft / Under Review | Events are Submitted, Approved, Rejected, Planning, Confirmed, Completed, Cancelled | Active workload list is Submitted, Approved, Planning, Confirmed (was Submitted, Approved, Confirmed) |
| Coordinator queue with `?status=` (SPM-48) | No queue endpoint. `GET /api/events` is coordinator-scoped; `EventListPage` already has a client-side Planning filter | No queue built (D8 alternative: queue cases Not Automated). AC5 asserted on the events list |
| Workload API, limit 5, `availability()` | No workload API. The Lead list returns `activeAssignments`; availability is a manual flag (`users.is_available`) plus a Lead notice that counts active events | AC6 asserted on the Lead list and the unavailable notice. Limit-5 function Not Automated |
| Unassigned Coordinator / non-Coordinator get 403 | Existing: unassigned Coordinator 404 "Assigned event not found."; other roles 403 "Coordinator access required." | Existing responses asserted as they are (F3 rule) |
| D3: every status other than Approved/Planning/Confirmed gets 409 | SPM-51 already accepts bookings for Submitted events (its tests rely on it) | Submitted kept open (no transition). Rejected, Completed, Cancelled get 409. **Decision for you: D3 deviation** |
| Organiser can start a clarification thread (07-A) | SPM-39: only the assigned Coordinator starts a thread; Organiser and Coordinator reply | Existing roles asserted. Organiser-started post Not Automated (F16: stop and ask) |
| Parallel identical requests give 4 conflicts (03-D) | Pending requests without a hold do not block each other | Asserted: five bookings, exactly one `statusChanged`, one history row |
| API status casing | `GET /api/events` returns lowercase (`planning`); history and DB keep `Planning` | Asserted as the repo has it |

## Changes to finished stories (D13)

`event-status.ts` (renamed `ACTIVE_COORDINATOR_EVENT_STATUSES` to `ACTIVE_WORKLOAD_STATUSES`, added Planning; new `BOOKING_OPEN_STATUSES`, `CLARIFICATION_OPEN_STATUSES`, `shouldTransitionToPlanning`), `venues.repository.ts`/`venues.service.ts` (status guard, compare-and-set, history, response fields), `booking-request.ts` (strict body), `clarifications.service.ts` (Planning open, Confirmed 409), `lead-assignment.service.ts` and `coordinator-availability.service.ts` (constant import only), `status.controller.ts`/`status.service.ts` (history read, 405), `EventDetailPage.tsx` (history panel), `VenueRecordDetailPage.tsx` (MSG-PL-01, store status). Existing tests updated for the new active list: `lead-assignment.service.spec.ts`, `lead-assignment.e2e-spec.ts`, `venues.repository.spec.ts` (mock event row now carries `status`).

Lock order: the event row is now `FOR UPDATE` (was `FOR SHARE`) after the venue row; no other code path locks the event first and then a venue, so no cycle was found (reasoned, plus 20 clean parallel runs).

## Results (all runs actual)

| Test case | Subtest | File :: test | Layer | Result | Notes |
|---|---|---|---|---|---|
| 01-A | | `test/events-planning-transition.e2e-spec.ts` :: PLAN-STATUS-01-A; `VenueRecordDetailPage.planning.test.tsx` :: 01-A | BE integration, FE | Pass | MSG-PL-01 wording ASSUMED |
| 01-B | 5 statuses | e2e :: PLAN-STATUS-01-B (it.each) | BE | Pass | Submitted and Confirmed 201 no change; Rejected/Completed/Cancelled 409. Unit table in `event-status.spec.ts`. Cancelled uses MSG-PL-02 (no SPM-136 guard on this branch) |
| 01-C | conflict | e2e :: 01-C | BE | Pass | |
| 01-C | capacity / suitability | | | Not Automated | Endpoint has no capacity or suitability check |
| 01-D | 4 roles + 401 | e2e :: 01-D | BE | Pass | Existing 404/403 text |
| 01-E | multi-venue | | | Not Automated | One venue per request |
| 02-A | | e2e :: 02-A | BE | Pass | `booking.created_at` is DB time, so only history and `events.updated_at` equal T0 |
| 02-B, 02-C, 02-D | faults after status UPDATE, booking INSERT, history INSERT | e2e :: 02-B/C/D | BE real DB | Pass | Database trigger raises right after the write; retry succeeds. No hold table, no hold assertion |
| 02-E | parallel | e2e :: 02-E | BE real DB | Pass | Adapted: two venues, same event |
| 03-A | | e2e :: 03-A; FE :: 03-A | BE, FE | Pass | |
| 03-B | | e2e :: 03-B | BE | Pass | |
| 03-C | | e2e :: 03-C | BE | Pass | Rejection by direct SQL fixture (no reject path exists) |
| 03-D | parallel / double click | e2e :: 03-D; FE :: 03-D | BE real DB, FE | Pass | Adapted, see differences table |
| 04-A | | e2e :: 04-A (x2); `StatusHistory.test.tsx` | BE, FE | Pass | Shows "15 Oct 2026 12:00 SGT" |
| 04-B | | e2e :: 04-B | BE | Pass | PUT and DELETE 405 with `Allow: GET` for Coordinator and Organiser |
| 04-C | | e2e :: 04-C; `booking-request.spec.ts` | BE, unit | Pass | 400 `UNSUPPORTED_BOOKING_FIELDS` |
| 04-D | | e2e :: 04-D; `StatusHistory.test.tsx` | BE, FE | Pass | Also run under three `TZ` values |
| 05-A | | e2e :: 05-A/B; `EventListPage.planning.test.tsx` | BE, FE | Pass | Events list, not a queue endpoint |
| 05-B | | covered inside e2e :: 05-A/B | BE | Pass | No FE reload test |
| 05-C | empty / foreign / bad value | foreign events asserted in 05-A/B | BE | Not Automated | No queue endpoint, no `status` parameter, no 400 for unknown value |
| 06-A | | e2e :: 06-A/B | BE | Pass | Active count 4 before and after the move |
| 06-B | | e2e :: 06-A/B | BE | Pass | API only; no Lead UI breakdown text exists |
| 06-C | notice | e2e :: 06-C | BE | Pass | Planning-only coordinator gives "1 active event" notice |
| 06-C | limit 5 / `availability()` | | | Not Automated | Function does not exist |
| 07-A, 07-B | | e2e :: 07-A/B | BE | Pass | Coordinator posts, Organiser and Coordinator reply. Organiser-started post Not Automated. No FE composer test |
| 07-C | | e2e :: 07-C | BE | Pass | |
| 07-D | | e2e :: 07-D | BE | Pass | Confirmed set by SQL, not by the real confirm flow |
| 07-E | | e2e :: 07-E | BE | Pass | |
| 08-A | | e2e :: 08-A | BE | Pass | Status-change endpoint refuses Planning (400 `UNSUPPORTED_TARGET_STATUS`) |
| 09-A | | e2e :: 09-A | BE | Pass | No Organiser FE test |
| 10-A | | e2e :: 10-A | BE | Pass (partial) | Refusal from Approved asserted; the 200 from Planning needs full arrangements, covered by SPM-135 |

## Evidence Table (oracle tier)

All e2e rows: oracle SPEC (prompt 2.6 table) except: 01-D messages and 404/403 (VERIFIED existing behaviour), 03-D (VERIFIED existing behaviour, adapted), `statusChanged`/`eventStatus` response shape (ASSUMED, D5), error code `UNSUPPORTED_BOOKING_FIELDS` (ASSUMED), MSG-PL-01 wording (ASSUMED), fault placement by trigger (DERIVED, Guide 5G). Each test carries a `Kills:` line naming the mutant it targets; the targets were not mutation-verified.

## Run record

| Suite | Command | Baseline | After |
|---|---|---|---|
| Backend unit | `npx vitest run` (backend) | 51 files, 1264 pass | 52 files, 1278 pass |
| Backend e2e (PostgreSQL) | `DATABASE_URL=postgres://spm:spm@localhost:55432/spm npx vitest run --config ./vitest.config.e2e.ts` | 360 pass, 11 skipped, 1 todo | 396 pass, 11 skipped, 1 todo |
| Frontend | `npx vitest run` (frontend) | 71 of 75 files ran; 4 failed to load (`@fullcalendar/react` declared but not installed). After `npm ci`: 75 files, 1084 pass | 78 files, 1091 pass, 1 todo |
| RED evidence | implementation stashed, new e2e file run | | 30 of 36 failed against the original source (the 6 that passed cover behaviour that already existed) |
| Timezones | `TZ=UTC`, `Asia/Singapore`, `America/Los_Angeles` | | e2e file 36/36 and `StatusHistory.test.tsx` 3/3 each |
| Concurrency | 02-E and 03-D, 20 consecutive runs | | 20 of 20 pass |
| Lint / build | `npm run lint`, `tsc -p tsconfig.build.json`, frontend `tsc -b` | | No errors; remaining lint warnings were already present |

Database used: a postgres container built from `database/postgresql` at the current init scripts. The pre-built `spm-local-postgres` image on this machine was stale (no `venue_bookings`) and gave false failures, so it was not used. Coverage was not measured.

## Gap list

- Not Automated: 01-C capacity/suitability, 01-E multi-venue, 05-C, 06-C limit-5 function, Organiser-started clarification, FE tests for the clarification composer, Organiser event list/history view and the 05-B reload.
- Handoffs: SPM-57 (equipment request transition), SPM-48 (queue endpoint with `status`), SPM-136 (Cancelled guard message MSG-CN-04), SPM-54 (multi-venue), SPM-132/133 (hold rows).
- Open decisions for the PO: D3 (Submitted stays bookable), D9 (active list gained Planning and keeps Submitted), F10 (legacy Approved events that already have bookings also move on their next request), F16 (Organiser-started thread), F24 (history readable by assigned Coordinator and owning Organiser only).
- Not run: Test Code Review, Requirement Review, Code Quality Review, mutation check M1 to M24, Playwright.
