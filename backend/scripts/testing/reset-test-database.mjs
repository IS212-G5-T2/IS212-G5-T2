// SPM-185: return a disposable test database to a known state between tests.
//
// Isolation is achieved by resetting contents, not by creating a database per test: the backend
// resolves DATABASE_URL once at boot and holds a connection pool, so a database per test would
// mean a process restart per test. A single TRUNCATE costs milliseconds and leaves the running
// stack alone.
//
// The table list is read from the catalogue on every call rather than hardcoded. A hardcoded
// list fails open - a table added next sprint would silently stop being reset and isolation
// would rot without anyone noticing. Reading the catalogue fails safe: a new table is truncated
// from the day it exists, and the only names written down are the few deliberately preserved.
import pg from 'pg';

// Written by database/postgresql/scripts/test-db.sh. Its absence means this is not a disposable
// database, and this module refuses to touch it. A developer database has no marker, so it
// cannot be truncated by accident even if TEST_DATABASE_URL is pointed at one.
export const MARKER_TABLE = 'spm_disposable_test_db';

// Reference and identity data, preserved across resets.
//
// Everything outside this list is truncated - and that includes the seeded demo data that
// database/postgresql/init/011, 012, 018-020, 026, 028, 030 and 036 create (sample venues, sample
// events, demo bookings). So a reset does NOT return the database to its freshly-initialised state:
// it returns it to reference data only. Suites that assert on seeded demo rows - for instance
// venues-booking-requests.e2e-spec.ts, which expects the SPM-51 sample venues - will fail after one.
// That is why this helper is not yet wired into any runner: the browser suites need per-test fixture
// builders first (SPM-187), and the backend suites either need the same or need seed restoration
// adding here.
//
// Preserving these is also a performance decision: the seeded accounts' password hashes are
// bcrypt, so re-seeding 20 users on every reset would dominate the cost of the reset itself.
// Nothing resets these tables, so a test that inserts into them and crashes leaves rows behind;
// the count check below surfaces that.
export const PRESERVED_TABLES = Object.freeze([
  MARKER_TABLE,
  'roles',
  'resources',
  'role_permissions',
  'users',
  'user_roles',
  'facilities',
  'room_layouts',
  'accessibility_features',
  'app_health_checks',
]);

// Reference tables that must still hold rows after a reset, with the row count a freshly
// initialised database has. If a future foreign key makes TRUNCATE ... CASCADE reach into preserved
// data, this turns a silent loss of login accounts into a loud failure on the first reset.
//
// Counts, not EXISTS: an existence check would pass with 1 of 20 users left, which is exactly the
// state that would make later logins fail for reasons no one could trace. The expected values match
// the ones database/README.md documents for a fresh database.
const MUST_REMAIN_POPULATED = Object.freeze({
  roles: 7,
  resources: 11,
  role_permissions: 31,
  users: 20,
  user_roles: 21,
});

const quoteIdentifier = (name) => `"${name.replace(/"/g, '""')}"`;

export async function assertDisposable(client) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${MARKER_TABLE}`]);
  if (!rows[0]?.present) {
    throw new Error(
      `Refusing to use the target database: it has no "${MARKER_TABLE}" marker, so it is not a disposable test database. ` +
        'Create one with database/postgresql/scripts/test-db.sh up and point TEST_DATABASE_URL at the URL it prints.',
    );
  }
}

export async function listResettableTables(client, preserve = PRESERVED_TABLES) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND NOT (tablename = ANY($1::text[]))
      ORDER BY tablename`,
    [preserve],
  );
  return rows.map((row) => row.tablename);
}

/**
 * Truncate every non-preserved table in the public schema and restart its identity sequences.
 * Returns the tables that were reset, so a caller can log or assert on them.
 */
export async function resetTestDatabase(client, { preserve = PRESERVED_TABLES } = {}) {
  await assertDisposable(client);

  const tables = await listResettableTables(client, preserve);
  if (tables.length > 0) {
    // One statement: TRUNCATE takes an ACCESS EXCLUSIVE lock per table, so truncating them
    // together avoids deadlocking against the foreign keys between them.
    await client.query(`TRUNCATE TABLE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
  }

  const damaged = [];
  for (const [table, expected] of Object.entries(MUST_REMAIN_POPULATED)) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdentifier(table)}`);
    const actual = rows[0]?.n ?? 0;
    // Fewer than expected means data was lost. More means a test added rows to a preserved table and
    // did not clean up - also worth surfacing, because nothing resets those tables.
    if (actual !== expected) damaged.push(`${table}: expected ${expected}, found ${actual}`);
  }
  if (damaged.length > 0) {
    throw new Error(
      `Reference data is not in its freshly-initialised state after reset:\n  ${damaged.join('\n  ')}\n` +
        'Fewer rows than expected: a new foreign key has most likely made TRUNCATE ... CASCADE reach into ' +
        'preserved data; re-seed the affected table or add the referencing table to PRESERVED_TABLES. ' +
        'More rows than expected: a test inserted into a preserved table without cleaning up, and nothing ' +
        'resets those tables. Update these counts deliberately if the init seed itself changed.',
    );
  }

  return tables;
}

/** Connect using TEST_DATABASE_URL, reset once, disconnect. For use outside a test runner. */
export async function resetFromEnvironment() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'TEST_DATABASE_URL is required. DATABASE_URL is deliberately not accepted: it points at the shared dev database. ' +
        'Run database/postgresql/scripts/test-db.sh up and export the URL it prints.',
    );
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await resetTestDatabase(client);
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const started = Date.now();
  try {
    const tables = await resetFromEnvironment();
    process.stderr.write(`reset ${tables.length} table(s) in ${Date.now() - started}ms\n`);
  } catch (error) {
    // A guard refusal is an expected operator error, not a crash: print the message, not a stack.
    process.stderr.write(`reset-test-database: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
