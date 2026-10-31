/*
 * SPM-155 Request Cancellation of My Event (Organiser).
 *
 * - AC1: the submitting Organiser files a request (optional reason). A request never changes the event. It is
 *   refused unless the event is in the SPM-136 cancellable set (D5: the set is imported, not copied), and only one
 *   request per event can be pending (the event row lock settles concurrent submissions; the unique index on
 *   `pending_key` is the backstop).
 * - AC2: the Organiser (and the assigned Coordinator) read the requests; a pending request whose event is
 *   Completed or Cancelled is shown as Closed, derived on every read and never written (D4).
 * - AC3 to AC5: the Coordinator assigned at decision time accepts or declines. Accept runs the request update and
 *   the SPM-136 core (`CancelEventService.cancelInTransaction`) in ONE transaction, so a failure anywhere rolls both
 *   back (D2). Decline writes the request row only: no arrangement, hold, history or notification is touched.
 *
 * Check order for a decision (D7, amended by the user on 31 Oct 2026): 401, authorisation (403: an unknown or malformed
 * request id answers the same 403 as another user's request, so a caller cannot probe which ids exist), body (400), already decided
 * (409 CANCELLATION_REQUEST_DECIDED), event eligibility (409 EVENT_NOT_CANCELLABLE), then act. The event row is
 * locked before the request row, and the request update is a compare-and-set on `status = 'pending'`.
 * Identity, time and status always come from the session, the injected clock and the database, never the body.
 */
