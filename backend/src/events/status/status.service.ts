/*
 * SPM-135 Confirm an Event. One status-change endpoint handles every target
 * status (G1); this file owns the Confirmed handler. Checks run in this order
 * (D4): 401, 404, 403 (assignment, MSG-CF-03), 400 unsupported target, status
 * guards (D5), readiness (R3) and one compare-and-set UPDATE inside one
 * transaction (D9). The history row and the notification commit with it.
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
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../common/clock.js';
import { DatabaseService } from '../../database/database.service.js';
import { UUID_PATTERN } from '../../common/uuid.js';
import {
  ArrangementsReader,
  SAFETY_OUTCOME_SOURCE,
  type SafetyOutcomeSource,
} from './arrangements.reader.js';
import { STATUS_CODES, STATUS_MESSAGES } from './status.messages.js';
import {
  evaluateReadiness,
  formatOutstanding,
  type OutstandingItem,
  type ReadinessResult,
} from './readiness.js';

interface EventRow {
  id: string;
  status: string;
  event_name: string;
  organiser_id: string;
  coordinator_id: string | null;
}

interface StatusChangeContext {
  identity: AuthenticatedUser;
  event: EventRow;
  now: Date;
}

type Handler = (
  client: pg.PoolClient,
  context: StatusChangeContext,
) => Promise<{ status: string; message: string }>;

@Injectable()
export class StatusService {
  /** One handler per target status (D16). SPM-136 adds `Cancelled` here. */
  private readonly handlers: Record<string, Handler> = {
    Confirmed: (client, context) => this.confirm(client, context),
  };

  constructor(
    private readonly database: DatabaseService,
    private readonly reader: ArrangementsReader,
    @Inject(SAFETY_OUTCOME_SOURCE) private readonly safety: SafetyOutcomeSource,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async changeStatus(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireUser(identity);
    const targetStatus = this.targetStatusOf(body);
    const event = await this.assignedEventOrThrow(user, eventId);
    const handler = Object.prototype.hasOwnProperty.call(this.handlers, targetStatus)
      ? this.handlers[targetStatus]
      : undefined;
    if (!handler)
      throw new BadRequestException({
        code: STATUS_CODES.unsupportedTarget,
        message: STATUS_MESSAGES.unsupportedTarget,
      });

    return this.database.transaction((client) =>
      handler(client, { identity: user, event, now: this.clock.now() }),
    );
  }

  /** The assigned coordinator's readiness view (R5, D3). Read-only. */
  async arrangementsStatus(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireUser(identity);
    await this.assignedEventOrThrow(user, eventId);
    const now = this.clock.now();
    const snapshot = await this.reader.read(this.database, eventId, { lock: false });
    const result: ReadinessResult = evaluateReadiness(
      { ...snapshot, safety: await this.safety.read(eventId) },
      now,
    );
    return { eventId, ready: result.ready, outstanding: result.outstanding };
  }

  /**
   * Organiser allowlist for a Confirmed event (D14, 05-B): named fields only,
   * never the event row. Only the submitting organiser may read it.
   */
  async confirmedArrangements(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireUser(identity);
    if (!user.roles.includes('ORGANISER')) throw new ForbiddenException('Organiser access required.');
    const event = await this.findEvent(eventId);
    if (!event || event.organiser_id !== user.uid) throw new NotFoundException(STATUS_MESSAGES.notFound);
    if (event.status !== 'Confirmed') throw new NotFoundException(STATUS_MESSAGES.notFound);

    const snapshot = await this.reader.read(this.database, eventId, { lock: false });
    const safety = await this.safety.read(eventId);
    return {
      eventId,
      status: 'Confirmed',
      venueBookings: snapshot.venueBookings.map((booking) => ({
        venueName: booking.venueName,
        start: booking.start,
        end: booking.end,
        status: booking.status === 'approved' ? 'Approved' : booking.status,
      })),
      // Sorted by name for a stable display order; the stored order is by id.
      equipment: [...snapshot.equipment]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((line) => ({ name: line.name, quantity: line.quantity, status: line.status })),
      safety: { state: safety?.state ?? 'Not recorded' },
    };
  }

  private async confirm(client: pg.PoolClient, { identity, event, now }: StatusChangeContext) {
    // Serialise concurrent confirmations of the same event (04-B B).
    const locked = await client.query<EventRow>(
      'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1 FOR UPDATE',
      [event.id],
    );
    const current = locked.rows[0];
    if (!current) throw new NotFoundException(STATUS_MESSAGES.notFound);
    // Re-check assignment on the locked row: a reassignment may land after the pre-check (D4).
    if (current.coordinator_id !== identity.uid)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });

    this.assertSourceStatus(current.status);

    const snapshot = await this.reader.read(client, event.id, { lock: true });
    const result = evaluateReadiness({ ...snapshot, safety: await this.safety.read(event.id) }, now);
    if (!result.ready) this.throwBlocked(result);

    const updated = await client.query<{ event_name: string; organiser_id: string }>(
      `UPDATE events SET status = 'Confirmed', updated_at = $2
        WHERE id = $1 AND status = 'Planning'
        RETURNING event_name, organiser_id`,
      [event.id, now],
    );
    if (!updated.rows[0]) throw new ConflictException(this.alreadyConfirmedBody());

    await client.query(
      `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
       VALUES ($1, $2, 'Planning', 'Confirmed', $3, $4)`,
      [randomUUID(), event.id, identity.uid, now],
    );
    // One notification per event and organiser, even if the write were repeated (R7).
    await client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, created_at)
       VALUES ($1, $2, 'EventConfirmed', $3, $4, $5)
       ON CONFLICT (recipient_id, related_event_id, type) WHERE type = 'EventConfirmed' DO NOTHING`,
      [
        randomUUID(),
        updated.rows[0].organiser_id,
        STATUS_MESSAGES.confirmed(updated.rows[0].event_name),
        event.id,
        now,
      ],
    );

    return {
      eventId: event.id,
      status: 'Confirmed',
      message: STATUS_MESSAGES.confirmed(updated.rows[0].event_name),
    };
  }

  private assertSourceStatus(status: string) {
    if (status === 'Planning') return;
    if (status === 'Confirmed')
      throw new ConflictException({ code: STATUS_CODES.alreadyConfirmed, message: STATUS_MESSAGES.alreadyConfirmed });
    if (status === 'Rejected' || status === 'Cancelled')
      throw new UnprocessableEntityException({
        code: STATUS_CODES.notConfirmable,
        message: STATUS_MESSAGES.rejectedOrCancelled,
      });
    throw new UnprocessableEntityException({
      code: STATUS_CODES.notConfirmable,
      message: STATUS_MESSAGES.notPlanning,
    });
  }

  private throwBlocked(result: ReadinessResult): never {
    const outstanding: OutstandingItem[] = result.outstanding;
    throw new UnprocessableEntityException({
      code: STATUS_CODES.confirmBlocked,
      message: STATUS_MESSAGES.outstanding(outstanding.map(formatOutstanding).join('; ')),
      outstanding,
    });
  }

  private alreadyConfirmedBody() {
    return { code: STATUS_CODES.alreadyConfirmed, message: STATUS_MESSAGES.alreadyConfirmed };
  }

  /** 401 without identity, 404 for a bad or missing id, 403 unless assigned (MSG-CF-03). */
  private async assignedEventOrThrow(user: AuthenticatedUser, eventId: string): Promise<EventRow> {
    const event = await this.findEvent(eventId);
    if (!event) throw new NotFoundException(STATUS_MESSAGES.notFound);
    const isAssigned = user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;
    if (!isAssigned)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
    return event;
  }

  private async findEvent(eventId: string): Promise<EventRow | undefined> {
    if (!UUID_PATTERN.test(eventId)) return undefined;
    const result = await this.database.query<EventRow>(
      'SELECT id, status, event_name, organiser_id, coordinator_id FROM events WHERE id = $1',
      [eventId],
    );
    return result.rows[0];
  }

  private requireUser(identity: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!identity?.uid) throw new UnauthorizedException('Authentication required.');
    return identity;
  }

  private targetStatusOf(body: unknown): string {
    const value = (body as { targetStatus?: unknown } | null)?.targetStatus;
    return typeof value === 'string' ? value : '';
  }
}
