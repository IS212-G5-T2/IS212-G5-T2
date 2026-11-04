import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CANCELLATION_REQUEST_MESSAGES as MESSAGES } from './cancellation-request.messages.js';

// SPM-162: the Coordinator accepts or declines an Organiser's cancellation request and the Organiser is told in the
// notification bell. The two notification types are written down here only; the Organiser's read allow-list in
// EventsService and the frontend's Notification type list the same two strings.
export const CANCELLATION_ACCEPTED_NOTICE = 'cancellation_request_accepted';
export const CANCELLATION_DECLINED_NOTICE = 'cancellation_request_declined';

// SPM-171: the assigned Coordinator is told of a submitted request; other places that name this string are listed in backend/AGENTS.md.
export const CANCELLATION_REQUESTED_NOTICE = 'cancellation_request_submitted';

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

/**
 * SPM-171 AC1/AC2: writes the "requested to cancel" notice for one Coordinator on the caller's transaction client, so it
 * commits or rolls back with the request row. The timestamp is the submission time the caller passes.
 */
export async function notifyCancellationRequested(
  client: Queryable,
  coordinatorId: string,
  eventId: string,
  eventName: string,
  requestedBy: string,
  requestedAt: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)
     VALUES ($1, $2, $3, $4, $5::uuid, $6)`,
    [randomUUID(), coordinatorId, CANCELLATION_REQUESTED_NOTICE, MESSAGES.requestedNotice(requestedBy, eventName), eventId, requestedAt],
  );
}

/**
 * SPM-171 AC6: when an event is assigned or reassigned, tells the new Coordinator about a cancellation request that is
 * still pending on it, stamped with the original submission time. Returns whether a notice was sent.
 */
export async function notifyPendingCancellationRequest(
  client: Queryable,
  eventId: string,
  eventName: string,
  coordinatorId: string,
): Promise<boolean> {
  const pending = await client.query<{ requested_by: string; requested_at: Date }>(
    `SELECT requested_by, requested_at FROM event_cancellation_requests WHERE event_id = $1 AND status = 'pending'`,
    [eventId],
  );
  const request = pending.rows[0];
  if (!request) return false;
  await notifyCancellationRequested(client, coordinatorId, eventId, eventName, request.requested_by, request.requested_at);
  return true;
}
