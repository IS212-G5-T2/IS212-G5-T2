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
 * Verified identity placed on the request after local-session validation.
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

/** Authenticated account resolved after PostgreSQL verifies its credentials. */
export type AuthAccount = AuthenticatedUser;

/** Authenticated account resolved from an active persisted session. */
export interface SessionUser extends AuthenticatedUser {
  sessionId: string;
}

export interface AuthConfig {
  cookieName: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
}

export interface AuthAccountRow {
  id: string;
  email: string;
  display_name: string;
  roles: UserRole[];
}

export interface SessionRow {
  session_id: string;
  id: string;
  email: string;
  display_name: string;
  roles: UserRole[];
}
