/*
 * SPM-65 Review and Approve/Deny a Change Request (Coordinator).
 *
 * - AC1/AC2: the assigned coordinator reads the event's requests (ChangeRequestsService.listForEvent
 *   and listMine); each request carries every requested field with its value when requested.
 * - AC3: preview() assesses the requested values against the event's active venue bookings,
 *   equipment reservations and registrations without writing anything (agreed read-only preview).
 * - AC4/AC7: approve() applies every requested field in one transaction through the planning
 *   repository's applyFields, so the safety-check trigger and the field rules stay in one place.
 *   The values are validated again at decision time; a field with a change still awaiting review
 *   (SPM-85) blocks approval until that change is resolved.
 * - AC5: deny() requires a reason of 10 to 500 characters and leaves the event unchanged.
 * - AC6: each decision returns the updated request so the page can confirm it.
 * - AC8: approving any change to an event that has a safety check resets it (database trigger); the
 *   reset reason reads "Change request approved" and a Confirmed event goes back to Planning
 *   (agreed), with a Status History entry. The coordinator re-requests the safety check (agreed).
 * - AC9: the venue bookings and equipment reservations the approved change affects are stored on
 *   the request as a re-check list; the coordinator ticks each one off (agreed).
 * - AC10: every outcome is written to the append-only audit log in the same transaction.
 * - AC11 (revised 18 Oct 2026): a pending request is closed automatically when the organiser withdraws it
 *   (status Withdrawn, ChangeRequestsService.withdraw) or the event is cancelled (status Closed,
 *   release/change-request.releaser.ts). A closed request cannot be previewed or decided and the 409 says
 *   why; a request already approved or denied is refused the same way (AC4).
 *   Every mutation also calls the SPM-136 cancelled-event guard after the pending check, so a request
 *   closed by cancellation keeps its own message and nothing else can change a cancelled event.
 * The organiser is notified of the decision (change_request_approved / change_request_denied).
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
import type { AuthenticatedUser } from '../../../auth/types/auth.models.js';
import { CLOCK, systemClock, type Clock } from '../../../common/clock.js';
import { assertEventNotCancelled } from '../../cancelled-guard.js';
import {
  validateEventUpdate,
  type EventUpdatePatch,
} from '../../planning/dto/event-update-input.js';
import {
  EventPlanningRepository,
  type PlanningEventRow,
} from '../../planning/event-planning.repository.js';
import { recordOutcome, toAuditEntry } from '../change-request-audit.js';
import {
  CHANGE_REQUEST_OPEN_STATUSES,
  ChangeRequestsService,
} from '../change-requests.service.js';
import {
  assessChangeRequest,
  type ArrangementImpact,
} from './assess-change-request.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DENIAL_REASON_MIN = 10;
export const DENIAL_REASON_MAX = 500;
export const SAFETY_RESET_REASON = 'Change request approved';

export const REVIEW_MESSAGES = {
  notFound: 'Event not found.',
  requestNotFound: 'Change request not found.',
  coordinatorOnly: 'Only the assigned coordinator can review change requests.',
  decided: 'This change request has already been decided.',
  withdrawn: 'The organiser has withdrawn this change request.',
  closed: 'This change request was closed because the event was cancelled.',
  notOpen: 'Change requests can no longer be decided for this event.',
  started:
    'This event has already started, so the change can no longer be applied.',
  flaggedPending:
    'A change to this detail is already awaiting review. Resolve it before approving this request.',
  reasonRequired: 'Please give a reason for denying this change.',
  reasonLength: `Use between ${DENIAL_REASON_MIN} and ${DENIAL_REASON_MAX} characters.`,
  invalidValues:
    'The requested values are no longer valid. Deny the request or ask the organiser for a new one.',
  recheckNotFound: 'That arrangement is not on this request’s re-check list.',
  recheckDone: 'This arrangement has already been re-checked.',
  notApproved: 'Only an approved change request has arrangements to re-check.',
} as const;

export interface RecheckItem extends ArrangementImpact {
  id: string;
  checkedAt?: string;
  checkedBy?: string;
}

/** Statuses (events.status, title case) in which a request can still be approved. */
const OPEN = CHANGE_REQUEST_OPEN_STATUSES as readonly string[];

function displayName(user: AuthenticatedUser): string {
  return user.name ?? user.email ?? 'Coordinator';
}

