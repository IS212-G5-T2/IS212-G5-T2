// SPM-187: the one place the frontend suite runs backend/scripts/testing/browser-fixtures.mjs, as a child process, so
// frontend/ takes no database dependency. Shared by fixtures.ts (per-test reset and seeding) and auth.setup.ts.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SESSIONS_FILE } from "./accounts";

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
