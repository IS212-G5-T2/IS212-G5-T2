// The venue an event shows everywhere (list, details, planning). Labels match the planning checklist:
// an approved booking not blocked for its window is confirmed, a pending request is pending, and a
// rejected or blocked booking is unavailable.
export const VENUE_SUMMARY_SQL = `(SELECT string_agg(
    CASE
      WHEN b.status = 'approved' AND NOT EXISTS (
        SELECT 1 FROM venue_bookings u
         WHERE u.venue_id = b.venue_id AND u.event_id IS NULL AND u.status = 'blocked'
           AND u.start_at < b.end_at AND u.end_at > b.start_at)
        THEN v.name
      WHEN b.status = 'pending' THEN v.name || ' (pending)'
      ELSE v.name || ' (unavailable)'
    END, ', ' ORDER BY b.start_at)
  FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
 WHERE b.event_id = events.id) AS venue_summary`;
