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
import { PRESETS, buildEquipment, buildEvent, buildRegistration, buildScene, buildTentativeHold, buildVenue, describeError, restoreSessions } from './browser-fixtures.mjs';
import { DEADLOCK_SQLSTATE, assertDisposable, listResettableTables, resetTestDatabase } from './reset-test-database.mjs';

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

// ---- SPM-187 correction cycle (TR-01): every builder option and default, asserted on the stored row. -----------------
// Each test names the mutation it exists to kill. The Playwright specs use presets and db.scene far less than the
// builders offer, so a builder defect would otherwise surface only in a thirty-test suite built on top of it.
const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const row = async (sql, params) => (await db.query(sql, params)).rows[0];

test('buildVenue stores the requested capacity, location, owner and timings, and defaults capacity to 50', async () => {
  const venue = await buildVenue(db, { name: 'cap hall', capacity: 77, location: 'Annex', setupMinutes: 11, turnaroundMinutes: 7, ownerEmail: 'venue_staff2@connectsphere.test' });
  const stored = await row(
    `SELECT v.capacity, v.location, v.setup_time_minutes, v.turnaround_time_minutes, u.email AS owner FROM venues v JOIN users u ON u.id = v.owner_user_id WHERE v.id = $1`, [venue.id]);
  assert.deepEqual(stored, { capacity: 77, location: 'Annex', setup_time_minutes: 11, turnaround_time_minutes: 7, owner: 'venue_staff2@connectsphere.test' });
  const defaults = await buildVenue(db, {});
  const storedDefaults = await row('SELECT v.capacity, v.location, u.email AS owner FROM venues v JOIN users u ON u.id = v.owner_user_id WHERE v.id = $1', [defaults.id]);
  assert.deepEqual(storedDefaults, { capacity: 50, location: 'Browser Test Building', owner: 'venue_staff1@connectsphere.test' });
});

test('buildEvent registration flag follows capacity, and the duration and window follow durationHours and startInDays', async () => {
  const before = Date.now();
  const open = await buildEvent(db, { capacity: 12, durationHours: 5, startInDays: 10 });
  const closed = await buildEvent(db, {});
  const o = await row('SELECT registration_enabled, registration_limit, start_date_time, end_date_time, registration_opens_at, registration_closes_at FROM events WHERE id = $1', [open.id]);
  assert.equal(o.registration_enabled, true);
  assert.equal(o.registration_limit, 12);
  assert.equal(o.end_date_time - o.start_date_time, 5 * hourMs);
  assert.ok(Math.abs(o.start_date_time - (before + 10 * dayMs)) < 60_000, 'startInDays: 10 starts ten days from now');
  assert.ok(o.registration_opens_at < new Date(), 'registration is already open');
  assert.equal(o.start_date_time - o.registration_closes_at, dayMs, 'registration closes a day before the start');
  const c = await row('SELECT registration_enabled, registration_opens_at, registration_closes_at FROM events WHERE id = $1', [closed.id]);
  assert.deepEqual(c, { registration_enabled: false, registration_opens_at: null, registration_closes_at: null });
});

test('buildEvent defaults: two hours long, 30 days out, Submitted, organised by Organiser 1 and assigned to Coordinator 1', async () => {
  const before = Date.now();
  const event = await buildEvent(db, {});
  const e = await row(
    `SELECT e.start_date_time, e.end_date_time, e.status, e.organiser_name, e.organiser_email, e.coordinator_name, o.email AS organiser_user, c.email AS coordinator_user
       FROM events e JOIN users o ON o.id::text = e.organiser_id::text JOIN users c ON c.id::text = e.coordinator_id::text WHERE e.id = $1`, [event.id]);
  assert.equal(e.end_date_time - e.start_date_time, 2 * hourMs);
  assert.ok(Math.abs(e.start_date_time - (before + 30 * dayMs)) < 60_000, 'default startInDays is 30');
  assert.equal(e.status, 'Submitted');
  assert.equal(e.organiser_user, 'organiser1@connectsphere.test');
  assert.equal(e.organiser_email, 'organiser1@connectsphere.test');
  assert.equal(e.coordinator_user, 'coordinator1@connectsphere.test');
  const users = (await db.query("SELECT email, display_name FROM users WHERE email = ANY($1)", [['organiser1@connectsphere.test', 'coordinator1@connectsphere.test']])).rows;
  const name = (email) => users.find((u) => u.email === email).display_name;
  assert.equal(e.organiser_name, name('organiser1@connectsphere.test'));
  assert.equal(e.coordinator_name, name('coordinator1@connectsphere.test'));
});

