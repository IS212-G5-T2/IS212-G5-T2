import {
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
import { validateVenue } from './creation/dto/venue-input.js';
import { validateUnavailability } from './availability/dto/venue-unavailability.js';
import { VenuesRepository } from './repository/venues.repository.js';

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

  private async authorizeStaff(user: AuthenticatedUser | undefined) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (
      !user.roles.includes('VENUE_STAFF') ||
      !(await this.rbac.hasPermission('VENUE_STAFF', 'Venue', 'update'))
    )
      throw new ForbiddenException('Venue Staff access required.');
  }
}
