/*
 * SPM-138 11-E hook (unit only). Reopening registration belongs to the registration-setup story, which is not in HEAD, so
 * 11-E is Blocked. This hook fixes the order such a reopen must use: settle the waiting list BEFORE the window changes, so
 * entries removed at close are never restored by a reopen. The caller holds the event row lock.
 */
import type pg from 'pg';
import { settleLocked } from './settle.js';

/** Call before changing the registration window. Returns how many entries were removed by settling. */
export async function beforeRegistrationWindowChange(
  client: Pick<pg.PoolClient, 'query'>,
  eventId: string,
  now: Date,
): Promise<number> {
  return settleLocked(client, eventId, now);
}
