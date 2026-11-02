-- SPM-132: approved tentative holds have an explicit expired lifecycle state.
ALTER TABLE venue_bookings
  DROP CONSTRAINT IF EXISTS venue_bookings_status_check,
  ADD CONSTRAINT venue_bookings_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'released', 'cancelled', 'expired'));

ALTER TABLE venue_bookings
  DROP CONSTRAINT IF EXISTS venue_bookings_kind_check,
  ADD CONSTRAINT venue_bookings_kind_check CHECK (
    (status = 'blocked' AND event_id IS NULL AND reason IS NOT NULL
      AND length(btrim(reason)) BETWEEN 1 AND 500 AND hold_expires_at IS NULL)
    OR (status IN ('pending', 'approved', 'rejected', 'released', 'cancelled', 'expired')
      AND event_id IS NOT NULL AND reason IS NULL)
  );

ALTER TABLE booking_review_log
  DROP CONSTRAINT IF EXISTS booking_review_log_action_check,
  ADD CONSTRAINT booking_review_log_action_check
    CHECK (action IN ('approved', 'rejected', 'converted', 'released', 'expired'));

ALTER TABLE booking_review_log
  DROP CONSTRAINT IF EXISTS booking_review_log_reason_check,
  ADD CONSTRAINT booking_review_log_reason_check CHECK (
    (action = 'rejected' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000)
    OR (action IN ('approved', 'converted', 'released', 'expired') AND reason IS NULL)
  );

ALTER TABLE booking_review_log ALTER COLUMN actor_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS venue_bookings_due_hold_expiry_idx
  ON venue_bookings (hold_expires_at)
  WHERE request_kind = 'tentative_hold' AND status = 'approved';
