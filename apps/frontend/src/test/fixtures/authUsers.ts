/**
 * Mock Email/Password users used by the login tests.
 *
 * These are used to parameterize the "correct credentials" login tests so
 * every provisioned account is exercised, not just one happy path. The
 * password is shared across all seed accounts.
 *
 * Tests never hit real Firebase — `signInWithEmailAndPassword` is mocked in
 * every test file that imports this fixture. These are deliberately fake
 * credentials and must not match any real Firebase account.
 */
export interface SeedUser {
  role: string;
  email: string;
  password: string;
}

export const SEED_PASSWORD = "mock-only-password";

export const SEED_USERS: SeedUser[] = [
  { role: "attendee", email: "attendee@connectsphere.sg", password: SEED_PASSWORD },
  { role: "organiser", email: "organiser@connectsphere.sg", password: SEED_PASSWORD },
  { role: "coordinator", email: "coordinator@connectsphere.sg", password: SEED_PASSWORD },
  { role: "venue_staff", email: "venue_staff@connectsphere.sg", password: SEED_PASSWORD },
  { role: "tech_support", email: "technical_support@connectsphere.sg", password: SEED_PASSWORD },
];
