-- SPM-55 fix: store special_request on the booking row so each attempt keeps its own note.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS special_request text;
