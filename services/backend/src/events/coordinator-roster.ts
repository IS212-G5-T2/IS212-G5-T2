/*
 * SPM-38: local-only coordinator roster for round-robin assignment.
 *
 * There is no backend-queryable coordinator directory in this system — roles
 * live entirely in Firebase custom claims, and Postgres's `roles` table only
 * defines role names/permissions, not which UIDs hold them. Until a real
 * coordinator directory exists, this fixed, explicit list stands in for one,
 * matching the same "local/demo" pattern as DEMO_ORGANISER_ENABLED. The two
 * entries are the real local Firebase test accounts documented in
 * development/local-dev/README (coordinator@connectsphere.sg and
 * coor_tech@connectsphere.sg).
 */
export interface CoordinatorRosterEntry {
  id: string;
  name: string;
}

export const COORDINATOR_ROSTER: CoordinatorRosterEntry[] = [
  { id: 'ArEQUWmd20Y3yuvTOi8pEovnFLa2', name: 'coordinator@connectsphere.sg' },
  { id: '4L9nD2BXtIZMcNwaeBUF003z95J2', name: 'coor_tech@connectsphere.sg' },
];

/**
 * Picks the next coordinator in round-robin order.
 *
 * @param alreadyAssignedCount - Total number of events ever assigned a
 * coordinator so far. Using a count (rather than persisted cursor state)
 * keeps this stateless and safe under concurrent inserts, at the cost of
 * skipping a slot if an assigned event is later deleted.
 * @returns The coordinator whose turn it is next.
 */
export function pickNextCoordinator(alreadyAssignedCount: number): CoordinatorRosterEntry {
  return COORDINATOR_ROSTER[alreadyAssignedCount % COORDINATOR_ROSTER.length];
}
