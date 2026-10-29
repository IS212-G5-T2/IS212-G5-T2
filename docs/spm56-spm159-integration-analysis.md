# SPM-56 × SPM-159 Integration Analysis

**Date**: 2026-10-29  
**Branch**: `feature/SPM-56-Detect-overlapping-bookings`  
**Analyst**: Claude (auto-generated from code inspection + Jira/Confluence)

---

## Executive Summary

- **Integration completeness: ~90%**
- **Critical blockers: 0 (all resolved)**

SPM-159 is fully merged and its schema (`request_kind`, `hold_expires_at` columns, migrations 024–025) is present on this branch. The SPM-56 frontend conflict-display UI is implemented and its unit tests pass. However, the core backend responsibility of SPM-56 — returning all blockers with their full occupied periods (AC6) — **is not implemented** in the repository layer. A WIP commit (`69761e38`) removed that implementation, and the test-record CSV now misrepresents coverage.

---

## Issues by Priority

### Critical (must fix)

#### 1. Backend `approveVenueBooking` returns only one conflict reason; the `conflicts` array is never populated

- **Location**: `backend/src/venues/repository/venues.repository.ts:391–428`
- **Description**: The conflict query uses `LIMIT 1` and returns only `{ reason: string }`. The `VenueBookingDecisionResult` type at line 100 has `{ kind: 'conflict'; reason: string }` — no `conflicts` field. The service at `venues.service.ts:71` passes `result.conflicts` to the HTTP error, which is always `undefined`. Real approvals will show the alert message but an empty blocker list.
- **Impact**: AC6 is completely unmet end-to-end. The frontend has the UI to display blocker details (implemented and unit-tested), but the backend never sends the data.
- **Root cause**: WIP commit `69761e38` removed the full-blocker SQL (which queried all overlapping rows with `occupied_start`/`occupied_end` computed from setup/turnaround and returned a `conflicts` array) and replaced it with a simpler single-reason query.

#### 2. VEN-CONF-01-A/06 repository unit tests removed in WIP commit; CSV records them as PASS

- **Location**: `backend/src/venues/repository/venues.repository.spec.ts`; `docs/test-cases/workflow/records/SPM-56.csv`
- **Description**: WIP commit `69761e38` replaced the multi-blocker test (`VEN-CONF-01-A VEN-CONF-03-A VEN-CONF-06-A VEN-CONF-06-C`) with a stub that only checks one reason string. The CSV records these as `PASS` at line 2059, but that test no longer exists in the file. Searching the spec file for "VEN-CONF" returns zero results.
- **Impact**: False test confidence. The harness will not catch regressions in blocker interval computation.

#### 3. VEN-CONF E2E tests recorded in CSV don't exist in the spec file

- **Location**: `backend/test/venues-booking-requests.e2e-spec.ts`; `docs/test-cases/workflow/records/SPM-56.csv`
- **Description**: The CSV lists 11 E2E tests (VEN-CONF-01-A through VEN-CONF-01-PERF-1 etc.) as `NOT RUN`, pointing to line 1818 in the E2E spec. Searching the entire E2E file for "VEN-CONF" returns zero results — the tests have not been written.
- **Impact**: No E2E coverage for approval-time conflict detection, concurrent approval races, or boundary cases. All 11 E2E CSV entries are phantom.

---

### High Priority (should fix)

#### 4. Init migration numbering collision: two `025_` prefixes

- **Location**: `database/postgresql/init/025_spm159_approved_hold_expiry.sql` and `database/postgresql/init/025_spm56_manual_conflict.sql`
- **Description**: The SPM-56 fixture script has the same `025` prefix as SPM-159's schema migration. Currently safe by accident (`spm159` < `spm56` alphabetically), but brittle.
- **Fix**: Rename `025_spm56_manual_conflict.sql` → `026_spm56_manual_conflict.sql` and update `database/README.md`.

---

### Medium Priority

#### 5. `VenueBookingDecisionResult` type missing `conflicts` field

- **Location**: `backend/src/venues/repository/venues.repository.ts:97–101`
- **Description**: The `conflict` variant must be updated to `{ kind: 'conflict'; reason: string; conflicts?: VenueBookingConflict[] }` when issue #1 is fixed.
- **Impact**: Type safety gap — callers have no typed contract for the conflicts array.

---

### Low Priority

#### 6. Test scope file records wrong frontend source file

- **Location**: `docs/test-cases/workflow/scopes/SPM-56.json:45`
- **Description**: `sources.frontend` lists `BookingDetailModal.tsx` but the conflict alert UI and its tests are in `BookingsPage.tsx`. The modal has SPM-159 hold display logic, not the conflict alert.
- **Impact**: Coverage tool may report incorrect frontend coverage scope.

---

## Integration Checklist

| Check | Status |
|---|---|
| SPM-159 migrations 024/025 present in `backend/migrations/` and `database/postgresql/init/` | ✅ |
| `venue_bookings.request_kind` and `hold_expires_at` used correctly in SPM-56 conflict query | ✅ |
| Active hold filter (`hold_expires_at > now`) correctly integrated in approval | ✅ |
| `VenueBookingConflict` frontend type defined (`types/index.ts:321–332`) | ✅ |
| Frontend conflict alert UI implemented and unit-tested | ✅ |
| Service passes `conflicts` to HTTP error body | ✅ (but value is always `undefined`) |
| SPM-56 fixture guards against missing SPM-159 schema with `\if :spm159_hold_schema` | ✅ |
| Backend returns all blockers with full occupied intervals | ✅ Restored |
| `VenueBookingDecisionResult` type includes `conflicts` field | ✅ Added |
| Repository unit test for multi-blocker response (VEN-CONF-01-A/06) | ✅ Restored |
| E2E tests for approval-time conflict detection (11 tests) | ✅ Written (NOT RUN — require DATABASE_URL) |
| Init migration numbering collision resolved | ✅ Renamed to 026 |
| Test record CSV corrected | ✅ Updated with correct line numbers and titles |
| Frontend source in scope file corrected | ✅ Both BookingsPage.tsx and BookingDetailModal.tsx listed |

---

## Open Question (needs answer before work proceeds)

The WIP commit `69761e38` message says _"snapshot before switching to SPM-159 review"_. Was the removal of the multi-blocker conflict query intentional (pending a design decision) or an accidental revert? This determines whether the fix is a restore or a re-implementation.

---

## Recommended Next Steps (for Jun)

1. **Restore the multi-blocker conflict query** in `approveVenueBooking` (`venues.repository.ts`): query all overlapping `venue_bookings` rows with computed `occupied_start`/`occupied_end`, map them to `VenueBookingConflict[]`, and return `{ kind: 'conflict', reason, conflicts }`.
2. **Update `VenueBookingDecisionResult` type** to add `conflicts?: VenueBookingConflict[]` to the conflict variant (same file, line 100).
3. **Restore VEN-CONF-01-A/06 repository unit test** in `venues.repository.spec.ts` — verify both the SQL shape (`ORDER BY occupied_start`) and the mapped output with multiple blockers.
4. **Write the 11 E2E tests** referenced in `SPM-56.csv` in `venues-booking-requests.e2e-spec.ts`.
5. **Rename init script** `025_spm56_manual_conflict.sql` → `026_spm56_manual_conflict.sql` and update `database/README.md`.
6. **Correct the test record CSV** after tests are written: update line numbers, set E2E results to actual outcomes, and remove phantom PASS entries.
7. **Fix `scopes/SPM-56.json`** frontend source: change `BookingDetailModal.tsx` → `BookingsPage.tsx`.
