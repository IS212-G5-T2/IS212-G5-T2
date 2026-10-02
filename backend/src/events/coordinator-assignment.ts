/*
 * SPM-123: workload-balanced coordinator assignment.
 *
 * A new event request goes to the active coordinator with the fewest
 * currently active requests. Ties go to whoever was assigned least recently
 * (never-assigned first), which makes equal workloads rotate like a round
 * robin instead of always favouring the same person. Any remaining tie keeps
 * the order the database returned, which is by email, so the choice is
 * deterministic.
 *
 * Coordinators are real accounts in Postgres (users/user_roles/roles, seeded in
 * database/postgresql/init/002_seed_data.sql). An account is eligible only when
 * it holds the COORDINATOR role and its account is active. Coordinator
 * availability (SPM-80) will add its filter to getEligibleCoordinators.
 *
 * A coordinator's last-assigned time is the newest created_at among the events
 * assigned to them. Auto-assignment happens in the same transaction that
 * inserts the event, so an event's created_at is the moment it was assigned.
 */
import pg from 'pg';

// Once a request reaches one of these statuses it no longer counts toward a
// coordinator's workload. The assignment itself is kept for the record.
export const TERMINAL_STATUSES = ['Rejected'];

export interface CoordinatorCandidate {
  id: string;
  name: string;
  activeLoad: number;
  lastAssignedAt: string | null;
}

interface CandidateRow {
  id: string;
  name: string;
  activeLoad: number;
  lastAssignedAt: Date | null;
}

export async function getEligibleCoordinators(
  client: pg.Pool | pg.PoolClient,
): Promise<CoordinatorCandidate[]> {
  const { rows } = await client.query<CandidateRow>(
    `SELECT users.id::text AS id,
            users.display_name AS name,
            (SELECT COUNT(*)::int
               FROM events
              WHERE events.coordinator_id = users.id::text
                AND events.status <> ALL($1::text[])) AS "activeLoad",
            (SELECT MAX(events.created_at)
               FROM events
              WHERE events.coordinator_id = users.id::text) AS "lastAssignedAt"
       FROM users
       JOIN user_roles ON user_roles.user_id = users.id
       JOIN roles ON roles.id = user_roles.role_id
      WHERE roles.name = 'COORDINATOR'
        AND users.is_active = true
      ORDER BY users.email`,
    [TERMINAL_STATUSES],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    activeLoad: row.activeLoad,
    lastAssignedAt: row.lastAssignedAt
      ? new Date(row.lastAssignedAt).toISOString()
      : null,
  }));
}

function byLoadThenLeastRecentlyAssigned(
  a: CoordinatorCandidate,
  b: CoordinatorCandidate,
): number {
  if (a.activeLoad !== b.activeLoad) return a.activeLoad - b.activeLoad;
  if (a.lastAssignedAt === b.lastAssignedAt) return 0;
  if (a.lastAssignedAt === null) return -1;
  if (b.lastAssignedAt === null) return 1;
  // Both are toISOString() values, so string order is chronological order.
  return a.lastAssignedAt < b.lastAssignedAt ? -1 : 1;
}

/**
 * Picks who should get the next request.
 *
 * @param candidates - Eligible coordinators, in the order the database gave.
 * @returns The chosen coordinator, or undefined if there is nobody to assign.
 */
export function selectCoordinator(
  candidates: CoordinatorCandidate[],
): CoordinatorCandidate | undefined {
  // Array.prototype.sort is stable, so equal candidates keep their input order.
  return [...candidates].sort(byLoadThenLeastRecentlyAssigned)[0];
}
