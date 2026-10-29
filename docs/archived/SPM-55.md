# SPM-55 AI usage archive

Archived from `AI_USAGE.md`; original dates and wording retained.

## 2026-10-15

- chaw678 - implementation - SPM-55 - Review and decide on booking request: Added pending-request list and approve/reject endpoints for the owning Venue Staff, with pending-only checks, 409 BOOKING_ALREADY_DECIDED for decided or cancelled requests, approval-time slot re-check (409 BOOKING_SLOT_CONFLICT), a rejection reason column, and a booking_review_log audit table (migration 021). Coordinators see the rejection reason; the staff page now loads and decides through the API. Backend venues suite 208 passed; frontend suite 33 passed on bookings + format; backend lint and build pass; frontend `tsc -b` fails on pre-existing `venueSearch.test.ts`. Staged, not committed; Jira status unchanged (To Do).

- chaw678 - test - SPM-55 - Test-workflow artefacts and cycle-01: Created scope (SPM-55.json), 13 VEN-REV-* test IDs in registry, 42-row records CSV, tier matrix section, and mutant definitions (9 backend, 4 frontend); annotated all 42 tests with JSDoc IDs. Cycle-01 G1–G7 PASS overall AMBER (coverage floor gaps from pre-existing SPM-50/SPM-54 code in shared source files; Confluence matrix IDs deferred — Atlassian not authorised). Nothing committed.

- chaw678 - test - SPM-55 - Test Review remediation cycles 2–8 (F1–F32): Eight correction cycles resolving record parser gaps, reject-path transaction pinning, ownership/WHERE anchoring, JOIN condition assertions, RBAC argument pinning, route metadata and @Req() binding; 37 mutants (M01–M37 backend, 4 frontend) all killed; 48 records (G1–G7 PASS cycle-08, overall AMBER). Cycle-08 final: 147 tests (112 backend unit, 35 frontend), 0 failed, 0 skipped. Staged, not committed.

- chaw678 - review evidence - SPM-55 - Requirement Review PASS + Code Quality Review PASS: All six ACs satisfied; advisory notes: no 1-char boundary test (RR-F-01), no frontend maxLength on rejection textarea (RR-F-02), bookingReference computed at 4 sites (CQ-M1 deferred), ON DELETE CASCADE on audit table accepted (CQ-M2 reverted — RESTRICT breaks event-cascade delete paths). Staged, not committed.

- chaw678 - fix - SPM-55 - Test Code Review cycle-09 blocking findings (TR-55-01 to TR-55-03): Mutation runners repaired (backend 34 mutants and frontend 6 mutants, all killed; new mutants for the in-place row update and the read-only guard); 6 frontend tests added for the status filter, in-place update, rejection reason on card and read-only decided dialogs (VEN-REV-08-A to 08-G); stale test titles and oracle classes updated in SPM-55 records (G3 PASS, 55 records). Frontend suite 1671 passed; BookingsPage, decision modal and card at 100% coverage. Staged, not committed.

## 2026-10-20

- chaw678 - review correction - SPM-55 - Test Review TR-55-05 and TR-55-08: added VEN-REV-09-A/B (approve and reject roll back and reject when the audit insert fails; mutant VEN-REV-M39 kills both) and VEN-REV-09-C (a user with Venue Staff and Coordinator roles sees the review list and the coordinator bookings; mutant VEN-REV-M42). Backend 74 files and 1680 tests, frontend 119 files and 1672 tests pass; BookingsPage.tsx and venues.repository.ts at 100%. Not committed.
