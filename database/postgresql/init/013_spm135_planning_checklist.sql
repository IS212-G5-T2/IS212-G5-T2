-- SPM-135 planning checklist: the coordinator's "no equipment needed" confirmation and
-- the operational safety check request. Idempotent so repeated local setup stays predictable.
ALTER TABLE events ADD COLUMN IF NOT EXISTS equipment_confirmed_at timestamptz;

CREATE TABLE IF NOT EXISTS event_safety_checks (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'changes_needed', 'approved')),
    requested_at timestamptz NOT NULL,
    requested_by text NOT NULL,
    approver_name text,
    feedback text,
    decided_at timestamptz
);
