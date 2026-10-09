/*
 * SPM-63 the single access rule behind the registration report and both exports (R1, R3, D3).
 * "Events I manage" ([A10]) means: the COORDINATOR assigned to the event, or the ORGANISER who owns it.
 * Identity and roles come from the verified session only; nothing from the query, body or headers is read here.
 */
import type { AuthenticatedUser } from '../../auth/models/auth.models.js';

/** The two owner columns of an event row (`coordinator_id`, `organiser_id`). */
export interface EventManagers {
  coordinatorId: string | null;
  organiserId: string | null;
}

export function canViewEventRegistrations(user: AuthenticatedUser, event: EventManagers): boolean {
  const isAssignedCoordinator = user.roles.includes('COORDINATOR') && event.coordinatorId === user.uid;
  const isOwningOrganiser = user.roles.includes('ORGANISER') && event.organiserId === user.uid;
  return isAssignedCoordinator || isOwningOrganiser;
}
