/*
 * SPM-138 D6: a waiting list position is derived on read, never stored. It is 1 plus the number of Waitlisted entries of
 * the same event that sort before this one by (joined_at, waitlist_seq). Only a Waitlisted row has a position.
 */

/**
 * SQL expression for the position of the row aliased `r`. Use it in a SELECT over event_registrations AS r.
 * Any other status gives NULL, so a position is only ever shown for a waiting entry.
 */
export const WAITLIST_POSITION_SQL = `CASE WHEN r.status = 'Waitlisted' THEN (
    SELECT 1 + COUNT(*)::integer FROM event_registrations o
     WHERE o.event_id = r.event_id AND o.status = 'Waitlisted'
       AND (o.joined_at, o.waitlist_seq) < (r.joined_at, r.waitlist_seq)
  ) END`;
