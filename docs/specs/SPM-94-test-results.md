# SPM-94 Track My Event Status (Organiser): test results

Status: all 10 TRACK-EVENT-STATUS cases automated. Test Code Review, Requirement Review and Code Quality Review have NOT run (waiting on the user). Design gaps are deferred to the manual check.

## Decisions applied

- **D6 (403):** a non-owning organiser gets 403 with the literal message `You can only view your own events.` and no event data. This changes the SPM-38 AC4 404 behaviour (and its unit assertion EVE-REV-04-C). Confirm with PO.
- **Drafts:** shown in a separate Drafts section on My Events, from the existing `/requests` API. Drafts are not merged into the event cards.
- **D2 (A), D5 (default):** safety read through the existing `event_safety_checks` table in SQL; no indicator for Rejected, Completed or Cancelled events, or a missing record.
- Assumptions: A1 "Under Review" is not a stored status (Approved stands in); A2 assignment does not change status (D11); A3 an empty coordinator id counts as unassigned; A4 the refusal message is the service literal.
- Jira SPM-94 is `In Progress`, which passes the status gate.

## What changed

| Area | File | Change |
|---|---|---|
| Indicators (pure) | `backend/src/events/status/event-indicators.ts` | `deriveAssignmentIndicator`, `deriveSafetyIndicator` |
| DTO and access | `backend/src/events/events.service.ts` | `awaitingCoordinatorAssignment`, `safetyIndicator`; non-owning organiser gets 403 on detail |
| Freshness | `backend/src/events/events.controller.ts` | `Cache-Control: no-store` on `GET /api/events` |
| Types | `frontend/src/types/index.ts` | two `EventRecord` fields |
| UI | `frontend/src/features/events/components/StatusIndicators.tsx` | `AssignmentIndicator`, `SafetyIndicator` (at most one safety element) |
| UI | `EventCard.tsx`, `EventDetailPage.tsx` | indicators on the organiser's card and planning header |
| UI | `EventListPage.tsx` | organiser's separate Drafts section |
| Logout | `frontend/src/store/useAppStore.ts` | `events` cleared on logout |
| Tests | `backend/src/events/status/event-indicators.spec.ts` | unit table tests, plus BND and INT rows |
| Tests | `backend/test/events-status-tracking.e2e-spec.ts` | e2e spec, 9 tests, each with `Kills:` and assumption index |
| Tests | `frontend/src/features/events/pages/list/EventListPage.test.tsx` | SPM-36 load-sequence tests (EVE-CRE-07 F/G/H) now serve `/requests` separately; drafts, remount and superseded-drafts tests added |

## Test cases

| Test Case ID | Layer | Test | Result |
|---|---|---|---|
| 01-A | e2e | `events-status-tracking.e2e-spec.ts` :: list holds only the caller's events for mine=true, plain and mine=false; every output field asserted | Pass |
| 01-A | component | `EventListPage.test.tsx` :: drafts section; superseded drafts load ignored | Pass |
| 01-B | e2e | same file :: list row and detail show the literal statuses `submitted`, `planning`, `confirmed` | Pass |
| 01-C | e2e | same file :: 403 with the literal message and no data; 401 without token; not in the other organiser's list | Pass |
| 02-A | e2e + unit + component | same file; `event-indicators.spec.ts` BND row (empty id); `StatusIndicators.test.tsx` | Pass |
| 02-B | e2e | same file :: Lead's real assign endpoint clears the indicator; status stays `submitted` (A2) | Pass |
| 03-A | e2e + service | same file; `events.service.spec.ts` | Pass |
| 03-B | e2e + unit + component | same file; `event-indicators.spec.ts` BND and INT rows; `StatusIndicators.test.tsx` | Pass |
| 03-C | e2e | same file :: indicator gone once the Safety Officer responds | Pass |
| 04-A | e2e | same file :: approve through the real endpoint; list and detail show `approved`; both `no-store` | Pass |
| 04-B | component + store | `EventListPage.test.tsx` :: remount refetches and shows the newer status (A, B); `useAppStore.logout.test.ts` :: logout clears events (C) | Pass |

