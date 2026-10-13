import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/*
 * SAFETY-FEEDBACK: when the Safety Officer requests changes, each feedback item is resolved by the
 * coordinator, and re-requesting needs every item resolved. Real PostgreSQL, real AppModule.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 015 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SAFETY-STALE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('SAFETY-FEEDBACK: coordinator resolves Safety Officer feedback (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let coordinator: { uid: string; cookie: string };
  let createdEventIds: string[];
  let createdVenueIds: string[];
  let createdUserIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdVenueIds = [];
    createdUserIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    coordinator = await createSession('COORDINATOR', 'Coordinator 1');
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length)
      await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => request(app.getHttpServer());

  async function createSession(role: string, name: string) {
    const email = `e2e-safety-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** A Planning event that is ready except for the safety check, which is approved. */
  async function seedApprovedEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1, 'org-1', 'Organiser 1', 'organiser@example.test', 'Stale Check Event', 'Purpose', 'Description',
               '2026-11-05T02:00:00Z', '2026-11-05T04:00:00Z', 80, 'Theatre', ARRAY['Projector'], ARRAY[]::text[],
               'Projector x1', 'Planning', $2, 'Coordinator 1', $3)`,
      [id, coordinator.uid, randomUUID()],
    );
    createdEventIds.push(id);
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Stale Hall', $1, 200, 'Open weekdays', ARRAY['Thursday'], '08:00', '22:00', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 9 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(venue.rows[0].id);
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved')`,
      [id, venue.rows[0].id, SLOT_START, SLOT_END],
    );
    await pool.query(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Projector', 1, 'Reserved')`,
      [id],
    );
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, 'approved', now(), $2, 'Safety Officer 1', now())`,
      [id, coordinator.uid],
    );
    return { id, venueId: venue.rows[0].id };
  }

  /** The safety record, or undefined once it has been reset to "not requested". */
  async function safetyOf(eventId: string) {
    const row = await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]);
    return row.rows[0]?.status;
  }

  async function seedChangesNeededEvent() {
    const { id } = await seedApprovedEvent();
    await pool.query(
      "UPDATE event_safety_checks SET status = 'changes_needed', approver_name = 'Safety Officer 1', decided_at = now() WHERE event_id = $1",
      [id],
    );
    const itemIds = [randomUUID(), randomUUID()];
    await pool.query(
      `INSERT INTO safety_check_feedback_items (id, event_id, feedback_text, requested_at)
       VALUES ($1, $3, 'Add a fire exit plan.', now()), ($2, $3, 'Confirm occupancy.', now())`,
      [itemIds[0], itemIds[1], id],
    );
    return { id, itemIds };
  }

  it('SAFETY-FEEDBACK-01: resolving an item marks it, and unresolving clears it', async () => {
    // Arrange
    const { id, itemIds } = await seedChangesNeededEvent();

    // Act: resolve the first item
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: the checklist shows the first item resolved and the second not
    let status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    const feedback = status.body.checklist.safetyCheck.feedback as { id: string; resolvedByCoordinatorAt?: string }[];
    expect(!!feedback.find((item) => item.id === itemIds[0])?.resolvedByCoordinatorAt).toBe(true);
    expect(!!feedback.find((item) => item.id === itemIds[1])?.resolvedByCoordinatorAt).toBe(false);

    // Act: unresolve it again
    await http().delete(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Assert
    status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(status.body.checklist.safetyCheck.feedback.every((item: { resolvedByCoordinatorAt?: string }) => !item.resolvedByCoordinatorAt)).toBe(true);
  });

  it('SAFETY-FEEDBACK-02: re-requesting is refused while any item is unresolved, and allowed once all are resolved', async () => {
    // Arrange
    const { id, itemIds } = await seedChangesNeededEvent();
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(200);

    // Act + Assert: one item still open
    const blocked = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(blocked.body.code).toBe('SAFETY_FEEDBACK_UNRESOLVED');
    expect(await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [id]).then((r) => r.rows[0].status)).toBe('changes_needed');

    // Act: resolve the rest and re-request
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[1]}/resolve`).set('Cookie', coordinator.cookie).expect(200);
    const ok = await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: pending again, and the old items are cleared
    expect(ok.body.status).toBe('pending');
    const left = await pool.query('SELECT count(*)::int AS n FROM safety_check_feedback_items WHERE event_id = $1', [id]);
    expect(left.rows[0].n).toBe(0);
  });

  it('SAFETY-FEEDBACK-03: an unknown item is not found, and resolving outside changes-needed is refused', async () => {
    // Arrange
    const { id, itemIds } = await seedChangesNeededEvent();

    // Act + Assert: an item id that is not on this event
    await http().post(`/api/events/${id}/safety-check/feedback/${randomUUID()}/resolve`).set('Cookie', coordinator.cookie).expect(404);

    // Arrange: the check is approved, not changes-needed
    await pool.query("UPDATE event_safety_checks SET status = 'approved' WHERE event_id = $1", [id]);

    // Act + Assert
    await http().post(`/api/events/${id}/safety-check/feedback/${itemIds[0]}/resolve`).set('Cookie', coordinator.cookie).expect(409);
  });
});
