import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { ACTIVE_STATUSES } from '../lead/lead-assignment.service.js';

type AvailabilityRow = { is_available: boolean };
type UpdatedAvailabilityRow = AvailabilityRow & { display_name?: string; was_available?: boolean };

// SPM-80: a coordinator's own "can take new event assignments" setting.
// The account always comes from the session, so a coordinator can only read or
// change their own availability. Saving it updates users.is_available and never
// touches events, so current assignments stay as they are (AC2). SPM-47 AC10:
// going unavailable with active events tells the Lead those events may need
// reassignment; becoming available again marks that notice read.
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
    // The FROM subquery reads the value from before this update, so the Lead is
    // only told about an actual change from available to unavailable.
    const result = await this.database.query<UpdatedAvailabilityRow>(
      `UPDATE users SET is_available = $1, updated_at = now()
         FROM (SELECT is_available AS was_available FROM users WHERE id = $2) AS previous
        WHERE users.id = $2
        RETURNING users.is_available, users.display_name, previous.was_available`,
      [available, user.uid],
    );
    const row = result.rows[0];
    const saved = toAvailability(row);
    if (row.was_available === true && !row.is_available) await this.tellLead(user.uid, row.display_name ?? '');
    if (row.was_available === false && row.is_available) await this.clearLeadNotice(user.uid);
    return saved;
  }

  // AC10: one notice per Lead, naming the coordinator and their active events.
  private async tellLead(coordinatorId: string, name: string) {
    const counted = await this.database.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM events WHERE coordinator_id = $1 AND status = ANY($2)',
      [coordinatorId, ACTIVE_STATUSES],
    );
    const active = Number(counted.rows[0]?.count ?? 0);
    if (active === 0) return;
    const leads = await this.database.query<{ id: string }>(
      `SELECT users.id FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id
        WHERE roles.name = 'COORDINATOR_LEAD' AND users.is_active = true`,
    );
    const message = `${name} is now unavailable and has ${active} active event${active === 1 ? '' : 's'} that may need reassignment.`;
    for (const lead of leads.rows) {
      await this.database.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_user_id)
         VALUES ($1, $2, 'coordinator_unavailable', $3, $4)`,
        [randomUUID(), lead.id, message, coordinatorId],
      );
    }
  }

  // AC10: once the coordinator is available again, the Lead's notice no longer applies.
  private async clearLeadNotice(coordinatorId: string) {
    await this.database.query(
      `UPDATE notifications SET read = true
        WHERE type = 'coordinator_unavailable' AND related_user_id = $1 AND read = false`,
      [coordinatorId],
    );
  }
}
