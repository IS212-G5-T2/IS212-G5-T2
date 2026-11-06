/*
 * SPM-138 D9: a waitlist is settled once its registration has closed. Waitlisted entries become Removed (no notice),
 * with removed_at set to the injected clock. Closing is exclusive at the closing instant, the same rule as the window
 * (registration-window.ts). A manual close is registration_enabled = false.
 *
 * DUE_WAITLIST is the one predicate for "this list is due to be removed". The lock-free check (settleIfDue), the close
 * job's candidate scan and the locked settle (settleLocked) all use it, so they cannot disagree.
 * Callers that write must hold the event row lock (SELECT ... FOR UPDATE on events) when they call settleLocked.
 */
import type pg from 'pg';
import type { DatabaseService } from '../../database/database.service.js';

/** The due test over `r` (event_registrations) joined to `e` (events). `instant` is the SQL placeholder for the time. */
export const dueWaitlist = (instant: string) => `r.status = 'Waitlisted'
  AND (NOT e.registration_enabled
       OR (e.registration_closes_at IS NOT NULL AND ${instant} >= e.registration_closes_at))`;

/**
 * Removes the event's due Waitlisted entries. Returns how many entries were removed. The UPDATE carries the due test,
 * so an open list is left untouched; this is also the re-check after the lock is taken.
 */
export async function settleLocked(client: Pick<pg.PoolClient, 'query'>, eventId: string, now: Date): Promise<number> {
  const removed = await client.query(
    `UPDATE event_registrations r
        SET status = 'Removed', removed_at = $2, updated_at = $2
       FROM events e
      WHERE r.event_id = $1 AND e.id = r.event_id AND ${dueWaitlist('$2')}
      RETURNING r.id`,
    [eventId, now],
  );
  return removed.rows.length;
}

/**
 * Settles one event only when it is due, and takes the event row lock only then. The first check is a plain read with
 * no lock and no write; a list that is not due costs nothing. A due list is re-checked under the lock by settleLocked.
 */
export async function settleIfDue(
  database: Pick<DatabaseService, 'query' | 'transaction'>,
  eventId: string,
  now: Date,
): Promise<number> {
  const due = await database.query(
    `SELECT 1 FROM event_registrations r JOIN events e ON e.id = r.event_id
      WHERE r.event_id = $1 AND ${dueWaitlist('$2')}
      LIMIT 1`,
    [eventId, now],
  );
  if (!due.rows[0]) return 0;
  return database.transaction(async (client) => {
    await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    return settleLocked(client, eventId, now);
  });
}
