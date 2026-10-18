-- SPM-54: retain optional coordinator notes and independently cancelled requests.
ALTER TABLE venue_bookings ADD COLUMN IF NOT EXISTS special_requests text;
ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_bookings_special_requests_check;
ALTER TABLE venue_bookings ADD CONSTRAINT venue_bookings_special_requests_check
    CHECK (special_requests IS NULL OR length(special_requests) <= 2000);
ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_bookings_status_check;
ALTER TABLE venue_bookings DROP CONSTRAINT IF EXISTS venue_bookings_kind_check;
ALTER TABLE venue_bookings ADD CONSTRAINT venue_bookings_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'cancelled'));
ALTER TABLE venue_bookings ADD CONSTRAINT venue_bookings_kind_check CHECK (
    (status = 'blocked' AND event_id IS NULL
        AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500
        AND hold_expires_at IS NULL AND special_requests IS NULL)
    OR (status IN ('pending', 'approved', 'rejected', 'cancelled')
        AND event_id IS NOT NULL AND reason IS NULL)
);
