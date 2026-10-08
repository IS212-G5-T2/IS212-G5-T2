import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to the database used by the browser test backend.',
  );
const name = `Draft browser ${randomUUID()}`;
const approvalName = `SPM-40 approval functional ${randomUUID()}`;
const equipmentName = `SPM-111 equipment browser ${randomUUID()}`;
const auditTrailEquipmentName = `SPM-119 audit browser ${randomUUID()}`;
const withdrawalEventName = `SPM-120 withdrawal browser ${randomUUID()}`;
const venueName = `SPM-122 unavailability browser ${randomUUID()}`;
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
let code = 1;
try {
  // SPM-119 05-A/B/C fixture: an available item whose live availability
  // changes and shared audit history are exercised by the browser spec below.
  await db.query(
    `INSERT INTO equipment
       (equipment_name, equipment_type, quantity, maintenance_status, location, is_available)
     VALUES ($1, 'Lighting', 50, 'Active', 'Tampines', true)`,
    [auditTrailEquipmentName],
  );
  // SPM-120 08-A fixture: a published event with capacity 2 that is full, with the
  // seeded attendee1 (withdraws) and attendee2 registered. Removed again below.
  const day = 24 * 3_600_000;
  const hour = 3_600_000;
  const start = new Date(Date.now() + 10 * day);
  const event = await db.query(
    `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
       start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
       registration_opens_at, registration_closes_at, status, submission_key)
     VALUES ($7,'organiser-x','Organiser','o@example.com',$1,'SPM-120 browser fixture',$2,$3,2,true,2,$4,$5,'Confirmed',$6)
     RETURNING id`,
    [
      withdrawalEventName,
      start,
      new Date(start.getTime() + 2 * hour),
      new Date(Date.now() - hour),
      new Date(Date.now() + 9 * day),
      randomUUID(),
      randomUUID(),
    ],
  );
  await db.query(
    `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email)
     SELECT $1, id, 'Registered', display_name, email FROM users
      WHERE email IN ('attendee1@connectsphere.test', 'attendee2@connectsphere.test')`,
    [event.rows[0].id],
  );
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
          SPM37_TEST_NAME: name,
          SPM40_TEST_NAME: approvalName,
          SPM111_TEST_NAME: equipmentName,
          SPM119_AUDIT_EQUIPMENT_NAME: auditTrailEquipmentName,
          SPM120_TEST_NAME: withdrawalEventName,
          SPM122_TEST_VENUE_NAME: venueName,
        },
      },
    );
    child.on('error', reject);
    child.on('exit', (value) => resolve(value ?? 1));
  });
} finally {
  // Delete only the uniquely named record created by this browser run, in FK order.
  if ((await db.query("SELECT to_regclass('public.event_drafts') AS table_name")).rows[0].table_name)
    await db.query("DELETE FROM event_drafts WHERE fields->>'name'=$1", [name]);
  await db.query('DELETE FROM events WHERE event_name=$1', [name]);
  await db.query(
    `DELETE FROM notifications
     WHERE related_event_id IN (
       SELECT id FROM events WHERE event_name LIKE $1
     )`,
    [`${approvalName}%`],
  );
  await db.query('DELETE FROM events WHERE event_name LIKE $1', [
    `${approvalName}%`,
  ]);
  await db.query('DELETE FROM equipment WHERE equipment_name=$1', [
    equipmentName,
  ]);
  await db.query('DELETE FROM equipment WHERE equipment_name=$1', [
    auditTrailEquipmentName,
  ]);
  // Registrations are removed by the event's ON DELETE CASCADE.
  await db.query('DELETE FROM events WHERE event_name=$1', [
    withdrawalEventName,
  ]);
  // The venue's unavailable periods cascade with it; only this run's unique venue is removed.
  await db.query('DELETE FROM venues WHERE name=$1', [venueName]);
  await db.end();
}
process.exitCode = code;
