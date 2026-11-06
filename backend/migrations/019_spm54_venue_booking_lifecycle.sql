-- SPM-54: request details are separate from UUID booking lifecycle/history rows.
CREATE TABLE IF NOT EXISTS venue_booking_requests (
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  special_request text,
  PRIMARY KEY (event_id, venue_id),
  CHECK (length(special_request) <= 1000)
);
-- Order-safe (SPM-132): migration 032 later widens the status check to include 'expired'. Re-running this
-- file must not narrow a check that is already wide, which would fail on existing expired rows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'venue_bookings'::regclass
          AND conname = 'venue_bookings_status_check'
          AND pg_get_constraintdef(oid) LIKE '%expired%'
    ) THEN
        ALTER TABLE venue_bookings
          DROP CONSTRAINT IF EXISTS venue_bookings_status_check,
          DROP CONSTRAINT IF EXISTS venue_bookings_kind_check,
          ADD CONSTRAINT venue_bookings_status_check
            CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'released', 'cancelled')),
          ADD CONSTRAINT venue_bookings_kind_check CHECK (
            (status = 'blocked' AND event_id IS NULL AND reason IS NOT NULL
              AND length(btrim(reason)) BETWEEN 1 AND 500 AND hold_expires_at IS NULL)
            OR (status IN ('pending', 'approved', 'rejected', 'released', 'cancelled')
              AND event_id IS NOT NULL AND reason IS NULL)
          );
    END IF;
END $$;
