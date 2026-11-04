/*
 * SPM-157: reads every history source for one event. Read-only; nothing here writes.
 * event_audit_log is written by the database triggers in database/postgresql/init/034; the other
 * sources are the histories earlier stories keep and are read as they are.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { approvedHoldState } from '../venue-unavailable.js';
import type {
  AuditLogRow,
  CancellationRequestRow,
  ChangeRequestOutcomeRow,
  ChangeRequestRow,
  ExpiredHoldRow,
  FlaggedChangeRow,
  HistorySources,
} from './event-history.types.js';

export interface HistoryEventRow {
  id: string;
  event_name: string;
  status: string;
  organiser_id: string;
  coordinator_id: string | null;
}

interface HoldRow {
  id: string;
  venue_name: string;
  status: string;
  request_kind: string;
  hold_expires_at: Date | null;
}

/** Audit log sections each viewer may read (AC8: an organiser reads event and registration history). */
export type AuditSections = ('event' | 'venue_booking' | 'equipment' | 'registration')[];

@Injectable()
export class EventHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async findEvent(eventId: string): Promise<HistoryEventRow | undefined> {
    const result = await this.database.query<HistoryEventRow>(
      'SELECT id, event_name, status, organiser_id, coordinator_id FROM events WHERE id = $1',
      [eventId],
    );
    return result.rows[0];
  }

  /**
   * All sources for the event. `sections` limits the audit log; venue and equipment sources are read
   * only when their section is included. `now` decides which approved holds have expired.
   */
  async readSources(eventId: string, sections: AuditSections, now: Date): Promise<HistorySources> {
    const includesVenue = sections.includes('venue_booking');
    const [auditLog, flaggedChanges, changeRequests, changeRequestOutcomes, cancellationRequests, expiredHolds] =
      await Promise.all([
        this.database.query<AuditLogRow>(
          `SELECT id::text, section, action, subject_label, changes, reason, actor_name, actor_kind, occurred_at
             FROM event_audit_log
            WHERE event_id = $1 AND section = ANY($2::text[])
            ORDER BY occurred_at, id`,
          [eventId, sections],
        ),
        this.database.query<FlaggedChangeRow>(
          `SELECT id, kind, field, original_value, proposed_value, status, proposed_by, created_at,
                  resolved_by, resolved_at
             FROM event_flagged_changes
            WHERE event_id = $1
            ORDER BY created_at, id`,
          [eventId],
        ),
        this.database.query<ChangeRequestRow>(
          `SELECT id, requested_by, changes, reason, created_at
             FROM event_change_requests
            WHERE event_id = $1
            ORDER BY created_at, id`,
          [eventId],
        ),
        this.database.query<ChangeRequestOutcomeRow>(
          `SELECT id, outcome, changes, decided_by, reason, decided_at
             FROM event_change_request_audit
            WHERE event_id = $1
            ORDER BY decided_at, id`,
          [eventId],
        ),
        this.database.query<CancellationRequestRow>(
          `SELECT id, requested_by, reason, status, requested_at, decided_by, decided_at
             FROM event_cancellation_requests
            WHERE event_id = $1
            ORDER BY requested_at, id`,
          [eventId],
        ),
        includesVenue
          ? this.database.query<HoldRow>(
              `SELECT b.id, v.name AS venue_name, b.status, b.request_kind, b.hold_expires_at
                 FROM venue_bookings b
                 JOIN venues v ON v.id = b.venue_id
                WHERE b.event_id = $1 AND b.request_kind = 'tentative_hold' AND b.status IN ('approved', 'expired')
                ORDER BY b.hold_expires_at, b.id`,
              [eventId],
            )
          : Promise.resolve({ rows: [] as HoldRow[] }),
      ]);
    return {
      auditLog: auditLog.rows,
      flaggedChanges: flaggedChanges.rows,
      changeRequests: changeRequests.rows,
      changeRequestOutcomes: changeRequestOutcomes.rows,
      cancellationRequests: cancellationRequests.rows,
      // SPM-159 and SPM-132: the one hold rule (src/events/venue-unavailable.ts), with the injected clock. A hold the
      // expiry processor already marked 'expired' is expired too; either way the entry is at hold_expires_at.
      expiredHolds: expiredHolds.rows
        .filter((row) => approvedHoldState(
          { status: row.status, requestKind: row.request_kind, holdExpiresAt: row.hold_expires_at }, now) === 'expired')
        .map((row): ExpiredHoldRow => ({ id: row.id, venue_name: row.venue_name, hold_expires_at: row.hold_expires_at as Date })),
    };
  }
}
