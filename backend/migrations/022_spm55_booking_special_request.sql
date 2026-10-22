-- SPM-55 fix: store special_request on the booking row so each attempt keeps its own note.
-- Previously it was read from venue_booking_requests (event_id, venue_id) which is overwritten on resubmission.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS special_request text;
