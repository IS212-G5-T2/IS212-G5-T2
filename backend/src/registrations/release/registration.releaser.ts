/*
 * SPM-136 AC8 and AC6: Registered attendees of a cancelled event become Cancelled with the reason
 * 'Event cancelled' (CANCEL-EVENT-08-A). Withdrawn rows are not touched (08-B). No waiting-list promotion.
 * The recipients are the Registered attendees, read before the rows change (AC6 notice).
 */
import type pg from 'pg';
import type { EventReleaser } from '../../events/cancel/release.registry.js';

export const registrationReleaser: EventReleaser = {
  name: 'event_registrations',
  async collectRecipients(eventId: string, client: pg.PoolClient) {
    const result = await client.query<{ attendee_id: string }>(
      `SELECT attendee_id::text AS attendee_id FROM event_registrations
        WHERE event_id = $1 AND status = 'Registered' ORDER BY attendee_id`,
      [eventId],
    );
    return result.rows.map((row) => row.attendee_id);
  },
  async release(eventId: string, client: pg.PoolClient, now: Date) {
    await client.query(
      `UPDATE event_registrations
          SET status = 'Cancelled', cancellation_reason = 'Event cancelled', updated_at = $2
        WHERE event_id = $1 AND status = 'Registered'`,
      [eventId, now],
    );
  },
};
