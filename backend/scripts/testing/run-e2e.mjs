// SPM-185: run the backend integration suites against a disposable test database, and make it
// impossible for them to reach a developer's database instead.
//
// Why a wrapper rather than editing the suites: 51 of the 54 suites resolve
// `TEST_DATABASE_URL ?? DATABASE_URL`, so exporting DATABASE_URL alone is enough to point the
// whole set at the persistent dev database - and two of them re-apply migrations to whatever
// they are given, which rolls schema backwards. Instead of changing that resolution in 54
// files, this wrapper requires TEST_DATABASE_URL and then sets DATABASE_URL to the same value
// for the child process. Whichever variable a suite reads, it reads the test database.
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { MARKER_TABLE, assertDisposable } from './reset-test-database.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const testDbScript = fileURLToPath(new URL('../../../database/postgresql/scripts/test-db.sh', import.meta.url));

/**
 * Provision a disposable database so a plain `npm run test:e2e` is safe with no setup. Reusing an
 * already-running container makes this close to free on later runs. The container is deliberately
 * left running afterwards: per docker-compose/AGENTS.md an automation that starts services reports
 * that it did and whether they were left up for reuse, rather than tearing down behind the caller.
 */
function provision() {
  process.stderr.write('run-e2e: no TEST_DATABASE_URL; provisioning a disposable test database\n');
  try {
    const url = execFileSync('bash', [testDbScript, 'up'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
    if (!url.startsWith('postgres')) throw new Error(`test-db.sh up printed no connection URL (got: ${url || 'nothing'})`);
    process.stderr.write(`run-e2e: using ${url}\n         left running for reuse; remove it with: database/postgresql/scripts/test-db.sh down\n`);
    return url;
  } catch (error) {
    process.stderr.write(
      `run-e2e: could not provision a test database: ${error instanceof Error ? error.message : String(error)}\n\n` +
        'Start Docker and retry, or point TEST_DATABASE_URL at a database of your own.\n' +
        'DATABASE_URL is deliberately not accepted: these suites create, mutate and delete rows, and two\n' +
        'of them re-apply migrations, so they must never run against a developer or shared database.\n',
    );
    process.exit(1);
  }
}

/**
 * Requiring TEST_DATABASE_URL is not on its own a guard: it only moves the target, it does not make
 * the target disposable. Pointing it at a working database would run all 54 suites against it, and
 * those suites insert and delete rows - with ~22 still replaying migrations (SPM-194) and so rolling
 * schema backwards. So verify the database is actually marked disposable before handing it to vitest.
 *
 * The marker is a guard against accident, not authentication: anyone can create the table by hand.
 * It exists so that pointing this at a database nobody prepared for destruction fails loudly.
 */
async function assertTargetIsDisposable(connectionString) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    process.stderr.write(`run-e2e: could not connect to TEST_DATABASE_URL: ${error.message}\n`);
    process.exit(1);
  }
  try {
    await assertDisposable(client);
  } catch (error) {
    process.stderr.write(
      `run-e2e: ${error instanceof Error ? error.message : String(error)}\n\n` +
        'These suites insert and delete rows, and some still re-apply migrations, so they must only run\n' +
        'against a database prepared for destruction. Either use database/postgresql/scripts/test-db.sh,\n' +
        'which stamps the marker, or stamp your own throwaway database:\n\n' +
        `  CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (stamped_at timestamptz NOT NULL DEFAULT now(), owner text NOT NULL);\n` +
        `  INSERT INTO ${MARKER_TABLE} (owner) VALUES ('<who prepared it>');\n`,
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || provision();
await assertTargetIsDisposable(testDatabaseUrl);

if (process.env.DATABASE_URL && process.env.DATABASE_URL !== testDatabaseUrl) {
  process.stderr.write(
    `run-e2e: overriding DATABASE_URL for this run so the suites cannot reach it.\n` +
      `         was: ${process.env.DATABASE_URL}\n         now: ${testDatabaseUrl}\n`,
  );
}

const vitest = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));
const child = spawn(
  process.execPath,
  [vitest, 'run', '--config', './vitest.config.e2e.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, TEST_DATABASE_URL: testDatabaseUrl },
  },
);

child.on('error', (error) => {
  process.stderr.write(`run-e2e: failed to start vitest: ${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
