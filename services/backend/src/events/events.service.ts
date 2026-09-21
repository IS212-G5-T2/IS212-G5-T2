import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { validateEvent, type EventAttachment } from './event-input.js';
import { pickNextCoordinator } from './coordinator-roster.js';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  // SPM-38: never trust an organiser/coordinator id from a request body — the
  // verified Firebase identity (set by FirebaseAuthenticationMiddleware) is
  // the only source of truth for who is calling.
  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }

  private requireOrganiser(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    if (!user.roles.includes('ORGANISER'))
      throw new ForbiddenException('Organiser access required.');
    return { id: user.uid, name: user.name ?? user.email ?? 'Organiser', email: user.email ?? '' };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private record(row: pg.QueryResultRow) {
    return {
      id: row.id,
      name: row.event_name,
      purpose: row.purpose,
      description: row.description,
      organiserId: row.organiser_id,
      organiserName: row.organiser_name,
      coordinatorId: row.coordinator_id ?? undefined,
      coordinatorName: row.coordinator_name ?? undefined,
      status: row.status.toLowerCase(),
      startDateTime: row.start_date_time.toISOString(),
      endDateTime: row.end_date_time.toISOString(),
      expectedAttendance: row.expected_attendance,
      venueRequirements: {
        minCapacity: row.expected_attendance,
        layout: row.preferred_room_layout,
        facilities: row.required_facilities,
        accessibility: row.accessibility_needs,
      },
      attachments: row.attachments ?? [],
      equipmentNeeds: row.equipment_needs,
      registrationEnabled: false,
      changeRequests: [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
  // SPM-38 AC1/AC2/AC3: an organiser sees their own submitted requests; a
  // coordinator sees only the requests round-robin has assigned to them —
  // never another coordinator's. Every other role gets nothing from this
  // organiser/coordinator-facing endpoint.
  async list(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    const result = user.roles.includes('COORDINATOR')
      ? await this.pool.query(
          'SELECT * FROM events WHERE coordinator_id = $1 ORDER BY created_at DESC',
          [user.uid],
        )
      : user.roles.includes('ORGANISER')
        ? await this.pool.query(
            'SELECT * FROM events WHERE organiser_id = $1 ORDER BY created_at DESC',
            [user.uid],
          )
        : { rows: [] as pg.QueryResultRow[] };
    // The list view only needs attachment metadata (name/size/type), never the
    // base64 file contents. Keeping dataUrl here would balloon the response to
    // tens of MB per attached file and make the page time out; the detail
    // endpoint (get) still returns the full attachments including dataUrl.
    return result.rows.map((row) => {
      const record = this.record(row);
      return {
        ...record,
        attachments: (record.attachments as EventAttachment[]).map(
          ({ dataUrl: _dataUrl, ...meta }) => meta,
        ),
      };
    });
  }
  // SPM-38 AC4: only the owning organiser or the assigned coordinator may
  // view a request's details — a different coordinator gets the same
  // NotFoundException as a bad ID, so existence is never leaked to them.
  async get(identity: AuthenticatedUser | undefined, id: string) {
    const user = this.requireUser(identity);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Event not found.');
    const result = await this.pool.query('SELECT * FROM events WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Event not found.');
    const isOwningOrganiser =
      user.roles.includes('ORGANISER') && row.organiser_id === user.uid;
    const isAssignedCoordinator =
      user.roles.includes('COORDINATOR') && row.coordinator_id === user.uid;
    if (!isOwningOrganiser && !isAssignedCoordinator)
      throw new NotFoundException('Event not found.');
    return this.record(row);
  }
  // Manual override for a coordinator claim/reassignment. Round-robin
  // (see insert()) is now the primary path, so this mainly exists for
  // reassignment edge cases; kept scoped by event id like before. Assignment
  // never advances status — "Under Review" was retired as a distinct stage.
  async assignCoordinator(id: string, body: unknown) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
      throw new NotFoundException('Event not found.');
    const data = body as Record<string, unknown> | null;
    const coordinatorId =
      typeof data?.coordinatorId === 'string' ? data.coordinatorId.trim() : '';
    const coordinatorName =
      typeof data?.coordinatorName === 'string' ? data.coordinatorName.trim() : '';
    if (!coordinatorId || !coordinatorName)
      throw new BadRequestException('A coordinator id and name are required.');
    const result = await this.pool.query(
      `UPDATE events
         SET coordinator_id = $2,
             coordinator_name = $3,
             updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, coordinatorId, coordinatorName],
    );
    if (!result.rows[0]) throw new NotFoundException('Event not found.');
    return this.record(result.rows[0]);
  }
  async create(
    identity: AuthenticatedUser | undefined,
    body: unknown,
    transaction?: pg.PoolClient,
    eventId?: string,
  ) {
    const user = this.requireOrganiser(identity);
    const data = validateEvent(body);
    // When the caller supplies a transaction (e.g. draft submission), it owns
    // BEGIN/COMMIT/ROLLBACK and the connection lifecycle; we just run the insert.
    if (transaction) {
      return this.insert(data, user, transaction, eventId);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.insert(data, user, client, eventId);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insert(
    data: ReturnType<typeof validateEvent>,
    user: ReturnType<EventsService['requireOrganiser']>,
    client: pg.PoolClient,
    eventId?: string,
  ) {
    const inserted = await client.query(
      `INSERT INTO events
        (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, preferred_room_layout,
        required_facilities, accessibility_needs, attachments, equipment_needs, submission_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (organiser_id, submission_key) DO NOTHING RETURNING *`,
      [
        eventId ?? randomUUID(),
        user.id,
        user.name,
        user.email,
        data.name,
        data.purpose,
        data.description,
        data.startDateTime,
        data.endDateTime,
        data.expectedAttendance,
        data.layout,
        data.facilities,
        data.accessibility,
        JSON.stringify(data.attachments),
        data.equipmentNeeds,
        data.submissionKey,
      ],
    );
    const row =
      inserted.rows[0] ??
      (
        await client.query(
          'SELECT * FROM events WHERE organiser_id=$1 AND submission_key=$2',
          [user.id, data.submissionKey],
        )
      ).rows[0];
    const assignedRow = await this.autoAssignCoordinator(row, client);
    return {
      event: this.record(assignedRow),
      message: 'Your event request was submitted successfully.',
    };
  }

  // SPM-38 AC5: round-robin assignment at submission time, so a request is
  // never left waiting for a coordinator to manually claim it. A retried
  // submission (ON CONFLICT above) reuses the row already assigned, so this
  // only ever assigns once per event. Assignment never advances status.
  private async autoAssignCoordinator(row: pg.QueryResultRow, client: pg.PoolClient) {
    if (row.coordinator_id) return row;
    const { rows } = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM events WHERE coordinator_id IS NOT NULL',
    );
    const coordinator = pickNextCoordinator(Number(rows[0].count));
    const updated = await client.query(
      `UPDATE events
         SET coordinator_id = $2,
             coordinator_name = $3,
             updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [row.id, coordinator.id, coordinator.name],
    );
    return updated.rows[0];
  }
}
