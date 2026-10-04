/*
 * Business rules for event information during the planning phase:
 * - SPM-97: the owning organiser views planning information read-only.
 * - SPM-49: the assigned coordinator views and updates event information.
 * - SPM-85: changes that affect existing bookings are flagged "Needs Review"
 *   and the coordinator confirms or rejects them, per change or per booking.
 *
 * Identity always comes from the verified session (request.currentUser), never
 * from the body. A user who is neither the owning organiser nor the assigned
 * coordinator gets 404, exactly like a missing event, so existence never leaks
 * (same rule as EventsService.get, SPM-38 AC4).
 *
 * See backend/HANDOVER.md "Event planning (SPM-97/49/85)" for assumptions.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { assessVenueBookings, type ProposedChange } from './event-impact.js';
import {
  EventPlanningRepository,
  type EquipmentArrangementRow,
  type EquipmentImpact,
  type FlaggedChangeRow,
  type PlanningEventRow,
  type StoredBookingImpact,
  type VenueBookingRow,
} from './event-planning.repository.js';
import {
  EDITABLE_FIELDS,
  classifyUpdate,
  validateEventUpdate,
  type EventFieldKey,
  type EventUpdatePatch,
} from './event-update-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Once the event has entered the planning process" (SPM-97 AC1). */
const VIEWABLE_STATUSES = new Set(['approved', 'planning', 'confirmed']);
/** "After event approval ... pre-confirmation" (SPM-49, SPM-85). */
const EDITABLE_STATUSES = new Set(['approved', 'planning']);
/** Booking/arrangement states that no longer hold anything for the event. */
const INACTIVE_BOOKING_STATUSES = new Set(['unavailable', 'cancelled']);
const INACTIVE_EQUIPMENT_STATUSES = new Set([
  'unavailable',
  'cancelled',
  'released',
]);
/** Fields whose change also affects equipment reservations. */
const EQUIPMENT_FIELDS = new Set<EventFieldKey>([
  'startDateTime',
  'endDateTime',
  'equipmentNeeds',
]);

export type FieldMode = 'direct' | 'needs_review';

type Access = {
  user: AuthenticatedUser;
  event: PlanningEventRow;
  isCoordinator: boolean;
};

@Injectable()
export class EventPlanningService {
  constructor(private readonly repository: EventPlanningRepository) {}

  // ---------------------------------------------------------------- SPM-97 / SPM-49 AC1

  /**
   * Planning information for the owning organiser (read-only) or the assigned
   * coordinator (with per-field edit modes). Always read live from the
   * database so each call reflects the coordinator's latest changes; the
   * frontend polls this endpoint (SPM-97 AC2, AC5).
   */
  async getPlanningView(
    identity: AuthenticatedUser | undefined,
    eventId: string,
  ) {
    const { event, isCoordinator } = await this.access(identity, eventId);
    if (!VIEWABLE_STATUSES.has(event.status.toLowerCase()))
      throw new ConflictException(
        'Planning information is available once the event is approved.',
      );

    const [bookings, equipment, pending] = await Promise.all([
      this.repository.listVenueBookings(eventId),
      this.repository.listEquipmentArrangements(eventId),
      this.repository.listPendingChanges(eventId),
    ]);
    const editable =
      isCoordinator && EDITABLE_STATUSES.has(event.status.toLowerCase());
    const hasArrangements = this.hasArrangements(bookings, equipment);

    return {
      event: this.toEventRecord(event),
      venueBookings: bookings.map(
        ({ neighbours: _neighbours, ...booking }) => booking,
      ),
      equipmentArrangements: equipment,
      pendingChanges: [
        ...pending.map((change) =>
          this.toPendingChange(change, event, isCoordinator),
        ),
        // SPM-97 AC3: a booked venue that became unavailable needs a replacement.
        ...bookings
          .filter((booking) => booking.status.toLowerCase() === 'unavailable')
          .map((booking) => ({
            id: `venue-${booking.id}`,
            kind: 'replacement_venue_required' as const,
            field: 'venue' as const,
            bookingId: booking.id,
            venueName: booking.venueName,
            status: 'Needs Review' as const,
          })),
      ],
      // SPM-97 AC4: the organiser view is read-only, enforced again on write.
      readOnly: !editable,
      editableFields: editable
        ? EDITABLE_FIELDS.map((field) => ({
            field,
            mode: (classifyUpdate([field], hasArrangements).needsReview.length
              ? 'needs_review'
              : 'direct') as FieldMode,
          }))
        : [],
      // SPM-49 AC6.
      lastUpdatedAt: event.updatedAt,
    };
  }

