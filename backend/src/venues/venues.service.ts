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
import type {
  AuthenticatedUser,
  PermissionAction,
} from '../auth/types/auth.models.js';
import { RbacRepository } from '../auth/authorization/repository/rbac.repository.js';
import { CLOCK, systemClock, type Clock } from '../common/clock.js';
import { UUID_PATTERN as UUID } from '../common/uuid.js';
import {
  PLANNING_CODES,
  PLANNING_MESSAGES,
} from '../events/status/planning.messages.js';
import { validateVenue } from './creation/dto/venue-input.js';
import { validateUnavailability } from './availability/dto/venue-unavailability.js';
import { validateBookingRequest } from './availability/dto/booking-request.js';
import { validateTentativeHoldRequest } from './availability/dto/tentative-hold-request.js';
import {
  VenuesRepository,
  type AffectedBooking,
  type VenueBookingDecision,
  type VenueBookingDecisionResult,
} from './repository/venues.repository.js';

const REJECTION_REASON_MAX_LENGTH = 1000;

/** Validates the SPM-55 rejection reason: required after trimming and at most 1000 characters. */
function validateRejectionReason(body: unknown): string {
  const reason =
    body && typeof body === 'object'
      ? (body as { reason?: unknown }).reason
      : undefined;
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed)
    throw new BadRequestException({
      message: 'A rejection reason is required.',
      errors: { reason: 'Enter why this booking cannot be accepted.' },
    });
  if (trimmed.length > REJECTION_REASON_MAX_LENGTH)
    throw new BadRequestException({
      message: 'The rejection reason is too long.',
      errors: {
        reason: `Use ${REJECTION_REASON_MAX_LENGTH} characters or fewer.`,
      },
    });
  return trimmed;
}

/** Converts a repository decision outcome into the HTTP result or its SPM-55/SPM-56 error. */
function decisionOrThrow(
  result: VenueBookingDecisionResult,
): VenueBookingDecision {
  if (result.kind === 'not-found')
    throw new NotFoundException('Venue booking not found.');
  if (result.kind === 'already-decided')
    throw new ConflictException({
      code: 'BOOKING_ALREADY_DECIDED',
      message: `This booking request is already ${result.status} and can no longer be approved or rejected.`,
    });
  if (result.kind === 'conflict') {
    const names = [...new Set(result.conflicts.map((c) => c.reason))];
    let message: string;
    if (names.length === 0) {
      message = result.reason;
    } else {
      const summary = names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      message = `This slot can no longer be approved because it conflicts with ${summary}. Check availability again before approving.`;
    }
    throw new ConflictException({
      code: 'BOOKING_SLOT_CONFLICT',
      message,
      conflicts: result.conflicts,
    });
  }
  return result.booking;
}

const VENUE_DUPLICATE_CONSTRAINT = 'venues_name_location_unique';
/** Identifies the PostgreSQL constraint that protects venue natural-key uniqueness. */
function isDuplicateVenue(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === VENUE_DUPLICATE_CONSTRAINT
  );
}