test('buildEvent keeps the organiser and the coordinator apart when both are overridden', async () => {
  const event = await buildEvent(db, { organiserEmail: 'organiser2@connectsphere.test', coordinatorEmail: 'coordinator2@connectsphere.test' });
  const e = await row(
    `SELECT e.organiser_email, e.coordinator_name, o.email AS organiser_user, c.email AS coordinator_user, c.display_name AS coordinator_display
       FROM events e JOIN users o ON o.id::text = e.organiser_id::text JOIN users c ON c.id::text = e.coordinator_id::text WHERE e.id = $1`, [event.id]);
  assert.equal(e.organiser_user, 'organiser2@connectsphere.test');
  assert.equal(e.organiser_email, 'organiser2@connectsphere.test');
  assert.equal(e.coordinator_user, 'coordinator2@connectsphere.test');
  assert.equal(e.coordinator_name, e.coordinator_display);
});

test('an event that books a venue gets an approved booking for exactly its own window', async () => {
  const { id: venueId } = await buildVenue(db, {});
  const event = await buildEvent(db, { venueId, durationHours: 3 });
  const stored = await row('SELECT start_at, end_at, status FROM venue_bookings WHERE event_id = $1', [event.id]);
  assert.equal(stored.status, 'approved');
  assert.equal(stored.start_at.toISOString(), event.startAt);
  assert.equal(stored.end_at.toISOString(), event.endAt);
  assert.equal(stored.end_at - stored.start_at, 3 * hourMs);
});

test('buildEquipment stores an active, available pool of the requested size, type and location', async () => {
  const item = await buildEquipment(db, { name: 'lamp pool', quantity: 7, type: 'Audio', location: 'Bedok' });
  assert.equal(item.quantity, 7);
  const stored = await row('SELECT equipment_name, equipment_type, quantity, active_quantity, under_maintenance_quantity, retired_quantity, location, is_available, maintenance_status FROM equipment WHERE id = $1', [item.id]);
  assert.deepEqual(stored, { equipment_name: 'lamp pool', equipment_type: 'Audio', quantity: 7, active_quantity: 7, under_maintenance_quantity: 0, retired_quantity: 0, location: 'Bedok', is_available: true, maintenance_status: 'Active' });
  const defaults = await buildEquipment(db, {});
  assert.deepEqual(await row('SELECT quantity, active_quantity, equipment_type, location FROM equipment WHERE id = $1', [defaults.id]), { quantity: 1, active_quantity: 1, equipment_type: 'Lighting', location: 'Tampines' });
});

test('buildTentativeHold inserts an approved tentative hold of the venue for the event, expiring when asked', async () => {
  const { id: venueId } = await buildVenue(db, {});
  const { id: eventId } = await buildEvent(db, {});
  const expiresAt = new Date(Date.now() + 5 * hourMs);
  const hold = await buildTentativeHold(db, { venueId, eventId, expiresAt, startInDays: 12 });
  assert.equal(hold.expiresAt, expiresAt.toISOString());
  const stored = await row('SELECT venue_id, event_id, status, request_kind, hold_expires_at, start_at, end_at FROM venue_bookings WHERE id = $1', [hold.id]);
  assert.equal(stored.venue_id, venueId);
  assert.equal(stored.event_id, eventId);
  assert.equal(stored.status, 'approved');
  assert.equal(stored.request_kind, 'tentative_hold');
  assert.equal(stored.hold_expires_at.toISOString(), expiresAt.toISOString());
  assert.equal(stored.end_at - stored.start_at, hourMs);
  assert.ok(Math.abs(stored.start_at - (Date.now() + 12 * dayMs)) < 60_000);
});