  // ---------------------------------------------------------------- SPM-49 / SPM-85 AC1

  /**
   * Applies fields that cannot affect bookings immediately and flags the rest
   * as "Needs Review" when the event already has a venue booking or equipment
   * arrangement. Everything happens in one transaction.
   */
  async updateEvent(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    body: unknown,
  ) {
    this.requireCoordinatorRole(identity);
    const patch = validateEventUpdate(body);

    return this.atomically(async () => {
      const { user, event } = await this.editableAccess(identity, eventId);
      this.checkMergedSchedule(event, patch);

      const changed = (Object.keys(patch) as EventFieldKey[]).filter(
        (field) => !sameValue(field, event[field], patch[field]),
      );
      if (!changed.length)
        return {
          event: this.toEventRecord(event),
          applied: [],
          flagged: [],
          updatedAt: event.updatedAt,
        };

      const window = { start: patch.startDateTime, end: patch.endDateTime };
      const [bookings, equipment] = await Promise.all([
        this.repository.listVenueBookings(eventId, window),
        this.repository.listEquipmentArrangements(eventId),
      ]);
      const { immediate, needsReview } = classifyUpdate(
        changed,
        this.hasArrangements(bookings, equipment),
      );

      if (needsReview.length) {
        // One pending change per field: a second proposal must wait until the
        // first is resolved, so original → confirmed values stay unambiguous.
        const pendingFields = new Set(
          (await this.repository.listPendingChanges(eventId)).map(
            (c) => c.field,
          ),
        );
        const blocked = needsReview.filter((field) => pendingFields.has(field));
        if (blocked.length)
          throw new ConflictException({
            message:
              'A change to this field is already awaiting review. Resolve it first.',
            errors: Object.fromEntries(
              blocked.map((field) => [
                field,
                'A change is already awaiting review.',
              ]),
            ),
          });
      }

      let current = event;
      if (immediate.length)
        current = await this.repository.applyFields(
          eventId,
          pick(patch, immediate),
          new Date(),
        );

      const activeBookings = bookings.filter(
        (b) => !INACTIVE_BOOKING_STATUSES.has(b.status.toLowerCase()),
      );
      const activeEquipment = equipment.filter(
        (e) => !INACTIVE_EQUIPMENT_STATUSES.has(e.status.toLowerCase()),
      );
      const flagged: FlaggedChangeRow[] = [];
      for (const field of needsReview) {
        flagged.push(
          await this.repository.createFlaggedChange(eventId, {
            kind: 'booking_conflict',
            field,
            originalValue: event[field],
            proposedValue: patch[field],
            impacts: assessVenueBookings(
              proposalFor(field, patch),
              activeBookings,
            ),
            equipmentImpacts: EQUIPMENT_FIELDS.has(field)
              ? equipmentImpacts(field, activeEquipment)
              : [],
            proposedBy: displayName(user),
            proposedById: user.uid,
          }),
        );
      }

      return {
        event: this.toEventRecord(current),
        applied: immediate,
        flagged: flagged.map((change) =>
          this.toPendingChange(change, current, true),
        ),
        updatedAt: current.updatedAt,
      };
    });
  }