Boundary (BND) and interaction (INT) rows are in `event-indicators.spec.ts`: an empty-string coordinator id counts as unassigned; Confirmed is not a terminal status; Submitted is not terminal; a terminal event shows no indicator whatever its safety state.

## Verification run

| Check | Command | Result |
|---|---|---|
| Backend e2e (full) | `TEST_DATABASE_URL=… npx vitest run --config ./vitest.config.e2e.ts` on a fresh `spm_spm94` database (Docker Postgres, init 001 to 017) | 30 files, 529 passed, 4 skipped, 1 todo |
| Backend unit (full) | `npx vitest run` | 57 files, 1361 passed |
| Frontend unit (full) | `npx vitest run` | 97 files, 1297 passed, 2 skipped, 1 todo |
| Frontend lint | `npm run lint` | exit 0, 5 pre-existing warnings |
| Frontend type-check | `npx tsc --noEmit` | exit 0 |
| Backend type-check | `npx tsc --noEmit` | 37 errors, all pre-existing in other files; none in touched files |
| Timezones | SPM-94 unit, component and e2e files under `TZ=UTC`, `Asia/Singapore`, `America/Los_Angeles` | all pass in all three zones |

The timezone runs confirm no timezone dependence. These tests don't assert formatted dates, so they don't verify SGT display.

## Mutation check

Runner: `scratchpad/mutate.mjs`. Each mutant is applied to a scratch copy only, one at a time, and the named tests are run there. The original files are never edited.

| Mutant | Change | Suite | Result |
|---|---|---|---|
| M2 | remove owner filter from organiser list | e2e (new) | Killed |
| M3 | detail route without owner check (both 403 and 404 paths) | unit | Killed |
| M3e | disable only the 404 path | e2e (new) + `events-assign` e2e | Killed. The new spec alone did not kill it; the existing `EVE-REV-04-F` coordinator 404 test does |
| M5 | remove `no-store` on the list | e2e (new) | Killed |
| M6 | assignment indicator for any unassigned event | unit | Killed |
| M7 | assignment indicator persists after assignment | unit | Killed |
| M8 | changes requested and cleared swapped | unit | Killed |
| M8e | same swap | e2e (new) | Killed |
| approved shown as AWAITING_CHECK | `approved: 'AWAITING_CHECK'` | e2e (new) | Killed |
| M9 | two safety indicators at once | component | Killed |
| M12 | store not cleared on logout | unit | Killed |
| assignment gate removed in the component | `AssignmentIndicator` always renders | component | Killed |
| drafts effect cleanup removed | no `active = false` on unmount | component | Killed by the superseded-drafts test (was surviving) |

Result: 13 of 13 killed. The first M3e run and the drafts-cleanup survivor from the previous round are now resolved.

## Checklists (Guide 10C and 11)

| Question | Answer |
|---|---|
| Does every test trace to an AC? | Yes. Exceptions: none. |
| Does every test have a plausible failing implementation? | Yes. Each e2e test has a `Kills:` line; unit and component tests have one too. |
| Can each setup, action and expected result be explained? | Yes. Fixtures are described in the e2e and unit files. |
| Are expected values justified independently of the code? | Yes, with literals. Assumptions A1 to A4 are listed in the e2e and unit files. |
| Deterministic and non-vacuous? | Mostly. Fixtures use SQL `now()` and `randomUUID()` (not fixed UUIDs). Frontend fixtures use `new Date()`. No test asserts on these values. |

