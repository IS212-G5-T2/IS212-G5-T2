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

/*
 * SPM-159: the one rule for "this approved booking is a tentative hold, and is it still running". Venue Staff
 * approve a coordinator's hold request into a `venue_bookings` row with status `approved`, `request_kind`
 * `tentative_hold` and a `hold_expires_at` 14 days after approval. Such a row is not a confirmed booking: while the
 * expiry is in the future it is an active hold (label "Hold"), from the expiry instant on it is an expired hold
 * (label "Hold expired", exclusive: expiry == now is expired). Neither satisfies the "Venue booking approval"
 * readiness item, so neither is "confirmed" or "Booked". An active hold still occupies the venue; an expired one does
 * not. An approved hold with no recorded expiry is treated as active (fail closed). Ordinary approved bookings
 * (`request_kind` 'booking') are unaffected. Expired-hold status changes and notices belong to other stories.
 */
export type ApprovedHoldState = 'active' | 'expired';

/** The hold state of an approved booking, or null for a booking that is not an approved tentative hold. */
export function approvedHoldState(
  booking: { status: string; requestKind?: string | null; holdExpiresAt: Date | null },
  now: Date,
): ApprovedHoldState | null {
  if (booking.status !== 'approved' || booking.requestKind !== 'tentative_hold') return null;
  return booking.holdExpiresAt !== null && booking.holdExpiresAt.getTime() <= now.getTime() ? 'expired' : 'active';
}

/** SQL: row `alias` is an approved tentative hold whose expiry has passed (SQL clock `now()`). */
export const expiredApprovedHoldSql = (alias = 'b') =>
  `(${alias}.status = 'approved' AND ${alias}.request_kind = 'tentative_hold'
     AND ${alias}.hold_expires_at IS NOT NULL AND ${alias}.hold_expires_at <= now())`;

/** SQL: row `alias` is an approved tentative hold that has not expired. */
export const activeApprovedHoldSql = (alias = 'b') =>
  `(${alias}.status = 'approved' AND ${alias}.request_kind = 'tentative_hold'
     AND (${alias}.hold_expires_at IS NULL OR ${alias}.hold_expires_at > now()))`;

/** SQL: row `alias` is a confirmed (ordinary) approved booking, never a hold. */
export const confirmedBookingSql = (alias = 'b') =>
  `(${alias}.status = 'approved' AND ${alias}.request_kind <> 'tentative_hold')`;

/** SQL: row `alias` currently occupies its venue: a confirmed booking or an active hold; an expired hold does not. */
export const occupiesVenueSql = (alias = 'b') =>
  `(${alias}.status = 'approved' AND NOT ${expiredApprovedHoldSql(alias)})`;
