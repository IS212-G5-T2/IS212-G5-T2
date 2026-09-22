import type { User, UserRole } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

interface AuthUser {
  uid: string;
  email?: string;
  name?: string;
  roles: string[];
}

const roleByDatabaseRole: ReadonlyArray<{ databaseRole: string; role: UserRole }> = [
  { databaseRole: "ORGANISER", role: "organiser" },
  { databaseRole: "COORDINATOR", role: "coordinator" },
  { databaseRole: "VENUE_STAFF", role: "venue_staff" },
  { databaseRole: "TECH_SUPPORT", role: "tech_support" },
  { databaseRole: "ATTENDEE", role: "attendee" },
];

/** Converts the server-owned local account identity into the UI user model. */
export function toLocalUser(account: AuthUser): User | undefined {
  const databaseRoles = new Set(account.roles.map((role) => role.trim().toUpperCase()));
  const roles = roleByDatabaseRole
    .filter(({ databaseRole }) => databaseRoles.has(databaseRole))
    .map(({ role }) => role);
  const role = roles[0];
  if (!role) return undefined;

  return {
    id: account.uid,
    name: account.name ?? account.email ?? "Signed-in user",
    email: account.email ?? "",
    role,
    roles,
  };
}

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await readBody(response);
  if (!response.ok) throw new AuthError(response.status, body.message);
  const user = toLocalUser(body as AuthUser);
  if (!user) throw new AuthError(403, "This account does not have a supported ConnectSphere role.");
  return user;
}

export async function restoreSession(): Promise<User | undefined> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
  if (response.status === 401) return undefined;

  const body = await readBody(response);
  if (!response.ok) throw new AuthError(response.status, body.message);
  return toLocalUser(body as AuthUser);
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export class AuthError extends Error {
  constructor(readonly status: number, message?: string) {
    super(message || "We couldn't sign you in. Please try again.");
  }
}

async function readBody(response: Response): Promise<{ message?: string }> {
  try {
    return await response.json() as { message?: string };
  } catch {
    return {};
  }
}
