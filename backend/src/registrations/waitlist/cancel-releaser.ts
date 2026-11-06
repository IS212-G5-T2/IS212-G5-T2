/*
 * SPM-138 AC12 (waitlist side). When an event is cancelled, its waiting entries become Cancelled and each attendee
 * gets one EventCancelled notice ("Your waitlist place is cancelled", MSG-WL-06), in the same transaction. Registered,
 * Withdrawn and Removed rows are never touched. Dedupe per registration: the UPDATE moves only Waitlisted rows, so an
 * entry can be cancelled, and therefore noticed, once.
 *
 * Called by the cancellation core through the waitlist releaser (registrations/release/waitlist.releaser.ts), inside the
 * cancellation transaction. 12-C-REL tests this function against rows; 12-A to 12-C test the whole flow. The caller must
 * hold the event row lock (D7).
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
    // TR-136-18: an attendee who is also the organiser or the assigned coordinator already holds the core EventCancelled
    // notice from the cancellation core (same transaction). The once-only index makes this a no-op, so that recipient
    // keeps exactly one notice (the core text) and the cancel still succeeds.
    // TR-136-21: created_at is the injected cancel instant (now), not the database clock.
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id, created_at)
       VALUES ($1, $2, 'EventCancelled', $3, $4, $5::uuid, $6)
       ON CONFLICT (recipient_id, related_event_id, type) WHERE type = 'EventCancelled' DO NOTHING`,
      [randomUUID(), row.attendee_id, MESSAGES.waitlistCancelled(event.rows[0].name), eventId, row.attendee_id, now],
    );
  }
  return cancelled.rows.length;
}
