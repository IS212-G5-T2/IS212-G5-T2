-- SPM-135 Confirm an Event: status history and the once-only EventConfirmed notification.
-- Idempotent so repeated local setup and existing volumes stay predictable.
CREATE TABLE IF NOT EXISTS event_status_history (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    from_status text NOT NULL,
    to_status text NOT NULL,
    actor_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_status_history_event_idx ON event_status_history (event_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_confirmed_once
    ON notifications (recipient_id, related_event_id, type) WHERE type = 'EventConfirmed';
