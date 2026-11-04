// SPM-134 browser fixtures (HOLD-EXP-NOTIF-06-INT-1/2), shared by run-browser.mjs and the seeding command below: one event
// of seeded Coordinator 1 with three approved tentative holds at three venues. The reminder hold expires in 47 hours (inside
// the 48-hour window), the expired one a minute ago, the third in 10 days (the spec releases it as Venue Staff). The backend
// under test must run with TENTATIVE_HOLD_EXPIRY_INTERVAL_MS=1000 so its own scheduler writes the notices.
//
// Reproducing the browser cases outside run-browser.mjs (for example from the test-workflow cycle runner):
//   TEST_DATABASE_URL=<db> node scripts/testing/spm134-hold-fixtures.mjs seed > fixtures.json   (prints the env as JSON)
//   export the variables, run the cycle, then: TEST_DATABASE_URL=<db> node scripts/testing/spm134-hold-fixtures.mjs cleanup fixtures.json
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const day = 24 * 3_600_000;
const hour = 3_600_000;

export function holdFixtureNames(run = randomUUID()) {
  return {
    event: `SPM-134 hold browser ${run}`,
    venues: {
      reminder: `SPM-134 Reminder Hall ${run}`,
      expired: `SPM-134 Expired Hall ${run}`,
      release: `SPM-134 Release Hall ${run}`,
    },
  };
}

/** Inserts the fixtures and returns the environment the Playwright spec reads. */
export async function seedHoldFixtures(db, names) {
  const coordinator = (await db.query("SELECT id FROM users WHERE email = 'coordinator1@connectsphere.test'")).rows[0].id;
  const owner = (await db.query("SELECT id FROM users WHERE email = 'venue_staff1@connectsphere.test'")).rows[0].id;
  const eventId = (
    await db.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, 'spm134-organiser', 'Organiser', 'o@example.com', $2, 'SPM-134 browser fixture', $3, $4, 10, $5, 'Coordinator 1', $1, 'Planning')
       RETURNING id`,
      [randomUUID(), names.event, new Date(Date.now() + 40 * day), new Date(Date.now() + 40 * day + hour), coordinator],
    )
  ).rows[0].id;
  // Whole minutes, so the spec can state the exact text the notices carry (they show minutes only).
  const reminderExpires = new Date(Math.floor((Date.now() + 47 * hour) / 60_000) * 60_000);
  const expiredExpires = new Date(Math.floor((Date.now() - 60_000) / 60_000) * 60_000);
  const ids = {};
  for (const [key, expires] of [
    ['reminder', reminderExpires],
    ['expired', expiredExpires],
    ['release', new Date(Date.now() + 10 * day)],
  ]) {
    const hallId = randomUUID();
    await db.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'Browser Test Building', 50, 'SPM-134 fixture', 0, 0)`,
      [hallId, owner, names.venues[key]],
    );
    ids[key] = (
      await db.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, $3, $4, 'approved', 'tentative_hold', $5) RETURNING id`,
        [hallId, eventId, new Date(Date.now() + 40 * day), new Date(Date.now() + 40 * day + hour), expires],
      )
    ).rows[0].id;
  }
  return {
    SPM134_EVENT_NAME: names.event,
    SPM134_REMINDER_VENUE: names.venues.reminder,
    SPM134_EXPIRED_VENUE: names.venues.expired,
    SPM134_RELEASE_VENUE: names.venues.release,
    SPM134_REMINDER_HOLD_ID: ids.reminder,
    SPM134_RELEASE_HOLD_ID: ids.release,
    SPM134_REMINDER_EXPIRES_ISO: reminderExpires.toISOString(),
    SPM134_EXPIRED_EXPIRES_ISO: expiredExpires.toISOString(),
  };
}

/** Removes the fixtures: the holds' venues (their bookings and those bookings' notifications cascade) and the event. */
export async function cleanupHoldFixtures(db, names) {
  await db.query('DELETE FROM venues WHERE name = ANY($1::text[])', [Object.values(names.venues)]);
  await db.query('DELETE FROM notifications WHERE related_event_id IN (SELECT id FROM events WHERE event_name = $1)', [names.event]);
  await db.query('DELETE FROM events WHERE event_name = $1', [names.event]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to the database used by the browser test backend.');
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    if (command === 'seed') {
      const names = holdFixtureNames();
      console.log(JSON.stringify({ ...(await seedHoldFixtures(db, names)) }, null, 2));
    } else if (command === 'cleanup' && file) {
      const env = JSON.parse(readFileSync(file, 'utf8'));
      const run = env.SPM134_EVENT_NAME.replace('SPM-134 hold browser ', '');
      await cleanupHoldFixtures(db, holdFixtureNames(run));
    } else {
      throw new Error('usage: spm134-hold-fixtures.mjs seed | cleanup <fixtures.json>');
    }
  } finally {
    await db.end();
  }
}
