-- SPM-58 AC8/AC9: Technical Support can mark an equipment request "Cannot Provide"
-- and record why; the event coordinator reads the reason. Extend the status domain
-- and add the reason column with its presence rule. Safe to re-run.

-- An inline column CHECK from the base schema is named equipment_requests_status_check,
-- so dropping by that name and re-adding keeps old and new databases in step.
ALTER TABLE equipment_requests
    DROP CONSTRAINT IF EXISTS equipment_requests_status_check;
ALTER TABLE equipment_requests
    ADD CONSTRAINT equipment_requests_status_check
    CHECK (status IN ('Pending Review', 'Reserved', 'Unavailable', 'Cannot Provide', 'Cancelled'));

ALTER TABLE equipment_requests
    ADD COLUMN IF NOT EXISTS decision_reason text;

ALTER TABLE equipment_requests
    DROP CONSTRAINT IF EXISTS equipment_requests_cannot_provide_reason_check;
ALTER TABLE equipment_requests
    ADD CONSTRAINT equipment_requests_cannot_provide_reason_check
    CHECK (
        status <> 'Cannot Provide'
        OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 1 AND 500)
    );
