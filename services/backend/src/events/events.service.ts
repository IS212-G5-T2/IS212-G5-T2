import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { validateEvent, type EventAttachment } from './event-input.js';

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
  private requireRole(
    user: AuthenticatedUser | undefined,
    role: 'ORGANISER' | 'COORDINATOR',
  ) {
    if (!user?.uid || !user.roles.includes(role))
      throw new ForbiddenException('Access denied.');
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
      rejectionReason: row.rejection_reason ?? undefined,
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
  // Persist a coordinator claiming an event. A coordinator (not the organiser)
  // performs this, so it is scoped by event id rather than organiser_id. A
  // still-'Submitted' request advances to 'Under_Review'; later statuses are
  // left untouched. coordinatorId/name come from the caller because the events
  // routes carry no authenticated identity in local/demo mode.
  async assignCoordinator(id: string, body: unknown) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Event not found.');
    const data = body as Record<string, unknown> | null;
    const coordinatorId =
      typeof data?.coordinatorId === 'string' ? data.coordinatorId.trim() : '';
    const coordinatorName =
      typeof data?.coordinatorName === 'string'
        ? data.coordinatorName.trim()
        : '';
    if (!coordinatorId || !coordinatorName)
      throw new BadRequestException('A coordinator id and name are required.');
    const result = await this.pool.query(
      `UPDATE events
         SET coordinator_id = $2,
             coordinator_name = $3,
             status = CASE WHEN status = 'Submitted' THEN 'Under_Review' ELSE status END,
             updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, coordinatorId, coordinatorName],
    );
    if (!result.rows[0]) throw new NotFoundException('Event not found.');
    return this.record(result.rows[0]);
  }

  private eventId(id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Event not found.');
  }

  static validateRejectionReason(reason: string): string {
    const raw = typeof reason === 'string' ? reason : '';
    const trimmed = raw.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    const hasLetters = /[a-zA-Z]/.test(trimmed);
    if (
      !trimmed ||
      raw.length > 500 ||
      trimmed.length < 10 ||
      trimmed.length > 500 ||
      words.length < 3 ||
      !hasLetters
    ) {
      throw new BadRequestException(
        'Please provide a reason that: is between 10 and 500 characters; ' +
          'contains at least 3 words; and includes real words, not just numbers or symbols.',
      );
    }
    return trimmed;
  }

  async reject(id: string, body: unknown, currentUser?: AuthenticatedUser) {
    this.requireRole(currentUser, 'COORDINATOR');
    this.eventId(id);
    const data = body as Record<string, unknown> | null;
    const reason = EventsService.validateRejectionReason(
      typeof data?.reason === 'string' ? data.reason : '',
    );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(
        'SELECT * FROM events WHERE id = $1 FOR UPDATE',
        [id],
      );
      const event = selected.rows[0];
      if (!event) throw new NotFoundException('Event not found.');
      if (event.status !== 'Submitted' && event.status !== 'Under_Review')
        throw new ConflictException(
          'Only Submitted or Under_Review requests can be rejected. Refresh the pending list.',
        );
      if (event.coordinator_id && event.coordinator_id !== currentUser!.uid)
        throw new ForbiddenException(
          'This request is assigned to another coordinator.',
        );
      const updated = await client.query(
        `UPDATE events
            SET status = CASE WHEN status IN ('Submitted', 'Under_Review') THEN 'Rejected' ELSE status END,
                rejection_reason = CASE WHEN status IN ('Submitted', 'Under_Review') THEN $2 ELSE rejection_reason END,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id, reason],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
         VALUES ($1, $2, 'rejection', $3, $4)`,
        [
          randomUUID(),
          event.organiser_id,
          `Your event request "${event.event_name}" was rejected: ${reason}`,
          id,
        ],
      );
      await client.query('COMMIT');
      return this.record(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async notifications(currentUser?: AuthenticatedUser) {
    this.requireRole(currentUser, 'ORGANISER');
    const recipientId =
      process.env.DEMO_ORGANISER_ENABLED === 'true'
        ? this.identity().id
        : currentUser!.uid;
    const result = await this.pool.query(
      "SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'rejection' ORDER BY created_at DESC",
      [recipientId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      audienceRole: 'organiser',
      audienceUserId: row.recipient_id,
      type: row.type,
      message: row.message,
      relatedEventId: row.related_event_id,
      read: row.read,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async readNotification(id: string, currentUser?: AuthenticatedUser) {
    this.requireRole(currentUser, 'ORGANISER');
    this.eventId(id);
    const recipientId =
      process.env.DEMO_ORGANISER_ENABLED === 'true'
        ? this.identity().id
        : currentUser!.uid;
    const result = await this.pool.query(
      "UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = 'rejection' RETURNING id",
      [id, recipientId],
    );
    if (!result.rows[0]) throw new NotFoundException('Notification not found.');
    return { success: true };
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
