import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { tentativeHoldDecisionMessage, venueBookingDecisionMessage } from '../../registrations/helpers/messages.js';

// SPM-137: Venue Staff decide a booking request and the event's Coordinator is told in the notification bell.
// The two notification types are the only place their names are written down; the Coordinator's read allow-list in
// EventsService and the bell's filter in the frontend list the same two strings.
export const BOOKING_APPROVED_NOTICE = 'venue_booking_approved';
export const BOOKING_REJECTED_NOTICE = 'venue_booking_rejected';

// SPM-165: a tentative hold request decision tells the Coordinator with its own two types, so a hold is never reported
// as a booking. Same recipient, link and transaction rules as the booking decision notices above.
export const HOLD_APPROVED_NOTICE = 'tentative_hold_approved';
export const HOLD_REJECTED_NOTICE = 'tentative_hold_rejected';

// All four decision notice types, for the places that must treat them as one group (the Coordinator's reassignment).
export const VENUE_DECISION_NOTICE_TYPES = [
  BOOKING_APPROVED_NOTICE,
  BOOKING_REJECTED_NOTICE,
  HOLD_APPROVED_NOTICE,
  HOLD_REJECTED_NOTICE,
] as const;

const NOTICE_TYPE = {
  booking: { approved: BOOKING_APPROVED_NOTICE, rejected: BOOKING_REJECTED_NOTICE },
  tentative_hold: { approved: HOLD_APPROVED_NOTICE, rejected: HOLD_REJECTED_NOTICE },
} as const;

const NOTICE_MESSAGE = {
  booking: venueBookingDecisionMessage,
  tentative_hold: tentativeHoldDecisionMessage,
} as const;

type Queryable = Pick<pg.PoolClient, 'query'>;

/**
 * Writes the decision notification for one booking, inside the decision's own transaction (the caller passes its
 * transaction client), so a decision and its notification are saved together or not at all.
 *
 * The recipient is the Coordinator the event has at this moment (AC6), read here rather than remembered from earlier,
 * and the timestamp is the decision time the caller passes (AC2). `requestKind` picks the SPM-137 booking wording and
 * types or the SPM-165 tentative hold ones (a hold is never reported as a booking, SPM-165 AC1). An event with no
 * Coordinator has no recipient: nothing is written and the decision stands.
 */
export async function notifyBookingDecision(
  client: Queryable,
  bookingId: string,
  decision: 'approved' | 'rejected',
  decidedAt: Date,
  requestKind: 'booking' | 'tentative_hold',
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
      NOTICE_TYPE[requestKind][decision],
      NOTICE_MESSAGE[requestKind](row.venue_name, row.event_name, decision),
      row.event_id,
      bookingId,
      decidedAt,
    ],
  );
}
