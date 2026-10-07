-- SPM-46: one row per reassignment of an event between coordinators (written by
-- SPM-47's reassign in the same transaction). The current coordinator sees who
-- the event came from and when; a previous coordinator is told it moved.
-- Idempotent; fresh volumes run it after 001-009, existing volumes apply it manually.
CREATE TABLE IF NOT EXISTS event_reassignments (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    from_coordinator_id text NOT NULL,
    from_coordinator_name text NOT NULL,
    to_coordinator_id text NOT NULL,
    to_coordinator_name text NOT NULL,
    reassigned_by text NOT NULL,
    reassigned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS event_reassignments_event_idx ON event_reassignments (event_id, reassigned_at DESC);
CREATE INDEX IF NOT EXISTS event_reassignments_from_idx ON event_reassignments (event_id, from_coordinator_id);
