import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  tentativeHoldConvertedMessage,
  tentativeHoldExpiredMessage,
  tentativeHoldReleasedMessage,
  tentativeHoldReminderMessage,
} from '../../registrations/helpers/messages.js';

// SPM-134: the event's Coordinator is told about an active tentative hold 48 hours before it expires, when it expires,
// and when Venue Staff release it or convert it to a confirmed booking. The types are written down here once; the
// Coordinator's read allow-list in EventsService, the Lead's reassignment and the frontend's bell filter list the same
// four strings.
export const HOLD_EXPIRY_REMINDER_NOTICE = 'tentative_hold_expiry_reminder';
export const HOLD_EXPIRED_NOTICE = 'tentative_hold_expired';
export const HOLD_RELEASED_NOTICE = 'tentative_hold_released';
export const HOLD_CONVERTED_NOTICE = 'tentative_hold_converted';

export const HOLD_LIFECYCLE_NOTICE_TYPES = [
  HOLD_EXPIRY_REMINDER_NOTICE,
  HOLD_EXPIRED_NOTICE,
  HOLD_RELEASED_NOTICE,
  HOLD_CONVERTED_NOTICE,
] as const;

export type HoldLifecycleEvent = 'reminder' | 'expired' | 'released' | 'converted';

/**
 * What happened to the hold. The reminder and expired notices name the hold's expiry, so those two events carry it (a
 * Date is required); released and converted notices name no date.
 */
export type HoldLifecycleChange = { event: 'reminder' | 'expired'; expiresAt: Date } | { event: 'released' | 'converted' };

const NOTICE_TYPE: Record<HoldLifecycleEvent, string> = {
  reminder: HOLD_EXPIRY_REMINDER_NOTICE,
  expired: HOLD_EXPIRED_NOTICE,
  released: HOLD_RELEASED_NOTICE,
  converted: HOLD_CONVERTED_NOTICE,
};

type Queryable = Pick<pg.PoolClient, 'query'>;

/**
 * Writes the lifecycle notification for one tentative hold, inside the caller's transaction (the caller passes its
 * transaction client), so a change and its notification are saved together or not at all.
 *
 * The recipient is the Coordinator the event has at this moment (AC9), read here rather than remembered from earlier,
 * and the timestamp is the time the caller passes (AC4). An event with no Coordinator has no recipient, and a cancelled
 * event gets no hold notification (AC10): nothing is written and the change stands (SC-SPM134-05: a reminder that finds
 * no Coordinator is consumed, not re-sent when one is assigned later).
 */
export async function notifyHoldLifecycle(
  client: Queryable,
  holdId: string,
  change: HoldLifecycleChange,
  at: Date,
): Promise<void> {
  const context = await client.query<{
    coordinator_id: string | null;
    event_id: string;
    event_name: string;
    event_status: string;
    venue_name: string;
  }>(
    `SELECT e.coordinator_id, e.id AS event_id, e.event_name, e.status AS event_status, v.name AS venue_name
       FROM venue_bookings b
       JOIN events e ON e.id = b.event_id
       JOIN venues v ON v.id = b.venue_id
      WHERE b.id = $1::uuid`,
    [holdId],
  );
  const row = context.rows[0];
  if (!row?.coordinator_id || row.event_status === 'Cancelled') return;
  const message = messageFor(change, row.venue_name, row.event_name);
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`,
    [randomUUID(), row.coordinator_id, NOTICE_TYPE[change.event], message, row.event_id, holdId, at],
  );
}

function messageFor(change: HoldLifecycleChange, venueName: string, eventName: string): string {
  switch (change.event) {
    case 'reminder':
      return tentativeHoldReminderMessage(venueName, eventName, change.expiresAt);
    case 'expired':
      return tentativeHoldExpiredMessage(venueName, eventName, change.expiresAt);
    case 'released':
      return tentativeHoldReleasedMessage(venueName, eventName);
    case 'converted':
      return tentativeHoldConvertedMessage(venueName, eventName);
  }
}

/**
 * SPM-134 AC11: once Venue Staff release or convert a hold, its unread expiry reminder is no longer actionable, so it is
 * marked read. Runs on the caller's transaction client. Only unread reminders of this hold change, and nothing is
 * deleted: the notice stays in the history.
 */
export async function markHoldRemindersRead(client: Queryable, holdId: string): Promise<void> {
  await client.query(
    `UPDATE notifications SET read = true
      WHERE related_booking_id = $1::uuid AND type = $2 AND read = false`,
    [holdId, HOLD_EXPIRY_REMINDER_NOTICE],
  );
}
