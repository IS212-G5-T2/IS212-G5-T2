import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to the database used by the browser test backend.',
  );
const name = `Draft browser ${randomUUID()}`;
const frontend = fileURLToPath(
  new URL('../../../../apps/frontend/', import.meta.url),
);
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
let code = 1;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test'],
      {
        cwd: frontend,
        stdio: 'inherit',
        env: { ...process.env, SPM37_TEST_NAME: name },
      },
    );
    child.on('error', reject);
    child.on('exit', (value) => resolve(value ?? 1));
  });
} finally {
  // Delete only the uniquely named record created by this browser run, in FK order.
  await db.query("DELETE FROM event_drafts WHERE fields->>'name'=$1", [name]);
  await db.query('DELETE FROM events WHERE event_name=$1', [name]);
  await db.end();
}
process.exitCode = code;
