-- SPM-55 fix: store special_request on the booking row so each attempt keeps its own note.
-- Previously it was read from venue_booking_requests (event_id, venue_id) which is overwritten on resubmission.
ALTER TABLE venue_bookings
  ADD COLUMN IF NOT EXISTS special_request text;

-- Backfill: copy the surviving note into only the most-recent booking attempt per (event_id, venue_id).
-- venue_booking_requests keeps exactly one row per pair (overwritten on each resubmission), so we can
-- only safely associate it with the latest attempt. Older attempts cannot be recovered and remain NULL.
UPDATE venue_bookings b
   SET special_request = r.special_request
  FROM venue_booking_requests r
  JOIN (
    SELECT DISTINCT ON (event_id, venue_id) id
      FROM venue_bookings
     WHERE event_id IS NOT NULL
     ORDER BY event_id, venue_id, created_at DESC
  ) latest ON latest.id = b.id
 WHERE r.event_id = b.event_id
   AND r.venue_id = b.venue_id
   AND b.special_request IS NULL
   AND r.special_request IS NOT NULL;
