/*
 * SPM-136 AC5: releases the equipment reservations of a cancelled event (CANCEL-EVENT-05-A).
 * Requested, Reserved and Unavailable lines become 'Released'; lines already Released or Cancelled are left alone.
 */
import type pg from 'pg';
import type { EventReleaser } from '../../events/cancel/release.registry.js';

export const equipmentReservationReleaser: EventReleaser = {
  name: 'equipment_reservations',
  async release(eventId: string, client: pg.PoolClient, now: Date) {
    await client.query(
      `UPDATE equipment_reservations SET status = 'Released', released_at = $2, updated_at = $2
        WHERE event_id = $1 AND status IN ('Requested', 'Reserved', 'Unavailable')`,
      [eventId, now],
    );
  },
};
