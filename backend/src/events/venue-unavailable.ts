/*
 * The one rule for "this booking's venue is unavailable": a Venue Staff unavailable period (a `blocked`
 * venue_bookings row, SPM-122) overlaps the booking's window widened by the venue's setup time before it and
 * turnaround time after it. SPM-122 AC7 and SPM-54 AC2/AC6 define an affected booking this way, and the
 * coordinator's booking list (venues.repository.ts) already uses it. The overlap is exclusive at both ends: a
 * period that only touches the widened window does not affect the booking.
 *
 * Used by the venue summary, Confirm readiness (arrangements.reader.ts) and the SPM-48 coordinator queue so all
 * three agree (owner decision, 23 Oct 2026). The SQL expects the booking aliased `b` and its venue aliased `v`.
 */
export const VENUE_UNAVAILABLE_SQL = `EXISTS (
    SELECT 1 FROM venue_bookings u
     WHERE u.venue_id = b.venue_id AND u.event_id IS NULL AND u.status = 'blocked'
       AND u.start_at < b.end_at + make_interval(mins => v.turnaround_time_minutes)
       AND u.end_at > b.start_at - make_interval(mins => v.setup_time_minutes))`;
