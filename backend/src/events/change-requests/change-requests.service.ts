/*
 * SPM-64 Request a Change to a Submitted Event (organiser side).
 *
 * - AC1/AC2/AC6: the body is validated by validateChangeRequest (permitted
 *   fields only; event name and organiser rejected by name).
 * - Only the owning organiser can request a change, and only while the event
 *   is Submitted, Approved, Planning or Confirmed and has not started (agreed
 *   scope). Anyone else gets 404, exactly like a missing event, so existence
 *   never leaks (same rule as EventsService.get).
 * - The request stores the proposed values only. The event, its bookings and
 *   its safety check are untouched until the assigned coordinator approves it
 *   (SPM-65), so a request can be denied without anything to undo.
 * - AC3: the request belongs to the event, so it is always reviewed by
 *   whoever is the event's assigned coordinator now (it follows a
 *   reassignment). The coordinator assigned at submission gets an in-app
 *   notification; an unassigned event's request waits in its list until the
 *   Lead assigns a coordinator.
 * - AC4/AC5: the created request is returned for the confirmation message,
 *   and the organiser can list their requests with their status.
 * - One request per event can be Pending at a time; the event row lock and a
 *   partial unique index make concurrent submissions settle to one.
 * - The organiser can withdraw their own pending request (SPM-65 AC11: this closes it automatically,
 *   status Withdrawn, so the coordinator can no longer decide it).
 *
 * Identity always comes from the verified session, never from the body.
 */
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
import type pg from 'pg';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { DatabaseService } from '../../database/database.service.js';
import { changeRequestNoticeMessage, insertChangeRequestNotice } from './change-request-notice.js';
import { recordOutcome } from './change-request-audit.js';
import {
  PERMITTED_CHANGE_FIELDS,
  validateChangeRequest,
  type ChangeField,
} from './dto/change-request-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Event statuses that accept a change request (agreed: Submitted to Confirmed). */
export const CHANGE_REQUEST_OPEN_STATUSES = ['Submitted', 'Approved', 'Planning', 'Confirmed'] as const;

/**
 * SPM-64 note / SPM-65 AC8: approving any change resets the event's safety
 * check (database/postgresql/init/014), so a request needs a new safety check
 * exactly when the event has one. Stored at submission; a pending request is
 * re-read live because a safety check can be requested while it waits.
 */
const HAS_SAFETY_CHECK =
  'EXISTS (SELECT 1 FROM event_safety_checks s WHERE s.event_id = r.event_id) AS has_safety_check';

