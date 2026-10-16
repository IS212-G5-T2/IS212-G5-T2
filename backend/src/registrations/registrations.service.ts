/*
 * SPM-61 attendee registration, SPM-120 withdrawal and SPM-138 waitlist. Every rule (role, window, duplicate,
 * capacity, validation, ownership, event start, waitlist order) is enforced here; the UI only mirrors them.
 * Concurrency safety comes from locking the event row (D7) plus the UNIQUE (event_id, attendee_id) constraint on
 * event_registrations; withdrawal and waitlist changes use compare-and-set UPDATEs.
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
import type { RegistrationReport, ReportRow } from './report/report-types.js';
import {
  ALL_REPORT_DB_STATUSES,
  DB_TO_REPORT_STATUS,
  REPORT_DB_STATUS,
  parseReportStatusFilter,
} from './report/report-status.js';
import { validateRegistration } from './registration/dto/validation.js';
import { settleIfDue, settleLocked } from './waitlist/settle.js';
import { fillFreeSpots } from './waitlist/promotion.js';
import { WAITLIST_POSITION_SQL } from './waitlist/position.js';

// Attendees may only see (and register for) published events.
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
      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);
      if (state === 'closed') throw this.closed();

      const existing = await client.query(
        'SELECT status FROM event_registrations WHERE event_id = $1 AND attendee_id = $2',
        [eventId, attendee.uid],
      );
      if (existing.rows[0]?.status === 'Registered') throw this.duplicate();
      // SPM-138: a waiting entry is never turned into a direct registration; the attendee is told they are already waiting.
      if (existing.rows[0]?.status === 'Waitlisted') throw this.waitlistDuplicate();

      // Only Registered rows hold a place (SPM-138 counts Confirmed attendees only).
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

      // A withdrawn, removed or rejoining row is reactivated (same id, D16); an active row makes the
      // WHERE fail, which surfaces as a duplicate even without the lock above.
      const saved = await client.query(
        `INSERT INTO event_registrations
           (event_id, attendee_id, status, full_name, email, contact_number, special_requirements)
         VALUES ($1, $2, 'Registered', $3, $4, $5, $6)
         ON CONFLICT (event_id, attendee_id) DO UPDATE
           SET status = 'Registered', full_name = EXCLUDED.full_name, email = EXCLUDED.email,
               contact_number = EXCLUDED.contact_number,
               special_requirements = EXCLUDED.special_requirements,
               withdrawn_at = NULL, created_at = now(), updated_at = now(),
               joined_at = NULL, waitlist_seq = NULL, removed_at = NULL, registered_at = now()
           WHERE event_registrations.status IN ('Withdrawn', 'Removed')
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
   * SPM-138 AC1: the signed-in attendee joins the waitlist of a full, open event. Order of checks (D15): authentication
   * (401) -> role (403) -> strict body (400) -> event (404) -> window (422, MSG-02 or MSG-01) -> duplicates (409 MSG-05 when
   * Confirmed, MSG-WL-04 when waiting) -> fullness (422 WAITLIST_NOT_AVAILABLE unless full) -> insert or rejoin.
   * The event row lock (D7) serialises joins and withdrawals, so the position is read against a settled, current list.
   * Joined_at and the sequence come from the injected clock and the sequence, never from the request.
   */
  async joinWaitlist(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const attendee = this.requireAttendee(identity);
    this.requireEmptyBody(body);
    this.requireEventId(eventId);

    return this.database.transaction(async (client) => {
      const selected = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      const event = selected.rows[0];
      if (!event || !ATTENDEE_VISIBLE.includes(event.status))
        throw new NotFoundException(MESSAGES.eventNotFound);

      const now = this.clock.now();
      await settleLocked(client, eventId, now);
      const state = registrationWindowState(
        {
          registrationEnabled: event.registration_enabled,
          status: event.status,
          opensAt: event.registration_opens_at ?? null,
          closesAt: event.registration_closes_at ?? null,
        },
        now,
      );
      if (state === 'not_open') throw this.notOpen(event.registration_opens_at);
      if (state === 'closed') throw this.closed();

      const existing = await client.query(
        'SELECT status FROM event_registrations WHERE event_id = $1 AND attendee_id = $2',
        [eventId, attendee.uid],
      );
      if (existing.rows[0]?.status === 'Registered') throw this.duplicate();
      if (existing.rows[0]?.status === 'Waitlisted') throw this.waitlistDuplicate();

      const taken = await client.query<{ count: number }>(
        `SELECT COUNT(*)::integer AS count FROM event_registrations
          WHERE event_id = $1 AND status = 'Registered'`,
        [eventId],
      );
      if (taken.rows[0].count < event.registration_limit) throw this.waitlistNotAvailable();

      // A new entry, or a rejoin after Withdrawn, Removed or Cancelled: the same row, sent to the back of the list (D2).
      const saved = await client.query(
        `INSERT INTO event_registrations
           (event_id, attendee_id, status, joined_at, waitlist_seq, full_name, email)
         SELECT $1::uuid, u.id, 'Waitlisted', $3::timestamptz, nextval('event_registrations_waitlist_seq'), u.display_name, u.email
           FROM users u WHERE u.id = $2::uuid
         ON CONFLICT (event_id, attendee_id) DO UPDATE
           SET status = 'Waitlisted', joined_at = EXCLUDED.joined_at, waitlist_seq = EXCLUDED.waitlist_seq,
               withdrawn_at = NULL, removed_at = NULL, registered_at = NULL, updated_at = EXCLUDED.joined_at
           WHERE event_registrations.status IN ('Withdrawn', 'Removed', 'Cancelled')
         RETURNING id`,
        [eventId, attendee.uid, now],
      );
      // Unreachable under the lock; kept as a guard so a lost race can never report a success.
      if (!saved.rows[0]) throw this.waitlistDuplicate();

      const position = await client.query<{ position: number }>(
        `SELECT ${WAITLIST_POSITION_SQL} AS position FROM event_registrations r WHERE r.id = $1`,
        [saved.rows[0].id],
      );
      const value = position.rows[0].position;
      return {
        registrationId: saved.rows[0].id,
        status: 'waitlisted',
        position: value,
        message: MESSAGES.waitlistJoined(event.event_name, value),
      };
    });
  }

  /**
   * The signed-in attendee's latest registration for an event, of any status, or null. A withdrawn registration is
   * returned so its status and withdrawal time survive a reload (SPM-120 AC6). The table keeps one row per attendee and
   * event, so "latest" is unambiguous. A waiting entry carries its position, derived on read (SPM-138 D6). The waiting
   * list is settled first (D9), so a closed list reads as removed.
   */
  async findMine(identity: AuthenticatedUser | undefined, eventId: string) {
    const attendee = this.requireAttendee(identity);
    this.requireEventId(eventId);
    // The row is read through the attendee visibility filter first; only a visible waiting entry can be settled.
    const read = () =>
      this.database.query(
        `SELECT r.*, e.event_name, ${WAITLIST_POSITION_SQL} AS waitlist_position
           FROM event_registrations r
           JOIN events e ON e.id = r.event_id
          WHERE r.event_id = $1 AND r.attendee_id = $2
            AND e.status = ANY($3::text[])
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT 1`,
        [eventId, attendee.uid, ATTENDEE_VISIBLE],
      );
    let result = await read();
    if (result.rows[0]?.status === 'Waitlisted' && (await settleIfDue(this.database, eventId, this.clock.now())) > 0)
      result = await read();
    const row = result.rows[0];
    return { registration: row ? this.record(row, row.event_name, row.waitlist_position) : null };
  }

  /**
   * SPM-120 and SPM-138: the signed-in attendee withdraws their own registration or leaves the waitlist. Order of
   * checks: authentication (middleware, 401) -> body -> ownership (404) -> event row lock (D7) -> state (422, or 409 for a
   * Removed or Cancelled entry) -> event start (422) -> mutate. A Registered withdrawal releases its place and promotes the
   * first waiting entry in the same transaction (D8). A waiting entry withdrawal changes no capacity and promotes nobody.
   * The state change is a compare-and-set UPDATE, so concurrent or repeated requests produce one success and the rest
   * "already withdrawn". withdrawn_at comes from the injected clock, never SQL now().
   */
  async withdraw(identity: AuthenticatedUser | undefined, registrationId: string, body: unknown) {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    this.requireEmptyBody(body);
    // A malformed id cannot belong to anyone: same 404 as a missing registration.
    if (!UUID.test(registrationId)) throw new NotFoundException(MESSAGES.registrationNotFound);

    // The transaction returns either its result or the refusal. A refusal is thrown after the commit, so the
    // settle that precedes it (a closed waitlist) is kept; a thrown refusal would roll that settle back.
    const outcome = await this.database.transaction(async (client) => {
      // Ownership-scoped lookup: another user's registration looks like a missing one.
      const found = await client.query(
        `SELECT r.id, e.event_name, e.start_date_time, r.event_id
           FROM event_registrations r JOIN events e ON e.id = r.event_id
          WHERE r.id = $1 AND r.attendee_id = $2`,
        [registrationId, identity.uid],
      );
      const current = found.rows[0];
      if (!current) throw new NotFoundException(MESSAGES.registrationNotFound);
      const now = this.clock.now();
      // Lock order (D7): the event row before any write to the registration.
      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [current.event_id]);
      // The status is read again under the lock, and every branch below uses that value, never the pre-lock read.
      // If the locked read is a waiting entry, the list is settled (a list the close has shut removes it) and the status is
      // read again before the decision.
      const readStatus = async () =>
        (await client.query<{ status: string }>('SELECT status FROM event_registrations WHERE id = $1', [registrationId])).rows[0]?.status;
      let status = await readStatus();
      if (status === 'Waitlisted') {
        await settleLocked(client, current.event_id, now);
        status = await readStatus();
      }
      if (status === 'Removed' || status === 'Cancelled') return { refused: this.notWithdrawable() };
      if (status !== 'Registered' && status !== 'Waitlisted') return { refused: this.alreadyWithdrawn() };

      if (hasEventStarted({ startDateTime: current.start_date_time }, now))
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: REGISTRATION_ERROR_CODES.eventAlreadyOccurred,
          message: MESSAGES.eventAlreadyOccurred,
        });

      if (status === 'Waitlisted') {
        // SPM-138: leaving the list releases no place, promotes nobody and sends no notification.
        const left = await client.query(
          `UPDATE event_registrations
              SET status = 'Withdrawn', withdrawn_at = $3, updated_at = $3
            WHERE id = $1 AND attendee_id = $2 AND status = 'Waitlisted'
          RETURNING *`,
          [registrationId, identity.uid, now],
        );
        if (!left.rows[0]) throw this.alreadyWithdrawn();
        return {
          ok: {
            ...this.record(left.rows[0], current.event_name),
            message: MESSAGES.withdrawalSuccess(current.event_name),
          },
        };
      }

      // Compare-and-set: only the request that still sees 'Registered' wins.
      const updated = await client.query(
        `UPDATE event_registrations
            SET status = 'Withdrawn', withdrawn_at = $3, updated_at = $3
          WHERE id = $1 AND attendee_id = $2 AND status = 'Registered'
        RETURNING *`,
        [registrationId, identity.uid, now],
      );
      if (!updated.rows[0]) throw this.alreadyWithdrawn();
      // SPM-138 D8: the released place goes to the first waiting entry, in the same transaction.
      await fillFreeSpots(client, current.event_id, now);
      return {
        ok: {
          ...this.record(updated.rows[0], current.event_name),
          message: MESSAGES.withdrawalSuccess(current.event_name),
        },
      };
    });
    if ('refused' in outcome) throw outcome.refused;
    return outcome.ok;
  }

  /**
   * SPM-63, changed by the SPM-138 owner decision: the registration report for an event the caller manages. This one
   * method guards the report and both exports (the controller calls it for every door). Order of checks: authentication
   * (middleware, 401 here as a backstop) -> event exists (404) -> assigned coordinator or owning organiser (403, logged)
   * -> status filter parsed (400) -> data. Identity comes from the verified session only. The totals (Confirmed and
   * waitlist counts) are read once, unfiltered. The rows list every status, or only the chosen ones, in report order
   * (Confirmed by registration date, Waitlisted by position, the rest by the instant their status last changed). The
   * CSV and PDF reuse the same rows. Nothing is cached, so a change shows on the next call.
   */
  async getReport(identity: AuthenticatedUser | undefined, eventId: string, status?: unknown): Promise<RegistrationReport> {
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

    // SPM-138 owner decision: every status is listed; the optional filter narrows the rows. Parsed after access (403 first).
    const filter = parseReportStatusFilter(status);
    const dbStatuses = filter ? filter.map((value) => REPORT_DB_STATUS[value]) : [...ALL_REPORT_DB_STATUSES];
    const counts = await this.database.query<{ confirmed: number; waitlisted: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'Registered')::integer AS confirmed,
              COUNT(*) FILTER (WHERE status = 'Waitlisted')::integer AS waitlisted
         FROM event_registrations WHERE event_id = $1`,
      [eventId],
    );
    // Order: Confirmed by registration time; Waitlisted by position (joined_at, waitlist_seq); the rest by the instant their
    // status last changed (withdrawn, removed or cancelled), then the registration instant and id.
    const listed = await this.database.query(
      `SELECT r.id, r.full_name, r.email, r.contact_number, r.created_at, r.special_requirements, r.status,
              r.joined_at, r.waitlist_seq, r.withdrawn_at, r.removed_at, r.updated_at,
              ${WAITLIST_POSITION_SQL} AS waitlist_position
         FROM event_registrations r
        WHERE r.event_id = $1 AND r.status = ANY($2::text[])
        ORDER BY CASE r.status WHEN 'Registered' THEN 0 WHEN 'Waitlisted' THEN 1 ELSE 2 END,
                 CASE WHEN r.status = 'Registered' THEN r.created_at END ASC,
                 CASE WHEN r.status = 'Waitlisted' THEN r.joined_at END ASC,
                 CASE WHEN r.status = 'Waitlisted' THEN r.waitlist_seq END ASC,
                 CASE WHEN r.status NOT IN ('Registered', 'Waitlisted')
                      THEN COALESCE(r.withdrawn_at, r.removed_at, r.updated_at) END ASC,
                 r.created_at ASC, r.id ASC`,
      [eventId, dbStatuses],
    );
    const registrations: ReportRow[] = listed.rows.map((row) => {
      const reportStatus = DB_TO_REPORT_STATUS[row.status as string];
      return {
        registrationId: row.id as string,
        fullName: (row.full_name ?? '') as string,
        email: (row.email ?? '') as string,
        contactNumber: (row.contact_number ?? '') as string,
        registeredAt: (row.created_at as Date).toISOString(),
        status: reportStatus,
        ...(row.special_requirements && { specialRequirements: row.special_requirements as string }),
        ...(reportStatus === 'waitlisted' && {
          waitlistPosition: Number(row.waitlist_position),
          joinedAt: (row.joined_at as Date).toISOString(),
        }),
      };
    });
    const confirmed = counts.rows[0].confirmed;
    return {
      event: {
        id: event.id,
        name: event.event_name,
        startDateTime: event.start_date_time.toISOString(),
        endDateTime: event.end_date_time.toISOString(),
        capacity: event.registration_limit,
      },
      totalConfirmed: confirmed,
      waitlistCount: counts.rows[0].waitlisted,
      availableSpots: Math.max(event.registration_limit - confirmed, 0),
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

  /** The withdraw and join routes take no input: an empty or absent body only (D15 / D2). */
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

  private notOpen(opensAt: Date): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      code: REGISTRATION_ERROR_CODES.notOpen,
      message: MESSAGES.notOpen(opensAt),
      registrationOpensAt: opensAt.toISOString(),
    });
  }

  private closed(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      code: REGISTRATION_ERROR_CODES.closed,
      message: MESSAGES.closed,
    });
  }

  private waitlistNotAvailable(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      code: REGISTRATION_ERROR_CODES.waitlistNotAvailable,
      message: MESSAGES.waitlistNotAvailable,
    });
  }

  private alreadyWithdrawn(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      code: REGISTRATION_ERROR_CODES.alreadyWithdrawn,
      message: MESSAGES.alreadyWithdrawn,
    });
  }

  private notWithdrawable(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: REGISTRATION_ERROR_CODES.notWithdrawable,
      message: MESSAGES.notWithdrawable,
    });
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: REGISTRATION_ERROR_CODES.duplicate,
      message: MESSAGES.alreadyRegistered,
    });
  }

  private waitlistDuplicate(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: REGISTRATION_ERROR_CODES.alreadyOnWaitlist,
      message: MESSAGES.waitlistDuplicate,
    });
  }

  private record(row: pg.QueryResultRow, eventName: string, waitlistPosition?: number | null) {
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
      // Lower-cased to match the frontend RegistrationStatus type (D4, D3 for waitlisted and removed).
      status: String(row.status).toLowerCase(),
      registeredAt: row.created_at.toISOString(),
      // SPM-120: set once, by the withdrawal; absent while the registration is active.
      withdrawnAt: row.withdrawn_at ? row.withdrawn_at.toISOString() : undefined,
      // SPM-138 D6: the owner's own waiting position. Null for every other entry; the key is always present.
      waitlistPosition: waitlistPosition == null ? null : Number(waitlistPosition),
      // SPM-138 UI: when the attendee joined the waitlist, for a waitlisted entry only (the card's "Joined waitlist on").
      joinedAt: String(row.status) === 'Waitlisted' && row.joined_at ? row.joined_at.toISOString() : undefined,
    };
  }
}
