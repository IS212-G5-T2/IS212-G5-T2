import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { venueBookingDecisionMessage } from '../../registrations/helpers/messages.js';

// SPM-137: Venue Staff decide a booking request and the event's Coordinator is told in the notification bell.
// The two notification types are the only place their names are written down; the Coordinator's read allow-list in
// EventsService and the bell's filter in the frontend list the same two strings.
export const BOOKING_APPROVED_NOTICE = 'venue_booking_approved';
export const BOOKING_REJECTED_NOTICE = 'venue_booking_rejected';

type Queryable = Pick<pg.PoolClient, 'query'>;

/**
 * Writes the decision notification for one booking, inside the decision's own transaction (the caller passes its
 * transaction client), so a decision and its notification are saved together or not at all.
 *
 * The recipient is the Coordinator the event has at this moment (AC6), read here rather than remembered from earlier,
 * and the timestamp is the decision time the caller passes (AC2). A tentative hold request must not reach this
 * function (the caller skips it, AC1). An event with no Coordinator has no recipient: nothing is written and the
 * decision stands.
 */
export async function notifyBookingDecision(
  client: Queryable,
  bookingId: string,
  decision: 'approved' | 'rejected',
  decidedAt: Date,
): Promise<void> {
  const context = await client.query<{
    coordinator_id: string | null;
    event_id: string;
    event_name: string;
    venue_name: string;
  }>(
    `SELECT e.coordinator_id, e.id AS event_id, e.event_name, v.name AS venue_name
       FROM venue_bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = b.venue_id
      WHERE b.id = $1::uuid`,
    [bookingId],
  );
  const row = context.rows[0];
  if (!row?.coordinator_id) return;
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`,
    [
      randomUUID(),
      row.coordinator_id,
      decision === 'approved' ? BOOKING_APPROVED_NOTICE : BOOKING_REJECTED_NOTICE,
      venueBookingDecisionMessage(row.venue_name, row.event_name, decision),
      row.event_id,
      bookingId,
      decidedAt,
    ],
  );
}
