import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CANCELLATION_REQUEST_MESSAGES as MESSAGES } from './cancellation-request.messages.js';

// SPM-162: the Coordinator accepts or declines an Organiser's cancellation request and the Organiser is told in the
// notification bell. The two notification types are written down here only; the Organiser's read allow-list in
// EventsService and the frontend's Notification type list the same two strings.
export const CANCELLATION_ACCEPTED_NOTICE = 'cancellation_request_accepted';
export const CANCELLATION_DECLINED_NOTICE = 'cancellation_request_declined';

type Queryable = Pick<pg.PoolClient, 'query'>;

/**
 * Writes the request-outcome notice for the event's Organiser, on the decision's own transaction client, so the
 * notice commits or rolls back with the request update (and, on accept, the cancellation). The timestamp is the
 * decision time the caller passes (AC2). The caller reaches this only after the decision row was saved.
 */
export async function notifyCancellationOutcome(
  client: Queryable,
  event: { id: string; event_name: string; organiser_id: string },
  outcome: 'accepted' | 'declined',
  decidedAt: Date,
): Promise<void> {
  const accepted = outcome === 'accepted';
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)
     VALUES ($1, $2, $3, $4, $5::uuid, $6)`,
    [
      randomUUID(),
      event.organiser_id,
      accepted ? CANCELLATION_ACCEPTED_NOTICE : CANCELLATION_DECLINED_NOTICE,
      accepted ? MESSAGES.outcomeAccepted(event.event_name) : MESSAGES.outcomeDeclined(event.event_name),
      event.id,
      decidedAt,
    ],
  );
}
