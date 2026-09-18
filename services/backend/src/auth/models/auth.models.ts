/*
 * Shared authentication and authorization model types used across middleware,
 * services, repositories, and tests.
 */
export type UserRole =
  | 'ORGANISER'
  | 'COORDINATOR'
  | 'VENUE_STAFF'
  | 'TECH_SUPPORT'
  | 'ATTENDEE';

export type PermissionAction = 'create' | 'read' | 'update' | 'delete';

/**
 * Verified identity placed on the request after Firebase token validation.
 */
export interface AuthenticatedUser {
  uid: string;
  roles: UserRole[];
  email?: string;
  name?: string;
}

/**
 * Resource/action requirement supplied by protected use cases before checking RBAC.
 */
export interface PermissionRequirement {
  resource: string;
  action: PermissionAction;
  ownerParam?: string;
}

export const CURRENT_USER_REQUEST_KEY = 'currentUser';

export const PUBLIC_ROUTES = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/healthz' },
] as const;
