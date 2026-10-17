/*
 * SPM-138 D8: automatic promotion. When a Confirmed place is released, the earliest waiting entries move to Registered
 * while Confirmed is below the event's capacity. This runs inside the withdrawal transaction, under the event row lock,
 * so capacity is never exceeded and no acceptance step exists. Each promotion writes one WaitlistPromoted notification
 * in the same transaction (D13): the notification exists when the response returns, and a failed promotion rolls it back.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { MESSAGES } from '../helpers/messages.js';
import { settleLocked } from './settle.js';

/**
 * Promotes waiting entries of one event into free places. The caller holds the event row lock.
 * Settles the list first (D9), so an entry whose registration has closed is never promoted (11-D).
 * Returns the number of promotions.
 */
export async function fillFreeSpots(client: Pick<pg.PoolClient, 'query'>, eventId: string, now: Date): Promise<number> {
  await settleLocked(client, eventId, now);
  const event = await client.query<{ capacity: number; name: string }>(
    `SELECT registration_limit AS capacity, event_name AS name
       FROM events WHERE id = $1`,
    [eventId],
  );
  if (!event.rows[0]) return 0;
  const taken = await client.query<{ count: number }>(
    `SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = 'Registered'`,
    [eventId],
  );
  // At most one promotion per free place: the loop is bounded by the places, never by the list.
  let free = event.rows[0].capacity - taken.rows[0].count;
  let promoted = 0;
  while (free > 0) {
    const next = await client.query<{ id: string; attendee_id: string }>(
      `SELECT id, attendee_id FROM event_registrations
        WHERE event_id = $1 AND status = 'Waitlisted'
        ORDER BY joined_at, waitlist_seq
        LIMIT 1`,
      [eventId],
    );
    const entry = next.rows[0];
    if (!entry) break;
    await client.query(
      `UPDATE event_registrations SET status = 'Registered', registered_at = $2, updated_at = $2 WHERE id = $1`,
      [entry.id, now],
    );
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_user_id)
       VALUES ($1, $2, 'WaitlistPromoted', $3, $4, $5::uuid)`,
      [randomUUID(), entry.attendee_id, MESSAGES.waitlistPromoted(event.rows[0].name), eventId, entry.attendee_id],
    );
    free -= 1;
    promoted += 1;
  }
  return promoted;
}
