-- SPM-153 Event Status Changes from Confirmed to Completed: the completion record of a Completed event.
-- One row per event (saved by the assigned Coordinator, last write wins). Saving it never changes the event status
-- or the status history. Issues are a child table, replaced as a whole on each save that carries `issues`.
CREATE TABLE IF NOT EXISTS completion_records (
    event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
    attendance_count integer CHECK (attendance_count >= 0),
    operational_notes text CHECK (char_length(operational_notes) <= 2000),
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS completion_record_issues (
    event_id uuid NOT NULL REFERENCES completion_records (event_id) ON DELETE CASCADE,
    position integer NOT NULL,
    description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
    PRIMARY KEY (event_id, position)
);
