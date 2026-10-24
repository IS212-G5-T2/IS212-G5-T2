-- SPM-48 AC7: allow a rejected safety arrangement (SPM-130 AC2) so the coordinator's queue can show it.
-- Same change as backend/migrations/023_spm48_safety_rejected.sql. Idempotent.
ALTER TABLE event_safety_checks
    DROP CONSTRAINT IF EXISTS event_safety_checks_status_check,
    ADD CONSTRAINT event_safety_checks_status_check
        CHECK (status IN ('pending', 'changes_needed', 'approved', 'rejected'));
