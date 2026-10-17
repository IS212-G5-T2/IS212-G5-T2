# SPM-94 Track My Event Status (Organiser): test results

Status: all 10 TRACK-EVENT-STATUS cases automated. Test Code Review, Requirement Review and Code Quality Review have NOT run (waiting on the user). Design gaps are deferred to the manual check.

## Decisions applied

- **D6 (403):** a non-owning organiser gets 403 with no event data on the detail route. This changes the SPM-38 AC4 404 behaviour (and its unit assertion EVE-REV-04-C). Confirm with PO.
- **Drafts:** shown in a separate Drafts section on My Events, from the existing `/requests` API. Drafts are not merged into the event cards.
- **D2 (A), D5 (default):** safety read through the existing `event_safety_checks` table in SQL; no indicator for Rejected, Completed or Cancelled events, or a missing record.
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
| Tests | `backend/test/events-status-tracking.e2e-spec.ts` | new e2e spec (9 tests) |
| Tests | `EventListPage.test.tsx` | SPM-36 load-sequence tests (EVE-CRE-07 F/G/H) now serve `/requests` separately; drafts and remount tests added |

## Test cases

| Test Case ID | Layer | Test | Result |
|---|---|---|---|
| 01-A | e2e | `events-status-tracking.e2e-spec.ts` :: list holds only the caller's events for mine=true, plain and mine=false | Pass |
| 01-A | component | `EventListPage.test.tsx` :: drafts section; `StatusIndicators.test.tsx` :: organiser vs attendee card | Pass |
| 01-B | e2e | same file :: list row and detail show the same status | Pass |
| 01-C | e2e | same file :: 403 with no data; 401 without token; not in the other organiser's list | Pass |
| 02-A | e2e + unit + component | same file, `event-indicators.spec.ts`, `StatusIndicators.test.tsx` | Pass |
| 02-B | e2e | same file :: Lead's real assign endpoint clears the indicator; status stays Submitted (D11) | Pass |
| 03-A | e2e + service | same file, `events.service.spec.ts` | Pass |
| 03-B | e2e + unit + component | same file, `event-indicators.spec.ts`, `StatusIndicators.test.tsx` | Pass |
| 03-C | e2e | same file :: indicator is gone once the Safety Officer responds | Pass |
| 04-A | e2e | same file :: approve through the real endpoint; list and detail show Approved; both no-store | Pass |
| 04-B | component + store | `EventListPage.test.tsx` :: remount refetches and shows the newer status (A, B); `useAppStore.logout.test.ts` :: logout clears events (C) | Pass |

## Verification run

| Check | Command | Result |
|---|---|---|
| Backend e2e (full) | `TEST_DATABASE_URL=… npx vitest run --config ./vitest.config.e2e.ts` on a fresh `spm_spm94` database (Docker Postgres, init 001 to 017 applied) | 29 files, 520 passed, 4 skipped, 1 todo (run before the new spec was added) |
| Backend e2e (new spec) | same, `test/events-status-tracking.e2e-spec.ts` | 9 passed |
| Backend unit (full) | `npx vitest run` | 57 files, 1353 passed |
| Frontend unit (full) | `npx vitest run` | 97 files, 1296 passed, 2 skipped, 1 todo |
| Backend lint | `npm run lint` | exit 0 (pre-existing warnings) |
| Frontend lint | `npm run lint` | exit 0 (5 pre-existing warnings) |
| Frontend type-check | `npx tsc --noEmit` | exit 0 |
| Backend type-check | `npx tsc --noEmit` | 37 errors, all pre-existing in other files; none in touched files |

## Mutation check

Runner: `scratchpad/mutate.mjs`. Each mutant is applied to a scratch copy only, one at a time, and the test file is run there. The original files are never edited.

| Mutant | Change | Suite | Result |
|---|---|---|---|
| M2 | remove owner filter from the organiser list | e2e | Killed |
| M3 | detail route without owner check (both 403 and 404 paths) | unit | Killed |
| M3e | disable only the 404 path | e2e | Survived. The 403 branch still refuses non-owning organisers, so this mutant only weakens the coordinator path and is not the spec's M3 |
| M5 | remove `no-store` on the list | e2e | Killed |
| M6 | assignment indicator for any unassigned event | unit | Killed |
| M7 | assignment indicator persists after assignment | unit | Killed |
| M8 | changes requested and cleared swapped | unit | Killed |
| M8e | same swap | e2e | Killed |
| M9 | two safety indicators at once | component | Killed |
| M12 | store not cleared on logout | unit | Killed |
| approved state shown as AWAITING_CHECK | `approved: 'AWAITING_CHECK'` | e2e | Killed (first attempt was an invalid mutant: it added a duplicate key that the original line overrode; corrected and rerun) |
| assignment gate removed in the component | `AssignmentIndicator` always renders | component | Killed |
| drafts effect cleanup removed | no `active = false` on unmount | unit | Survived. No test covers a superseded drafts load; a gap to close in manual check |

Killed: 10 of 12 real mutants. Survived: M3e (weaker than the spec's M3) and the drafts cleanup.

## Gaps (deferred to manual check)

- **Access-denied screen** (01-C B): the API returns 403; the planning route shows the existing load error.
- **Safety port** (D2 A): the list reads `event_safety_checks` in SQL, not through a `SafetyCheckReader` port.
- **`no-store` middleware** (D8): inline `@Header` on the list route, not a shared middleware.
- **Draft in the event cards:** drafts are in a separate section; a merged card needs a PO decision.
- **Drafts superseded load** (mutant above): no test.
- **Coverage:** not measured.
- **Reviews:** Test Code Review, Requirement Review and Code Quality Review are pending, not run.
