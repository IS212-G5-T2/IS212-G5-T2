/*
 * SPM-65 AC10: one append-only audit entry per change request outcome (Approved, Denied, and also
 * Withdrawn by the organiser and Closed when the event is cancelled). Written in the same
 * transaction as the decision, so a failed write rolls the decision back. The table refuses
 * UPDATE (database trigger) and allows one entry per request (unique index).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

type Queryable = { query(text: string, params?: unknown[]): Promise<unknown> };

export type ChangeRequestOutcome =
  'Approved' | 'Denied' | 'Withdrawn' | 'Closed';

export interface AuditEntry {
  id: string;
  changeRequestId: string;
  outcome: ChangeRequestOutcome;
  changes: unknown[];
  requestedBy: string;
  decidedBy: string;
  reason?: string;
  decidedAt: string;
}

/** Records the outcome of `request` (an event_change_requests row before it was decided). */
export async function recordOutcome(
  client: Queryable,
  request: pg.QueryResultRow,
  outcome: ChangeRequestOutcome,
  decision: {
    decidedBy: string;
    decidedById: string | null;
    reason?: string | null;
    decidedAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO event_change_request_audit
       (id, change_request_id, event_id, outcome, changes, requested_by_id, requested_by,
        decided_by_id, decided_by, reason, decided_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      request.id,
      request.event_id,
      outcome,
      JSON.stringify(request.changes),
      request.requested_by_id,
      request.requested_by,
      decision.decidedById,
      decision.decidedBy,
      decision.reason ?? null,
      decision.decidedAt,
    ],
  );
}

export function toAuditEntry(row: pg.QueryResultRow): AuditEntry {
  return {
    id: row.id,
    changeRequestId: row.change_request_id,
    outcome: row.outcome,
    changes: row.changes,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    ...(row.reason ? { reason: row.reason } : {}),
    decidedAt: new Date(row.decided_at).toISOString(),
  };
}