import {
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
import { UUID_PATTERN } from '../../common/uuid.js';
import { DatabaseService } from '../../database/database.service.js';
import { CancelEventService } from '../cancel/cancel-event.service.js';
import { isCancellable } from '../cancel/cancel-rules.js';
import { validateCreateBody, validateDecisionBody } from './cancellation-request.input.js';
import { CANCELLATION_REQUEST_CODES as CODES, CANCELLATION_REQUEST_MESSAGES as MESSAGES } from './cancellation-request.messages.js';
import { displayStatusOf, type DisplayCancellationStatus, type StoredCancellationStatus } from './cancellation-request.status.js';

interface EventRow {
  id: string;
  status: string;
  event_name: string;
  organiser_id: string;
  coordinator_id: string | null;
}

export interface CancellationRequestRecord {
  id: string;
  eventId: string;
  eventName: string;
  /** The stored status: pending, accepted or declined. */
  status: StoredCancellationStatus;
  /** What to show: the stored status, or closed for a pending request whose event has ended (D4). */
  displayStatus: DisplayCancellationStatus;
  closedNote?: string;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

const EVENT_COLUMNS = 'id, status, event_name, organiser_id, coordinator_id';

function iso(value: unknown): string {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function displayName(user: AuthenticatedUser, fallback: string): string {
  return user.name ?? user.email ?? fallback;
}

@Injectable()
export class CancellationRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cancelEvent: CancelEventService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---------------------------------------------------------------- AC1

  /** POST /api/events/:id/cancellation-requests: the submitting Organiser files a request. */
  async create(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireUser(identity);
    if (!UUID_PATTERN.test(eventId)) throw this.eventNotFound();
    try {
      return await this.database.transaction(async (client) => {
        const event = await this.lockEvent(client, eventId);
        if (!event) throw await this.missingEvent(client, user, eventId);
        // Authorisation before the body and before the status: a stranger learns nothing about either.
        if (!user.roles.includes('ORGANISER') || event.organiser_id !== user.uid) throw this.forbidden();
        const { reason } = validateCreateBody(body);
        if (!isCancellable(event.status)) throw this.notCancellable();
        const pending = await client.query(
          `SELECT 1 FROM event_cancellation_requests WHERE event_id = $1 AND status = 'pending'`,
          [eventId],
        );
        if (pending.rows.length) throw this.pending();
        const now = this.clock.now();
        const inserted = await client.query(
          `INSERT INTO event_cancellation_requests (id, event_id, requested_by_id, requested_by, reason, requested_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [randomUUID(), eventId, user.uid, displayName(user, 'Organiser'), reason, now],
        );
        return { request: this.toRecord(inserted.rows[0], event.event_name, event.status), message: MESSAGES.requested };
      });
    } catch (error) {
      // Two submissions that both passed the pending check: the unique index lets only one commit.
      if ((error as { code?: string }).code === '23505') throw this.pending();
      throw error;
    }
  }

  // ---------------------------------------------------------------- AC2

  /** GET /api/events/:id/cancellation-requests: the owner or the assigned Coordinator, newest first. */
  async listForEvent(identity: AuthenticatedUser | undefined, eventId: string): Promise<CancellationRequestRecord[]> {
    const user = this.requireUser(identity);
    if (!UUID_PATTERN.test(eventId)) throw this.eventNotFound();
    const found = await this.database.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [eventId]);
    const event = found.rows[0];
    if (!event) throw this.eventNotFound();
    if (!this.canRead(user, event)) throw this.forbidden();
    const result = await this.database.query(
      `SELECT * FROM event_cancellation_requests WHERE event_id = $1 ORDER BY requested_at DESC, id`,
      [eventId],
    );
    return result.rows.map((row) => this.toRecord(row, event.event_name, event.status));
  }

  /** GET /api/cancellation-requests: the caller's latest request on each of their events (the list indicator). */
  async listMine(identity: AuthenticatedUser | undefined): Promise<CancellationRequestRecord[]> {
    const user = this.requireUser(identity);
    const isOrganiser = user.roles.includes('ORGANISER');
    const isCoordinator = user.roles.includes('COORDINATOR');
    if (!isOrganiser && !isCoordinator) throw this.forbidden();
    const result = await this.database.query(
      `SELECT DISTINCT ON (r.event_id) r.*, e.event_name, e.status AS event_status
         FROM event_cancellation_requests r
         JOIN events e ON e.id = r.event_id
        WHERE (e.organiser_id = $1 AND $2) OR (e.coordinator_id = $1 AND $3)
        ORDER BY r.event_id, r.requested_at DESC, r.id DESC`,
      [user.uid, isOrganiser, isCoordinator],
    );
    return result.rows.map((row) => this.toRecord(row, row.event_name, row.event_status));
  }

  // ---------------------------------------------------------------- AC3 to AC5

  /** POST /api/cancellation-requests/:id/decision: the assigned Coordinator accepts or declines. */
  async decide(identity: AuthenticatedUser | undefined, requestId: string, body: unknown) {
    const user = this.requireUser(identity);
    if (!UUID_PATTERN.test(requestId)) throw this.forbidden();
    return this.database.transaction(async (client) => {
      // The event id never changes, so it can be read before the locks; the locks then re-read everything.
      const located = await client.query<{ event_id: string }>(
        'SELECT event_id FROM event_cancellation_requests WHERE id = $1',
        [requestId],
      );
      if (!located.rows[0]) throw this.forbidden();
      const eventId = located.rows[0].event_id;
      // Event row first, then the request row, so a decision, a creation and a direct cancellation all queue on the event.
      const event = await this.lockEvent(client, eventId);
      if (!event) throw this.forbidden();
      const locked = await client.query(
        'SELECT * FROM event_cancellation_requests WHERE id = $1 FOR UPDATE',
        [requestId],
      );
      const request = locked.rows[0];
      if (!request) throw this.forbidden();
      // The coordinator assigned NOW, on the locked row: never the requester, never an unassigned Lead.
      if (!user.roles.includes('COORDINATOR') || event.coordinator_id !== user.uid) throw this.forbidden();
      const { decision } = validateDecisionBody(body);
      if (request.status !== 'pending') throw this.decided();
      if (!isCancellable(event.status)) throw this.notCancellable();

      const now = this.clock.now();
      const status: StoredCancellationStatus = decision === 'accept' ? 'accepted' : 'declined';
      // Compare-and-set: only a request that is still pending can be decided.
      const updated = await client.query(
        `UPDATE event_cancellation_requests
            SET status = $2, decided_by_id = $3, decided_by = $4, decided_at = $5
          WHERE id = $1 AND status = 'pending'
          RETURNING *`,
        [requestId, status, user.uid, displayName(user, 'Coordinator'), now],
      );
      if (!updated.rows[0]) throw this.decided();

      if (decision === 'accept') {
        // The SPM-136 core on this transaction: a failure in any release rolls the request update back too.
        await this.cancelEvent.cancelInTransaction(client, user, eventId, now);
        return {
          request: this.toRecord(updated.rows[0], event.event_name, 'Cancelled'),
          message: MESSAGES.accepted(event.event_name),
        };
      }
      return { request: this.toRecord(updated.rows[0], event.event_name, event.status), message: MESSAGES.declined };
    });
  }

  // ---------------------------------------------------------------- helpers

  private toRecord(row: pg.QueryResultRow, eventName: string, eventStatus: string): CancellationRequestRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      eventName,
      status: row.status,
      ...displayStatusOf(row.status, eventStatus),
      reason: row.reason ?? null,
      requestedBy: row.requested_by,
      requestedAt: iso(row.requested_at),
      ...(row.decided_at ? { decidedAt: iso(row.decided_at) } : {}),
      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
    };
  }

  private async lockEvent(client: pg.PoolClient, eventId: string): Promise<EventRow | undefined> {
    const result = await client.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
    return result.rows[0];
  }

  /** No events row: the caller's own unsubmitted Draft is not cancellable (409, D5); anything else is not found. */
  private async missingEvent(client: pg.PoolClient, user: AuthenticatedUser, eventId: string) {
    const draft = await client.query(
      `SELECT 1 FROM event_drafts WHERE id = $1 AND organiser_id = $2 AND status = 'Draft'`,
      [eventId, user.uid],
    );
    return draft.rows.length ? this.notCancellable() : this.eventNotFound();
  }

  private canRead(user: AuthenticatedUser, event: EventRow): boolean {
    return (
      (user.roles.includes('ORGANISER') && event.organiser_id === user.uid) ||
      (user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid)
    );
  }

  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }

  private eventNotFound() {
    return new NotFoundException({ code: CODES.notFound, message: MESSAGES.notFound });
  }

  private forbidden() {
    return new ForbiddenException({ code: CODES.forbidden, message: MESSAGES.forbidden });
  }

  private notCancellable() {
    return new ConflictException({ code: CODES.notCancellable, message: MESSAGES.notCancellable });
  }

  private pending() {
    return new ConflictException({ code: CODES.pending, message: MESSAGES.pending });
  }

  private decided() {
    return new ConflictException({ code: CODES.decided, message: MESSAGES.decided });
  }
}
