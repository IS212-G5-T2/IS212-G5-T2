/*
 * The operational safety check record (coordinator request, Safety Officer
 * outcome). The Safety Officer stories write the outcome columns; this story
 * writes the request. Readiness (readiness.ts) sees it through the
 * SafetyOutcomeSource port, so "no row" stays outstanding.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { SafetyOutcomeSource } from './arrangements.reader.js';
import type { SafetyFact } from './readiness.js';

// 'rejected' (SPM-48 AC7, SPM-130 AC2): the Safety Officer rejected the arrangement; the coordinator re-requests it.
export type SafetyCheckStatus = 'not_requested' | 'pending' | 'changes_needed' | 'approved' | 'rejected';

export interface SafetyCheckFeedback {
  id: string;
  text: string;
  requestedAt: string;
  resolvedByCoordinatorAt?: string;
}

export interface SafetyCheckView {
  status: SafetyCheckStatus;
  requestedDate?: string;
  approverName?: string;
  feedback?: SafetyCheckFeedback[];
  /** Why a previous safety check was reset (set only while status is not_requested). */
  resetReason?: string;
  resetDate?: string;
}

interface SafetyCheckRow {
  status: Exclude<SafetyCheckStatus, 'not_requested'>;
  requested_at: Date;
  approver_name: string | null;
}

interface FeedbackRow {
  id: string;
  feedback_text: string;
  requested_at: Date;
  resolved_by_coordinator_at: Date | null;
}

const FACT_STATE: Record<SafetyCheckRow['status'], SafetyFact['state']> = {
  pending: 'Awaiting Check',
  changes_needed: 'Changes Requested',
  approved: 'Approved',
  rejected: 'Rejected',
};

@Injectable()
export class EventSafetyCheckSource implements SafetyOutcomeSource {
  constructor(private readonly database: DatabaseService) {}

  async read(eventId: string): Promise<SafetyFact | undefined> {
    const row = await this.row(eventId);
    return row ? { state: FACT_STATE[row.status] } : undefined;
  }

  async view(eventId: string): Promise<SafetyCheckView> {
    const row = await this.row(eventId);
    if (!row) {
      const reset = await this.database.query<{ reset_at: Date; reason: string }>(
        'SELECT reset_at, reason FROM event_safety_resets WHERE event_id = $1',
        [eventId],
      );
      const found = reset.rows[0];
      return found
        ? { status: 'not_requested', resetReason: found.reason, resetDate: found.reset_at.toISOString() }
        : { status: 'not_requested' };
    }
    const feedbackItems = await this.feedbackItems(eventId);
    return {
      status: row.status,
      requestedDate: row.requested_at.toISOString(),
      ...(row.approver_name ? { approverName: row.approver_name } : {}),
      ...(feedbackItems.length > 0 ? { feedback: feedbackItems } : {}),
    };
  }

  private async feedbackItems(eventId: string): Promise<SafetyCheckFeedback[]> {
    const result = await this.database.query<FeedbackRow>(
      `SELECT id, feedback_text, requested_at, resolved_by_coordinator_at
         FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY requested_at, id`,
      [eventId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      text: row.feedback_text,
      requestedAt: row.requested_at.toISOString(),
      ...(row.resolved_by_coordinator_at
        ? { resolvedByCoordinatorAt: row.resolved_by_coordinator_at.toISOString() }
        : {}),
    }));
  }

  private async row(eventId: string): Promise<SafetyCheckRow | undefined> {
    const result = await this.database.query<SafetyCheckRow>(
      'SELECT status, requested_at, approver_name FROM event_safety_checks WHERE event_id = $1',
      [eventId],
    );
    return result.rows[0];
  }
}
