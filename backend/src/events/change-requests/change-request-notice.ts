/*
 * SPM-64 AC3: the coordinator notice for a change request, shared by the
 * request itself (ChangeRequestsService.create) and by the Lead's assignment
 * and reassignment (LeadAssignmentService), so a coordinator who receives an
 * event that already has a pending request is told about it the same way.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { ChangeField } from './dto/change-request-input.js';

type Queryable = Pick<pg.PoolClient, 'query'>;

export const CHANGE_REQUEST_NOTICE = 'coordinator_change_request';

const FIELD_NAMES: Record<ChangeField, string> = {
  description: 'description',
  startDateTime: 'start date & time',
  endDateTime: 'end date & time',
  expectedAttendance: 'expected attendance',
  layout: 'room layout',
  facilities: 'required facilities',
  accessibility: 'accessibility needs',
  equipmentNeeds: 'equipment requirements',
};

/** "Organiser 1 requested a change to "Event": expected attendance, room layout." */
export function changeRequestNoticeMessage(
  requestedBy: string,
  eventName: string,
  changes: readonly { field: ChangeField }[],
): string {
  return `${requestedBy} requested a change to "${eventName}": ${changes
    .map((change) => FIELD_NAMES[change.field])
    .join(', ')}.`;
}

/** Inserts the change request notice for one coordinator, inside the caller's transaction. */
export async function insertChangeRequestNotice(
  client: Queryable,
  coordinatorId: string,
  eventId: string,
  message: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
     VALUES ($1, $2, '${CHANGE_REQUEST_NOTICE}', $3, $4)`,
    [randomUUID(), coordinatorId, message, eventId],
  );
}

/**
 * When an event is assigned or reassigned, tells the new coordinator about a
 * change request that is still pending on it. Returns whether a notice was sent.
 */
export async function notifyPendingChangeRequest(
  client: Queryable,
  eventId: string,
  eventName: string,
  coordinatorId: string,
): Promise<boolean> {
  const pending = await client.query<{ requested_by: string; changes: { field: ChangeField }[] }>(
    `SELECT requested_by, changes FROM event_change_requests WHERE event_id = $1 AND status = 'Pending'`,
    [eventId],
  );
  const request = pending.rows[0];
  if (!request) return false;
  await insertChangeRequestNotice(
    client,
    coordinatorId,
    eventId,
    changeRequestNoticeMessage(request.requested_by, eventName, request.changes),
  );
  return true;
}
