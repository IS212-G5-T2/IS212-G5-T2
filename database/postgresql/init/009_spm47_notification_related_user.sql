-- SPM-47 AC10: the Event Coordinator Lead's "coordinator unavailable" notification
-- names the coordinator it is about, so it can be marked read when that
-- coordinator becomes available again. Nullable; existing notifications keep NULL.
-- Idempotent; fresh volumes run it after 001-008, existing volumes apply it manually.
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS related_user_id uuid REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notifications_related_user_idx
    ON notifications (related_user_id) WHERE related_user_id IS NOT NULL;
