-- SPM-55 venue booking review: rejection reasons on booking rows and an append-only review audit trail.
-- The rejection reason has its own column so the blocked-period reason rules in venue_bookings_kind_check stay unchanged.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE venue_bookings
  DROP CONSTRAINT IF EXISTS venue_bookings_rejection_reason_check,
  ADD CONSTRAINT venue_bookings_rejection_reason_check CHECK (
    rejection_reason IS NULL
    OR (status = 'rejected' AND length(btrim(rejection_reason)) BETWEEN 1 AND 1000)
  );

CREATE TABLE IF NOT EXISTS booking_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES venue_bookings (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_review_log_reason_check CHECK (
    (action = 'rejected' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000)
    OR (action = 'approved' AND reason IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS booking_review_log_booking_idx ON booking_review_log (booking_id, created_at);
