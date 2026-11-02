/*
 * SPM-153 AC5: the completion record of a Completed event (attendance, operational notes and issues).
 *
 * - Only the assigned Coordinator reads or writes it (D3); everyone else gets 403, no token 401, a missing event 404.
 * - Saving is allowed only while the event is Completed (MSG-CP-05); the status check runs under the event row lock.
 * - A save may carry any subset of the three items; omitted items keep their saved value (D7, 05-B).
 * - Saving never changes the event status or writes a status history row (C7).
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type pg from 'pg';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { UUID_PATTERN } from '../../common/uuid.js';
import { DatabaseService } from '../../database/database.service.js';
import type { Queryable } from '../status/arrangements.reader.js';
import { STATUS_MESSAGES } from '../status/status.messages.js';
import { COMPLETION_CODES, COMPLETION_MESSAGES } from './completion.messages.js';
import { validateCompletionRecord, type CompletionRecordInput } from './completion.rules.js';

interface RecordRow {
  attendance_count: number | null;
  operational_notes: string | null;
  updated_by: string | null;
  updated_at: Date | null;
}

interface EventLockRow {
  id: string;
  status: string;
  coordinator_id: string | null;
}

export interface CompletionRecordView {
  attendanceCount: number | null;
  operationalNotes: string | null;
  issues: { description: string }[];
  updatedAt: string | null;
  updatedBy: string | null;
}

@Injectable()
export class CompletionRecordService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /** GET /api/events/:eventId/completion-record: the assigned Coordinator only. Nulls and an empty list when nothing is saved. */
  async read(identity: AuthenticatedUser | undefined, eventId: string): Promise<CompletionRecordView> {
    const user = this.requireUser(identity);
    await this.assignedEventOrThrow(user, eventId);
    return this.viewOf(this.database, eventId);
  }

  /** PUT /api/events/:eventId/completion-record: a subset save on a Completed event, last write wins. */
  async save(identity: AuthenticatedUser | undefined, eventId: string, body: unknown): Promise<CompletionRecordView & { message: string }> {
    const user = this.requireUser(identity);
    await this.assignedEventOrThrow(user, eventId);
    const now = this.clock.now();
    return this.database.transaction(async (client) => {
      const locked = (
        await client.query<EventLockRow>('SELECT id, status, coordinator_id FROM events WHERE id = $1 FOR UPDATE', [eventId])
      ).rows[0];
      if (!locked) throw new NotFoundException(STATUS_MESSAGES.notFound);
      if (locked.coordinator_id !== user.uid)
        throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
      if (locked.status !== 'Completed')
        throw new ConflictException({ code: COMPLETION_CODES.recordNotAllowed, message: COMPLETION_MESSAGES.recordNotAllowed });

      const result = validateCompletionRecord(body);
      if (!result.ok)
        throw new UnprocessableEntityException({
          code: COMPLETION_CODES.invalidRecord,
          message: COMPLETION_MESSAGES.invalidRecord,
          field: result.field,
        });

      await this.write(client, eventId, user.uid, now, result.value);
      return { ...(await this.viewOf(client, eventId)), message: COMPLETION_MESSAGES.recordSaved };
    });
  }

  /** Merges the items that were sent over the saved record and writes it. The event row lock serialises saves. */
  private async write(client: pg.PoolClient, eventId: string, actorId: string, now: Date, input: CompletionRecordInput) {
    const saved = (
      await client.query<RecordRow>(
        'SELECT attendance_count, operational_notes, updated_by, updated_at FROM completion_records WHERE event_id = $1',
        [eventId],
      )
    ).rows[0];
    const attendance = 'attendanceCount' in input ? input.attendanceCount ?? null : saved?.attendance_count ?? null;
    const notes = 'operationalNotes' in input ? input.operationalNotes ?? null : saved?.operational_notes ?? null;

    await client.query(
      `INSERT INTO completion_records (event_id, attendance_count, operational_notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO UPDATE
         SET attendance_count = $2, operational_notes = $3, updated_by = $4, updated_at = $5`,
      [eventId, attendance, notes, actorId, now],
    );
    if (input.issues !== undefined) {
      await client.query('DELETE FROM completion_record_issues WHERE event_id = $1', [eventId]);
      for (const [index, description] of input.issues.entries())
        await client.query(
          'INSERT INTO completion_record_issues (event_id, position, description) VALUES ($1, $2, $3)',
          [eventId, index + 1, description],
        );
    }
  }

  private async viewOf(client: Queryable, eventId: string): Promise<CompletionRecordView> {
    const record = (
      await client.query<RecordRow>(
        'SELECT attendance_count, operational_notes, updated_by, updated_at FROM completion_records WHERE event_id = $1',
        [eventId],
      )
    ).rows[0];
    const issues = (
      await client.query<{ description: string }>(
        'SELECT description FROM completion_record_issues WHERE event_id = $1 ORDER BY position',
        [eventId],
      )
    ).rows;
    return {
      attendanceCount: record?.attendance_count ?? null,
      operationalNotes: record?.operational_notes ?? null,
      issues: issues.map((issue) => ({ description: issue.description })),
      updatedAt: record?.updated_at ? record.updated_at.toISOString() : null,
      updatedBy: record?.updated_by ?? null,
    };
  }

  /** 404 for a bad or missing id, 403 unless the caller is the assigned Coordinator (D3). */
  private async assignedEventOrThrow(user: AuthenticatedUser, eventId: string) {
    if (!UUID_PATTERN.test(eventId)) throw new NotFoundException(STATUS_MESSAGES.notFound);
    const event = (
      await this.database.query<{ coordinator_id: string | null }>('SELECT coordinator_id FROM events WHERE id = $1', [eventId])
    ).rows[0];
    if (!event) throw new NotFoundException(STATUS_MESSAGES.notFound);
    const isAssigned = user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;
    if (!isAssigned) throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
  }

  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }
}
