/*
 * SPM-138 AC11: the registration close job, as a plain exported function. Nothing in this repository schedules it: no timer,
 * cron or worker calls runRegistrationCloseJob. It settles every event whose waiting list is due at `now`; each event is
 * locked and re-checked inside its own transaction (settleIfDue), and an event that is not due takes no lock.
 */
import type { DatabaseService } from '../../database/database.service.js';
import { dueWaitlist, settleIfDue } from './settle.js';

/** Settles the waiting lists that are due at `now`. Returns the number of entries removed. */
export async function runRegistrationCloseJob(database: DatabaseService, now: Date): Promise<number> {
  const due = await database.query<{ event_id: string }>(
    `SELECT DISTINCT r.event_id
       FROM event_registrations r JOIN events e ON e.id = r.event_id
      WHERE ${dueWaitlist('$1')}`,
    [now],
  );
  let removed = 0;
  for (const row of due.rows) removed += await settleIfDue(database, row.event_id, now);
  return removed;
}
