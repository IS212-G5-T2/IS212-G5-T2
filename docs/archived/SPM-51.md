# SPM-51

## 2026-10-12

- swr - calendar UI fix - SPM-51 - Make venue availability selection clear and immediate: Keep selected time inside the blue block, allow clicking it to clear, restrict drag selection to operating hours, derive availability from the loaded schedule with optional refresh, and retain server-side submission checks; rebase onto dev and run calendar Test Code Review.
- swr - test correction - SPM-51 - Verify calendar occupancy and hold expiry: Keep confirmed bookings out of free shading, assert exact SGT setup/turnaround boundaries, and calculate list gaps from currently active reservations as holds expire.
- swr - calendar fix - SPM-51 - Allow selection across open operating days: Permit next-day drag ranges when every touched date is open and both endpoints fall within operating hours; reject closed-day and out-of-hours ranges.
- swr - test review correction - SPM-51 - Strengthen catalogue, route and API evidence: Assert exact availability destination parameters and role variants, guard late detail responses, verify SPM-51 database seeds and assigned submissions, and add mapped UI/API mutation suites.

## 2026-10-13

- swr - test review correction - SPM-51 - Verify real calendar drag selection: Add a Chromium browser test against the rendered FullCalendar grid proving a valid cross-day drag updates event start/end and a closed-day drag is rejected.
- swr - requirement review correction - SPM-51 - Align planning with venue hold lifecycle: Map pending rows to Booked only when an explicit hold expiry is still in the future; verify unbounded requests, expired holds, exact-expiry holds, active holds, and approved bookings against PostgreSQL.
- swr - bug fix - SPM-51 - Restore event availability context after refresh: Fetch URL-linked events when absent from the store on the catalogue and venue detail pages, guard stale responses, and verify retry and cold-store prefill behavior.
- swr - bug fix - SPM-51 - Preserve event context and show server-backed reservations: Carry eventId through venue detail navigation and return links; render confirmed bookings and active holds from the venue detail API response instead of volatile client store data.
- swr - test review correction - SPM-51 - Harden venue details and planning hold lifecycle: Tolerate omitted reservation collections, prove API-backed booking display and event-context navigation, and extend PostgreSQL mutation checks for unbounded and expired pending requests.
- swr - test review correction - SPM-51 - Mutate venue context and reservation display: Add focused frontend mutations for both eventId navigation links and stale-store versus API-backed venue reservations.
- swr - implementation - SPM-51 - Add images to seeded venues and normalize event names: Seed 24 unique venue SVG images, remove the visible SPM-51 prefix from five seeded event names, and verify with the focused E2E suite (10/10).
- swr - verification - SPM-51 - Run the full backend E2E suite: Compose PostgreSQL-backed `npm run test:e2e` passed (270 passed, 11 skipped, 1 todo); backend lint and `git diff --check` passed for the seed change.

- swr - documentation - SPM-51 - Require labelled mutation kill targets: Update the Test Code Reviewer guidance to require and validate each mutant's exact test-file and test-title kill mapping.
- swr - testing - SPM-51 - Trace and run frontend venue mutations: Assign FE-B06–FE-B17 IDs and explicit test-case mappings to all 10 frontend mutants; runner validates test references and reports skipped/error outcomes distinctly. Full frontend mutation run passed (10/10 killed, 11 mapped test links, both baselines green); `npm run test:cov` passed (70 files, 1,012 passed, 1 todo); targeted ESLint and `git diff --check` passed.
- swr - documentation - SPM-51 - Correct VEN-AVL procedures and matrix: Revised all 27 Confluence test cases for reproducible fixtures and current UI behavior, corrected AC mapping and evidence citations, and reconciled blocked backend E2E/manual evidence in the matrix.
- swr - verification - SPM-51 - Run VEN-AVL E2E against local PostgreSQL: Using the configured DATABASE_URL, `test/venues-booking-requests.e2e-spec.ts` passed 12/12, including VEN-AVL-02-C and VEN-AVL-07-C.
- swr - testing - SPM-51 - Trace backend tests to booking-request mutants: Name DTO parameter rows, map B06–B14 to exact test locations, replace wall-clock expiry fixtures with PostgreSQL-clock values, and document the rejected-versus-cancelled schema limit. Focused unit tests passed (19); full backend coverage tests passed (1,176); database E2E (25) and nine database mutants were skipped because DATABASE_URL was unavailable.
- swr - fix - SPM-51 - Make booking range formatting timezone-independent: Parse SGT wall-time form values consistently with venue ISO instants; UTC frontend suite passed (1,011 passed, 1 todo), lint and production build passed with warnings.
- swr - testing - SPM-51 - Add direct VEN-AVL coverage for schedule state changes: Add VEN-AVL-05-B venue-switch schedule assertions and backend cases for VEN-AVL-02-C and VEN-AVL-07-C; after adding the missing coordinator fixture, frontend passed (70 files, 1,012 passed, 1 todo). Backend E2E skipped (12 tests) without `DATABASE_URL`. The DB supports `rejected`, not `cancelled`, so 02-C asserts rejected is omitted and active pending holds remain tentative.
- swr - fix - SPM-51 - Remove operating-hours constraints from venue availability: Calendar selection now accepts any finite positive range; free periods span each SGT day and exclude bookings, holds, unavailable periods, and setup/turnaround buffers. Focused frontend suites passed (92 tests), build passed, SPM-51 mutants passed 10/10, and SPM-50 display mutants passed 7/7.
- swr - testing - SPM-50/SPM-51 - Strengthen schedule-removal and full-day calendar regressions: Added isolated PostgreSQL execution of the complete fresh schema, null/partial legacy-input, four-view Open 24 hours/24/7, and full-day grid mutation checks; BE-50-05 was killed by an ALTER-after-create mutant in the fresh-init test. Backend E2E mutants were previously skipped without DATABASE_URL; frontend view mutants passed 8/8, and slot bound mutants passed 2/2. Browser interaction passed with a clear 02:00–04:00 SGT selection.
- swr - fix - SPM-51 - Scope dual-role event lists to coordinator assignments: Give COORDINATOR precedence over ATTENDEE in event listing so booking request selectors receive only events assigned to the current coordinator; preserve the attendee-only feed and cover both behaviors.

## 2026-10-14

- general - implementation - SPM-51 - backend mutation baseline validation: Require Vitest summary evidence of executed tests before reporting a baseline green; verified SPM-50 and SPM-51 mapped mutation suites.

- swr - test review correction - SPM-51 - Enforce named frontend mutation kills: Validate FE-B06–B20 kill labels against exact mapped tests, reject zero-test selections, and pass the full SPM-51 mutation run (13/13 killed).

- swr - fix - SPM-50/SPM-51 - Repair review test evidence: Updated venue detail tests for API-backed loading, stale requests, event return context, server reservations, and removed-hour regressions; corrected backend mutation mapping execution and scratch schema asset handling.

- swr - testing - SPM-51 - Mutate dual-role event list scope: Added mapped precedence, coordinator-scope, and attendee-only feed mutants; all three killed by the mapped EventsService tests.
- swr - testing - SPM-51 - Reject empty mapped mutation selections: Map B13/B14 to the real planning test and fail both mutation runners when a mapped selection executes zero tests.
