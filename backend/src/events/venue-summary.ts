import { VENUE_UNAVAILABLE_SQL } from './venue-unavailable.js';

// The venue an event shows everywhere (list, details, planning). Labels match the planning checklist:
// an approved booking not blocked for its window (with setup and turnaround, venue-unavailable.ts) is confirmed, a pending request is pending, and a
// rejected or blocked booking is unavailable. A released booking (SPM-136, cancelled event) holds no venue and is
// left out (PO confirmed 22 Oct 2026, SC-136-013; documented in docs/specs/SPM-136-test-results.md, RR-136-01).
export const VENUE_SUMMARY_SQL = `(SELECT string_agg(
    CASE
      WHEN b.status = 'approved' AND NOT ${VENUE_UNAVAILABLE_SQL}
        THEN v.name
      WHEN b.status = 'pending' THEN v.name || ' (pending)'
      ELSE v.name || ' (unavailable)'
    END, ', ' ORDER BY b.start_at)
  FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
 WHERE b.event_id = events.id AND b.status <> 'released') AS venue_summary`;
