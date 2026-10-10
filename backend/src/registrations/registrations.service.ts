/*
 * SPM-61 attendee registration and SPM-120 withdrawal. Every rule (role, window,
 * duplicate, capacity, validation, ownership, event start) is enforced here; the
 * UI only mirrors them. Registration concurrency safety comes from locking the
 * event row plus the UNIQUE (event_id, attendee_id) constraint on
 * event_registrations; withdrawal uses a single compare-and-set UPDATE.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type pg from 'pg';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { CLOCK, systemClock, type Clock } from '../common/clock.js';
import { UUID_PATTERN as UUID } from '../common/uuid.js';
import { hasEventStarted } from './withdrawal/event-start.js';
import { MESSAGES, REGISTRATION_ERROR_CODES } from './helpers/messages.js';
import { ATTENDEE_VISIBLE_STATUSES, registrationWindowState } from './registration/registration-window.js';
import { canViewEventRegistrations } from './report/report-access.js';
import type { RegistrationReport } from './report/report-types.js';
import { validateRegistration } from './registration/dto/validation.js';

// Capacity is a hard limit (no waitlist in Release 1). Attendees may only see
// (and register for) published events.
const ATTENDEE_VISIBLE = ATTENDEE_VISIBLE_STATUSES;

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

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
               withdrawn_at = NULL, created_at = now(), updated_at = now()
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

  /**
   * The signed-in attendee's latest registration for an event, of any status, or
   * null. A withdrawn registration is returned so its status and withdrawal time
   * survive a reload (SPM-120 AC6). The table keeps one row per attendee and
   * event, so "latest" is unambiguous; the ordering makes that explicit.
   */
  async findMine(identity: AuthenticatedUser | undefined, eventId: string) {
    const attendee = this.requireAttendee(identity);
    this.requireEventId(eventId);
    const result = await this.database.query(
      `SELECT r.*, e.event_name FROM event_registrations r
         JOIN events e ON e.id = r.event_id
        WHERE r.event_id = $1 AND r.attendee_id = $2
          AND e.status = ANY($3::text[])
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1`,
      [eventId, attendee.uid, ATTENDEE_VISIBLE],
    );
    const row = result.rows[0];
    return { registration: row ? this.record(row, row.event_name) : null };
  }

  /**
   * SPM-120: the signed-in attendee withdraws their own registration. Order of
   * checks: authentication (middleware, 401) -> body -> ownership (404) -> state
   * (422) -> event start (422) -> mutate. The state change is one compare-and-set
   * UPDATE, so concurrent or repeated requests produce one success and the rest
   * "already withdrawn", and the spot is released once (capacity is computed from
   * Registered rows). withdrawn_at comes from the injected clock, never SQL now().
   */
  async withdraw(identity: AuthenticatedUser | undefined, registrationId: string, body: unknown) {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    this.requireEmptyBody(body);
    // A malformed id cannot belong to anyone: same 404 as a missing registration.
    if (!UUID.test(registrationId)) throw new NotFoundException(MESSAGES.registrationNotFound);

    return this.database.transaction(async (client) => {
      // Ownership-scoped lookup: another user's registration looks like a missing one.
      const found = await client.query(
        `SELECT r.id, r.status, e.event_name, e.start_date_time
           FROM event_registrations r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1 AND r.attendee_id = $2`,
        [registrationId, identity.uid],
      );
      const current = found.rows[0];
      if (!current) throw new NotFoundException(MESSAGES.registrationNotFound);
      if (current.status !== 'Registered') throw this.alreadyWithdrawn();

      const now = this.clock.now();
      if (hasEventStarted({ startDateTime: current.start_date_time }, now))
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.eventAlreadyOccurred,
          message: MESSAGES.eventAlreadyOccurred,
        });

      // Compare-and-set: only the request that still sees 'Registered' wins.
      const updated = await client.query(
        `UPDATE event_registrations
            SET status = 'Withdrawn', withdrawn_at = $3, updated_at = $3
          WHERE id = $1 AND attendee_id = $2 AND status = 'Registered'
        RETURNING *`,
        [registrationId, identity.uid, now],
      );
      if (!updated.rows[0]) throw this.alreadyWithdrawn();
      return {
        ...this.record(updated.rows[0], current.event_name),
        message: MESSAGES.withdrawalSuccess(current.event_name),
      };
    });
  }

  /**
   * SPM-63: the registration report for an event the caller manages. This one method guards the report and both
   * exports (the controller calls it for every door). Order of checks: authentication (middleware, 401 here as
   * a backstop) -> event exists (404) -> assigned coordinator or owning organiser (403, logged) -> data. Identity
   * comes from the verified session only. Count, rows, CSV and PDF all derive from the one Registered-status query,
   * ordered by registration date then id; nothing is cached, so a registration or withdrawal shows on the next call.
   */
  async getReport(identity: AuthenticatedUser | undefined, eventId: string): Promise<RegistrationReport> {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    this.requireEventId(eventId);

    const found = await this.database.query(
      `SELECT id, event_name, start_date_time, end_date_time, registration_limit, organiser_id, coordinator_id
         FROM events WHERE id = $1`,
      [eventId],
    );
    const event = found.rows[0];
    if (!event) throw new NotFoundException(MESSAGES.eventNotFound);

    if (!canViewEventRegistrations(identity, { coordinatorId: event.coordinator_id, organiserId: event.organiser_id })) {
      // User and event ids only: attendee names, emails and contact numbers never reach a log line.
      this.logger.warn({
        message: `${identity.uid} does not manage ${eventId}`,
        userId: identity.uid,
        eventId,
        reason: 'not_assigned_or_owner',
      });
      throw new ForbiddenException(MESSAGES.reportForbidden);
    }

    const registered = await this.database.query(
      `SELECT id, full_name, email, contact_number, created_at, special_requirements FROM event_registrations
        WHERE event_id = $1 AND status = 'Registered'
        ORDER BY created_at ASC, id ASC`,
      [eventId],
    );
    const registrations = registered.rows.map((row) => ({
      registrationId: row.id as string,
      fullName: (row.full_name ?? '') as string,
      email: (row.email ?? '') as string,
      contactNumber: (row.contact_number ?? '') as string,
      registeredAt: (row.created_at as Date).toISOString(),
      status: 'Confirmed' as const,
      ...(row.special_requirements && { specialRequirements: row.special_requirements as string }),
    }));
    return {
      event: {
        id: event.id,
        name: event.event_name,
        startDateTime: event.start_date_time.toISOString(),
        endDateTime: event.end_date_time.toISOString(),
        capacity: event.registration_limit,
      },
      totalConfirmed: registrations.length,
      availableSpots: Math.max(event.registration_limit - registrations.length, 0),
      generatedAt: this.clock.now().toISOString(),
      registrations,
    };
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

  /** The withdraw route takes no input: an empty or absent body only (D15 / D2). */
  private requireEmptyBody(body: unknown): void {
    if (body === undefined || body === null) return;
    const isObject = typeof body === 'object' && !Array.isArray(body);
    const keys = isObject ? Object.keys(body as object) : [];
    if (isObject && keys.length === 0) return;
    const errors: Record<string, string> = {};
    if (isObject) for (const key of keys) errors[key] = 'This field is not accepted.';
    else errors.form = 'This request does not accept a body.';
    throw new BadRequestException({
      statusCode: 400,
      code: REGISTRATION_ERROR_CODES.validation,
      message: MESSAGES.validation,
      errors,
    });
  }

  private alreadyWithdrawn(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      code: REGISTRATION_ERROR_CODES.alreadyWithdrawn,
      message: MESSAGES.alreadyWithdrawn,
    });
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
      // SPM-120: set once, by the withdrawal; absent while the registration is active.
      withdrawnAt: row.withdrawn_at ? row.withdrawn_at.toISOString() : undefined,
    };
  }
}
