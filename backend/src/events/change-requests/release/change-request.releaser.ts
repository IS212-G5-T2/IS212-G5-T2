/*
 * SPM-65 AC11 (revised 18 Oct 2026): cancelling an event closes its pending change request automatically, so nobody can
 * approve or deny it and the organiser sees why. Runs inside the SPM-136 cancellation transaction;
 * the outcome is written to the change request audit log like any other (AC10).
 */
import type pg from 'pg';
import type { EventReleaser } from '../../cancel/release.registry.js';
import { recordOutcome } from '../change-request-audit.js';

export const CLOSED_BY = 'System';
export const CLOSED_REASON = 'The event was cancelled.';

export const changeRequestReleaser: EventReleaser = {
  name: 'event_change_requests',
  async release(eventId: string, client: pg.PoolClient, now: Date) {
    const pending = await client.query(
      `SELECT * FROM event_change_requests WHERE event_id = $1 AND status = 'Pending' FOR UPDATE`,
      [eventId],
    );
    for (const request of pending.rows) {
      await client.query(
        `UPDATE event_change_requests
            SET status = 'Closed', decided_by = $2, decided_by_id = NULL, decided_at = $3, decision_reason = $4
          WHERE id = $1`,
        [request.id, CLOSED_BY, now, CLOSED_REASON],
      );
      await recordOutcome(client, request, 'Closed', {
        decidedBy: CLOSED_BY,
        decidedById: null,
        reason: CLOSED_REASON,
        decidedAt: now,
      });
    }
  },
};
