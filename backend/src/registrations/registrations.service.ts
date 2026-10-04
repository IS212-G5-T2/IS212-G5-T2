/*
 * SPM-61 attendee registration. Every rule (role, window, duplicate, capacity,
 * validation) is enforced here; the UI only mirrors them. Concurrency safety
 * comes from locking the event row plus the UNIQUE (event_id, attendee_id)
 * constraint on event_registrations.
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
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { CLOCK, systemClock, type Clock } from './clock.js';
import { MESSAGES, REGISTRATION_ERROR_CODES } from './messages.js';
import { ATTENDEE_VISIBLE_STATUSES, registrationWindowState } from './registration-window.js';
import { validateRegistration } from './validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Capacity is a hard limit (no waitlist in Release 1). Attendees may only see
// (and register for) published events.
const ATTENDEE_VISIBLE = ATTENDEE_VISIBLE_STATUSES;

@Injectable()
export class RegistrationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async register(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const attendee = this.requireAttendee(identity);
    this.requireEventId(eventId);
    const input = validateRegistration(body);

    return this.database.transaction(async (client) => {
      // The row lock serialises concurrent registrations for one event, so the
      // duplicate and capacity checks below cannot race each other.
      const selected = await client.query(
        'SELECT * FROM events WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      const event = selected.rows[0];
      if (!event || !ATTENDEE_VISIBLE.includes(event.status))
        throw new NotFoundException(MESSAGES.eventNotFound);

      const state = registrationWindowState(
        {
          registrationEnabled: event.registration_enabled,
          status: event.status,
          opensAt: event.registration_opens_at ?? null,
          closesAt: event.registration_closes_at ?? null,
        },
        this.clock.now(),
      );
      if (state === 'not_open')
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.notOpen,
          message: MESSAGES.notOpen(event.registration_opens_at),
          registrationOpensAt: event.registration_opens_at.toISOString(),
        });
      if (state === 'closed')
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.closed,
          message: MESSAGES.closed,
        });

      const existing = await client.query(
        'SELECT status FROM event_registrations WHERE event_id = $1 AND attendee_id = $2',
        [eventId, attendee.uid],
      );
      if (existing.rows[0]?.status === 'Registered') throw this.duplicate();

      const taken = await client.query<{ count: number }>(
        `SELECT COUNT(*)::integer AS count FROM event_registrations
          WHERE event_id = $1 AND status = 'Registered'`,
        [eventId],
      );
      if (taken.rows[0].count >= event.registration_limit)
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.full,
          message: MESSAGES.full,
        });

      // A withdrawn row is reactivated (same id, D16); an active row makes the
      // WHERE fail, which surfaces as a duplicate even without the lock above.
      const saved = await client.query(
        `INSERT INTO event_registrations
           (event_id, attendee_id, status, full_name, email, contact_number, special_requirements)
         VALUES ($1, $2, 'Registered', $3, $4, $5, $6)
         ON CONFLICT (event_id, attendee_id) DO UPDATE
           SET status = 'Registered', full_name = EXCLUDED.full_name, email = EXCLUDED.email,
               contact_number = EXCLUDED.contact_number,
               special_requirements = EXCLUDED.special_requirements,
               created_at = now(), updated_at = now()
           WHERE event_registrations.status = 'Withdrawn'
         RETURNING *`,
        [eventId, attendee.uid, input.fullName, input.email, input.contactNumber ?? null, input.specialRequirements ?? null],
      );
      if (!saved.rows[0]) throw this.duplicate();
      return {
        registration: this.record(saved.rows[0], event.event_name),
        message: MESSAGES.success(event.event_name),
      };
    });
  }

  /** The signed-in attendee's active registration for an event, or null. */
  async findMine(identity: AuthenticatedUser | undefined, eventId: string) {
    const attendee = this.requireAttendee(identity);
    this.requireEventId(eventId);
    const result = await this.database.query(
      `SELECT r.*, e.event_name FROM event_registrations r
         JOIN events e ON e.id = r.event_id
        WHERE r.event_id = $1 AND r.attendee_id = $2 AND r.status = 'Registered'
          AND e.status = ANY($3::text[])`,
      [eventId, attendee.uid, ATTENDEE_VISIBLE],
    );
    const row = result.rows[0];
    return { registration: row ? this.record(row, row.event_name) : null };
  }

  private requireAttendee(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('ATTENDEE'))
      throw new ForbiddenException(MESSAGES.attendeeOnly);
    return identity;
  }

  private requireEventId(id: string): void {
    if (!UUID.test(id)) throw new NotFoundException(MESSAGES.eventNotFound);
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: REGISTRATION_ERROR_CODES.duplicate,
      message: MESSAGES.alreadyRegistered,
    });
  }

  private record(row: pg.QueryResultRow, eventName: string) {
    return {
      id: row.id,
      eventId: row.event_id,
      eventName,
      attendeeId: row.attendee_id,
      attendeeName: row.full_name ?? '',
      fullName: row.full_name ?? '',
      email: row.email ?? '',
      contactNumber: row.contact_number ?? undefined,
      specialRequirements: row.special_requirements ?? undefined,
      // Lower-cased to match the frontend RegistrationStatus type (D4).
      status: String(row.status).toLowerCase(),
      registeredAt: row.created_at.toISOString(),
    };
  }
}
