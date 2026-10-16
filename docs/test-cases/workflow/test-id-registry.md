# Test ID registry

Every test id used by a story's tests is listed here. `PRIMARY` ids are rows of the Confluence matrix; `SUPPORTING` ids group tests that support a parent AC and are not matrix rows. A test may not carry an id that is not in this registry. See `ai/docs/test-workflow.md` section 2 and gate G1.

## Test IDs

| ID | Type | Story | Parent AC | Source | Owning test file | Approved | Status |
|---|---|---|---|---|---|---|---|
| EQUIP-UPDATE-01-A | PRIMARY | SPM-118 | AC1 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230285 | frontend/src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx, backend/src/equipment/equipment.service.spec.ts, frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-01-B | PRIMARY | SPM-118 | AC1 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230285 | frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx, backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-01-C | PRIMARY | SPM-118 | AC1 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230285 | backend/src/equipment/equipment.service.spec.ts, backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-02-A | PRIMARY | SPM-118 | AC2 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27525142 | frontend/src/features/equipment/api/equipment-api.test.ts, backend/src/equipment/equipment.controller.spec.ts, frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx, backend/src/equipment/equipment.service.spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-02-B | PRIMARY | SPM-118 | AC2 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27525142 | backend/src/equipment/equipment.service.spec.ts, backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-03-A | PRIMARY | SPM-118 | AC3 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27525158 | frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-03-B | PRIMARY | SPM-118 | AC3 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27525158 | backend/src/equipment/equipment.service.spec.ts, backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-03-C | PRIMARY | SPM-118 | AC3 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27525158 | frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-04-A | PRIMARY | SPM-118 | AC4 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27492357 | frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-04-B | PRIMARY | SPM-118 | AC4 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27492357 | frontend/src/features/equipment/pages/edit/EquipmentEditPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-05-A | PRIMARY | SPM-118 | AC5 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27492373 | backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-06-A | PRIMARY | SPM-118 | AC6 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230301 | backend/test/equipment-update.e2e-spec.ts, frontend/src/features/equipment/pages/audit-trail/AuditTrailPage.test.tsx | n/a (matrix) | Active |
| EQUIP-UPDATE-06-B | PRIMARY | SPM-118 | AC6 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230301 | backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| EQUIP-UPDATE-06-C | PRIMARY | SPM-118 | AC6 | Confluence matrix 27295823 (SPM-118 Update Equipment Records Matrix); case page 27230301 | backend/src/equipment/equipment.service.spec.ts, backend/test/equipment-update.e2e-spec.ts | n/a (matrix) | Active |
| CHECKLIST-ACTION-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-04 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-05 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-06 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CHECKLIST-ACTION-07 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group CHECKLIST-ACTION; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-checklist-actions.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| CONFIRM-EVENT-01-A | PRIMARY | SPM-135 | AC1 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/EventDetailPage.confirm.test.tsx, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-01-B | PRIMARY | SPM-135 | AC1 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts | n/a (matrix) | Active |
| CONFIRM-EVENT-01-C | PRIMARY | SPM-135 | AC1 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/EventDetailPage.confirm.test.tsx, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-02-A | PRIMARY | SPM-135 | AC2 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-02-B | PRIMARY | SPM-135 | AC2 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts | n/a (matrix) | Active |
| CONFIRM-EVENT-02-C | PRIMARY | SPM-135 | AC2 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-02-D | PRIMARY | SPM-135 | AC2 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-03-A | PRIMARY | SPM-135 | AC3 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-03-B | PRIMARY | SPM-135 | AC3 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-03-C | PRIMARY | SPM-135 | AC3 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/src/events/status/readiness.spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-03-D | SUPPORTING | SPM-135 | AC2, AC3 | Supporting; no Confluence case with this id (see Notes) | frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | pending (proposed 2026-10-14) | Active |
| CONFIRM-EVENT-04-A | PRIMARY | SPM-135 | AC4 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | frontend/src/features/events/pages/detail/EventDetailPage.confirm.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-04-B | PRIMARY | SPM-135 | AC4 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-05-A | PRIMARY | SPM-135 | AC5 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts | n/a (matrix) | Active |
| CONFIRM-EVENT-05-B | PRIMARY | SPM-135 | AC5 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/EventDetailPage.confirm.test.tsx, frontend/src/features/events/pages/detail/planning/ConfirmedArrangementsPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-05-C | PRIMARY | SPM-135 | AC5 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts | n/a (matrix) | Active |
| CONFIRM-EVENT-06-A | PRIMARY | SPM-135 | AC6 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| CONFIRM-EVENT-06-B | PRIMARY | SPM-135 | AC6 | Confluence matrix 22905205 (Confirm an Event (Coordinator) Matrix) | backend/test/events-confirm.e2e-spec.ts, frontend/src/features/events/pages/detail/planning/ConfirmEventPanel.test.tsx | n/a (matrix) | Active |
| EQUIPMENT-GATE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-GATE; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-GATE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-GATE; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/status/readiness.spec.ts, backend/test/events-confirm.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-04 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-05 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-06 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-07 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| EQUIPMENT-REMOVE-08 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group EQUIPMENT-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-equipment-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-FEEDBACK-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-FEEDBACK; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-feedback.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-FEEDBACK-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-FEEDBACK; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-feedback.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-FEEDBACK-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-FEEDBACK; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-feedback.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-RESET-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-RESET; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/status/checklist.spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-RESET-UPDATE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-RESET-UPDATE; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/planning/event-planning.service.spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-RESET-UPDATE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-RESET-UPDATE; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/planning/event-planning.service.spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-RESET-UPDATE-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-RESET-UPDATE; mapped in docs/specs/SPM-135-test-results.md | backend/src/events/planning/event-planning.service.spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-SOURCE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-SOURCE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-confirm-safety-source.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-SOURCE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-SOURCE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-confirm-safety-source.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-SOURCE-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-SOURCE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-confirm-safety-source.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-SOURCE-04 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-SOURCE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-confirm-safety-source.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-04 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-05 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-06 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| SAFETY-STALE-07 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group SAFETY-STALE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-safety-invalidation.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-01 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-02 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-03 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-04 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-05 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-06 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-07 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-08 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-REMOVE-09 | SUPPORTING | SPM-135 | AC1, AC2 | Supporting group VENUE-REMOVE; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-removal.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-01 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-02 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-03 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-04 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-05 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-06 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-07 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |
| VENUE-SUMMARY-08 | SUPPORTING | SPM-135 | AC3 | Supporting group VENUE-SUMMARY; mapped in docs/specs/SPM-135-test-results.md | backend/test/events-venue-summary.e2e-spec.ts | pending (proposed 2026-10-14) | Active |

## Notes

- `CONFIRM-EVENT-03-D` is used by a confirm panel test but has no Confluence case, so it is registered as SUPPORTING. Its name reads like a matrix row; renaming it to a supporting id is a follow-up.
- Supporting-id AC mappings are proposed by the workflow author and stay `pending` until the story owner approves them.

## Non-test tokens

Id-shaped text in the tests that is not a test id (fixture labels, message codes, Jira keys, review labels). G1 ignores these families.

| Family | What it is |
|---|---|
| EVT | Seeded event labels used as fixture data |
| COO | Coordinator login labels in specs |
| ORG | Organiser login labels in specs |
| ATT | Attendee login labels in specs |
| LEAD | Lead login labels in specs |
| MSG-CF | Message catalogue codes |
| SPM | Jira keys |
| TR | Test Code Review finding labels |
| VB | Fixture venue booking labels |
