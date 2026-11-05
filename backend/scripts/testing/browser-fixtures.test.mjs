// SPM-187: smoke test of the browser fixture builders against a disposable database (needs TEST_DATABASE_URL).
// Run: cd backend && TEST_DATABASE_URL=<db> npm run test:browser-fixtures
// Why a node-level test and not a Playwright spec: it asserts on database rows, and frontend/ takes no `pg`
// dependency (the point of the child-process design), so a spec could only check the values the builders echo back.
// Covers acceptance criterion 2 ("a venue with 30 min setup and 15 min turnaround, and an event at Approved, in one
// call") plus buildEvent({status}) and buildRegistration({status}). It resets the database first, as every browser test does.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { buildEvent, buildRegistration, buildScene, buildVenue, describeError, restoreSessions } from './browser-fixtures.mjs';
import { assertDisposable, resetTestDatabase } from './reset-test-database.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required (DATABASE_URL is deliberately not accepted).');
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

before(async () => {
  await db.connect();
  await assertDisposable(db);
  await resetTestDatabase(db);
});
after(() => db.end());

test('one scene call builds a 30/15-minute venue and an Approved event booking it', async () => {
  const scene = await buildScene(db, {
    venues: { hall: { setupMinutes: 30, turnaroundMinutes: 15 } },
    events: { main: { status: 'Approved', venue: 'hall' } },
  });
  const venue = (await db.query('SELECT setup_time_minutes, turnaround_time_minutes FROM venues WHERE id = $1', [scene.venues.hall.id])).rows[0];
  assert.deepEqual(venue, { setup_time_minutes: 30, turnaround_time_minutes: 15 });
  const event = (await db.query('SELECT status FROM events WHERE id = $1', [scene.events.main.id])).rows[0];
  assert.equal(event.status, 'Approved');
  const bookings = (await db.query('SELECT venue_id, status FROM venue_bookings WHERE event_id = $1', [scene.events.main.id])).rows;
  assert.deepEqual(bookings, [{ venue_id: scene.venues.hall.id, status: 'approved' }]);
});

test('buildEvent stores the requested status and buildRegistration the requested status', async () => {
  const { id: eventId } = await buildEvent(db, { status: 'Planning', capacity: 5 });
  assert.equal((await db.query('SELECT status, registration_enabled FROM events WHERE id = $1', [eventId])).rows[0].status, 'Planning');
  for (const status of ['Registered', 'Withdrawn']) {
    const { id } = await buildRegistration(db, { eventId, attendeeEmail: status === 'Registered' ? 'attendee1@connectsphere.test' : 'attendee2@connectsphere.test', status });
    const row = (await db.query('SELECT status, withdrawn_at FROM event_registrations WHERE id = $1', [id])).rows[0];
    assert.equal(row.status, status);
    assert.equal(row.withdrawn_at !== null, status === 'Withdrawn');
  }
});

test('buildVenue defaults to zero setup and turnaround', async () => {
  assert.deepEqual(await buildVenue(db, { name: 'defaults hall' }).then(({ setupMinutes, turnaroundMinutes }) => ({ setupMinutes, turnaroundMinutes })), { setupMinutes: 0, turnaroundMinutes: 0 });
});

test('describeError joins AggregateError members and Postgres detail', () => {
  assert.equal(describeError(new AggregateError([new Error('a'), new Error('b')])), 'a; b');
  assert.equal(describeError(Object.assign(new Error('dup'), { detail: 'Key exists', constraint: 'k', table: 't' })), 'dup (detail: Key exists, constraint: k, table: t)');
  assert.equal(describeError(Object.assign(new Error(''), { code: 'ECONNREFUSED' })), 'ECONNREFUSED');
});

test('restoreSessions re-creates a valid, unrevoked session per account after a reset, and only stores the hash', async () => {
  const sessions = { 'coordinator1@connectsphere.test': 'a'.repeat(64), 'lead@connectsphere.test': 'b'.repeat(64) };
  // A session left over from a previous test (here: revoked, as a logout would leave it) must not survive the reset.
  await restoreSessions(db, sessions);
  await db.query('UPDATE auth_sessions SET revoked_at = now()');
  await resetTestDatabase(db);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n, 0);

  assert.equal(await restoreSessions(db, sessions), 2);
  const rows = (await db.query(
    `SELECT u.email, s.token_hash, s.revoked_at, s.expires_at > now() + interval '300 days' AS far_future
       FROM auth_sessions s JOIN users u ON u.id = s.user_id ORDER BY u.email`)).rows;
  assert.deepEqual(rows.map((r) => r.email), Object.keys(sessions).sort());
  for (const row of rows) {
    assert.equal(row.token_hash, createHash('sha256').update(sessions[row.email]).digest('hex'));
    assert.equal(row.revoked_at, null);
    assert.equal(row.far_future, true);
  }
});

test('restoreSessions refuses an account that is not seeded', async () => {
  await resetTestDatabase(db);
  await assert.rejects(() => restoreSessions(db, { 'nobody@connectsphere.test': 'c'.repeat(64) }), /not seeded/);
});
