# SPM-61 Register for an Event: test results

**Provenance.** `docs/specs/SPM-61-feature-spec.md` and `SPM-61-test-cases.md` were not in the repository, so Test Case IDs come from the task's Test Case Matrix (`ASSUMED`) and the "Expected Result" quotes are the Jira SPM-61 acceptance-criterion wording. Reconcile the IDs and quotes when the two documents are added. Results below are what the runners printed.

Commands: backend unit `cd backend && npx vitest run`; backend integration `DATABASE_URL=<spm_test> npx vitest run --config vitest.config.e2e.ts`; frontend `cd frontend && npx vitest run`.

## Results

| Test Case ID | Subtest | Automated test (file :: test name) | Layer | Result | Notes |
|---|---|---|---|---|---|
| EVENT-REG-01-A | | `backend/src/registrations/registrations.e2e-spec.ts :: EVENT-REG-01-A ... event detail reports registrationOpen=true`; `frontend/.../RegistrationSection.test.tsx :: 01-A open` | BE integration + FE component | Pass | |
| EVENT-REG-01-B | | `registrations.e2e-spec.ts :: EVENT-REG-01-B ...`; `RegistrationSection.test.tsx :: 01-B not yet open` | BE integration + FE component | Pass | MSG-02 wording locked |
| EVENT-REG-01-C | A time-based | `registrations.e2e-spec.ts :: EVENT-REG-01-C ... [A]`; `RegistrationSection.test.tsx :: 01-C[A]` | BE integration + FE component | Pass | |
| EVENT-REG-01-C | B manual close | `it.todo` in both files | n/a | Blocked | No `manual_close_at` field in the events schema (D17); decision: stays Blocked |
| EVENT-REG-01-BND-1 / 02-BND-1 | A-D | `registrations.e2e-spec.ts :: ...registration window instants`; `registration-window.spec.ts`; `utils/registration.test.ts`; `RegistrationSection.test.tsx :: BND-1[D]` | BE integration (injected clock) + BE/FE unit | Pass | Inclusive open, exclusive close (D6) |
| EVENT-REG-02-A | | `registrations.e2e-spec.ts :: EVENT-REG-01-C / EVENT-REG-02-A ...` | BE integration | Pass | 422 MSG-01, no row stored |
| EVENT-REG-02-B | | `RegistrationSection.test.tsx :: EVENT-REG-02-B ...` | FE component (frozen Date and interval, mocked 422) | Pass | Form and values preserved |
| EVENT-REG-03-A | | `registrations.e2e-spec.ts :: EVENT-REG-03-A / 04-A`; `RegistrationSection.test.tsx :: EVENT-REG-03-A / 04-A` | BE integration + FE component | Pass | |
| EVENT-REG-03-B / 03-C | | `validation.spec.ts`; `registrations.e2e-spec.ts :: 03-B / 03-C`; `utils/registration.test.ts`; `RegistrationSection.test.tsx :: 03-B / 03-C` | BE unit + integration, FE unit + component | Pass | Table-driven |
| EVENT-REG-03-D | | `validation.spec.ts :: 03-D`; `registrations.e2e-spec.ts :: 03-D` | BE unit + integration | Pass | Strict 400 (D15) |
| EVENT-REG-03-BND-1 | | `validation.spec.ts :: 03-BND-1`; `utils/registration.test.ts :: 03-BND-1` | BE unit + FE unit | Pass | Limits pinned on both sides; email 254 and requirements 500 locked |
| EVENT-REG-03-SEC-1 | Storage | `validation.spec.ts`; `registrations.e2e-spec.ts :: 03-SEC-1` | BE unit + integration | Pass | |
| EVENT-REG-03-SEC-1 | Render | `RegistrationSection.test.tsx :: 03-SEC-1` (2 tests) | FE component | Pass | Pages for SPM-62/63 do not exist (D19) |
| EVENT-REG-03-SEC-1 | Steps 2-3 (SPM-62 details, SPM-63 coordinator report) | | n/a | Blocked | Depends on SPM-62/63 |
| EVENT-REG-04-A | | `RegistrationSection.test.tsx :: EVENT-REG-03-A / 04-A` | FE component | Pass | MSG-06, ID, no auto-dismiss |
| EVENT-REG-05-A | | `registrations.e2e-spec.ts :: EVENT-REG-05-A`; `RegistrationSection.test.tsx :: 05-A` (2 tests); `EventDetailPage.registration.test.tsx` | BE integration + FE component/page | Pass | |
| EVENT-REG-05-B | | `registrations.e2e-spec.ts :: EVENT-REG-05-B` | BE integration, real PostgreSQL | Pass | 5 concurrent: one 201, four 409, one row |
| EVENT-REG-05-C | | `registrations.e2e-spec.ts :: EVENT-REG-05-C` (re-register, capacity); `RegistrationSection.test.tsx :: 05-C` | BE integration + FE component | Pass | Capacity 422 `registration_full` locked (hard limit, no waitlist in R1) |
| EVENT-REG-05-SEC-1 | A-C, non-attendee roles, hidden and malformed events | `registrations.e2e-spec.ts :: EVENT-REG-05-SEC-1` | BE integration | Pass | 401, 403 for 4 roles, own-registration-only, 404 |
| EVENT-REG-05-SEC-1 | D FE redirect | | n/a | Not Automated | Redirect URL locked to `/events/:id/registrations/:registrationId`, but that route does not exist yet; see open item 2 |

