import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { validateEvent } from './event-input.js';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  identity() {
    // Explicit local-only identity. Never trust an organiser ID from a request body.
    if (process.env.DEMO_ORGANISER_ENABLED !== 'true')
      throw new ForbiddenException(
        'Event access requires configured authentication.',
      );
    return {
      id: 'current-user',
      name: 'Demo Organiser',
      email: 'organiser@example.test',
      role: 'organiser' as const,
    };
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
  async list() {
    const user = this.identity();
    const result = await this.pool.query(
      'SELECT * FROM events WHERE organiser_id = $1 ORDER BY created_at DESC',
      [user.id],
    );
    return result.rows.map((row) => this.record(row));
  }
  async get(id: string) {
    const user = this.identity();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Event not found.');
    const result = await this.pool.query(
      'SELECT * FROM events WHERE id = $1 AND organiser_id = $2',
      [id, user.id],
    );
    if (!result.rows[0]) throw new NotFoundException('Event not found.');
    return this.record(result.rows[0]);
  }
  async create(body: unknown, transaction?: pg.PoolClient, eventId?: string) {
    const user = this.identity();
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
    user: ReturnType<EventsService['identity']>,
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
    return {
      event: this.record(row),
      message: 'Your event request was submitted successfully.',
    };
  }
}
