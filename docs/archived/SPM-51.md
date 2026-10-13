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
