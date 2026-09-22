import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { EventsService } from './events.service.js';
import { uuid, validateDraft } from './draft-input.js';

/* v8 ignore start -- unreachable emitDecoratorMetadata paramtype guard */
@Injectable()
export class DraftsService {
  /* v8 ignore stop */
  constructor(
    private readonly events: EventsService,
    private readonly database: DatabaseService,
  ) {}
  private id(id: string) {
    if (!uuid.test(id)) throw new NotFoundException('Request not found.');
  }
  // Drafts are organiser-only, matching AGENTS.md's events-boundary policy:
  // never a shared demo identity, always the verified caller's own UID.
  private requireOrganiser(identity: AuthenticatedUser | undefined) {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('ORGANISER'))
      throw new ForbiddenException('Organiser access required.');
    return { id: identity.uid };
  }
  private record(row: pg.QueryResultRow) {
    return {
      id: row.id,
      fields: row.fields,
      status: row.status,
      version: row.version,
      eventId: row.event_id,
      updatedAt: row.updated_at.toISOString(),
    };
  }
  async list(identity: AuthenticatedUser | undefined) {
    const owner = this.requireOrganiser(identity);
    const result = await this.database.query(
      'SELECT * FROM event_drafts WHERE organiser_id=$1 ORDER BY updated_at DESC',
      [owner.id],
    );
    return result.rows.map((row) => this.record(row));
  }
  async get(identity: AuthenticatedUser | undefined, id: string) {
    const owner = this.requireOrganiser(identity);
    this.id(id);
    const result = await this.database.query(
      'SELECT * FROM event_drafts WHERE id=$1 AND organiser_id=$2',
      [id, owner.id],
    );
    if (!result.rows[0]) throw new NotFoundException('Request not found.');
    return this.record(result.rows[0]);
  }
  async save(identity: AuthenticatedUser | undefined, id: string, body: unknown) {
    const owner = this.requireOrganiser(identity);
    this.id(id);
    const data = validateDraft(body);
    return this.database.transaction(async (client) => {
      if (data.version === 0)
        await client.query(
          'INSERT INTO event_drafts (id, organiser_id, fields) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
          [id, owner.id, JSON.stringify(data.fields)],
        );
      const selected = await client.query(
        'SELECT * FROM event_drafts WHERE id=$1 AND organiser_id=$2 FOR UPDATE',
        [id, owner.id],
      );
      let row = selected.rows[0];
      if (!row) throw new NotFoundException('Request not found.');
      if (row.status !== 'Draft')
        throw new ConflictException(
          'This request was submitted. Use Event Change Requests for further changes.',
        );
      if (row.last_operation === data.operationId) {
        if (!isDeepStrictEqual(row.fields, data.fields))
          throw new ConflictException(
            'A save identifier cannot be reused for different values.',
          );
      } else {
        if (row.version !== data.version)
          throw new ConflictException(
            'This draft changed in another window. Reopen it before saving again.',
          );
        row = (
          await client.query(
            'UPDATE event_drafts SET fields=$3, version=version+1, last_operation=$4, updated_at=now() WHERE id=$1 AND organiser_id=$2 RETURNING *',
            [id, owner.id, JSON.stringify(data.fields), data.operationId],
          )
        ).rows[0];
      }
      return this.record(row);
    });
  }
  async submit(identity: AuthenticatedUser | undefined, id: string, body: unknown) {
    const owner = this.requireOrganiser(identity);
    this.id(id);
    const data = body as Record<string, unknown> | null;
    if (
      !data ||
      !Number.isSafeInteger(data.version) ||
      (data.version as number) < 1
    )
      throw new BadRequestException('Invalid draft version.');
    return this.database.transaction(async (client) => {
      const selected = await client.query(
        'SELECT * FROM event_drafts WHERE id=$1 AND organiser_id=$2 FOR UPDATE',
        [id, owner.id],
      );
      const row = selected.rows[0];
      if (!row) throw new NotFoundException('Request not found.');
      // A lost submission response is safely retried without creating another event.
      if (row.status === 'Submitted') {
        return {
          event: await this.events.get(identity, row.event_id),
          message: 'Your event request was submitted successfully.',
        };
      }
      if (row.version !== data.version)
        throw new ConflictException(
          'This draft changed. Reopen it before submitting.',
        );
      // The submitted snapshot must match the saved draft; the server owns status and identity.
      const fields = row.fields;
      const result = await this.events.create(
        identity,
        {
          ...fields,
          startDateTime: data.startDateTime,
          endDateTime: data.endDateTime,
          expectedAttendance:
            fields.expectedAttendance === ''
              ? null
              : Number(fields.expectedAttendance),
          submissionKey: id,
        },
        client,
        id,
      );
      await client.query(
        "UPDATE event_drafts SET status='Submitted', event_id=$2, version=version+1, updated_at=now() WHERE id=$1",
        [id, result.event.id],
      );
      return result;
    });
  }
}
