import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticatedUser,
  PermissionAction,
} from '../auth/models/auth.models.js';
import { RbacRepository } from '../auth/authorization/rbac.repository.js';
import { validateVenue } from './venue-input.js';
import { VenuesRepository } from './venues.repository.js';

const VENUE_DUPLICATE_CONSTRAINT = 'venues_name_location_unique';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async list(user: AuthenticatedUser | undefined) {
    const ownerId = await this.authorizeRead(user);
    return this.repository.list(ownerId);
  }

  async get(user: AuthenticatedUser | undefined, id: string) {
    const ownerId = await this.authorizeRead(user);
    if (!UUID.test(id)) throw new NotFoundException('Venue not found.');
    const venue = await this.repository.get(id, ownerId);
    if (!venue) throw new NotFoundException('Venue not found.');
    return venue;
  }

  private async authorizeRead(
    user: AuthenticatedUser | undefined,
  ): Promise<string | undefined> {
    const identity = await this.authorize(user, 'read');
    return identity.roles.includes('VENUE_STAFF') ? identity.uid : undefined;
  }
}
