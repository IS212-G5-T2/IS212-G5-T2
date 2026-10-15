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
import { buildChecklist } from './checklist.js';
import { EventSafetyCheckSource } from './safety-check.source.js';
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

interface PlanningEventRow extends EventRow {
  equipment_needs: string;
  equipment_confirmed_at: Date | null;
}

interface StatusChangeContext {
  identity: AuthenticatedUser;
  event: EventRow;
  now: Date;
}

@Injectable()
export class StatusService {
  constructor(
    private readonly database: DatabaseService,
    private readonly reader: ArrangementsReader,
    private readonly safetyChecks: EventSafetyCheckSource,
    @Inject(SAFETY_OUTCOME_SOURCE) private readonly safety: SafetyOutcomeSource,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async changeStatus(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const user = this.requireUser(identity);
    const targetStatus = this.targetStatusOf(body);
    const event = await this.assignedEventOrThrow(user, eventId);
    // SPM-136 adds `Cancelled` here.
    if (targetStatus !== 'Confirmed')
      throw new BadRequestException({
        code: STATUS_CODES.unsupportedTarget,
        message: STATUS_MESSAGES.unsupportedTarget,
      });

    return this.database.transaction((client) =>
      this.confirm(client, { identity: user, event, now: this.clock.now() }),
    );
  }

  /**
   * SPM-148 D7: the event's status history, oldest first. Readable by the
   * assigned Coordinator and the owning Organiser; everyone else gets 403.
   */
  async statusHistory(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireUser(identity);
    const event = await this.findEvent(eventId);
    if (!event) throw new NotFoundException(STATUS_MESSAGES.notFound);
    const isCoordinator = user.roles.includes('COORDINATOR') && event.coordinator_id === user.uid;
    const isOrganiser = user.roles.includes('ORGANISER') && event.organiser_id === user.uid;
    if (!isCoordinator && !isOrganiser)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
    const rows = await this.database.query<{
      from_status: string;
      to_status: string;
      created_at: Date;
      actor_id: string;
      actor_name: string | null;
    }>(
      `SELECT h.from_status, h.to_status, h.created_at, h.actor_id, u.display_name AS actor_name
         FROM event_status_history h
         LEFT JOIN users u ON u.id::text = h.actor_id
        WHERE h.event_id = $1
        ORDER BY h.created_at, h.id`,
      [eventId],
    );
    return rows.rows.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: row.created_at.toISOString(),
      changedBy: { id: row.actor_id, name: row.actor_name ?? row.actor_id },
    }));
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
    return {
      eventId,
      ready: result.ready,
      outstanding: result.outstanding,
      checklist: await this.checklistFor(eventId, now),
    };
  }

  /**
   * "Confirm no equipment needed": only for an event that lists no equipment and
   * has no live equipment request. Idempotent; the first confirmation time wins.
   */
  async confirmNoEquipment(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireUser(identity);
    const event = await this.assignedEventOrThrow(user, eventId);
    this.assertPlanning(event.status);
    const now = this.clock.now();
    return this.database.transaction(async (client) => {
      const row = (
        await client.query<PlanningEventRow>(
          `SELECT id, status, event_name, organiser_id, coordinator_id, equipment_needs, equipment_confirmed_at
             FROM events WHERE id = $1 FOR UPDATE`,
          [event.id],
        )
      ).rows[0];
      if (!row || row.coordinator_id !== user.uid)
        throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
      this.assertPlanning(row.status);
      const snapshot = await this.reader.read(client, event.id, { lock: false });
      const checklist = buildChecklist({
        snapshot,
        equipmentNeeds: row.equipment_needs,
        equipmentConfirmedAt: row.equipment_confirmed_at,
        safety: { status: 'not_requested' },
        now,
      });
      if (checklist.equipment.required || checklist.equipment.status !== 'not_requested')
        throw new UnprocessableEntityException({
          code: STATUS_CODES.equipmentRequired,
          message: STATUS_MESSAGES.equipmentRequired,
        });
      const confirmedAt = row.equipment_confirmed_at ?? now;
      if (!row.equipment_confirmed_at)
        await client.query('UPDATE events SET equipment_confirmed_at = $2 WHERE id = $1', [event.id, now]);
      return { eventId: event.id, equipmentConfirmedAt: confirmedAt.toISOString() };
    });
  }

  /**
   * Request (or re-request after "changes needed") the operational safety check.
   * Requires confirmed venue and equipment; the Safety Officer owns the outcome.
   */
  async requestSafetyCheck(identity: AuthenticatedUser | undefined, eventId: string) {
    const user = this.requireUser(identity);
    const event = await this.assignedEventOrThrow(user, eventId);
    this.assertPlanning(event.status);
    const now = this.clock.now();
    return this.database.transaction(async (client) => {
      const row = (
        await client.query<PlanningEventRow>(
          `SELECT id, status, event_name, organiser_id, coordinator_id, equipment_needs, equipment_confirmed_at
             FROM events WHERE id = $1 FOR UPDATE`,
          [event.id],
        )
      ).rows[0];
      if (!row || row.coordinator_id !== user.uid)
        throw new ForbiddenException({ code: 'FORBIDDEN', message: STATUS_MESSAGES.notAssigned });
      this.assertPlanning(row.status);

      const snapshot = await this.reader.read(client, event.id, { lock: true });
      const checklist = buildChecklist({
        snapshot,
        equipmentNeeds: row.equipment_needs,
        equipmentConfirmedAt: row.equipment_confirmed_at,
        safety: { status: 'not_requested' },
        now,
      });
      if (!checklist.canRequestSafetyCheck)
        throw new UnprocessableEntityException({
          code: STATUS_CODES.prerequisitesNotMet,
          message: STATUS_MESSAGES.prerequisitesNotMet(checklist.blocking.join(' and ')),
        });

      const current = (
        await client.query<{ status: string }>(
          'SELECT status FROM event_safety_checks WHERE event_id = $1 FOR UPDATE',
          [event.id],
        )
      ).rows[0];
      if (current?.status === 'pending')
        throw new ConflictException({
          code: STATUS_CODES.safetyCheckNotRequestable,
          message: STATUS_MESSAGES.safetyCheckPending,
        });
      if (current?.status === 'approved')
        throw new ConflictException({
          code: STATUS_CODES.safetyCheckNotRequestable,
          message: STATUS_MESSAGES.safetyCheckApproved,
        });
      if (current?.status === 'changes_needed') {
        const unresolved = (
          await client.query<{ count: string }>(
            'SELECT count(*) FROM safety_check_feedback_items WHERE event_id = $1 AND resolved_by_coordinator_at IS NULL',
            [event.id],
          )
        ).rows[0];
        const count = Number(unresolved.count);
        if (count > 0)
          throw new UnprocessableEntityException({
            code: STATUS_CODES.feedbackUnresolved,
            message: STATUS_MESSAGES.feedbackUnresolved(count),
          });
      }

      // A re-request clears the previous outcome; the history of outcomes is the Safety Officer's.
      await client.query('DELETE FROM safety_check_feedback_items WHERE event_id = $1', [event.id]);
      await client.query('DELETE FROM event_safety_resets WHERE event_id = $1', [event.id]);
      await client.query(
        `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
         VALUES ($1, 'pending', $2, $3)
         ON CONFLICT (event_id) DO UPDATE
           SET status = 'pending', requested_at = $2, requested_by = $3,
               approver_name = NULL, feedback = NULL, decided_at = NULL`,
        [event.id, now, user.uid],
      );
      return { eventId: event.id, status: 'pending', requestedDate: now.toISOString() };
    });
  }

  /** Removes an unavailable equipment request from the event; other requests cannot be removed this way. */
  async removeEquipmentRequest(identity: AuthenticatedUser | undefined, eventId: string, equipmentReservationId: string) {
    const user = this.requireUser(identity);
    const event = await this.assignedEventOrThrow(user, eventId);
    this.assertPlanning(event.status);
    return this.database.transaction(async (client) => {
      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);
      const snapshot = await this.reader.read(client, event.id, { lock: true });
      const reservation = snapshot.equipment.find((e) => e.id === equipmentReservationId);
      if (!reservation)
        throw new NotFoundException({ code: STATUS_CODES.equipmentRequestNotFound, message: STATUS_MESSAGES.equipmentRequestNotFound });
      const unavailable = ['unavailable', 'rejected'].includes(reservation.status.toLowerCase());
      if (!unavailable)
        throw new ConflictException({
          code: STATUS_CODES.equipmentRequestNotRemovable,
          message: STATUS_MESSAGES.equipmentRequestNotRemovable,
        });
      // Deleting the reservation also resets any safety check (equipment_reservations trigger, migration 014).
      await client.query('DELETE FROM equipment_reservations WHERE id = $1 AND event_id = $2', [equipmentReservationId, event.id]);
      return { eventId: event.id, equipmentReservationId, removed: true };
    });
  }

  /** Removes an unavailable venue request from the event; other requests cannot be removed this way. */
  async removeVenueRequest(identity: AuthenticatedUser | undefined, eventId: string, venueRequestId: string) {
    const user = this.requireUser(identity);
    const event = await this.assignedEventOrThrow(user, eventId);
    this.assertPlanning(event.status);
    return this.database.transaction(async (client) => {
      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);
      const snapshot = await this.reader.read(client, event.id, { lock: true });
      const booking = snapshot.venueBookings.find((b) => b.id === venueRequestId);
      if (!booking)
        throw new NotFoundException({ code: STATUS_CODES.venueRequestNotFound, message: STATUS_MESSAGES.venueRequestNotFound });
      const unavailable = booking.status === 'rejected' || booking.venueUnavailable;
      if (!unavailable)
        throw new ConflictException({
          code: STATUS_CODES.venueRequestNotRemovable,
          message: STATUS_MESSAGES.venueRequestNotRemovable,
        });
      // Deleting the booking also resets any safety check (venue_bookings trigger, migration 014).
      await client.query('DELETE FROM venue_bookings WHERE id = $1 AND event_id = $2', [venueRequestId, event.id]);
      return { eventId: event.id, venueRequestId, removed: true };
    });
  }

  /** Marks one Safety Officer feedback item as handled by the coordinator. */
  async resolveFeedback(identity: AuthenticatedUser | undefined, eventId: string, feedbackId: string) {
    return this.setFeedbackResolution(identity, eventId, feedbackId, true);
  }

  /** Clears the coordinator's handled mark on one feedback item. */
  async unresolveFeedback(identity: AuthenticatedUser | undefined, eventId: string, feedbackId: string) {
    return this.setFeedbackResolution(identity, eventId, feedbackId, false);
  }

  private async setFeedbackResolution(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    feedbackId: string,
    resolved: boolean,
  ) {
    const user = this.requireUser(identity);
    const event = await this.assignedEventOrThrow(user, eventId);
    this.assertPlanning(event.status);
    const now = this.clock.now();
    return this.database.transaction(async (client) => {
      const current = (
        await client.query<{ status: string }>(
          'SELECT status FROM event_safety_checks WHERE event_id = $1 FOR UPDATE',
          [event.id],
        )
      ).rows[0];
      if (current?.status !== 'changes_needed')
        throw new ConflictException({
          code: STATUS_CODES.safetyCheckNotRequestable,
          message: STATUS_MESSAGES.safetyCheckPending,
        });
      const updated = await client.query<{ id: string }>(
        `UPDATE safety_check_feedback_items
            SET resolved_by_coordinator_at = $3
          WHERE id = $1 AND event_id = $2
          RETURNING id`,
        [feedbackId, event.id, resolved ? now : null],
      );
      if (updated.rows.length === 0)
        throw new NotFoundException({ code: STATUS_CODES.feedbackNotFound, message: STATUS_MESSAGES.feedbackNotFound });
      return resolved
        ? { eventId: event.id, feedbackId, resolvedAt: now.toISOString() }
        : { eventId: event.id, feedbackId };
    });
  }

  private async checklistFor(eventId: string, now: Date) {
    const [snapshot, meta, safety] = await Promise.all([
      this.reader.read(this.database, eventId, { lock: false }),
      this.database.query<{ equipment_needs: string; equipment_confirmed_at: Date | null }>(
        'SELECT equipment_needs, equipment_confirmed_at FROM events WHERE id = $1',
        [eventId],
      ),
      this.safetyChecks.view(eventId),
    ]);
    return buildChecklist({
      snapshot,
      equipmentNeeds: meta.rows[0]?.equipment_needs ?? '',
      equipmentConfirmedAt: meta.rows[0]?.equipment_confirmed_at ?? null,
      safety,
      now,
    });
  }

  private assertPlanning(status: string) {
    if (status !== 'Planning')
      throw new UnprocessableEntityException({
        code: STATUS_CODES.notConfirmable,
        message: STATUS_MESSAGES.notPlanningForUpdate,
      });
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
