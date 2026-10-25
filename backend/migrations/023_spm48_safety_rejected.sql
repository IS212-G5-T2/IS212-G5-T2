-- SPM-48 AC7: the Safety Officer can reject an event's safety arrangement (SPM-130 AC2), and the
-- coordinator's queue shows it. Adds 'rejected' to the allowed safety-check states. SPM-130 will write
-- the outcome; until then only seeded and test rows use it. The coordinator re-requests a rejected
-- check through the existing request flow (SPM-131 AC6), which already overwrites any non-pending row.
-- Idempotent: safe to run more than once.
ALTER TABLE event_safety_checks
    DROP CONSTRAINT IF EXISTS event_safety_checks_status_check,
    ADD CONSTRAINT event_safety_checks_status_check
        CHECK (status IN ('pending', 'changes_needed', 'approved', 'rejected'));
