-- SPM-132: persist expiry once while preserving the original expiry deadline.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS hold_expiry_processed_at timestamptz;
ALTER TABLE venue_bookings
  DROP CONSTRAINT IF EXISTS venue_bookings_status_check,
  DROP CONSTRAINT IF EXISTS venue_bookings_kind_check,
  ADD CONSTRAINT venue_bookings_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'released', 'cancelled', 'expired')),
  ADD CONSTRAINT venue_bookings_kind_check CHECK (
    (status = 'blocked' AND event_id IS NULL AND reason IS NOT NULL
      AND length(btrim(reason)) BETWEEN 1 AND 500 AND hold_expires_at IS NULL)
    OR (status IN ('pending', 'approved', 'rejected', 'released', 'cancelled')
      AND event_id IS NOT NULL AND reason IS NULL)
    OR (status = 'expired' AND request_kind = 'tentative_hold'
      AND event_id IS NOT NULL AND reason IS NULL AND hold_expires_at IS NOT NULL)
  );
-- Upgrade markers written by the first implementation without inventing deadlines.
UPDATE venue_bookings SET status = 'expired'
 WHERE status = 'approved' AND request_kind = 'tentative_hold'
   AND hold_expiry_processed_at IS NOT NULL AND hold_expires_at IS NOT NULL;
