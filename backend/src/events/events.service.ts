import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { validateEvent, type EventAttachment } from './event-input.js';
import {
  getEligibleCoordinators,
  selectCoordinator,
} from './coordinator-assignment.js';

// Every assignment decision takes this transaction-scoped lock first, so two
// submissions racing each other can't both read the same workloads and pick the
// same coordinator. It is released automatically on commit or rollback.
const ASSIGNMENT_LOCK_KEY = 'event-coordinator-assignment';

// Which notification types each role may read and mark as read: organisers
// get their request decisions (SPM-40 approval, SPM-83 rejection), and
// coordinators get their new assignments (SPM-123).
const NOTIFICATION_TYPES_BY_ROLE = {
  ORGANISER: ['rejection', 'approval'],
  COORDINATOR: ['coordinator_assignment'],
} as const;

@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

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
      registrationEnabled: row.registration_enabled,
      registrationOpensAt: row.registration_opens_at?.toISOString(),
      registrationClosesAt: row.registration_closes_at?.toISOString(),
      // PostgreSQL owns the capacity calculation so every API consumer sees
      // the same persisted registration availability.
      availableRegistrationSpots:
        row.available_registration_spots == null
          ? undefined
          : Number(row.available_registration_spots),
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
    const result = user.roles.includes('ATTENDEE')
      ? await this.database.query(
          `SELECT events.*, GREATEST(
             0,
             COALESCE(events.registration_limit, events.expected_attendance) - (
               SELECT COUNT(*)::integer FROM event_registrations
                WHERE event_id = events.id AND status = 'Registered'
             )
           )::integer AS available_registration_spots
             FROM events
            WHERE status IN ('Confirmed', 'Completed', 'Cancelled')
            ORDER BY start_date_time ASC`,
        )
      : user.roles.includes('COORDINATOR')
      ? await this.database.query(
          'SELECT * FROM events WHERE coordinator_id = $1 ORDER BY created_at DESC',
          [user.uid],
        )
      : user.roles.includes('ORGANISER')
        ? await this.database.query(
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
    const result = await this.database.query(
      `SELECT events.*, GREATEST(
         0,
         COALESCE(events.registration_limit, events.expected_attendance) - (
           SELECT COUNT(*)::integer FROM event_registrations
            WHERE event_id = events.id AND status = 'Registered'
         )
       )::integer AS available_registration_spots
         FROM events WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Event not found.');
    const isOwningOrganiser =
      user.roles.includes('ORGANISER') && row.organiser_id === user.uid;
    const isAssignedCoordinator =
      user.roles.includes('COORDINATOR') && row.coordinator_id === user.uid;
    const isAttendeeViewable =
      user.roles.includes('ATTENDEE') &&
      ['Confirmed', 'Completed', 'Cancelled'].includes(row.status);
    if (!isOwningOrganiser && !isAssignedCoordinator && !isAttendeeViewable)
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
    const result = await this.database.query(
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

  private requireCoordinator(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    if (!user.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    return user;
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

  // SPM-83: only the coordinator assigned by SPM-38's round-robin flow may
  // reject a still-Submitted request. The decision and organiser notification
  // share one transaction so a rejection is never persisted without its reason.
  async reject(id: string, body: unknown, identity?: AuthenticatedUser) {
    const coordinator = this.requireCoordinator(identity);
    this.eventId(id);
    const data = body as Record<string, unknown> | null;
    const reason = EventsService.validateRejectionReason(
      typeof data?.reason === 'string' ? data.reason : '',
    );
    return this.database.transaction(async (client) => {
      const selected = await client.query(
        'SELECT * FROM events WHERE id = $1 FOR UPDATE',
        [id],
      );
      const event = selected.rows[0];
      if (!event) throw new NotFoundException('Event not found.');
      if (event.status !== 'Submitted')
        throw new ConflictException(
          'Only Submitted requests can be rejected. Refresh the pending list.',
        );
      if (event.coordinator_id !== coordinator.uid)
        throw new ForbiddenException(
          'This request is assigned to another coordinator.',
        );
      const updated = await client.query(
        `UPDATE events
           SET status = 'Rejected',
               rejection_reason = $2,
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
      return this.record(updated.rows[0]);
    });
  }

  // SPM-40: approval is a one-way decision made only by the coordinator
  // assigned to a still-Submitted request. The status change and organiser
  // notification are committed together so neither can exist without the
  // other, and the row lock prevents concurrent decisions from both winning.
  async approve(id: string, identity?: AuthenticatedUser) {
    const coordinator = this.requireCoordinator(identity);
    this.eventId(id);
    return this.database.transaction(async (client) => {
      const selected = await client.query(
        'SELECT * FROM events WHERE id = $1 FOR UPDATE',
        [id],
      );
      const event = selected.rows[0];
      if (!event) throw new NotFoundException('Event not found.');
      if (event.status !== 'Submitted')
        throw new ConflictException(
          'Only Submitted requests can be approved. Refresh the pending list.',
        );
      if (event.coordinator_id !== coordinator.uid)
        throw new ForbiddenException(
          'This request is assigned to another coordinator.',
        );
      const updated = await client.query(
        `UPDATE events
           SET status = 'Approved',
               updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
         VALUES ($1, $2, 'approval', $3, $4)`,
        [
          randomUUID(),
          event.organiser_id,
          `Your event request "${event.event_name}" was approved and can proceed.`,
          id,
        ],
      );
      return this.record(updated.rows[0]);
    });
  }

  // Organisers read their decision notifications; coordinators read their
  // assignment notifications. Roles without notifications (e.g. Venue Staff on
  // a Coordinator + Venue Staff account) add nothing.
  private notificationTypesFor(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    const types = (
      Object.keys(NOTIFICATION_TYPES_BY_ROLE) as (keyof typeof NOTIFICATION_TYPES_BY_ROLE)[]
    )
      .filter((role) => user.roles.includes(role))
      .flatMap((role) => [...NOTIFICATION_TYPES_BY_ROLE[role]]);
    if (!types.length)
      throw new ForbiddenException('Organiser or coordinator access required.');
    return { user, types };
  }

  async notifications(identity?: AuthenticatedUser) {
    const { user, types } = this.notificationTypesFor(identity);
    const result = await this.database.query(
      'SELECT * FROM notifications WHERE recipient_id = $1 AND type = ANY($2::text[]) ORDER BY created_at DESC',
      [user.uid, types],
    );
    return result.rows.map((row) => ({
      id: row.id,
      audienceRole: row.type === 'coordinator_assignment' ? 'coordinator' : 'organiser',
      audienceUserId: row.recipient_id,
      type: row.type,
      message: row.message,
      relatedEventId: row.related_event_id,
      read: row.read,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async readNotification(id: string, identity?: AuthenticatedUser) {
    const { user, types } = this.notificationTypesFor(identity);
    this.eventId(id);
    const result = await this.database.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = ANY($3::text[]) RETURNING id',
      [id, user.uid, types],
    );
    if (!result.rows[0]) throw new NotFoundException('Notification not found.');
    return { success: true };
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
    return this.database.transaction(async (client) => {
      const result = await this.insert(data, user, client, eventId);
      return result;
    });
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
        required_facilities, accessibility_needs, attachments, equipment_needs, registration_enabled,
        registration_limit, submission_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        data.registrationEnabled,
        data.expectedAttendance,
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

  // SPM-38/SPM-123: assign a coordinator at submission time so a request is
  // never left waiting for someone to claim it. The coordinator with the fewest
  // active requests gets it (see coordinator-assignment.ts). Everything below
  // runs inside the submission transaction: the assignment and the
  // coordinator's notification are saved together or not at all. A retried
  // submission (ON CONFLICT above) reuses the row already assigned, so an event
  // is only ever assigned once. Assignment never changes the event's status. If
  // there is no active coordinator the event is left unassigned rather than
  // failing the submission.
  private async autoAssignCoordinator(row: pg.QueryResultRow, client: pg.PoolClient) {
    if (row.coordinator_id) return row;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      ASSIGNMENT_LOCK_KEY,
    ]);
    const coordinator = selectCoordinator(await getEligibleCoordinators(client));
    if (!coordinator) return row;
    const updated = await client.query(
      `UPDATE events
         SET coordinator_id = $2,
             coordinator_name = $3,
             updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [row.id, coordinator.id, coordinator.name],
    );
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
       VALUES ($1, $2, 'coordinator_assignment', $3, $4)`,
      [
        randomUUID(),
        coordinator.id,
        `New event request "${row.event_name}" is awaiting your review.`,
        row.id,
      ],
    );
    return updated.rows[0];
  }
}
