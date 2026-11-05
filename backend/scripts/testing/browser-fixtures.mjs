// SPM-187: fixture builders and named presets for the browser (Playwright) suite - one seeding layer.
//
// Before this module run-browser.mjs inserted its rows once per run, so a spec could pass once and
// fail on a repeat, and a per-test reset (reset-test-database.mjs) would have wiped them. Now every
// test resets the database and then builds exactly the state it needs here. Rows are inserted
// directly in SQL, not built through the API: create -> submit -> assign -> approve -> confirm ->
// enable registration -> register is slow and brittle for every test that needs a Confirmed event.
//
// Two ways in:
//   - the builders (buildVenue, buildEvent, buildEquipment, buildRegistration, buildTentativeHold)
//     and buildScene(db, scene), which composes them in one call and returns every row it made;
//   - the named presets (PRESETS), which are scenes that older specs need verbatim.
//
// The frontend fixture (frontend/e2e/fixtures.ts) reaches this through the CLI below so frontend/
// takes no database dependency:
//   TEST_DATABASE_URL=<db> node browser-fixtures.mjs reset
//   TEST_DATABASE_URL=<db> node browser-fixtures.mjs seed   < scene.json   (prints the result as JSON)
//   TEST_DATABASE_URL=<db> node browser-fixtures.mjs preset <name>         (prints the result as JSON)
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDisposable, resetTestDatabase } from './reset-test-database.mjs';

const hour = 3_600_000;
const day = 24 * hour;

const userId = async (db, email) => {
  const { rows } = await db.query('SELECT id, display_name, email FROM users WHERE email = $1', [email]);
  if (!rows[0]) throw new Error(`No seeded user ${email}; reference data is missing.`);
  return rows[0];
};

/** A venue. Owner defaults to the seeded Venue Staff 1. */
export async function buildVenue(db, { name = `Browser venue ${randomUUID()}`, location = 'Browser Test Building', capacity = 50, setupMinutes = 0, turnaroundMinutes = 0, ownerEmail = 'venue_staff1@connectsphere.test' } = {}) {
  const owner = await userId(db, ownerEmail);
  const { rows } = await db.query(
    `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
     VALUES ($1, $2, $3, $4, $5, 'Browser test venue', $6, $7) RETURNING id, name, setup_time_minutes, turnaround_time_minutes`,
    [randomUUID(), owner.id, name, location, capacity, setupMinutes, turnaroundMinutes],
  );
  return { id: rows[0].id, name: rows[0].name, setupMinutes: rows[0].setup_time_minutes, turnaroundMinutes: rows[0].turnaround_time_minutes };
}

/**
 * An event at the given status. NOTE: `status: 'Confirmed'` sets only the status. It does NOT add the SPM-135
 * readiness rows (an approved venue booking, `equipment_confirmed_at`, an approved `event_safety_checks` row), so
 * such an event fails the readiness rule. Only the `withdrawal` preset adds them; a caller that needs a ready
 * Confirmed event must insert them itself or use that preset. Defaults: organised by seeded Organiser 1, assigned to Coordinator 1,
 * starting in 30 days for two hours. `capacity` turns registration on with that limit.
 * `venueId` also books that venue (approved) for the event's own window.
 */
export async function buildEvent(db, {
  name = `Browser event ${randomUUID()}`, status = 'Submitted', purpose = 'Browser test fixture', expectedAttendance = 10,
  startInDays = 30, durationHours = 2, capacity = null, organiserEmail = 'organiser1@connectsphere.test',
  coordinatorEmail = 'coordinator1@connectsphere.test', venueId = null,
} = {}) {
  const organiser = await userId(db, organiserEmail);
  const coordinator = await userId(db, coordinatorEmail);
  const start = new Date(Date.now() + startInDays * day);
  const end = new Date(start.getTime() + durationHours * hour);
  const id = randomUUID();
  await db.query(
    `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
       expected_attendance, registration_enabled, registration_limit, registration_opens_at, registration_closes_at, status,
       coordinator_id, coordinator_name, submission_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$1)`,
    [
      id, organiser.id, organiser.display_name, organiser.email, name, purpose, start, end, expectedAttendance,
      capacity !== null, capacity ?? 1,
      capacity !== null ? new Date(Date.now() - hour) : null, capacity !== null ? new Date(start.getTime() - day) : null,
      status, coordinator.id, coordinator.display_name,
    ],
  );
  if (venueId) {
    await db.query(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved')`,
      [venueId, id, start, end],
    );
  }
  return { id, name, status, startAt: start.toISOString(), endAt: end.toISOString() };
}

