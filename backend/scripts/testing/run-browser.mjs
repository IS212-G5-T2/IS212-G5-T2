// SPM-187: this harness no longer seeds anything. Seeding once per run made specs order- and
// repeat-dependent (a second --repeat-each iteration saw the first one's rows) and could not
// coexist with a per-test reset. Each test now resets the database and builds its own state
// through frontend/e2e/fixtures.ts, which calls browser-fixtures.mjs. This file's remaining job is
// to refuse a non-disposable database up front and start
// Playwright with the environment its servers need.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDisposable } from './reset-test-database.mjs';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to the database used by the browser test backend.',
  );
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
let code = 1;
try {
  // Fail fast and loudly, before starting two servers, if this is not a disposable database.
  await assertDisposable(db);
  code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      // Extra arguments (for example a spec path) are passed through to Playwright.
      ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
      {
        cwd: frontend,
        stdio: 'inherit',
        env: {
          ...process.env,
          // The servers Playwright starts (playwright.config.ts webServer) inherit this env, so the
          // backend under test talks to the same disposable database the per-test fixtures reset and seed
          // - never to DATABASE_URL's dev default. SPM-134's spec also requires the short expiry
          // interval, without which its hold-expiry assertions cannot pass.
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          // Must follow E2E_FRONTEND_PORT. Hardcoding 5173 here meant the backend allowed CORS for
          // an origin the frontend was not served on whenever the port was overridden, so every
          // login failed with "We couldn't sign you in" and every stack-dependent spec failed.
          FRONTEND_ORIGIN:
            process.env.FRONTEND_ORIGIN ?? `http://localhost:${process.env.E2E_FRONTEND_PORT ?? '5173'}`,
          TENTATIVE_HOLD_EXPIRY_INTERVAL_MS: process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS ?? '1000',
          // Specs that call the API directly read PLAYWRIGHT_API_URL; keep it on the same port the
          // Playwright config starts the backend on, so overriding E2E_BACKEND_PORT moves both.
          PLAYWRIGHT_API_URL:
            process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8080'}`,
          // Some specs open a second browser context, or build absolute app URLs, from
          // PLAYWRIGHT_BASE_URL. Publish it so those follow an overridden port too.
          PLAYWRIGHT_BASE_URL:
            process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.E2E_FRONTEND_PORT ?? '5173'}`,
        },
      },
    );
    child.on('error', reject);
    child.on('exit', (value) => resolve(value ?? 1));
  });
} finally {
  await db.end();
}
process.exitCode = code;