@Injectable()
export class ChangeRequestReviewService {
  constructor(
    private readonly repository: EventPlanningRepository,
    private readonly changeRequests: ChangeRequestsService,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---------------------------------------------------------------- AC3

  /** Conflicts the request's values would cause, without changing anything. */
  async preview(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    requestId: string,
  ) {
    const user = this.requireCoordinator(identity);
    const { event } = await this.assignedEvent(user, eventId);
    const request = await this.findRequest(eventId, requestId);
    this.requirePending(request);
    return {
      requestId: request.id,
      ...(await this.assess(event, request)),
    };
  }

  // ---------------------------------------------------------------- AC4, AC6-AC10

  async approve(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    requestId: string,
    body: unknown,
  ) {
    const user = this.requireCoordinator(identity);
    this.requireEmptyBody(body);
    return this.repository.runInTransaction(async () => {
      const { event } = await this.assignedEvent(user, eventId);
      const request = await this.findRequest(eventId, requestId, true);
      this.requirePending(request);
      assertEventNotCancelled(event.status);
      if (!OPEN.includes(event.status))
        throw new ConflictException(REVIEW_MESSAGES.notOpen);
      if (this.clock.now().getTime() >= Date.parse(event.startDateTime))
        throw new ConflictException({
          message: REVIEW_MESSAGES.started,
          code: 'event_started',
        });

      const patch = this.patchOf(request);
      // SPM-85: one pending change per field, so its original -> proposed values stay unambiguous.
      const flagged = (
        await this.repository.listPendingChanges(eventId)
      ).filter((change) => change.field in patch);
      if (flagged.length)
        throw new ConflictException({
          message: REVIEW_MESSAGES.flaggedPending,
          errors: Object.fromEntries(
            flagged.map((change) => [
              change.field,
              'A change is already awaiting review.',
            ]),
          ),
        });
      const valid = this.revalidate(patch, event);

      // AC9: what the change affects, assessed against the arrangements before they change.
      const assessment = await this.assess(event, request);
      const recheck: RecheckItem[] = [
        ...assessment.venueBookings,
        ...assessment.equipment,
      ].map((item) => ({
        ...item,
        id: randomUUID(),
      }));

      const now = this.clock.now();
      const hadSafetyCheck = await this.repository.safetyCheckExists(eventId);
      await this.repository.applyFields(eventId, valid, now);
      const safetyCheckReset =
        hadSafetyCheck && !(await this.repository.safetyCheckExists(eventId));
      if (safetyCheckReset)
        await this.repository.query(
          'UPDATE event_safety_resets SET reason = $2 WHERE event_id = $1',
          [eventId, SAFETY_RESET_REASON],
        );

      // AC8 (agreed): a Confirmed event goes back to Planning and must be confirmed again.
      let eventStatus = event.status;
      if (event.status === 'Confirmed') {
        await this.repository.query(
          `UPDATE events SET status = 'Planning', updated_at = $2 WHERE id = $1`,
          [eventId, now],
        );
        await this.repository.query(
          `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
           VALUES ($1, $2, 'Confirmed', 'Planning', $3, $4)`,
          [randomUUID(), eventId, user.uid, now],
        );
        eventStatus = 'Planning';
      }

      const decided = await this.repository.query(
        `UPDATE event_change_requests
            SET status = 'Approved', decided_by = $2, decided_by_id = $3, decided_at = $4,
                recheck = $5::jsonb, safety_check_reset = $6
          WHERE id = $1
          RETURNING *`,
        [
          request.id,
          displayName(user),
          user.uid,
          now,
          JSON.stringify(recheck),
          safetyCheckReset,
        ],
      );
      await recordOutcome(this.repository, request, 'Approved', {
        decidedBy: displayName(user),
        decidedById: user.uid,
        decidedAt: now,
      });
      await this.notifyOrganiser(
        event,
        'change_request_approved',
        `Your change request for "${event.name}" was approved.${safetyCheckReset ? ' The event needs a new safety check.' : ''}`,
      );
      return {
        request: this.changeRequests.toRecord(decided.rows[0], event.name),
        eventStatus: eventStatus.toLowerCase(),
        safetyCheckReset,
        registrations: assessment.registrations,
      };
    });
  }

  // ---------------------------------------------------------------- AC5, AC6, AC10

  async deny(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    requestId: string,
    body: unknown,
  ) {
    const user = this.requireCoordinator(identity);
    const reason = this.parseReason(body);
    return this.repository.runInTransaction(async () => {
      const { event } = await this.assignedEvent(user, eventId);
      const request = await this.findRequest(eventId, requestId, true);
      this.requirePending(request);
      assertEventNotCancelled(event.status);
      const now = this.clock.now();
      const decided = await this.repository.query(
        `UPDATE event_change_requests
            SET status = 'Denied', decided_by = $2, decided_by_id = $3, decided_at = $4, decision_reason = $5
          WHERE id = $1
          RETURNING *`,
        [request.id, displayName(user), user.uid, now, reason],
      );
      await recordOutcome(this.repository, request, 'Denied', {
        decidedBy: displayName(user),
        decidedById: user.uid,
        reason,
        decidedAt: now,
      });
      await this.notifyOrganiser(
        event,
        'change_request_denied',
        `Your change request for "${event.name}" was denied: ${reason}`,
      );
      return {
        request: this.changeRequests.toRecord(decided.rows[0], event.name),
      };
    });
  }

  // ---------------------------------------------------------------- AC9

  /** The coordinator marks one arrangement on an approved request's re-check list as re-checked. */
  async markRechecked(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    requestId: string,
    itemId: string,
  ) {
    const user = this.requireCoordinator(identity);
    return this.repository.runInTransaction(async () => {
      const { event } = await this.assignedEvent(user, eventId);
      const request = await this.findRequest(eventId, requestId, true);
      if (request.status !== 'Approved')
        throw new ConflictException(REVIEW_MESSAGES.notApproved);
      assertEventNotCancelled(event.status);
      const items = request.recheck as RecheckItem[];
      const item = items.find((entry) => entry.id === itemId);
      if (!item) throw new NotFoundException(REVIEW_MESSAGES.recheckNotFound);
      if (item.checkedAt)
        throw new ConflictException(REVIEW_MESSAGES.recheckDone);
      const updated = items.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              checkedAt: this.clock.now().toISOString(),
              checkedBy: displayName(user),
            }
          : entry,
      );
      const saved = await this.repository.query(
        'UPDATE event_change_requests SET recheck = $2::jsonb WHERE id = $1 RETURNING *',
        [request.id, JSON.stringify(updated)],
      );
      return this.changeRequests.toRecord(saved.rows[0], event.name);
    });
  }

  // ---------------------------------------------------------------- AC10

  /** The event's audit log, newest first: the owning organiser and the assigned coordinator. */
  async auditLog(identity: AuthenticatedUser | undefined, eventId: string) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (
      !identity.roles.includes('ORGANISER') &&
      !identity.roles.includes('COORDINATOR')
    )
      throw new ForbiddenException('Organiser or coordinator access required.');
    if (!UUID.test(eventId))
      throw new NotFoundException(REVIEW_MESSAGES.notFound);
    const event = await this.repository.findEvent(eventId);
    const canRead =
      !!event &&
      ((identity.roles.includes('ORGANISER') &&
        event.organiserId === identity.uid) ||
        (identity.roles.includes('COORDINATOR') &&
          event.coordinatorId === identity.uid));
    if (!canRead) throw new NotFoundException(REVIEW_MESSAGES.notFound);
    const rows = await this.repository.query(
      `SELECT * FROM event_change_request_audit WHERE event_id = $1 ORDER BY decided_at DESC, recorded_at DESC, id`,
      [eventId],
    );
    return rows.rows.map(toAuditEntry);
  }

  // ---------------------------------------------------------------- helpers

  private async assess(event: PlanningEventRow, request: pg.QueryResultRow) {
    const patch = this.patchOf(request);
    const window = { start: patch.startDateTime, end: patch.endDateTime };
    const [bookings, equipment, counts] = await Promise.all([
      this.repository.listVenueBookings(event.id, window),
      this.repository.listEquipmentArrangements(event.id),
      this.repository.query(
        `SELECT count(*) FILTER (WHERE status = 'Registered')::int AS registered,
                count(*) FILTER (WHERE status = 'Waitlisted')::int AS waitlisted
           FROM event_registrations WHERE event_id = $1`,
        [event.id],
      ),
    ]);
    return assessChangeRequest(
      patch,
      event,
      bookings,
      equipment,
      counts.rows[0],
    );
  }

  /** The request's proposed values as an update patch. */
  private patchOf(request: pg.QueryResultRow): EventUpdatePatch {
    return Object.fromEntries(
      (request.changes as { field: string; proposedValue: unknown }[]).map(
        (change) => [change.field, change.proposedValue],
      ),
    ) as EventUpdatePatch;
  }

  /** AC4: the values must still be valid when the decision is made (for example a start still in the future). */
  private revalidate(
    patch: EventUpdatePatch,
    event: PlanningEventRow,
  ): EventUpdatePatch {
    let valid: EventUpdatePatch;
    try {
      valid = validateEventUpdate(patch);
    } catch (error) {
      // validateEventUpdate always answers with a field -> message map.
      const body = (error as BadRequestException).getResponse() as {
        errors: Record<string, string>;
      };
      throw new BadRequestException({
        message: REVIEW_MESSAGES.invalidValues,
        errors: body.errors,
      });
    }
    const start = Date.parse(valid.startDateTime ?? event.startDateTime);
    const end = Date.parse(valid.endDateTime ?? event.endDateTime);
    if (end <= start)
      throw new BadRequestException({
        message: REVIEW_MESSAGES.invalidValues,
        errors: {
          [valid.endDateTime !== undefined ? 'endDateTime' : 'startDateTime']:
            'End must be after start.',
        },
      });
    return valid;
  }

  private async notifyOrganiser(
    event: PlanningEventRow,
    type: string,
    message: string,
  ) {
    await this.repository.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), event.organiserId, type, message, event.id],
    );
  }

  private requireCoordinator(
    identity: AuthenticatedUser | undefined,
  ): AuthenticatedUser {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException(REVIEW_MESSAGES.coordinatorOnly);
    return identity;
  }

  /** The event, locked when inside a transaction; anyone but its assigned coordinator gets 404. */
  private async assignedEvent(user: AuthenticatedUser, eventId: string) {
    if (!UUID.test(eventId))
      throw new NotFoundException(REVIEW_MESSAGES.notFound);
    const event = await this.repository.findEvent(eventId);
    if (!event || event.coordinatorId !== user.uid)
      throw new NotFoundException(REVIEW_MESSAGES.notFound);
    return { event };
  }

  private async findRequest(eventId: string, requestId: string, lock = false) {
    if (!UUID.test(requestId))
      throw new NotFoundException(REVIEW_MESSAGES.requestNotFound);
    const found = await this.repository.query(
      `SELECT * FROM event_change_requests WHERE id = $1 AND event_id = $2${lock ? ' FOR UPDATE' : ''}`,
      [requestId, eventId],
    );
    const request = found.rows[0];
    if (!request) throw new NotFoundException(REVIEW_MESSAGES.requestNotFound);
    return request;
  }

  /** AC11 / AC4: only a pending request can be decided; the message says why not (withdrawn, closed or decided). */
  private requirePending(request: pg.QueryResultRow) {
    if (request.status === 'Pending') return;
    const reasons: Record<string, { message: string; code: string }> = {
      Withdrawn: {
        message: REVIEW_MESSAGES.withdrawn,
        code: 'change_request_withdrawn',
      },
      Closed: {
        message: REVIEW_MESSAGES.closed,
        code: 'change_request_closed',
      },
    };
    throw new ConflictException(
      reasons[request.status] ?? {
        message: REVIEW_MESSAGES.decided,
        code: 'change_request_decided',
      },
    );
  }

  private requireEmptyBody(body: unknown) {
    if (body === undefined || body === null) return;
    if (
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new BadRequestException(
        'Approving a change request takes no details.',
      );
  }

  private parseReason(body: unknown): string {
    const data =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const unknown = Object.keys(data).filter((key) => key !== 'reason');
    if (unknown.length)
      throw new BadRequestException({
        message: 'Please correct the highlighted fields.',
        errors: Object.fromEntries(
          unknown.map((key) => [key, 'Unknown field.']),
        ),
      });
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (!reason)
      throw new BadRequestException({
        message: REVIEW_MESSAGES.reasonRequired,
        errors: { reason: REVIEW_MESSAGES.reasonRequired },
      });
    if (reason.length < DENIAL_REASON_MIN || reason.length > DENIAL_REASON_MAX)
      throw new BadRequestException({
        message: REVIEW_MESSAGES.reasonLength,
        errors: { reason: REVIEW_MESSAGES.reasonLength },
      });
    return reason;
  }
}