/** An equipment pool of `quantity` identical, available, active items. */
export async function buildEquipment(db, { name = `Browser equipment ${randomUUID()}`, quantity = 1, type = 'Lighting', location = 'Tampines' } = {}) {
  const { rows } = await db.query(
    `INSERT INTO equipment (equipment_name, equipment_type, quantity, maintenance_status, active_quantity,
       under_maintenance_quantity, retired_quantity, location, is_available)
     VALUES ($1, $2, $3, 'Active', $3, 0, 0, $4, true) RETURNING id`,
    [name, type, quantity, location],
  );
  return { id: rows[0].id, name, quantity, location, type };
}

/** A registration of a seeded attendee (by email) for an event, at status 'Registered' or 'Withdrawn'. */
export async function buildRegistration(db, { eventId, attendeeEmail = 'attendee1@connectsphere.test', status = 'Registered' }) {
  const attendee = await userId(db, attendeeEmail);
  const { rows } = await db.query(
    `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, withdrawn_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'Withdrawn' THEN now() ELSE NULL END) RETURNING id`,
    [eventId, attendee.id, status, attendee.display_name, attendee.email],
  );
  return { id: rows[0].id, eventId, attendeeEmail, status };
}

/** An approved tentative hold of `venueId` for `eventId`, expiring at `expiresAt`. */
export async function buildTentativeHold(db, { venueId, eventId, expiresAt, startInDays = 40 }) {
  const start = new Date(Date.now() + startInDays * day);
  const { rows } = await db.query(
    `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
     VALUES ($1, $2, $3, $4, 'approved', 'tentative_hold', $5) RETURNING id`,
    [venueId, eventId, start, new Date(start.getTime() + hour), expiresAt],
  );
  return { id: rows[0].id, venueId, eventId, expiresAt: expiresAt.toISOString() };
}

/**
 * Builds a whole scene in one call. Every section is optional and a plain object keyed by a name of the
 * caller's choosing; references between sections use those keys.
 *   { venues:  { hall: { setupMinutes: 30, turnaroundMinutes: 15 } },
 *     events:  { main: { status: 'Approved', venue: 'hall' } },
 *     equipment: { lamps: { quantity: 20 } },
 *     registrations: [{ event: 'main', attendee: 'attendee1@connectsphere.test', status: 'Registered' }] }
 * Returns the same shape with the created rows, so the test learns the ids and names.
 */
export async function buildScene(db, scene = {}) {
  const out = { venues: {}, events: {}, equipment: {}, registrations: [] };
  for (const [key, opts] of Object.entries(scene.venues ?? {})) out.venues[key] = await buildVenue(db, opts);
  for (const [key, { venue, ...opts }] of Object.entries(scene.events ?? {})) {
    if (venue && !out.venues[venue]) throw new Error(`Event "${key}" refers to unknown venue "${venue}".`);
    out.events[key] = await buildEvent(db, { ...opts, venueId: venue ? out.venues[venue].id : null });
  }
  for (const [key, opts] of Object.entries(scene.equipment ?? {})) out.equipment[key] = await buildEquipment(db, opts);
  for (const { event, attendee, status } of scene.registrations ?? []) {
    if (!out.events[event]) throw new Error(`Registration refers to unknown event "${event}".`);
    out.registrations.push(await buildRegistration(db, { eventId: out.events[event].id, attendeeEmail: attendee, status }));
  }
  return out;
}

// SPM-120 WITHDRAW-EVENT-REG-CAP-01 fixture ("the freed spot is available"): a Confirmed event with capacity 2, full with
// attendee1 (who withdraws) and attendee2. It is Confirmed, so it also carries what SPM-135's readiness
// rule needs (approved venue booking, equipment confirmed, approved safety check) - the rows the
// committed 028_spm120 seed used to supply.
// Consumed by frontend/src/features/events/pages/detail/EventDetailPage.withdraw.playwright.spec.ts
// through db.preset('withdrawal'). Case records: docs/specs/SPM-120-test-results.md and the Confluence
// Withdraw Registration Matrix; keep those in step with any change to the properties asserted here.
// Do NOT label this fixture "08-A": SPM-120's ids were renumbered (docs/specs/SPM-120-test-results.md,
// the Former/Current table), so the old 08-A is now CAP-01 and the current 08-A is the concurrent-
// withdrawal case, which is a backend integration test and not covered by this browser spec.
async function withdrawalPreset(db) {
  const scene = await buildScene(db, {
    venues: { hall: { name: 'SPM-120 withdrawal hall' } },
    events: { main: { name: 'SPM-120 withdrawal browser', status: 'Confirmed', capacity: 2, expectedAttendance: 2, venue: 'hall' } },
    registrations: [
      { event: 'main', attendee: 'attendee1@connectsphere.test' },
      { event: 'main', attendee: 'attendee2@connectsphere.test' },
    ],
  });
  const { id } = scene.events.main;
  await db.query("UPDATE events SET equipment_confirmed_at = now() - interval '2 days' WHERE id = $1", [id]);
  await db.query(
    `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, feedback, decided_at)
     VALUES ($1, 'approved', now() - interval '3 days', 'coordinator1@connectsphere.test', 'Safety Officer 1', NULL, now() - interval '2 days')`,
    [id],
  );
  return { eventName: scene.events.main.name, eventId: id };
}

