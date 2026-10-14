/*
 * SPM-136 AC4: releases the venue bookings and tentative holds of a cancelled event (CANCEL-EVENT-04-A).
 * Approved bookings and pending holds become 'released'; rejected rows hold nothing and are left as they are.
 */
import type pg from 'pg';
import type { EventReleaser } from '../../events/cancel/release.registry.js';

export const venueBookingReleaser: EventReleaser = {
  name: 'venue_bookings',
  async release(eventId: string, client: pg.PoolClient, now: Date) {
    await client.query(
      `UPDATE venue_bookings SET status = 'released', released_at = $2
        WHERE event_id = $1 AND status IN ('pending', 'approved')`,
      [eventId, now],
    );
  },
};