export const CHANGE_REQUEST_STATUSES = ['Pending', 'Approved', 'Denied', 'Withdrawn', 'Closed'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const MESSAGES = {
  notFound: 'Event not found.',
  requestNotFound: 'Change request not found.',
  closed: 'Change requests are not accepted for this event.',
  started: 'This event has already started, so it can no longer be changed.',
  pending: 'A change request for this event is already awaiting review.',
  noChanges: 'No changes to request. Change at least one detail.',
  decided: 'This change request has already been decided.',
  endBeforeStart: 'End must be after start.',
} as const;

/** events table column for each permitted field. */
const COLUMNS: Record<ChangeField, string> = {
  description: 'description',
  startDateTime: 'start_date_time',
  endDateTime: 'end_date_time',
  expectedAttendance: 'expected_attendance',
  layout: 'preferred_room_layout',
  facilities: 'required_facilities',
  accessibility: 'accessibility_needs',
  equipmentNeeds: 'equipment_needs',
};

/** Plain-English field names used in the coordinator's notification. */

export interface RequestedChange {
  field: ChangeField;
  originalValue: unknown;
  proposedValue: unknown;
}

export interface ChangeRequestRecord {
  id: string;
  eventId: string;
  eventName: string;
  status: ChangeRequestStatus;
  changes: RequestedChange[];
  reason?: string;
  requiresSafetyCheck: boolean;
  requestedBy: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  /** The event's organiser (shown in the coordinator's pending list, SPM-65 AC1). */
  organiserName?: string;
  /** SPM-65 AC9: arrangements to re-check after approval, each ticked off by the coordinator. */
  recheck: {
    id: string;
    kind: 'venue' | 'equipment';
    refId: string;
    name: string;
    details: string[];
    checkedAt?: string;
    checkedBy?: string;
  }[];
  /** SPM-65 AC8: approving reset the event's safety check. */
  safetyCheckReset: boolean;
}

type Queryable = Pick<pg.PoolClient, 'query'>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/** The stored value of a field, in the API's shape (dates as ISO strings). */
function storedValue(event: pg.QueryResultRow, field: ChangeField): unknown {
  const value = event[COLUMNS[field]];
  if (field === 'startDateTime' || field === 'endDateTime') return iso(value);
  return value;
}

/** Date fields compare as instants; lists compare as sets; others strictly. */
function sameValue(field: ChangeField, stored: unknown, proposed: unknown): boolean {
  if (field === 'startDateTime' || field === 'endDateTime')
    return Date.parse(String(stored)) === Date.parse(String(proposed));
  if (Array.isArray(stored) && Array.isArray(proposed))
    return stored.length === proposed.length && proposed.every((v) => stored.includes(v));
  return stored === proposed;
}

function displayName(user: AuthenticatedUser, fallback: string): string {
  return user.name ?? user.email ?? fallback;
}

@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---------------------------------------------------------------- AC1-AC4, AC6

  async create(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireOrganiser(identity);
    this.requireEventId(eventId);
    const input = validateChangeRequest(body);

    try {
      return await this.database.transaction(async (client) => {
        const event = await this.lockEvent(client, eventId);
        if (!event || event.organiser_id !== user.uid) throw new NotFoundException(MESSAGES.notFound);
        if (!(CHANGE_REQUEST_OPEN_STATUSES as readonly string[]).includes(event.status))
          throw new ConflictException({ message: MESSAGES.closed, code: 'change_request_closed' });
        if (this.clock.now().getTime() >= new Date(event.start_date_time).getTime())
          throw new ConflictException({ message: MESSAGES.started, code: 'event_started' });

        // End must stay after start once merged with the stored values.
        const start = Date.parse(input.changes.startDateTime ?? iso(event.start_date_time));
        const end = Date.parse(input.changes.endDateTime ?? iso(event.end_date_time));
        if (end <= start)
          throw new BadRequestException({
            message: 'Please correct the highlighted fields.',
            errors: {
              [input.changes.endDateTime !== undefined ? 'endDateTime' : 'startDateTime']:
                MESSAGES.endBeforeStart,
            },
          });

        // Only fields whose value actually differs are part of the request.
        const changes: RequestedChange[] = PERMITTED_CHANGE_FIELDS.filter(
          (field) =>
            input.changes[field] !== undefined &&
            !sameValue(field, storedValue(event, field), input.changes[field]),
        ).map((field) => ({
          field,
          originalValue: storedValue(event, field),
          proposedValue: input.changes[field],
        }));
        if (!changes.length)
          throw new BadRequestException({ message: MESSAGES.noChanges, errors: {} });

        const pending = await client.query(
          `SELECT 1 FROM event_change_requests WHERE event_id = $1 AND status = 'Pending'`,
          [eventId],
        );
        if (pending.rows.length)
          throw new ConflictException({ message: MESSAGES.pending, code: 'change_request_pending' });

        const safety = await client.query('SELECT 1 FROM event_safety_checks WHERE event_id = $1', [eventId]);

        const requestedBy = displayName(user, 'Organiser');
        const inserted = await client.query(
          `INSERT INTO event_change_requests
             (id, event_id, requested_by_id, requested_by, changes, reason, requires_safety_check, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
           RETURNING *`,
          [
            randomUUID(),
            eventId,
            user.uid,
            requestedBy,
            JSON.stringify(changes),
            input.reason ?? null,
            safety.rows.length > 0,
            this.clock.now(),
          ],
        );

        // AC3: tell the assigned coordinator, in the same transaction.
        // An event without a coordinator yet: the Lead's assignment sends it (notifyPendingChangeRequest).
        if (event.coordinator_id)
          await insertChangeRequestNotice(
            client,
            event.coordinator_id,
            eventId,
            changeRequestNoticeMessage(requestedBy, event.event_name, changes),
          );

        return this.toRecord(inserted.rows[0], event.event_name);
      });
    } catch (error) {
      // Two submissions that both passed the pending check: the partial unique
      // index lets only one commit.
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException({ message: MESSAGES.pending, code: 'change_request_pending' });
      throw error;
    }
  }

  // ---------------------------------------------------------------- AC5

  /** One event's requests, newest first: the owner, or its assigned coordinator (read-only). */
  async listForEvent(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireOrganiserOrCoordinator(identity);
    this.requireEventId(eventId);
    const found = await this.database.query('SELECT * FROM events WHERE id = $1', [eventId]);
    const event = found.rows[0];
    if (!event || !this.canRead(user, event)) throw new NotFoundException(MESSAGES.notFound);
    const result = await this.database.query(
      `SELECT r.*, ${HAS_SAFETY_CHECK}
         FROM event_change_requests r
        WHERE r.event_id = $1
        ORDER BY r.created_at DESC, r.id`,
      [eventId],
    );
    return result.rows.map((row) => this.toRecord(row, event.event_name, event.organiser_name));
  }

  /**
   * The caller's requests across events, newest first, for the dashboard:
   * an organiser sees requests on events they own, a coordinator those on
   * events assigned to them. `status` optionally narrows the list.
   */
  async listMine(identity: AuthenticatedUser | undefined, status?: unknown) {
    const user = this.requireOrganiserOrCoordinator(identity);
    if (status !== undefined && !(CHANGE_REQUEST_STATUSES as readonly unknown[]).includes(status))
      throw new BadRequestException('Choose a valid change request status.');
    const result = await this.database.query(
      `SELECT r.*, e.event_name, e.organiser_name, ${HAS_SAFETY_CHECK}
         FROM event_change_requests r
         JOIN events e ON e.id = r.event_id
        WHERE ((e.organiser_id = $1 AND $2) OR (e.coordinator_id = $1 AND $3))
          AND ($4::text IS NULL OR r.status = $4)
        ORDER BY r.created_at DESC, r.id`,
      [
        user.uid,
        user.roles.includes('ORGANISER'),
        user.roles.includes('COORDINATOR'),
        status ?? null,
      ],
    );
    return result.rows.map((row) => this.toRecord(row, row.event_name));
  }

  // ---------------------------------------------------------------- withdraw

  async withdraw(identity: AuthenticatedUser | undefined, eventId: string, requestId: string) {
    const user = this.requireOrganiser(identity);
    this.requireEventId(eventId);
    if (!UUID.test(requestId)) throw new NotFoundException(MESSAGES.requestNotFound);
    return this.database.transaction(async (client) => {
      const event = await this.lockEvent(client, eventId);
      if (!event || event.organiser_id !== user.uid) throw new NotFoundException(MESSAGES.notFound);
      const found = await client.query(
        'SELECT * FROM event_change_requests WHERE id = $1 AND event_id = $2 FOR UPDATE',
        [requestId, eventId],
      );
      const request = found.rows[0];
      if (!request) throw new NotFoundException(MESSAGES.requestNotFound);
      if (request.status !== 'Pending') throw new ConflictException(MESSAGES.decided);
      const now = this.clock.now();
      const updated = await client.query(
        `UPDATE event_change_requests
            SET status = 'Withdrawn', decided_by = $2, decided_by_id = $3, decided_at = $4
          WHERE id = $1
          RETURNING *`,
        [requestId, displayName(user, 'Organiser'), user.uid, now],
      );
      // SPM-65 AC10: every outcome is in the audit log, including the organiser's withdrawal.
      await recordOutcome(client, request, 'Withdrawn', {
        decidedBy: displayName(user, 'Organiser'),
        decidedById: user.uid,
        decidedAt: now,
      });
      return this.toRecord(updated.rows[0], event.event_name);
    });
  }

  // ---------------------------------------------------------------- helpers

  /** The API shape of a request row (also used by SPM-65 ChangeRequestReviewService). */
  toRecord(row: pg.QueryResultRow, eventName: string, organiserName?: string): ChangeRequestRecord {
    const organiser = organiserName ?? row.organiser_name;
    return {
      id: row.id,
      eventId: row.event_id,
      eventName,
      status: row.status,
      changes: row.changes,
      ...(row.reason ? { reason: row.reason } : {}),
      // A pending request reflects the event's safety check now; a decided one keeps what was stored.
      requiresSafetyCheck:
        row.status === 'Pending' && typeof row.has_safety_check === 'boolean'
          ? row.has_safety_check
          : row.requires_safety_check,
      requestedBy: row.requested_by,
      createdAt: iso(row.created_at),
      ...(row.decided_at ? { decidedAt: iso(row.decided_at) } : {}),
      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
      ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
      ...(organiser ? { organiserName: organiser } : {}),
      recheck: row.recheck ?? [],
      safetyCheckReset: row.safety_check_reset ?? false,
    };
  }

  private async lockEvent(client: Queryable, eventId: string) {
    const result = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    return result.rows[0] as pg.QueryResultRow | undefined;
  }

  private canRead(user: AuthenticatedUser, event: pg.QueryResultRow): boolean {
    return (
      (user.roles.includes('ORGANISER') && event.organiser_id === user.uid) ||
      (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid)
    );
  }

  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }

  private requireOrganiser(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    if (!user.roles.includes('ORGANISER'))
      throw new ForbiddenException('Only the event organiser can request a change.');
    return user;
  }

  private requireOrganiserOrCoordinator(identity: AuthenticatedUser | undefined) {
    const user = this.requireUser(identity);
    if (!user.roles.includes('ORGANISER') && !user.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Organiser or coordinator access required.');
    return user;
  }

  private requireEventId(eventId: string) {
    if (!UUID.test(eventId)) throw new NotFoundException(MESSAGES.notFound);
  }
}
