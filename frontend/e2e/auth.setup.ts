// SPM-187 stage 2: the `setup` project. It gives every seeded account a saved login (a Playwright storageState file)
// so a spec declares who it is with `test.use({ as: "coordinator" })` instead of typing into the login form.
//
// The hard part: frontend/e2e/fixtures.ts truncates auth_sessions before EVERY test, so a session created here
// would be gone by the first assertion and the app would bounce to /login. So the session is treated as a fixture,
// like any other seeded row. We generate one random token per account, put the raw token in that account's
// storageState cookie, and write all tokens to sessions.json. The reset (browser-fixtures.mjs `reset <sessions.json>`)
// re-inserts one fresh auth_sessions row per account (token_hash = sha256(token)) right after truncating. A logout
// inside a test only revokes that test's row; the next test's reset replaces it.
//
// This file uses @playwright/test directly, not ./fixtures: the auto reset there is per test and would not know the
// sessions yet. Tokens are generated here each run and never committed; AUTH_DIR is gitignored.
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, request, test as setup } from "@playwright/test";
import { ACCOUNTS, AUTH_DIR, EMAIL_DOMAIN, ROLE_ACCOUNTS, SESSIONS_FILE, emailOf, stateFile } from "./accounts";
import { resetWithSessions } from "./db-cli";

const cookieName = process.env.AUTH_COOKIE_NAME ?? "connectsphere_session";
const apiOrigin = process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? "8080"}`;
const frontendOrigin = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.E2E_FRONTEND_PORT ?? "5173"}`;

setup("authenticate every seeded account", async () => {
  rmSync(AUTH_DIR, { recursive: true, force: true });
  mkdirSync(AUTH_DIR, { recursive: true });

  // The cookie is host-scoped, not port-scoped, so one cookie serves the frontend and the API origin alike.
  const host = new URL(frontendOrigin).hostname;
  const expires = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const sessions: Record<string, string> = {};
  for (const account of ACCOUNTS) {
    const token = randomBytes(32).toString("hex");
    sessions[emailOf(account)] = token;
    const state = {
      cookies: [{ name: cookieName, value: token, domain: host, path: "/", expires, httpOnly: true, secure: false, sameSite: "Lax" }],
      origins: [],
    };
    writeFileSync(stateFile(account), JSON.stringify(state), { mode: 0o600 });
  }
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), { mode: 0o600 });

  // Leave the database exactly as a test's own reset will: truncated, with the sessions present.
  await resetWithSessions(SESSIONS_FILE);

  // Positive identity check: each state file must authenticate as ITS account (and nobody else), with the roles the
  // seed gives it. A mislabelled or swapped state file fails here, before any spec could pass as the wrong user.
  const roleOf = new Map(Object.values(ROLE_ACCOUNTS).map((entry) => [entry.account as string, entry.backendRole as string]));
  for (const account of ACCOUNTS) {
    const api = await request.newContext({ baseURL: apiOrigin, storageState: stateFile(account) });
    try {
      const response = await api.get("/api/auth/me");
      expect(response.status(), `${account}: GET /api/auth/me`).toBe(200);
      const me = (await response.json()) as { email?: string; roles: string[] };
      expect(me.email, `${account}: the state file must authenticate as its own account`).toBe(`${account}@${EMAIL_DOMAIN}`);
      const expectedRole = roleOf.get(account);
      if (expectedRole) expect(me.roles, `${account}: roles`).toContain(expectedRole);
    } finally {
      await api.dispose();
    }
  }
});
