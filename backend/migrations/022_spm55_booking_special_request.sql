-- SPM-55 fix: store special_request on the booking row so each attempt keeps its own note.
-- Previously it was read from venue_booking_requests (event_id, venue_id) which is overwritten on resubmission.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS special_request text;

-- Backfill: copy the best available note from venue_booking_requests into existing rows.
-- Only the most recent note per (event_id, venue_id) is available; rows whose note was already
-- overwritten by a later submission cannot be recovered and will remain NULL.
UPDATE venue_bookings b
   SET special_request = r.special_request
  FROM venue_booking_requests r
 WHERE r.event_id = b.event_id
   AND r.venue_id = b.venue_id
   AND b.special_request IS NULL
   AND r.special_request IS NOT NULL;
