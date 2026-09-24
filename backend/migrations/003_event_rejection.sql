-- Apply after the existing events and clarification schema. Existing rows are preserved.
BEGIN;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('Submitted', 'Under_Review', 'Approved', 'Rejected'));
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_rejection_reason_check;
ALTER TABLE events ADD CONSTRAINT events_rejection_reason_check
  CHECK (status <> 'Rejected' OR (rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) BETWEEN 1 AND 2000));
COMMIT;
