import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';

// SPM-123: the Event Coordinator Lead assigns each unassigned request to one
// available coordinator; SPM-47: the Lead reassigns an assigned event to another.
// Only these statuses count towards a coordinator's workload and can be
// reassigned; Rejected, Completed and Cancelled events are finished.
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

type AssignedRow = {
  id: string;
  event_name: string;
  status: string;
  start_date_time: Date;
  end_date_time: Date;
  coordinator_id: string;
  coordinator_name: string;
  coordinator_available: boolean;
};

type AssignableCoordinator = { id: string; display_name: string; is_available: boolean };

type CoordinatorRow = {
  id: string;
  display_name: string;
  is_available: boolean;
  active_assignments: string;
};

// The Lead is never also a Coordinator (SPM-123 decision). Only seed data grants
// roles today, so an account wrongly given both is refused as the Lead and is
// never listed or assignable as a coordinator.
function requireLead(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user?.uid) throw new UnauthorizedException('Authentication required.');
  if (!user.roles.includes('COORDINATOR_LEAD'))
    throw new ForbiddenException('Event Coordinator Lead access required.');
  if (user.roles.includes('COORDINATOR'))
    throw new ForbiddenException('An Event Coordinator Lead cannot also be an Event Coordinator.');
  return user;
}

// Shared by the coordinator list and the assignment check so both apply the same rule.
const NOT_ALSO_LEAD = `NOT EXISTS (
            SELECT 1 FROM user_roles lead_roles
              JOIN roles lead_role ON lead_role.id = lead_roles.role_id
             WHERE lead_roles.user_id = users.id AND lead_role.name = 'COORDINATOR_LEAD')`;

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
        WHERE roles.name = 'COORDINATOR' AND users.is_active = true
          AND ${NOT_ALSO_LEAD}`,
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

      const coordinator = await this.availableCoordinator(client, coordinatorId);

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

  // SPM-47 AC1/AC11: every active event that already has a coordinator, soonest
  // first, flagged when that coordinator is currently unavailable.
  async assigned(identity: AuthenticatedUser | undefined) {
    requireLead(identity);
    const result = await this.database.query<AssignedRow>(
      `SELECT events.id, events.event_name, events.status, events.start_date_time, events.end_date_time,
              events.coordinator_id, events.coordinator_name,
              COALESCE(users.is_available, false) AS coordinator_available
         FROM events
         LEFT JOIN users ON users.id::text = events.coordinator_id
        WHERE events.coordinator_id IS NOT NULL AND events.status = ANY($1)
        ORDER BY events.start_date_time ASC, events.id ASC`,
      [ACTIVE_STATUSES],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.event_name,
      status: row.status,
      startDateTime: row.start_date_time.toISOString(),
      endDateTime: row.end_date_time.toISOString(),
      coordinatorId: row.coordinator_id,
      coordinatorName: row.coordinator_name,
      coordinatorAvailable: row.coordinator_available,
    }));
  }

  // SPM-47 AC3-AC8: move an assigned event to a different available coordinator
  // under a row lock. The page sends the coordinator it showed, so a stale page
  // can't undo a newer reassignment. Only the coordinator columns change, so
  // clarifications and decisions stay with the event; both coordinators are
  // notified in the same transaction.
  async reassign(identity: AuthenticatedUser | undefined, eventId: string, body: unknown) {
    const lead = requireLead(identity);
    if (!UUID.test(eventId)) throw new NotFoundException('Event not found.');
    const coordinatorId = parseCoordinatorId(body);
    const shownCoordinatorId = (body as { currentCoordinatorId?: unknown }).currentCoordinatorId;

    return this.database.transaction(async (client) => {
      const selected = await client.query(
        'SELECT id, event_name, status, coordinator_id, coordinator_name FROM events WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      const event = selected.rows[0];
      if (!event) throw new NotFoundException('Event not found.');
      if (!event.coordinator_id || !(ACTIVE_STATUSES as readonly string[]).includes(event.status))
        throw new ConflictException('This event can no longer be reassigned.');
      if (event.coordinator_id !== shownCoordinatorId)
        throw new ConflictException('This event was changed since you loaded the page. Refresh and try again.');
      if (event.coordinator_id === coordinatorId)
        throw new BadRequestException('Choose a different coordinator.');

      const coordinator = await this.availableCoordinator(client, coordinatorId);

      await client.query(
        `UPDATE events
            SET coordinator_id = $2, coordinator_name = $3, updated_at = now()
          WHERE id = $1`,
        [eventId, coordinator.id, coordinator.display_name],
      );
      // SPM-46: record the move so the new coordinator sees where it came from
      // and the previous one is told it was reassigned.
      await client.query(
        `INSERT INTO event_reassignments
           (id, event_id, from_coordinator_id, from_coordinator_name, to_coordinator_id, to_coordinator_name, reassigned_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          eventId,
          event.coordinator_id,
          event.coordinator_name,
          coordinator.id,
          coordinator.display_name,
          lead.uid,
        ],
      );
      // The original coordinator's unread notices saying the event is theirs
      // (first assignment, or an earlier reassignment to them) no longer apply.
      await client.query(
        `UPDATE notifications SET read = true
          WHERE recipient_id = $1 AND related_event_id = $2
            AND type IN ('coordinator_assignment', 'coordinator_reassignment') AND read = false`,
        [event.coordinator_id, eventId],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
         VALUES ($1, $2, 'coordinator_reassignment', $3, $4)`,
        [randomUUID(), coordinator.id, `Event "${event.event_name}" has been reassigned to you.`, eventId],
      );
      await client.query(
        `INSERT INTO notifications (id, recipient_id, type, message, related_event_id)
         VALUES ($1, $2, 'coordinator_unassignment', $3, $4)`,
        [
          randomUUID(),
          event.coordinator_id,
          `Event "${event.event_name}" has been reassigned to ${coordinator.display_name}.`,
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
        message: `Event "${event.event_name}" reassigned to ${coordinator.display_name}.`,
      };
    });
  }

  // Shared by assign and reassign: the chosen account must be an active
  // coordinator who is not also the Lead, and available right now. FOR SHARE
  // holds the coordinator's row until commit, so an availability change made at
  // the same moment waits instead of slipping in between.
  private async availableCoordinator(client: pg.PoolClient, coordinatorId: string): Promise<AssignableCoordinator> {
    const found = await client.query<AssignableCoordinator>(
      `SELECT users.id, users.display_name, users.is_available
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id
        WHERE users.id = $1 AND roles.name = 'COORDINATOR' AND users.is_active = true
          AND ${NOT_ALSO_LEAD}
        FOR SHARE OF users`,
      [coordinatorId],
    );
    const coordinator = found.rows[0];
    if (!coordinator) throw new BadRequestException('Choose an active Event Coordinator.');
    if (!coordinator.is_available) throw new ConflictException('This coordinator is unavailable.');
    return coordinator;
  }
}
