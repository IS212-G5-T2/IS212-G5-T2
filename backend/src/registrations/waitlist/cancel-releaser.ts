/*
 * SPM-138 AC12 (waiting-list side). When an event is cancelled, its waiting entries become Cancelled and each attendee
 * gets one EventCancelled notice ("Your waiting list place is cancelled", MSG-WL-06), in the same transaction. Registered,
 * Withdrawn and Removed rows are never touched. Dedupe per registration: the UPDATE moves only Waitlisted rows, so an
 * entry can be cancelled, and therefore noticed, once.
 *
 * WIRING IS SPM-136's: the cancel flow is not in HEAD, so nothing calls this yet. The SPM-136 cases 12-A to 12-C stay
 * Blocked; 12-C-REL tests this function against rows. The caller must hold the event row lock (D7).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { MESSAGES } from '../helpers/messages.js';
import { settleLocked } from './settle.js';

/** Settles the list, then cancels each Waitlisted entry and writes its notice. Returns the number cancelled. */
export async function releaseWaitlistForCancelledEvent(
  client: Pick<pg.PoolClient, 'query'>,
  eventId: string,
  now: Date,
): Promise<number> {
  await settleLocked(client, eventId, now);
  const event = await client.query<{ name: string }>('SELECT event_name AS name FROM events WHERE id = $1', [eventId]);
  const cancelled = await client.query<{ attendee_id: string }>(
    `UPDATE event_registrations SET status = 'Cancelled', updated_at = $2
      WHERE event_id = $1 AND status = 'Waitlisted'
      RETURNING attendee_id`,
    [eventId, now],
  );
  for (const row of cancelled.rows) {
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id)
       VALUES ($1, $2, 'EventCancelled', $3, $4, $5::uuid)`,
      [randomUUID(), row.attendee_id, MESSAGES.waitlistCancelled(event.rows[0].name), eventId, row.attendee_id],
    );
  }
  return cancelled.rows.length;
}