  // ---------------------------------------------------------------- SPM-85 AC3, AC4, AC7

  /**
   * Confirms or rejects a flagged change.
   * - Whole change (no bookingId): confirm applies the proposed value now;
   *   reject keeps the original value and clears the impact assessment.
   * - One booking (bookingId): records the decision for that venue booking
   *   only. Other bookings' entries are untouched. When the last impacted
   *   booking is decided the change closes: Applied if every impacted booking
   *   was confirmed, otherwise Rejected (a value applies to the whole event,
   *   so it cannot be kept for one venue and dropped for another).
   */
  async resolveChange(
    identity: AuthenticatedUser | undefined,
    eventId: string,
    changeId: string,
    body: unknown,
  ) {
    this.requireCoordinatorRole(identity);
    const data = (body && typeof body === 'object' ? body : {}) as Record<
      string,
      unknown
    >;
    if (data.decision !== 'confirm' && data.decision !== 'reject')
      throw new BadRequestException({
        message: 'Choose to confirm or reject the change.',
        errors: { decision: 'Choose confirm or reject.' },
      });
    if (
      data.bookingId !== undefined &&
      (typeof data.bookingId !== 'string' || !data.bookingId)
    )
      throw new BadRequestException('Choose a valid venue booking.');
    const decision = data.decision;
    const bookingId = data.bookingId as string | undefined;

    return this.atomically(async () => {
      const { user, event } = await this.editableAccess(identity, eventId);
      const change = await this.repository.findChange(eventId, changeId);
      if (!change) throw new NotFoundException('Change not found.');
      if (change.status !== 'Needs Review')
        throw new ConflictException('This change has already been resolved.');

      const status =
        decision === 'confirm' ? ('Applied' as const) : ('Rejected' as const);
      const resolution = {
        status,
        resolvedBy: displayName(user),
        resolvedById: user.uid,
        resolvedAt: new Date(),
        ...(status === 'Rejected' ? { clearImpacts: true } : {}),
      };

      if (!bookingId) return this.closeChange(event, change, resolution);

      const entry = change.impacts.find(
        (impact) => impact.bookingId === bookingId,
      );
      if (!entry)
        throw new BadRequestException(
          'That venue booking is not affected by this change.',
        );
      if (!entry.impacted)
        throw new BadRequestException(
          'That venue booking has no impact to resolve.',
        );
      if (entry.decision)
        throw new ConflictException(
          'This venue booking has already been decided.',
        );

      const updated = await this.repository.resolveChange(eventId, change.id, {
        ...resolution,
        bookingId,
      });
      const decisions = change.impacts
        .filter((impact) => impact.impacted)
        .map((impact) =>
          impact.bookingId === bookingId ? status : impact.decision,
        );
      if (decisions.some((d) => d === undefined))
        return {
          event: this.toEventRecord(event),
          change: this.toPendingChange(updated, event, true),
          closed: false,
        };

      const outcome = decisions.every((d) => d === 'Applied')
        ? ('Applied' as const)
        : ('Rejected' as const);
      return this.closeChange(event, change, {
        ...resolution,
        status: outcome,
        ...(outcome === 'Rejected' ? { clearImpacts: true } : {}),
      });
    });
  }

  // ---------------------------------------------------------------- SPM-85 AC5

  /** Resolved changes, newest first: original → proposed, who, when, status. */
  async changeHistory(
    identity: AuthenticatedUser | undefined,
    eventId: string,
  ) {
    await this.access(identity, eventId);
    const rows = await this.repository.listHistory(eventId);
    return rows
      .filter((row) => row.status === 'Applied' || row.status === 'Rejected')
      .sort(
        (a, b) =>
          Date.parse(b.resolvedAt ?? '') - Date.parse(a.resolvedAt ?? ''),
      )
      .map((row) => ({
        id: row.id,
        field: row.field,
        originalValue: row.originalValue,
        proposedValue: row.proposedValue,
        // The value the event ended up with after the decision.
        resolvedValue:
          row.status === 'Applied' ? row.proposedValue : row.originalValue,
        resolvedBy: row.resolvedBy ?? '',
        resolvedAt: row.resolvedAt ?? '',
        status: row.status,
      }));
  }

