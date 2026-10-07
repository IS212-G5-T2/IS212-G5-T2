import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';

// SPM-123: the Event Coordinator Lead assigns each unassigned request to one
// available coordinator. Only these statuses count towards a coordinator's
// workload; Rejected, Completed and Cancelled events are finished.
export const ACTIVE_STATUSES = ['Submitted', 'Approved', 'Confirmed'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QueueRow = {
  id: string;
  event_name: string;
  purpose: string;
  start_date_time: Date;
  end_date_time: Date;
  expected_attendance: number;
  created_at: Date;
};

type CoordinatorRow = {
  id: string;
  display_name: string;
  is_available: boolean;
  active_assignments: string;
};

function requireLead(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user?.uid) throw new UnauthorizedException('Authentication required.');
  if (!user.roles.includes('COORDINATOR_LEAD'))
    throw new ForbiddenException('Event Coordinator Lead access required.');
  return user;
}

function parseCoordinatorId(body: unknown): string {
  const value = (body as { coordinatorId?: unknown } | null)?.coordinatorId;
  if (typeof value !== 'string' || !UUID.test(value))
    throw new BadRequestException('Choose an active Event Coordinator.');
  return value;
}

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Injectable()
/* v8 ignore stop */
export class LeadAssignmentService {
  constructor(private readonly database: DatabaseService) {}

  // AC1/AC2: requests nobody has been assigned yet, oldest first so none waits forever.
  async queue(identity: AuthenticatedUser | undefined) {
    requireLead(identity);
    const result = await this.database.query<QueueRow>(
      `SELECT id, event_name, purpose, start_date_time, end_date_time, expected_attendance, created_at
         FROM events
        WHERE status = 'Submitted' AND coordinator_id IS NULL
        ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.event_name,
      purpose: row.purpose,
      startDateTime: row.start_date_time.toISOString(),
      endDateTime: row.end_date_time.toISOString(),
      expectedAttendance: row.expected_attendance,
      submittedAt: row.created_at.toISOString(),
    }));
  }

  // AC3/AC4: every active coordinator with availability and active workload,
  // fewest active assignments first, then by name.
  async coordinators(identity: AuthenticatedUser | undefined) {
    requireLead(identity);
    const statuses = ACTIVE_STATUSES.map((status) => `'${status}'`).join(', ');
    const result = await this.database.query<CoordinatorRow>(
      `SELECT users.id, users.display_name, users.is_available,
              (SELECT COUNT(*) FROM events
                WHERE events.coordinator_id = users.id::text
                  AND events.status IN (${statuses}))::text AS active_assignments
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id
        WHERE roles.name = 'COORDINATOR' AND users.is_active = true`,
    );
    return result.rows
      .map((row) => ({
        id: row.id,
        name: row.display_name,
        available: row.is_available,
        activeAssignments: Number(row.active_assignments),
      }))
      .sort(
        (a, b) =>
          a.activeAssignments - b.activeAssignments || a.name.localeCompare(b.name),
      );
  }

  // AC5/AC6/AC9: assign under a row lock, re-checking the coordinator's
  // availability inside the transaction so a stale list can't assign someone
  // who just went unavailable. The assignment and its notification commit together.
  async assign(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    requireLead(identity);
    if (!UUID.test(eventId)) throw new NotFoundException('Event request not found.');
    const coordinatorId = parseCoordinatorId(body);

    return this.database.transaction(async (client) => {
      const selected = await client.query(
        'SELECT id, event_name, status, coordinator_id FROM events WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      const event = selected.rows[0];
      if (!event) throw new NotFoundException('Event request not found.');
      if (event.coordinator_id)
        throw new ConflictException('This event request has already been assigned.');
      if (event.status !== 'Submitted')
        throw new ConflictException('This event request is no longer awaiting assignment.');

      // FOR SHARE holds the coordinator's row until commit, so an availability
      // change made at the same moment waits instead of slipping in between.
      const found = await client.query<{ id: string; display_name: string; is_available: boolean }>(
        `SELECT users.id, users.display_name, users.is_available
           FROM users
           JOIN user_roles ON user_roles.user_id = users.id
           JOIN roles ON roles.id = user_roles.role_id
          WHERE users.id = $1 AND roles.name = 'COORDINATOR' AND users.is_active = true
          FOR SHARE OF users`,
        [coordinatorId],
      );
      const coordinator = found.rows[0];
      if (!coordinator) throw new BadRequestException('Choose an active Event Coordinator.');
      if (!coordinator.is_available) throw new ConflictException('This coordinator is unavailable.');

      await client.query(
        `UPDATE events
            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()
          WHERE id = $1`,
        [eventId, coordinator.id, coordinator.display_name],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
         VALUES ($1, $2, 'coordinator_assignment', $3, $4)`,
        [
          randomUUID(),
          coordinator.id,
          `New event request "${event.event_name}" is awaiting your review.`,
          eventId,
        ],
      );
      return {
        event: {
          id: eventId,
          name: event.event_name,
          coordinatorId: coordinator.id,
          coordinatorName: coordinator.display_name,
        },
        message: `Event request "${event.event_name}" assigned to ${coordinator.display_name}.`,
      };
    });
  }
}