// SPM-119 05-A/B/C (EQUIP-UNAVAIL-05-A/B/C) fixture: an available item with no history; the spec creates
// the audit history itself, so the two audited edits it asserts on are its own and their order is
// deterministic. Consumed by
// frontend/src/features/equipment/pages/audit-trail/AuditTrailPage.playwright.spec.ts through
// db.preset('auditTrail'). Case records: Confluence EQUIP-UNAVAIL-05 and the Mark Equipment as
// Unavailable Matrix.
async function auditTrailPreset(db) {
  return { equipmentName: (await buildEquipment(db, { name: 'SPM-119 audit browser', quantity: 50 })).name };
}

// SPM-134 browser fixtures (HOLD-EXP-NOTIF-06-INT-1/2): one event of Coordinator 1 with three approved
// tentative holds at three venues. The reminder hold expires in 47 hours (inside the 48-hour window), the
// expired one a minute ago, the release one in 10 days (the spec releases it as Venue Staff). The backend
// under test must run with TENTATIVE_HOLD_EXPIRY_INTERVAL_MS=1000 (run-browser.mjs sets it).
// Consumed by frontend/src/features/bookings/pages/requests/BookingsPage.hold-expiry.playwright.spec.ts
// through db.preset('holdExpiry'). This replaces the deleted spm134-hold-fixtures.mjs, which seeded once
// per run; the Confluence HOLD-EXP-NOTIF-06 pre-conditions still describe that older mechanism and need
// updating, so keep this comment and that page in step.
async function holdExpiryPreset(db) {
  const { events } = await buildScene(db, { events: { main: { name: 'SPM-134 hold browser', status: 'Planning', startInDays: 40, durationHours: 1 } } });
  // Whole minutes, so the spec can state the exact text the notices carry (they show minutes only).
  const minute = 60_000;
  const expiries = {
    reminder: new Date(Math.floor((Date.now() + 47 * hour) / minute) * minute),
    expired: new Date(Math.floor((Date.now() - minute) / minute) * minute),
    release: new Date(Date.now() + 10 * day),
  };
  const venues = {};
  const holds = {};
  for (const [key, expiresAt] of Object.entries(expiries)) {
    venues[key] = await buildVenue(db, { name: `SPM-134 ${key} hall` });
    holds[key] = await buildTentativeHold(db, { venueId: venues[key].id, eventId: events.main.id, expiresAt });
  }
  return {
    eventName: events.main.name,
    reminderVenue: venues.reminder.name, expiredVenue: venues.expired.name, releaseVenue: venues.release.name,
    reminderHoldId: holds.reminder.id, releaseHoldId: holds.release.id,
    reminderExpiresIso: expiries.reminder.toISOString(), expiredExpiresIso: expiries.expired.toISOString(),
  };
}

export const PRESETS = Object.freeze({ withdrawal: withdrawalPreset, auditTrail: auditTrailPreset, holdExpiry: holdExpiryPreset });

async function withClient(fn) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('TEST_DATABASE_URL is required (DATABASE_URL is deliberately not accepted).');
  const db = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    await assertDisposable(db);
    return await fn(db);
  } finally {
    await db.end();
  }
}

/**
 * A readable message for any thrown value. An AggregateError (what Node 24 throws when `localhost` resolves to both
 * ::1 and 127.0.0.1 and both refuse) has an empty .message, so its members are joined; Postgres errors carry the useful
 * part in detail/constraint/table, which are appended when present.
 */
export function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const parts = [];
  if (error.message) parts.push(error.message);
  if (Array.isArray(error.errors)) for (const inner of error.errors) if (inner?.message) parts.push(inner.message);
  const extras = ['detail', 'constraint', 'table'].filter((key) => error[key]).map((key) => `${key}: ${error[key]}`);
  let text = parts.join('; ');
  if (extras.length) text += `${text ? ' ' : ''}(${extras.join(', ')})`;
  return text || error.code || String(error);
}

const readStdin = async () => {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.trim() ? JSON.parse(text) : {};
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  try {
    if (command === 'reset') {
      await withClient((db) => resetTestDatabase(db));
    } else if (command === 'seed') {
      const scene = await readStdin();
      process.stdout.write(JSON.stringify(await withClient((db) => buildScene(db, scene))));
    } else if (command === 'preset' && Object.hasOwn(PRESETS, argument)) {
      process.stdout.write(JSON.stringify(await withClient((db) => PRESETS[argument](db))));
    } else {
      throw new Error(`usage: browser-fixtures.mjs reset | seed < scene.json | preset <${Object.keys(PRESETS).join('|')}>`);
    }
  } catch (error) {
    process.stderr.write(`${describeError(error)}\n`);
    process.exitCode = 1;
  }
}