test('buildScene builds its equipment section, and returns every section it was given', async () => {
  const scene = await buildScene(db, {
    venues: { hall: { name: 'scene hall' } },
    events: { main: { name: 'scene event', venue: 'hall' } },
    equipment: { lamps: { name: 'scene lamps', quantity: 20 }, mics: { name: 'scene mics', quantity: 3 } },
    registrations: [{ event: 'main', attendee: 'attendee3@connectsphere.test' }],
  });
  assert.deepEqual(Object.keys(scene.equipment), ['lamps', 'mics']);
  const stored = (await db.query("SELECT equipment_name, quantity FROM equipment WHERE equipment_name IN ('scene lamps', 'scene mics') ORDER BY equipment_name")).rows;
  assert.deepEqual(stored, [{ equipment_name: 'scene lamps', quantity: 20 }, { equipment_name: 'scene mics', quantity: 3 }]);
  assert.equal(scene.registrations.length, 1);
  assert.equal(scene.registrations[0].eventId, scene.events.main.id);
});

test('buildScene rejects a reference to an event or a venue it did not build, naming it', async () => {
  await assert.rejects(() => buildScene(db, { registrations: [{ event: 'ghost', attendee: 'attendee1@connectsphere.test' }] }), /unknown event "ghost"/);
  await assert.rejects(() => buildScene(db, { events: { main: { venue: 'ghost' } } }), /Event "main" refers to unknown venue "ghost"/);
});

test('every preset runs on a freshly reset database and builds the rows it describes', async () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['auditTrail', 'holdExpiry', 'withdrawal']);

  await resetTestDatabase(db);
  const withdrawal = await PRESETS.withdrawal(db);
  const w = await row(`SELECT status, registration_limit, equipment_confirmed_at IS NOT NULL AS equipment_confirmed FROM events WHERE id = $1`, [withdrawal.eventId]);
  assert.deepEqual(w, { status: 'Confirmed', registration_limit: 2, equipment_confirmed: true });
  assert.equal((await row("SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1 AND status = 'Registered'", [withdrawal.eventId])).n, 2);
  assert.equal((await row("SELECT count(*)::int AS n FROM event_safety_checks WHERE event_id = $1 AND status = 'approved'", [withdrawal.eventId])).n, 1);
  assert.equal((await row("SELECT count(*)::int AS n FROM venue_bookings WHERE event_id = $1 AND status = 'approved'", [withdrawal.eventId])).n, 1);

  await resetTestDatabase(db);
  const audit = await PRESETS.auditTrail(db);
  assert.deepEqual(await row('SELECT quantity, active_quantity FROM equipment WHERE equipment_name = $1', [audit.equipmentName]), { quantity: 50, active_quantity: 50 });

  await resetTestDatabase(db);
  const hold = await PRESETS.holdExpiry(db);
  const holds = (await db.query(
    `SELECT b.id, v.name AS venue, b.hold_expires_at FROM venue_bookings b JOIN venues v ON v.id = b.venue_id
      WHERE b.request_kind = 'tentative_hold' AND b.status = 'approved' ORDER BY b.hold_expires_at`)).rows;
  assert.deepEqual(holds.map((h) => h.venue), [hold.expiredVenue, hold.reminderVenue, hold.releaseVenue]);
  assert.equal(holds[1].id, hold.reminderHoldId);
  assert.equal(holds[2].id, hold.releaseHoldId);
  assert.equal(holds[0].hold_expires_at.toISOString(), hold.expiredExpiresIso);
  assert.equal(holds[1].hold_expires_at.toISOString(), hold.reminderExpiresIso);
});

// ---- SPM-187 correction cycle (TR-02): the reset retries a deadlock, and only a deadlock. ---------------------------

