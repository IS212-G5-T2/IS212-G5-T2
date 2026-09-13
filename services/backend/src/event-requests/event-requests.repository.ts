import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import type { DraftFields, SaveDraftDto } from './dto/save-draft.dto.js';
import type { DraftWorkspace } from './draft-workspace.js';

export interface EventRequestRecord {
  id: string;
  organisationId: string;
  organiserId: string;
  status: string;
  fields: DraftFields;
  version: number;
  createdAt: string;
  updatedAt: string;
}
interface Row {
  id: string; organisation_id: string; organiser_id: string; status: string;
  fields: DraftFields; version: number; created_at: Date; updated_at: Date;
  last_operation_id: string;
}
function record(row: Row): EventRequestRecord {
  return { id: row.id, organisationId: row.organisation_id, organiserId: row.organiser_id,
    status: row.status, fields: row.fields, version: row.version,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

@Injectable()
export class EventRequestsRepository implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000, max: 5 });

  async onModuleDestroy() { await this.pool.end(); }

  async list(user: DraftWorkspace): Promise<EventRequestRecord[]> {
    try {
      const result = await this.pool.query<Row>('SELECT * FROM event_requests WHERE organisation_id = $1 ORDER BY updated_at DESC, id', [user.organisationId]);
      return result.rows.map(record);
    } catch { throw new ServiceUnavailableException('Requests are temporarily unavailable. Please retry.'); }
  }

  async get(id: string, user: DraftWorkspace): Promise<EventRequestRecord> {
    let rows: Row[];
    try { ({ rows } = await this.pool.query<Row>('SELECT * FROM event_requests WHERE id = $1 AND organisation_id = $2', [id, user.organisationId])); }
    catch { throw new ServiceUnavailableException('Request is temporarily unavailable. Please retry.'); }
    if (!rows[0]) throw new NotFoundException('Request not found.');
    return record(rows[0]);
  }

  async save(id: string, dto: SaveDraftDto, user: DraftWorkspace): Promise<EventRequestRecord> {
    const client = await this.pool.connect().catch(() => { throw new ServiceUnavailableException('Draft could not be saved. Please retry.'); });
    try {
      await client.query('BEGIN');
      // The browser keeps the same UUID across retries; only version zero can create.
      if (dto.version === 0) {
        await client.query(`INSERT INTO event_requests (id, organisation_id, organiser_id, fields, last_operation_id)
          VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [id, user.organisationId, user.userId, dto.fields, dto.operationId]);
      }
      const { rows } = await client.query<Row>('SELECT * FROM event_requests WHERE id = $1 AND organisation_id = $2 FOR UPDATE', [id, user.organisationId]);
      const existing = rows[0];
      if (!existing) throw new NotFoundException('Request not found.');
      if (existing.status !== 'draft') throw new ConflictException('This request has been submitted. Use the Event Change Requests workflow.');
      if (existing.last_operation_id === dto.operationId) {
        // Replays must carry identical fields; never silently accept a different write.
        const same = Object.keys(dto.fields).every(key => dto.fields[key as keyof DraftFields] === existing.fields[key as keyof DraftFields]);
        if (!same) throw new ConflictException('Retry the original save before making another change.');
        await client.query('COMMIT');
        return record(existing);
      }
      if (existing.version !== dto.version) throw new ConflictException('This draft changed elsewhere. Reopen it before saving again.');
      const updated = await client.query<Row>(`UPDATE event_requests SET fields = $3, version = version + 1,
        updated_at = now(), last_operation_id = $4 WHERE id = $1 AND organisation_id = $2 AND status = 'draft' RETURNING *`,
        [id, user.organisationId, dto.fields, dto.operationId]);
      await client.query('COMMIT');
      return record(updated.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Draft could not be saved. Please retry.');
    } finally { client.release(); }
  }
}
