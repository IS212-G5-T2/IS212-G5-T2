import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { validateEvent, type EventAttachment } from './event-input.js';
import { CLOCK, systemClock, type Clock } from '../registrations/clock.js';
import {
  ATTENDEE_VISIBLE_STATUSES,
  isRegistrationOpen,
} from '../registrations/registration-window.js';

// SPM-46: the event's most recent reassignment, read with each event so the
// current coordinator can see who it came from and when.
const LATEST_REASSIGNMENT = `(SELECT json_build_object(
           'coordinatorName', r.from_coordinator_name,
           'reassignedAt', r.reassigned_at,
           'toCoordinatorId', r.to_coordinator_id)
         FROM event_reassignments r
        WHERE r.event_id = events.id
        ORDER BY r.reassigned_at DESC
        LIMIT 1) AS latest_reassignment`;

type LatestReassignment = { coordinatorName: string; reassignedAt: string; toCoordinatorId: string };

// Only the event's current coordinator sees how they got it, and only from a
// reassignment that was to them; organisers and attendees never receive it.
function reassignedFrom(row: pg.QueryResultRow, viewerUid?: string) {
  const latest = row.latest_reassignment as LatestReassignment | null | undefined;
  if (!viewerUid || viewerUid !== row.coordinator_id) return undefined;
  if (!latest || latest.toCoordinatorId !== row.coordinator_id) return undefined;
  return { coordinatorName: latest.coordinatorName, reassignedAt: new Date(latest.reassignedAt).toISOString() };
}

// Who a stored notification is for, as the frontend labels it.
function audienceRoleFor(type: string) {
  if (type === 'coordinator_unavailable') return 'coordinator_lead';
  if (type.startsWith('coordinator_')) return 'coordinator';
  return 'organiser';
}

@Injectable()
export class EventsService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

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

  private record(row: pg.QueryResultRow, viewerUid?: string) {
    return {
      id: row.id,
      name: row.event_name,
      purpose: row.purpose,
      description: row.description,
      organiserId: row.organiser_id,
      organiserName: row.organiser_name,
      coordinatorId: row.coordinator_id ?? undefined,
      coordinatorName: row.coordinator_name ?? undefined,
      reassignedFrom: reassignedFrom(row, viewerUid),
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
      // SPM-61: computed here so every client applies the same window rule
      // (inclusive open, exclusive close) using the injected clock.
      registrationOpen: isRegistrationOpen(
        {
          registrationEnabled: row.registration_enabled,
          status: row.status,
          opensAt: row.registration_opens_at ?? null,
          closesAt: row.registration_closes_at ?? null,
        },
        this.clock.now(),
      ),
      // PostgreSQL owns the capacity calculation so every API consumer sees
      // the same persisted registration availability.
      // SPM-61: the signed-in attendee's own registration, list view only.
      myRegistrationStatus: row.my_registration_status
        ? String(row.my_registration_status).toLowerCase()
        : undefined,
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
  // coordinator sees only the requests the Event Coordinator Lead assigned to
  // them (SPM-123) — never another coordinator's. Every other role gets nothing from this
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
           )::integer AS available_registration_spots,
           (SELECT r.status FROM event_registrations r
             WHERE r.event_id = events.id AND r.attendee_id::text = $1
           ) AS my_registration_status
             FROM events
            WHERE status IN (${ATTENDEE_VISIBLE_STATUSES.map((s) => `'${s}'`).join(', ')})
            ORDER BY start_date_time ASC`,
          [user.uid],
        )
      : user.roles.includes('COORDINATOR')
      ? await this.database.query(
          `SELECT events.*, ${LATEST_REASSIGNMENT} FROM events WHERE coordinator_id = $1 ORDER BY created_at DESC`,
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
      const record = this.record(row, user.uid);
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
       )::integer AS available_registration_spots,
       ${LATEST_REASSIGNMENT}
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
      ATTENDEE_VISIBLE_STATUSES.includes(row.status);
    if (!isOwningOrganiser && !isAssignedCoordinator && !isAttendeeViewable) {
      // SPM-46 AC4: someone who held the event before is told it moved (without
      // naming who has it now); anyone else still learns nothing.
      if (user.roles.includes('COORDINATOR')) {
        const held = await this.database.query(
          'SELECT 1 AS held FROM event_reassignments WHERE event_id = $1 AND from_coordinator_id = $2 LIMIT 1',
          [id, user.uid],
        );
        if (held.rows.length)
          throw new ForbiddenException('This event has been reassigned to another Coordinator.');
      }
      throw new NotFoundException('Event not found.');
    }
    return this.record(row, user.uid);
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

  // SPM-83: only the coordinator the Lead assigned (SPM-123) may
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

  // Which notification types each role reads and marks read: organisers get
  // their request decisions (SPM-83 rejection, SPM-40 approval); coordinators
  // get new assignments from the Event Coordinator Lead (SPM-123) and
  // reassignments to and away from them (SPM-47); the Lead is told when a
  // coordinator with active events becomes unavailable (SPM-47).
  private notificationTypesFor(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    const types = [
      ...(user.roles.includes('ORGANISER') ? ['rejection', 'approval'] : []),
      ...(user.roles.includes('COORDINATOR')
        ? ['coordinator_assignment', 'coordinator_reassignment', 'coordinator_unassignment']
        : []),
      ...(user.roles.includes('COORDINATOR_LEAD') ? ['coordinator_unavailable'] : []),
    ];
    if (!types.length) throw new ForbiddenException('Organiser or coordinator access required.');
    return { user, types };
  }

  async notifications(identity?: AuthenticatedUser) {
    const { user, types } = this.notificationTypesFor(identity);
    const result = await this.database.query(
      'SELECT * FROM notifications WHERE recipient_id = $1 AND type = ANY($2) ORDER BY created_at DESC',
      [user.uid, types],
    );
    return result.rows.map((row) => ({
      id: row.id,
      audienceRole: audienceRoleFor(row.type),
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
      'UPDATE notifications SET read = true WHERE id = $1 AND recipient_id = $2 AND type = ANY($3) RETURNING id',
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
    // SPM-123: the request waits unassigned in the Event Coordinator Lead's
    // queue; it is never assigned automatically.
    return {
      event: this.record(row),
      message: 'Your event request was submitted successfully.',
    };
  }
}