Also added: `useAppStore.registration.test.ts` (GET backoff, no POST retry, D14), `api.test.ts` (error code and status), and an updated SPM-99 `EventView.test.ts` and `EventDetailPage.registration.test.tsx`.

## Run totals

| Suite | Baseline (before) | After |
|---|---|---|
| Backend unit | 20 files, 457 passed | 22 files, 495 passed |
| Backend integration | 45 passed, 11 failed, 0 todo | 71 passed, 11 failed, 1 todo |
| Frontend | 23 files, 239 passed | 26 files, 275 passed, 1 todo |

The 11 backend integration failures are all in `src/events/drafts.e2e-spec.ts` (SPM-37). They failed identically before this work. Frontend `npm run lint` reports 2 errors, in `ClarificationThread.tsx` and `useAppStore.auth.test.ts`; neither file was touched. Backend lint, `npm run build` (frontend) and the frontend typecheck are clean. Backend `tsc --noEmit` on the full tsconfig reports errors only in existing e2e tests.

## Acceptance-criterion coverage

| AC | Covered by |
|---|---|
| AC1 button only while open | 01-A/B/C[A], BND-1, full-event test |
| AC2 error after close | 02-A, 02-B, BND-1[D] |
| AC3 enter details and submit | 03-A to 03-D, 03-BND-1, 03-SEC-1 |
| AC4 confirmation | 03-A/04-A |
| AC5 no double registration | 05-A, 05-B, 05-C |
| Cross-cutting auth | 05-SEC-1 |

## Locked decisions and open items

Locked (product decisions): MSG-02 "Registration for this event opens on [date] SGT.", MSG-03 "Please correct the highlighted fields.", MSG-04 "We couldn't complete your registration. Please try again.", fully-booked "This event is fully booked."; email max 254 and special requirements max 500; capacity is a hard limit returning 422 `registration_full` (no waitlist in Release 1); 01-C[B] stays Blocked (no `manual_close_at`). Messages live in `backend/src/registrations/messages.ts` and limits in `validation.ts`, with a frontend mirror in `frontend/src/utils/registration.ts`.

Still open:

1. Test Case IDs and quotes are ASSUMED (source documents absent).
2. 05-SEC-1[D]: the redirect URL was locked to `/events/:id/registrations/:registrationId`, but no such frontend route or redirect behaviour exists yet. Not automated until the intended behaviour is confirmed.
3. Only Confirmed events accept registration; unpublished events return 404; a missing window bound is unbounded on the server. The attendee page still hides the section unless both bounds exist (SPM-99).
4. Check order on POST: role, body validation, event lookup, window, duplicate, capacity.
5. The registration date rows keep SPM-99's local-time `formatDateTime`; only the new "opens on" sentence is in SGT (D20).
6. The integration-test gap is to be recorded in the retro; no retro document exists in the repo.

## Name mappings and deviations

- `Confirmed` in the test cases maps to the existing `registered`/`Registered` status (D4); no type renamed.
- Matrix paths that differ from the repo: `auth/auth.middleware.ts` is `auth/authentication/authentication.middleware.ts`; the period util lives in `pages/EventView.ts` plus `utils/registration.ts`.
- Slices 1 and 2 (validation, window rule) were written red-first. The registrations e2e suite was written after the service, so it was not observed failing first.
- Existing SPM-99 assertions were changed on purpose: closing instant is now closed, and closed, full, not-yet-open and cancelled states render no Register button.
- The Withdraw button is hidden until a withdraw story ships; the store `withdrawRegistration` action is unchanged.
