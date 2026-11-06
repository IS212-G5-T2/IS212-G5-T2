// SPM-187: the one place the frontend suite runs backend/scripts/testing/browser-fixtures.mjs, as a child process, so
// frontend/ takes no database dependency. Shared by fixtures.ts (per-test reset and seeding) and auth.setup.ts.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SESSIONS_FILE, type As, stateFile } from "./accounts";

const script = fileURLToPath(new URL("../../backend/scripts/testing/browser-fixtures.mjs", import.meta.url));

export function run(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [script, ...args], { env: process.env, maxBuffer: 10_000_000, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`browser-fixtures ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
      else resolve(stdout);
    });
    child.stdin?.end(stdin ?? "");
  });
}

export async function resetWithSessions(sessionsFile: string): Promise<void> {
  await run(["reset", sessionsFile]);
}

/** Reset to reference data and, when the `setup` project has written them, re-create every account's login session. */
export async function resetToReferenceData(): Promise<void> {
  await run(existsSync(SESSIONS_FILE) ? ["reset", SESSIONS_FILE] : ["reset"]);
}

/**
 * Fails with the cause and the fix when a spec asked to be signed in (`as`) but the saved logins are not there.
 * Without this the reset falls back to a plain reset, every `as` spec runs anonymous, and the failures read as
 * `TypeError: .map is not a function` or `expected 201, received 401` with nothing pointing at the missing file.
 * The sessions file is read here too, so a truncated or hand-edited file is named instead of failing inside the reset.
 */
export function assertSavedSessions(who: As): void {
  const fix = "They are written by the `setup` project (frontend/e2e/auth.setup.ts); run it first, e.g. through `npm run test:browser` in backend/ (which runs setup before the browser project), or `npx playwright test --project=setup`, and do not delete frontend/e2e/.auth between runs.";
  if (!existsSync(SESSIONS_FILE))
    throw new Error(`This test is signed in as "${who}" but there are no saved sessions: ${SESSIONS_FILE} does not exist. ${fix}`);
  try {
    const parsed: unknown = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not a JSON object of { email: token }");
  } catch (error) {
    throw new Error(`This test is signed in as "${who}" but the saved sessions file ${SESSIONS_FILE} is unreadable (${(error as Error).message}). ${fix}`);
  }
  if (!existsSync(stateFile(who)))
    throw new Error(`This test is signed in as "${who}" but its saved login ${stateFile(who)} does not exist. ${fix}`);
}