Pre-submit (Guide 11):
- [x] Every test traces to an AC; no spec worked examples exist for SPM-94.
- [x] Every test has a `Kills:` line (e2e tests added in this round).
- [x] Happy, sad and boundary paths covered for each rule: BND and INT rows added in `event-indicators.spec.ts`.
- [x] Every output field asserted in 01-A.
- [x] Expected values are literals; assumptions A1 to A4 indexed.
- [x] No loops that compute expectations; the list-comparison loops now assert literals.
- [x] Sad-path no-side-effect: 02-B and 03-C assert stored and displayed state.
- [ ] Rule-order interactions for every adjacent pair: only the terminal-before-state pair is covered.
- [ ] Non-default parameters and non-ASCII names: not covered; no formula-injection payloads in the drafts display.
- [ ] Time, UUID and clock controls: partial (see above).
- [ ] Coverage run: not run.
- [x] Mutation run: 13 of 13 killed.
- [x] Original files untouched; scratch copies in the scratchpad.

## Gaps (deferred to manual check)

- **Access-denied screen** (01-C B): the API returns 403; the planning route shows the existing load error.
- **Safety port** (D2 A): the list reads `event_safety_checks` in SQL, not through a `SafetyCheckReader` port.
- **`no-store` middleware** (D8): inline `@Header` on the list route, not a shared middleware.
- **Draft in the event cards:** drafts are in a separate section; a merged card needs a PO decision.
- **Fixed fixtures:** e2e and frontend fixtures use `now()`, `randomUUID()` and `new Date()`; fixed UUIDs and a frozen clock would be more repeatable.
- **Date display in SGT:** not asserted; no test checks formatted dates.
- **Coverage:** not measured.
- **Reviews:** Test Code Review, Requirement Review and Code Quality Review are pending, not run.

## Test Code Review (independent gate, read-only)

Result on snapshot 7153b22: **BLOCKED**. Findings and status after the follow-up commit `73257c9`:

| Finding | Severity | Status |
|---|---|---|
| F1 planning-page indicators untested | High | Fixed: `EventDetailPage.status.test.tsx` (7 tests). Reviewer mutant killed |
| F2 no test-workflow records (G1 to G7 not run) | High | Open: needs `scopes/SPM-94.json`, registry, tier matrix, conflict and determinism rows and records CSV. Not done in this pass |
| F3 mutation runner not in the repo; some Kills ids unverified | High | Partly fixed: the reviewer's surviving mutants are now killed and the Kills claims are corrected. The runner still lives in `scratchpad/`, not the repo. Open |
| F4 matrix/test conflicts not registered (02-B status, D6 vs 404, 01-A drafts, 03-C) | Medium | Open: needs `spec-conflicts.md` rows and Orchestrator or PO confirmation of D6, A1, A2 |
| F5 D6 role exemption untested | Medium | Fixed: unit rows for `['ORGANISER','COORDINATOR']` and `['ORGANISER','ATTENDEE']` (404). Widened exemption killed |
| F6 drafts untested for other roles or failures | Medium | Fixed: coordinator never requests drafts; failed drafts request keeps events; Untitled label |
| F7 Rejected and Cancelled status not asserted | Low | Fixed: e2e asserts `rejected` and `cancelled` |
| F8 weak Kills claims (M9 in e2e, M10 unverified) | Low | Fixed: M9 claim removed from e2e (checked at component level); M10 relabelled |
| F9 determinism and PII exposure | Low | Open: `now()`, `randomUUID()` and `new Date()` need `determinism-exceptions.md` rows; `safetyIndicator` visibility to attendees flagged for Requirement Review |

Coverage (measured on 7153b22 unless noted):
- Backend unit: `event-indicators.ts` 100% statements and branches; `events.service.ts` 99.2% statements, 98.6% branches.
- Backend e2e (events-related files only): `events.service.ts` 87.0% statements, 78.4% branches.
- Frontend unit: `StatusIndicators.tsx` 100%; `EventCard.tsx` 100%; `EventDetailPage.tsx` 92.5%; `EventListPage.tsx` 98.2% statements; `useAppStore.ts` 64.8%.

Mutation check: the reviewer's three surviving mutants (planning indicators removed, drafts role guard removed, D6 exemption widened) are all killed by the new tests.