  // ---------------------------------------------------------------- helpers

  private async closeChange(
    event: PlanningEventRow,
    change: FlaggedChangeRow,
    resolution: {
      status: 'Applied' | 'Rejected';
      resolvedBy: string;
      resolvedById: string;
      resolvedAt: Date;
      clearImpacts?: boolean;
    },
  ) {
    let current = event;
    if (resolution.status === 'Applied') {
      const patch = {
        [change.field]: change.proposedValue,
      } as EventUpdatePatch;
      this.checkMergedSchedule(event, patch);
      current = await this.repository.applyFields(
        event.id,
        patch,
        resolution.resolvedAt,
      );
    }
    const resolved = await this.repository.resolveChange(
      event.id,
      change.id,
      resolution,
    );
    return {
      event: this.toEventRecord(current),
      change: { ...resolved, currentValue: current[change.field] },
      closed: true,
    };
  }

  /** End must stay after start once merged with stored values (SPM-49 AC4). */
  private checkMergedSchedule(
    event: PlanningEventRow,
    patch: EventUpdatePatch,
  ) {
    if (patch.startDateTime === undefined && patch.endDateTime === undefined)
      return;
    const start = Date.parse(patch.startDateTime ?? event.startDateTime);
    const end = Date.parse(patch.endDateTime ?? event.endDateTime);
    if (end <= start)
      throw new BadRequestException({
        message: 'Please correct the highlighted fields.',
        errors: {
          [patch.endDateTime !== undefined ? 'endDateTime' : 'startDateTime']:
            'End must be after start.',
        },
      });
  }

  private hasArrangements(
    bookings: VenueBookingRow[],
    equipment: EquipmentArrangementRow[],
  ) {
    return (
      bookings.some(
        (b) => !INACTIVE_BOOKING_STATUSES.has(b.status.toLowerCase()),
      ) ||
      equipment.some(
        (e) => !INACTIVE_EQUIPMENT_STATUSES.has(e.status.toLowerCase()),
      )
    );
  }

  private toPendingChange(
    change: FlaggedChangeRow,
    event: PlanningEventRow,
    withImpacts: boolean,
  ) {
    return {
      id: change.id,
      kind: change.kind,
      field: change.field,
      currentValue: event[change.field],
      proposedValue: change.proposedValue,
      status: change.status,
      proposedBy: change.proposedBy,
      createdAt: change.createdAt,
      // Impacts name other organisers' events; only the coordinator sees them.
      ...(withImpacts
        ? {
            impacts: change.impacts as StoredBookingImpact[],
            equipmentImpacts: change.equipmentImpacts ?? [],
          }
        : {}),
    };
  }

  /** The same shape GET /api/events/:id returns, minus attachment payloads. */
  private toEventRecord(row: PlanningEventRow) {
    return {
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      description: row.description,
      organiserId: row.organiserId,
      organiserName: row.organiserName ?? '',
      coordinatorId: row.coordinatorId ?? undefined,
      coordinatorName: row.coordinatorName ?? undefined,
      status: row.status.toLowerCase(),
      startDateTime: row.startDateTime,
      endDateTime: row.endDateTime,
      expectedAttendance: row.expectedAttendance,
      venueRequirements: {
        minCapacity: row.expectedAttendance,
        layout: row.layout,
        facilities: row.facilities,
        accessibility: row.accessibility,
      },
      equipmentNeeds: row.equipmentNeeds,
      registrationEnabled: row.registrationEnabled ?? false,
      changeRequests: [],
      createdAt: row.createdAt ?? row.updatedAt,
      updatedAt: row.updatedAt,
    };
  }

