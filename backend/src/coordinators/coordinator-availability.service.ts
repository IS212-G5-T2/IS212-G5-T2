import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';

type AvailabilityRow = { is_available: boolean };

// SPM-80: a coordinator's own "can take new event assignments" setting.
// The account always comes from the session, so a coordinator can only read or
// change their own availability. Saving it only updates users.is_available and
// never touches events, so current assignments stay as they are (AC2).
function requireCoordinator(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user?.uid) throw new UnauthorizedException('Authentication required.');
  if (!user.roles.includes('COORDINATOR'))
    throw new ForbiddenException('Coordinator access required.');
  return user;
}

// Accepts exactly { available: true | false } and nothing else, so text such
// as "false" can't be saved as available and no other user can be named.
function parseAvailability(body: unknown): boolean {
  const valid =
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    typeof (body as { available?: unknown }).available === 'boolean';
  if (!valid) throw new BadRequestException('Availability must be true or false.');
  return (body as { available: boolean }).available;
}

function toAvailability(row: AvailabilityRow | undefined) {
  if (!row) throw new NotFoundException('Coordinator account not found.');
  return { available: row.is_available };
}

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Injectable()
/* v8 ignore stop */
export class CoordinatorAvailabilityService {
  constructor(private readonly database: DatabaseService) {}

  async getMine(identity: AuthenticatedUser | undefined) {
    const user = requireCoordinator(identity);
    const result = await this.database.query<AvailabilityRow>(
      'SELECT is_available FROM users WHERE id = $1',
      [user.uid],
    );
    return toAvailability(result.rows[0]);
  }

  async updateMine(identity: AuthenticatedUser | undefined, body: unknown) {
    const user = requireCoordinator(identity);
    const available = parseAvailability(body);
    const result = await this.database.query<AvailabilityRow>(
      `UPDATE users SET is_available = $1, updated_at = now()
       WHERE id = $2
       RETURNING is_available`,
      [available, user.uid],
    );
    return toAvailability(result.rows[0]);
  }
}