// A client double: answers the marker and table-list queries, then runs `truncate` for the TRUNCATE and a canned count.
const fakeClient = (truncate) => ({
  async query(sql) {
    if (/to_regclass/.test(sql)) return { rows: [{ present: true }] };
    if (/pg_tables/.test(sql)) return { rows: [{ tablename: 'events' }] };
    if (/^TRUNCATE/.test(sql)) return truncate(sql);
    const table = /FROM "(\w+)"/.exec(sql)?.[1];
    return { rows: [{ n: { roles: 7, resources: 11, role_permissions: 31, users: 20, user_roles: 21 }[table] }] };
  },
});
const failure = (code) => Object.assign(new Error(`failure ${code}`), { code });

test('reset retries a deadlock with a growing backoff, logs each retry, and then succeeds', async () => {
  let attempts = 0;
  const logs = [];
  const waits = [];
  const client = fakeClient(() => { attempts += 1; if (attempts <= 2) throw failure(DEADLOCK_SQLSTATE); return { rows: [] }; });
  assert.deepEqual(await resetTestDatabase(client, { log: (m) => logs.push(m), wait: async (ms) => { waits.push(ms); }, backoffMs: 10 }), ['events']);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /deadlock detected during TRUNCATE \(attempt 1 of 6\); retrying in 10ms/);
});

test('reset gives up after the bounded number of deadlock retries and throws the deadlock', async () => {
  let attempts = 0;
  const client = fakeClient(() => { attempts += 1; throw failure(DEADLOCK_SQLSTATE); });
  await assert.rejects(() => resetTestDatabase(client, { deadlockRetries: 3, log: () => {}, wait: async () => {} }), { code: DEADLOCK_SQLSTATE });
  assert.equal(attempts, 4);
});

test('reset does not retry any other error, including a lock timeout or a foreign key violation', async () => {
  for (const code of ['55P03', '23503', '57014']) {
    let attempts = 0;
    const logs = [];
    const client = fakeClient(() => { attempts += 1; throw failure(code); });
    await assert.rejects(() => resetTestDatabase(client, { log: (m) => logs.push(m), wait: async () => {} }), { code });
    assert.equal(attempts, 1, `${code} must be thrown on the first attempt`);
    assert.deepEqual(logs, []);
  }
});

test('reset survives a REAL deadlock with another session and logs the retry', async (t) => {
  // Build the cycle the review observed: a "product" session holds a lock on the LAST resettable table and then asks for the
  // FIRST, while the reset (which locks tables in that order) holds the first and waits for the last. Postgres aborts one of
  // the two; with the product session asking first, it is the reset's deadlock check that fires and the reset is the victim.
  const tables = await listResettableTables(db);
  const [first, last] = [tables[0], tables[tables.length - 1]];
  const holder = new pg.Client({ connectionString: url });
  const resetter = new pg.Client({ connectionString: url });
  await holder.connect();
  await resetter.connect();
  t.after(async () => { await holder.end(); await resetter.end(); });
  await resetter.query("SET deadlock_timeout = '300ms'");
  await holder.query("SET deadlock_timeout = '2s'");
  await holder.query('BEGIN');
  await holder.query(`LOCK TABLE "${last}" IN ACCESS SHARE MODE`);

  const logs = [];
  const waits = [];
  const resetting = resetTestDatabase(resetter, { log: (m) => logs.push(m), wait: async (ms) => { waits.push(ms); await new Promise((r) => setTimeout(r, ms)); }, backoffMs: 50 });
  // Wait until the reset is actually blocked on the held lock (it already owns the earlier tables), then close the cycle.
  for (let i = 0; i < 100; i += 1) {
    const { rows } = await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'TRUNCATE%'");
    if (rows.length) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const closing = holder.query(`LOCK TABLE "${first}" IN ACCESS SHARE MODE`).then(() => 'granted', (error) => `error ${error.code}`);
  // The reset is the victim, so the holder's request is granted once the reset's locks are released; the holder then
  // commits, which lets the retried TRUNCATE through.
  assert.equal(await closing, 'granted', 'the reset, not the other session, must be the deadlock victim in this construction');
  await holder.query('COMMIT');
  await resetting;
  assert.equal(logs.length >= 1, true, 'the retry was logged');
  assert.match(logs[0], /deadlock detected during TRUNCATE/);
  assert.equal(waits.length, logs.length);
});
