// SPM-187 stage 2: the seeded accounts the browser suite can sign in as, and where their saved sessions live.
// Nothing here is secret: the emails and the shared password are in database/README.md. What IS secret-like are the
// session tokens, which auth.setup.ts generates on every run and writes under AUTH_DIR (gitignored).
import { fileURLToPath } from "node:url";

export const AUTH_DIR = fileURLToPath(new URL("./.auth/", import.meta.url));
export const SESSIONS_FILE = `${AUTH_DIR}sessions.json`;
export const EMAIL_DOMAIN = "connectsphere.test";

/** Every seeded account (the 20 rows of the users table), named by the part of its email before the @. */
export const ACCOUNTS = [
  "organiser1", "organiser2", "organiser3",
  "coordinator1", "coordinator2", "coordinator3", "coordinator_venuestaff",
  "lead",
  "venue_staff1", "venue_staff2", "venue_staff3",
  "tech_support1", "tech_support2", "tech_support3",
  "safety_officer1", "safety_officer2", "safety_officer3",
  "attendee1", "attendee2", "attendee3",
] as const;
export type Account = (typeof ACCOUNTS)[number];

/** The account a test gets when it asks for a role. The backend role each one must carry is checked by auth.setup.ts. */
export const ROLE_ACCOUNTS = {
  organiser: { account: "organiser1", backendRole: "ORGANISER" },
  coordinator: { account: "coordinator1", backendRole: "COORDINATOR" },
  lead: { account: "lead", backendRole: "COORDINATOR_LEAD" },
  venue_staff: { account: "venue_staff1", backendRole: "VENUE_STAFF" },
  tech_support: { account: "tech_support1", backendRole: "TECH_SUPPORT" },
  safety_officer: { account: "safety_officer1", backendRole: "SAFETY_OFFICER" },
  attendee: { account: "attendee1", backendRole: "ATTENDEE" },
} as const;
export type Role = keyof typeof ROLE_ACCOUNTS;

/** A role (its default account) or one specific account, for the cases that need a particular user. */
export type As = Role | Account;

export const emailOf = (account: Account) => `${account}@${EMAIL_DOMAIN}`;

export function accountOf(who: As): Account {
  return who in ROLE_ACCOUNTS ? ROLE_ACCOUNTS[who as Role].account : (who as Account);
}

/** The Playwright storageState file for a role or an account. Exists only after the `setup` project has run. */
export const stateFile = (who: As) => `${AUTH_DIR}${accountOf(who)}.json`;
