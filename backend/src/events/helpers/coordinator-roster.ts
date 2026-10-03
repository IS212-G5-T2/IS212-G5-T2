/*
 * SPM-38: database-backed coordinator roster for round-robin assignment.
 *
 * Coordinators are real accounts in Postgres (users/user_roles/roles, seeded
 * in database/postgresql/init/002_seed_data.sql), so the roster is
 * queried live rather than hardcoded. Only active accounts holding the
 * COORDINATOR role are eligible. Ordered by email rather than created_at:
 * seed accounts are inserted in a single batch INSERT, so they all share the
 * same now()-derived created_at and sorting by it would really just be
 * sorting by the random UUID tiebreaker. Email is unique and stable, so it
 * gives a deterministic, predictable roster order instead.
 */
import pg from 'pg';

export interface CoordinatorRosterEntry {
  id: string;
  name: string;
}

export async function getCoordinatorRoster(
  client: pg.Pool | pg.PoolClient,
): Promise<CoordinatorRosterEntry[]> {
  const { rows } = await client.query<{ id: string; name: string }>(
    `SELECT users.id, users.display_name AS name
       FROM users
       JOIN user_roles ON user_roles.user_id = users.id
       JOIN roles ON roles.id = user_roles.role_id
      WHERE roles.name = 'COORDINATOR' AND users.is_active = true
      ORDER BY users.email`,
  );
  return rows;
}

/**
 * Picks the next coordinator in round-robin order.
 *
 * @param client - Pool or transaction client to query the live coordinator roster with.
 * @param alreadyAssignedCount - Total number of events ever assigned a
 * coordinator so far. Using a count (rather than persisted cursor state)
 * keeps this stateless and safe under concurrent inserts, at the cost of
 * skipping a slot if an assigned event is later deleted.
 * @returns The coordinator whose turn it is next, or undefined if there are
 * no active coordinator accounts to assign.
 */
export async function pickNextCoordinator(
  client: pg.Pool | pg.PoolClient,
  alreadyAssignedCount: number,
): Promise<CoordinatorRosterEntry | undefined> {
  const roster = await getCoordinatorRoster(client);
  if (roster.length === 0) return undefined;
  return roster[alreadyAssignedCount % roster.length];
}