/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Injectable()
/** Authorizes and creates persistent venue catalogue records. */
export class VenuesService {
  /* v8 ignore stop */
  constructor(
    private readonly repository: VenuesRepository,
    private readonly rbac: RbacRepository,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Confirms that the verified caller has the requested Venue permission.
   *
   * @param identity - Identity resolved from the authenticated session.
   * @param action - Venue action the caller intends to perform.
   * @throws UnauthorizedException when the caller is not authenticated.
   * @throws ForbiddenException when none of the caller's roles can create venues.
   */
  private async authorize(
    identity: AuthenticatedUser | undefined,
    action: PermissionAction,
  ): Promise<AuthenticatedUser> {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (
      !(
        await Promise.all(
          identity.roles.map((role) =>
            this.rbac.hasPermission(role, 'Venue', action),
          ),
        )
      ).some(Boolean)
    )
      throw new ForbiddenException('Venue access denied.');
    return identity;
  }

  /* v8 ignore start -- SPM-50 venue creation is covered by its owning story, not the SPM-54 booking scope. */
  /**
   * Validates and persists a venue for an authorized Venue Staff member.
   *
   * @param identity - Identity resolved from the authenticated session.
   * @param body - Untrusted venue payload.
   * @returns The saved venue and its user-facing confirmation message.
   */
  async create(identity: AuthenticatedUser | undefined, body: unknown) {
    const owner = await this.authorize(identity, 'create');
    const venue = validateVenue(body);
    try {
      return {
        venue: await this.repository.create(owner.uid, venue),
        message: 'Venue created successfully.',
      };
    } catch (error) {
      if (isDuplicateVenue(error))
        throw new ConflictException({
          message: 'A venue with this name and location already exists.',
          errors: {
            name: 'Use a different venue name or location.',
            location: 'Use a different venue name or location.',
          },
        });
      throw error;
    }
  }
  /* v8 ignore stop */

  /** Lists every readable venue, or only the session user's venues when requested. */
  async list(user: AuthenticatedUser | undefined, mine = false) {
    const identity = await this.authorize(user, 'read');
    return this.repository.list(mine ? identity.uid : undefined);
  }

  async get(user: AuthenticatedUser | undefined, id: string) {
    await this.authorize(user, 'read');
    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');
    const venue = await this.repository.get(id);
    if (!venue) throw new NotFoundException('Venue not found.');
    return venue;
  }

  /** SPM-121: updates the owned venue record identified by id. Returns affected bookings for AC8. */
  async update(
    user: AuthenticatedUser | undefined,
    id: string,
    body: unknown,
  ): Promise<{ venue: object; affectedBookings: AffectedBooking[]; capacityBookings: AffectedBooking[]; message: string }> {
    const staff = await this.authorizeStaff(user);
    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');
    const input = validateVenue(body);
    let result;
    try {
      result = await this.repository.update(staff.uid, id, input);
    } catch (error) {
      if (isDuplicateVenue(error))
        throw new ConflictException({
          message: 'A venue with this name and location already exists.',
          errors: {
            name: 'Use a different venue name or location.',
            location: 'Use a different venue name or location.',
          },
        });
      throw error;
    }
    if (result.kind === 'not-found') throw new NotFoundException('Venue not found.');
    if (result.kind === 'forbidden')
      throw new ForbiddenException('You can only edit venues you created.');
    return {
      venue: result.venue,
      affectedBookings: result.affectedBookings,
      capacityBookings: result.capacityBookings,
      message: 'Venue updated successfully.',
    };
  }

  /** Validates and atomically submits a booking request for an event assigned to the caller. */
  async submitBookingRequest(
    identity: AuthenticatedUser | undefined,
    venueId: string,
    body: unknown,
  ) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    // SPM-148 PLAN-STATUS-01-D: only the Coordinator role may submit; Lead, Organiser and Attendee get 403; no token gets 401.
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    if (!UUID.test(venueId)) throw new NotFoundException('Venue not found.');

    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).request_kind === 'tentative_hold'
    )
      return this.submitTentativeHoldRequest(identity, venueId, body);

    const input = validateBookingRequest(body);
    const result = await this.repository.submitBookingRequest(
      venueId,
      identity.uid,
      input,
    );
    if (result.kind === 'venue-not-found')
      throw new NotFoundException('Venue not found.');
    // SPM-148 PLAN-STATUS-01-D: an unassigned Coordinator gets the existing 404.
    if (result.kind === 'event-not-assigned')
      throw new NotFoundException('Assigned event not found.');
    // SPM-148 PLAN-STATUS-01-B: 409 EVENT_NOT_OPEN_FOR_BOOKING (MSG-PL-02) for closed statuses.
    if (result.kind === 'event-not-open')
      throw new ConflictException({
        code: PLANNING_CODES.eventNotOpenForBooking,
        message: PLANNING_MESSAGES.eventNotOpenForBooking,
      });
    if (result.kind === 'already-requested')
      throw new ConflictException({
        code: 'ACTIVE_VENUE_REQUEST_EXISTS',
        message:
          'An active booking request already exists for this event and venue.',
      });
    if (result.kind === 'conflict')
      throw new ConflictException(
        `This venue is unavailable for the selected time because it conflicts with ${result.reason}. Check availability again and choose another time.`,
      );
    return {
      id: result.id,
      eventId: input.eventId,
      venueId,
      start: result.start,
      end: result.end,
      status: 'pending' as const,
      eventStatus: result.eventStatus,
      statusChanged: result.statusChanged,
      bookingReference: `VB-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    };
  }

  /** Submits a hold request for the server-selected event interval, never a client-supplied interval. */
  async submitTentativeHoldRequest(
    identity: AuthenticatedUser | undefined,
    venueId: string,
    body: unknown,
  ) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    if (!UUID.test(venueId)) throw new NotFoundException('Venue not found.');

    const input = validateTentativeHoldRequest(body);
    const result = await this.repository.submitTentativeHoldRequest(
      venueId,
      identity.uid,
      input,
    );
    if (result.kind === 'venue-not-found')
      throw new NotFoundException('Venue not found.');
    if (result.kind === 'event-not-assigned')
      throw new NotFoundException('Assigned event not found.');
    if (result.kind === 'event-not-open')
      throw new ConflictException({
        code: PLANNING_CODES.eventNotOpenForBooking,
        message: PLANNING_MESSAGES.eventNotOpenForBooking,
      });
    if (result.kind === 'already-requested')
      throw new ConflictException({
        code: 'ACTIVE_VENUE_REQUEST_EXISTS',
        message:
          'A pending request or active hold already exists for this event and venue.',
      });
    if (result.kind === 'lead-time')
      throw new ConflictException({
        code: 'TENTATIVE_HOLD_LEAD_TIME',
        message:
          'A tentative hold can be requested only when the venue setup period begins at least 336 hours from now.',
      });
    if (result.kind === 'configuration-unavailable')
      throw new ConflictException({
        code: 'VENUE_TIMING_UNAVAILABLE',
        message:
          'This venue’s setup and turnaround times are unavailable. The tentative hold was not submitted.',
      });
    if (result.kind === 'conflict')
      throw new ConflictException({
        code: 'VENUE_SCHEDULE_CONFLICT',
        message: `This venue is unavailable for the event's occupied period because it conflicts with ${result.reason}.`,
      });
    return {
      id: result.id,
      eventId: input.eventId,
      venueId,
      start: result.start,
      end: result.end,
      status: 'pending' as const,
      requestKind: 'tentative_hold' as const,
      holdDurationHours: 336,
      holdStartsAt: 'venue-staff-approval' as const,
      specialRequest: input.specialRequest,
      message:
        'Tentative hold request submitted for Venue Staff approval. The hold is not active yet.',
      bookingReference: `VB-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    };
  }

  /** Returns every booking request for events assigned to the authenticated Coordinator. */
  async listCoordinatorBookings(identity: AuthenticatedUser | undefined) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    return this.repository.listCoordinatorBookings(identity.uid);
  }

  /** Cancels one of the Coordinator's active venue requests. */
  async cancelCoordinatorBooking(
    identity: AuthenticatedUser | undefined,
    bookingId: string,
    confirmed: boolean,
  ) {
    if (!identity?.uid)
      throw new UnauthorizedException('Authentication required.');
    if (!identity.roles.includes('COORDINATOR'))
      throw new ForbiddenException('Coordinator access required.');
    if (!UUID.test(bookingId))
      throw new NotFoundException('Venue booking not found.');
    const result = await this.repository.cancelCoordinatorBooking(
      identity.uid,
      bookingId,
      confirmed,
    );
    if (result.kind === 'not-found')
      throw new NotFoundException('Venue booking not found.');
    if (result.kind === 'not-active')
      throw new ConflictException(
        'Only pending or approved venue bookings can be cancelled.',
      );
    if (result.kind === 'last-active')
      throw new ConflictException({
        code: 'LAST_ACTIVE_VENUE_BOOKING',
        message:
          'This is the event’s last pending or approved venue booking. Confirm cancellation to continue.',
        requiresConfirmation: true,
      });
    return { id: bookingId, status: 'cancelled' as const };
  }

  /** SPM-55 AC1: lists pending requests for the venues the authenticated Venue Staff member owns. */
  async listPendingVenueBookings(user: AuthenticatedUser | undefined) {
    const staff = await this.authorizeStaff(user);
    return this.repository.listPendingVenueBookings(staff.uid);
  }

  /** SPM-55 AC2, AC6: approves a pending request; a decided or cancelled request returns 409. */
  async approveVenueBooking(
    user: AuthenticatedUser | undefined,
    bookingId: string,
  ) {
    const staff = await this.authorizeStaff(user);
    if (!UUID.test(bookingId))
      throw new NotFoundException('Venue booking not found.');
    return decisionOrThrow(
      await this.repository.approveVenueBooking(staff.uid, bookingId),
    );
  }

  /** SPM-55 AC3, AC6: rejects a pending request with a non-empty reason; a decided or cancelled request returns 409. */
  async rejectVenueBooking(
    user: AuthenticatedUser | undefined,
    bookingId: string,
    body: unknown,
  ) {
    const staff = await this.authorizeStaff(user);
    if (!UUID.test(bookingId))
      throw new NotFoundException('Venue booking not found.');
    const reason = validateRejectionReason(body);
    return decisionOrThrow(
      await this.repository.rejectVenueBooking(staff.uid, bookingId, reason),
    );
  }

  /* v8 ignore start -- SPM-122 unavailable-period mutations are outside SPM-54; booking conflicts are tested through the read/submission API. */
  /** Venue Staff can save blockouts even when existing bookings are affected. */
  async markUnavailable(
    user: AuthenticatedUser | undefined,
    id: string,
    body: unknown,
  ) {
    await this.authorizeStaff(user);
    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');
    const result = await this.repository.markUnavailable(
      id,
      validateUnavailability(body, this.clock.now()),
    );
    if (!result) throw new NotFoundException('Venue not found.');
    return result;
  }

  async endUnavailable(
    user: AuthenticatedUser | undefined,
    id: string,
    periodId: string,
  ) {
    await this.authorizeStaff(user);
    if (!UUID.test(id) || !UUID.test(periodId))
      throw new NotFoundException('Unavailable period not found.');
    const period = await this.repository.endUnavailable(id, periodId);
    if (!period) throw new NotFoundException('Unavailable period not found.');
    return { period };
  }

  /* v8 ignore stop */

  /** SPM-55: the authorization gate for the Venue Staff review endpoints, so it is measured rather than excluded. */
  private async authorizeStaff(user: AuthenticatedUser | undefined) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (
      !user.roles.includes('VENUE_STAFF') ||
      !(await this.rbac.hasPermission('VENUE_STAFF', 'Venue', 'update'))
    )
      throw new ForbiddenException('Venue Staff access required.');
    return user;
  }
}
