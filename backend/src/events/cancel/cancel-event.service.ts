/*
 * SPM-136 Cancel an Event and Release its Reservations. One transaction (AC3 to AC8):
 *   1. lock the event row (FOR UPDATE) and re-check who may cancel on the locked row;
 *   2. refuse a status outside the cancellable set (409 EVENT_NOT_CANCELLABLE);
 *   3. compare-and-set the status to Cancelled, record who and when (injected clock, not SQL now());
 *   4. write one history row;
 *   5. collect recipients, write the EventCancelled notifications (once per recipient), then let every
 *      registered releaser free its rows.
 * Any fault rolls back all of it. Identity comes from the verified session only.
 *
 * Check order before the transaction (D4): 401, 404, 403, 400 (confirmation), then the locked checks.
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
import { UUID_PATTERN } from '../../common/uuid.js';
import { DatabaseService } from '../../database/database.service.js';
import { CANCELLABLE_STATUSES, isCancellable, isConfirmed } from './cancel-rules.js';
import { CANCEL_CODES, CANCEL_MESSAGES } from './cancel.messages.js';
import { DEFAULT_RELEASERS, EVENT_RELEASERS, type EventReleaser } from './release.registry.js';

interface CancelEventRow {
  id: string;
  status: string;
  event_name: string;
  organiser_id: string;
  coordinator_id: string | null;
}

@Injectable()
export class CancelEventService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
    @Optional() @Inject(EVENT_RELEASERS) private readonly releasers: readonly EventReleaser[] = DEFAULT_RELEASERS,
  ) {}

  /** POST /api/events/:eventId/status-change with targetStatus 'Cancelled'. */
  async cancel(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireUser(identity);
    if (!UUID_PATTERN.test(eventId)) throw new NotFoundException(CANCEL_MESSAGES.notFound);
    const event = await this.findEvent(eventId);
    if (!event) throw new NotFoundException(CANCEL_MESSAGES.notFound);
    if (!this.mayCancel(user, event)) throw this.notAllowed();
    if (!isConfirmed(body))
      throw new BadRequestException({ code: CANCEL_CODES.notConfirmed, message: CANCEL_MESSAGES.notConfirmed });

    const now = this.clock.now();
    return this.database.transaction((client) => this.cancelInside(client, user, eventId, now));
  }

  /**
   * The cancellation steps on the caller's transaction (SPM-155 D2/D13a): the Organiser's request flow runs this
   * inside its own transaction so the request update and the cancellation commit or roll back together. It opens
   * no transaction, takes the acting user and the instant from the caller, and re-checks on the locked row that the
   * actor is the assigned Coordinator. POST status-change reaches the same steps through cancel().
   */
  cancelInTransaction(client: pg.PoolClient, user: AuthenticatedUser, eventId: string, now: Date) {
    return this.cancelInside(client, user, eventId, now);
  }

  private async cancelInside(client: pg.PoolClient, user: AuthenticatedUser, eventId: string, now: Date) {
    const locked = await client.query<CancelEventRow>(
      'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1 FOR UPDATE',
      [eventId],
    );
    const event = locked.rows[0];
    if (!event) throw new NotFoundException(CANCEL_MESSAGES.notFound);
    if (!this.mayCancel(user, event)) throw this.notAllowed();
    if (!isCancellable(event.status)) throw this.notCancellable();

    // Compare-and-set: only the request that still sees a cancellable status wins.
    const updated = await client.query<{ event_name: string }>(
      `UPDATE events SET status = 'Cancelled', cancelled_by = $2, cancelled_at = $3, updated_at = $3
        WHERE id = $1 AND status = ANY($4::text[])
        RETURNING event_name`,
      [eventId, user.uid, now, [...CANCELLABLE_STATUSES]],
    );
    if (!updated.rows[0]) throw this.notCancellable();

    await client.query(
      `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
       VALUES ($1, $2, $3, 'Cancelled', $4, $5)`,
      [randomUUID(), eventId, event.status, user.uid, now],
    );

    // Recipients are read before any release changes the rows the attendee list comes from.
    const recipients = new Set<string>([event.organiser_id]);
    // The canceller is the assigned coordinator (mayCancel), so the coordinator is always a recipient.
    recipients.add(user.uid);
    for (const releaser of this.releasers)
      for (const recipient of (await releaser.collectRecipients?.(eventId, client)) ?? []) recipients.add(recipient);

    // Notices are written before the releases, inside the same transaction: a fault in any later step
    // rolls them back with everything else (CANCEL-EVENT-04-C).
    const message = CANCEL_MESSAGES.cancelled(updated.rows[0].event_name);
    // One set-based statement (CQ F5); the once-only index still makes a repeat a no-op.
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)
       SELECT gen_random_uuid(), recipient, 'EventCancelled', $2, $3, $4
         FROM unnest($1::text[]) AS recipient
       ON CONFLICT (recipient_id, related_event_id, type) WHERE type = 'EventCancelled' DO NOTHING`,
      [[...recipients], message, eventId, now],
    );

    for (const releaser of this.releasers) await releaser.release(eventId, client, now);

    return { eventId, status: 'Cancelled', message };
  }

  /** Only the assigned Coordinator (COORDINATOR role and coordinator_id). The submitting Organiser is not allowed. */
  private mayCancel(user: AuthenticatedUser, event: Pick<CancelEventRow, 'coordinator_id'>): boolean {
    return user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;
  }

  private async findEvent(eventId: string): Promise<CancelEventRow | undefined> {
    const result = await this.database.query<CancelEventRow>(
      'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1',
      [eventId],
    );
    return result.rows[0];
  }

  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }

  private notAllowed() {
    return new ForbiddenException({ code: CANCEL_CODES.forbidden, message: CANCEL_MESSAGES.notAllowed });
  }

  private notCancellable() {
    return new ConflictException({ code: CANCEL_CODES.notCancellable, message: CANCEL_MESSAGES.notCancellable });
  }
}
