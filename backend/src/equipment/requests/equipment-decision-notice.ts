import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { equipmentRequestDecisionMessage } from '../../registrations/helpers/messages.js';

// SPM-172: Technical Support decide an equipment request and the event's Coordinator is told in the notification bell.
// These are the only place the two notification type names are written down; the Coordinator's read allow-list in
// EventsService, the reassignment clearing in LeadAssignmentService and the bell's filter in the frontend list the same
// strings.
export const EQUIPMENT_RESERVED_NOTICE = 'equipment_request_reserved';
export const EQUIPMENT_CANNOT_PROVIDE_NOTICE = 'equipment_request_cannot_provide';
export const EQUIPMENT_DECISION_NOTICE_TYPES = [EQUIPMENT_RESERVED_NOTICE, EQUIPMENT_CANNOT_PROVIDE_NOTICE] as const;

type Queryable = Pick<pg.PoolClient, 'query'>;

export type EquipmentDecisionContext = {
  requestId: string;
  eventId: string;
  eventName: string;
  /** The event's Coordinator as read from the locked event row inside the decision transaction (AC6). */
  coordinatorId: string | null;
  decision: 'reserved' | 'cannot-provide';
  /** The decision time (AC2). */
  decidedAt: Date;
};

/**
 * Writes the decision notification for one equipment request, inside the decision's own transaction (the caller passes
 * its transaction client), so a decision and its notification are saved together or not at all (AC7). It is called only
 * after the decision's checks passed and the status was updated. An event with no Coordinator has no recipient: nothing
 * is written and the decision stands.
 */
export async function notifyEquipmentDecision(client: Queryable, context: EquipmentDecisionContext): Promise<void> {
  if (!context.coordinatorId) return;
  await client.query(
    `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_equipment_request_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`,
    [
      randomUUID(),
      context.coordinatorId,
      context.decision === 'reserved' ? EQUIPMENT_RESERVED_NOTICE : EQUIPMENT_CANNOT_PROVIDE_NOTICE,
      equipmentRequestDecisionMessage(context.eventName, context.decision),
      context.eventId,
      context.requestId,
      context.decidedAt,
    ],
  );
}
