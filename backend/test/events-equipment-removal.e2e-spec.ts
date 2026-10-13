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
 * EQUIPMENT-REMOVE: only an unavailable equipment request can be removed from the event's list, and the
 * equipment section then reflects the remaining requests. Real PostgreSQL, real AppModule.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 016 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('EQUIPMENT-REMOVE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('EQUIPMENT-REMOVE: coordinator removes an unavailable equipment request (e2e)', () => {
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
    await approveSafety(id);
    return { id, venueId: venue.rows[0].id };
  }

  /** Writes an approved safety record (the Safety Officer's outcome) for the event. */
  async function approveSafety(eventId: string) {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, 'approved', now(), $2, 'Safety Officer 1', now())`,
      [eventId, coordinator.uid],
    );
  }

  /** The safety record status, or undefined once it has been reset to "not requested". */
  async function safetyOf(eventId: string) {
    const row = await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]);
    return row.rows[0]?.status;
  }

  async function reserve(eventId: string, name: string, status: string) {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, $2, 1, $3) RETURNING id`,
      [eventId, name, status],
    );
    return row.rows[0].id;
  }

  async function reservationExists(id: string) {
    const row = await pool.query('SELECT 1 FROM equipment_reservations WHERE id = $1', [id]);
    return row.rows.length;
  }

  const remove = (eventId: string, reservationId: string) =>
    http().delete(`/api/events/${eventId}/equipment-reservations/${reservationId}`).set('Cookie', coordinator.cookie);

  async function checklistOf(eventId: string) {
    const status = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    return status.body.checklist;
  }

  /**
   * An unavailable equipment request can be removed. The response confirms removal, the reservation row
   * is gone, the approved safety check is reset, and the equipment section is not requested.
   */
  it('EQUIPMENT-REMOVE-01: removing the only (unavailable) equipment request leaves equipment not requested', async () => {
    // Arrange: the only equipment line is Unavailable; the approved safety check is in place
    const { id } = await seedApprovedEvent();
    await pool.query('DELETE FROM equipment_reservations WHERE event_id = $1', [id]);
    const reservationId = await reserve(id, 'Microphone', 'Unavailable');
    await approveSafety(id);
    expect((await checklistOf(id)).equipment.status).toBe('unavailable');
    expect(await safetyOf(id)).toBe('approved');

    // Act
    const response = await remove(id, reservationId).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId: id, equipmentReservationId: reservationId, removed: true });
    expect(await reservationExists(reservationId)).toBe(0);
    expect(await safetyOf(id)).toBeUndefined();
    const checklist = await checklistOf(id);
    expect(checklist.equipment).toMatchObject({ status: 'not_requested', items: [] });
    // The reset reason names the equipment change, so the coordinator knows why a re-request is needed.
    expect(checklist.safetyCheck).toMatchObject({ status: 'not_requested', resetReason: 'The equipment request changed' });
    expect(checklist.safetyCheck.resetDate).toEqual(expect.any(String));
  });

  /** A Reserved equipment line is confirmed, not unavailable, so it cannot be removed (409). */
  it('EQUIPMENT-REMOVE-02: a reserved equipment request cannot be removed', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();
    const reservationId = await reserve(id, 'Speakers', 'Reserved');

    // Act + Assert
    const response = await remove(id, reservationId).expect(409);
    expect(response.body.code).toBe('EQUIPMENT_REQUEST_NOT_REMOVABLE');
    expect(await reservationExists(reservationId)).toBe(1);
  });

  /** An equipment request id that does not belong to the event is reported as not found. */
  it('EQUIPMENT-REMOVE-03: an unknown equipment request is not found', async () => {
    const { id } = await seedApprovedEvent();
    const response = await remove(id, randomUUID()).expect(404);
    expect(response.body.code).toBe('EQUIPMENT_REQUEST_NOT_FOUND');
  });

  /**
   * Removing one unavailable line leaves the reserved projector in place. The approved safety check is
   * re-approved after the arrange step, so the reset caused by removal is observed.
   */
  it('EQUIPMENT-REMOVE-04: removing the unavailable request leaves the other equipment confirmed', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();
    const unavailableId = await reserve(id, 'Microphone', 'Unavailable');
    // Inserting the line resets the safety check, so re-approve it before acting.
    await approveSafety(id);
    const before = await checklistOf(id);
    expect(before.equipment.status).toBe('unavailable');
    expect(before.equipment.items).toHaveLength(2);
    expect(await safetyOf(id)).toBe('approved');

    // Act
    await remove(id, unavailableId).expect(200);

    // Assert: removing the request resets the approved safety check
    expect(await safetyOf(id)).toBeUndefined();
    // Assert: only the reserved projector remains, so the section is confirmed
    const after = await checklistOf(id);
    expect(after.equipment.status).toBe('confirmed');
    expect(after.equipment.items.map((item: { status: string }) => item.status)).toEqual(['confirmed']);
    expect(after.blocking).not.toContain('equipment');
  });

  /** A Requested equipment line is still awaiting the decision, so it cannot be removed (409). */
  it('EQUIPMENT-REMOVE-05: a requested (not yet decided) equipment line cannot be removed', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();
    const requestedId = await reserve(id, 'Microphone', 'Requested');

    // Act + Assert
    const response = await remove(id, requestedId).expect(409);
    expect(response.body.code).toBe('EQUIPMENT_REQUEST_NOT_REMOVABLE');
    expect(await reservationExists(requestedId)).toBe(1);
  });

  /** A coordinator who is not assigned to the event gets 403 and the request is left unchanged. */
  it('EQUIPMENT-REMOVE-06: a coordinator not assigned to the event is refused with 403', async () => {
    // Arrange: an unavailable line on an event assigned to Coordinator 1, and a different coordinator
    const { id } = await seedApprovedEvent();
    const unavailableId = await reserve(id, 'Microphone', 'Unavailable');
    await approveSafety(id);
    const otherCoordinator = await createSession('COORDINATOR', 'Coordinator 2');

    // Act
    const response = await http()
      .delete(`/api/events/${id}/equipment-reservations/${unavailableId}`)
      .set('Cookie', otherCoordinator.cookie)
      .expect(403);

    // Assert
    expect(response.body.message).toBe('You do not have permission to confirm this event.');
    expect(await reservationExists(unavailableId)).toBe(1);
    expect(await safetyOf(id)).toBe('approved');
  });

  /** Removal is only possible while the event is in Planning; a Confirmed event refuses it (422). */
  it('EQUIPMENT-REMOVE-07: removal on an event that is not in Planning is refused with 422', async () => {
    // Arrange: an unavailable line on an event that has already been confirmed
    const { id } = await seedApprovedEvent();
    const unavailableId = await reserve(id, 'Microphone', 'Unavailable');
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [id]);

    // Act
    const response = await remove(id, unavailableId).expect(422);

    // Assert
    expect(response.body.code).toBe('EVENT_NOT_CONFIRMABLE');
    expect(await reservationExists(unavailableId)).toBe(1);
  });

  /** A request with no session is refused with 401 and nothing is removed. */
  it('EQUIPMENT-REMOVE-08: no session gets 401 and the equipment request is kept', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();
    const unavailableId = await reserve(id, 'Microphone', 'Unavailable');

    // Act + Assert
    await http().delete(`/api/events/${id}/equipment-reservations/${unavailableId}`).expect(401);
    expect(await reservationExists(unavailableId)).toBe(1);
  });
});