  private requireCoordinatorRole(identity: AuthenticatedUser | undefined) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    // SPM-97 AC4: organisers (and every other role) can never write.
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException(
        'Only the assigned coordinator can change event information.',
      );
  }

  private async access(
    identity: AuthenticatedUser | undefined,
    eventId: string,
  ): Promise<Access> {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (
      !identity.roles.includes('ORGANISER') &&
      !identity.roles.includes('COORDINATOR')
    )
      throw new ForbiddenException('Organiser or coordinator access required.');
    if (!UUID.test(eventId)) throw new NotFoundException('Event not found.');
    const event = await this.repository.findEvent(eventId);
    if (!event) throw new NotFoundException('Event not found.');
    const isCoordinator =
      identity.roles.includes('COORDINATOR') &&
      event.coordinatorId === identity.uid;
    const isOwner =
      identity.roles.includes('ORGANISER') &&
      event.organiserId === identity.uid;
    if (!isCoordinator && !isOwner)
      throw new NotFoundException('Event not found.');
    return { user: identity, event, isCoordinator };
  }

  private async editableAccess(
    identity: AuthenticatedUser | undefined,
    eventId: string,
  ) {
    const access = await this.access(identity, eventId);
    if (!access.isCoordinator) throw new NotFoundException('Event not found.');
    if (!EDITABLE_STATUSES.has(access.event.status.toLowerCase()))
      throw new ConflictException(
        'Event information can only be changed after approval and before confirmation.',
      );
    return access;
  }

  /** Real repository: one DB transaction. Test doubles without it run as-is. */
  private atomically<T>(work: () => Promise<T>): Promise<T> {
    const repository = this.repository as Partial<
      Pick<EventPlanningRepository, 'runInTransaction'>
    >;
    return typeof repository.runInTransaction === 'function'
      ? repository.runInTransaction(work)
      : work();
  }
}

function displayName(user: AuthenticatedUser): string {
  return user.name ?? user.email ?? 'Coordinator';
}

function pick(
  patch: EventUpdatePatch,
  fields: EventFieldKey[],
): EventUpdatePatch {
  return Object.fromEntries(
    fields.map((field) => [field, patch[field]]),
  ) as EventUpdatePatch;
}

/** Date fields compare as instants; lists compare as sets; others strictly. */
function sameValue(
  field: EventFieldKey,
  stored: unknown,
  proposed: unknown,
): boolean {
  if (field === 'startDateTime' || field === 'endDateTime')
    return Date.parse(String(stored)) === Date.parse(String(proposed));
  if (Array.isArray(stored) && Array.isArray(proposed))
    return (
      stored.length === proposed.length &&
      proposed.every((v) => stored.includes(v))
    );
  return stored === proposed;
}

/**
 * What to assess for one flagged field. Date/time fields use every time field
 * in this update so a shifted event is assessed as one move, not two halves.
 */
function proposalFor(
  field: EventFieldKey,
  patch: EventUpdatePatch,
): ProposedChange {
  switch (field) {
    case 'startDateTime':
    case 'endDateTime':
      return {
        startDateTime: patch.startDateTime,
        endDateTime: patch.endDateTime,
      };
    case 'expectedAttendance':
      return { expectedAttendance: patch.expectedAttendance };
    case 'layout':
      return { layout: patch.layout };
    case 'facilities':
      return { facilities: patch.facilities };
    default:
      return {};
  }
}

function equipmentImpacts(
  field: EventFieldKey,
  equipment: EquipmentArrangementRow[],
): EquipmentImpact[] {
  const detail =
    field === 'equipmentNeeds'
      ? 'Check this reservation still matches the new equipment requirements'
      : 'Reservation period must move with the new event time';
  return equipment.map((item) => ({
    arrangementId: item.id,
    name: item.name,
    quantity: item.quantity,
    detail,
  }));
}
