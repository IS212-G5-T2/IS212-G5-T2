import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/*
 * CHECKLIST-ACTION: the two planning-checklist actions ("confirm no equipment" and "request the safety check") and
 * the status-change input guard refuse what they must refuse. Supporting tests for SPM-135 AC1 and AC2: Confirm
 * Event is only reachable once equipment and the safety check have been handled in the right order. Real
 * PostgreSQL, real AppModule. Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('CHECKLIST-ACTION tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('CHECKLIST-ACTION: confirm-no-equipment, safety-check request and status-change input (e2e)', () => {
  let app: INestApplication;
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
    if (createdUserIds.length)
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
  });

  const http = () => request(app.getHttpServer());

  async function createSession(role: string, name: string) {
    const email = `e2e-checklist-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = ([] as string[])
      .concat(response.headers['set-cookie'] ?? [])
      .find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** A Planning event assigned to the coordinator. `equipmentNeeds` is the organiser's free-text requirement. */
  async function seedEvent(equipmentNeeds: string) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1, 'org-1', 'Organiser 1', 'organiser@example.test', 'Checklist Action Event', 'Purpose', 'Description',
               '2026-11-05T02:00:00Z', '2026-11-05T04:00:00Z', 80, 'Theatre', ARRAY['Projector'], ARRAY[]::text[],
               $2, 'Planning', $3, 'Coordinator 1', $4)`,
      [id, equipmentNeeds, coordinator.uid, randomUUID()],
    );
    createdEventIds.push(id);
    return id;
  }

  async function approveVenue(eventId: string) {
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Checklist Hall', $1, 200, 'Open weekdays', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 5 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(venue.rows[0].id);
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved')`,
      [eventId, venue.rows[0].id, SLOT_START, SLOT_END],
    );
  }

  /** Inserted last in a test: any venue or equipment write after it resets the safety check by trigger. */
  async function insertSafety(eventId: string, status: 'pending' | 'approved') {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, $2, now(), $3, $4, $5)`,
      [eventId, status, coordinator.uid, status === 'approved' ? 'Safety Officer 1' : null, status === 'approved' ? '2026-10-13T09:00:00.000Z' : null],
    );
  }

  const equipmentConfirmedAt = async (eventId: string) =>
    (await pool.query<{ at: Date | null }>('SELECT equipment_confirmed_at AS at FROM events WHERE id = $1', [eventId])).rows[0].at;

  const safetyOf = async (eventId: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId])).rows[0]?.status;

  const post = (path: string) => http().post(path).set('Cookie', coordinator.cookie);

  /**
   * When the event lists no equipment and none is requested, the coordinator can confirm "none"; confirming again
   * returns the same time and writes nothing new.
   * Kills: the confirmation time is overwritten on every call; the endpoint refuses an event with no equipment.
   */
  it('CHECKLIST-ACTION-01: confirming no equipment stores the time once and a second call repeats it', async () => {
    // Arrange: the organiser listed no equipment and none was requested
    const id = await seedEvent('None');
    expect(await equipmentConfirmedAt(id)).toBeNull();

    // Act
    const first = await post(`/api/events/${id}/confirm-no-equipment`).expect(200);
    const second = await post(`/api/events/${id}/confirm-no-equipment`).expect(200);

    // Assert: the stored time is the one returned first, and the second call returned it unchanged
    const stored = await equipmentConfirmedAt(id);
    expect(stored?.toISOString()).toBe(first.body.equipmentConfirmedAt);
    expect(second.body).toEqual({ eventId: id, equipmentConfirmedAt: first.body.equipmentConfirmedAt });
  });

  /**
   * An event that lists equipment cannot be marked as having none, and nothing is stored.
   * Kills: the "equipment required" check removed; the check reading the wrong field.
   */
  it('CHECKLIST-ACTION-02: confirming no equipment is refused when the event lists equipment', async () => {
    // Arrange
    const id = await seedEvent('Projector x1');

    // Act
    const response = await post(`/api/events/${id}/confirm-no-equipment`).expect(422);

    // Assert
    expect(response.body.code).toBe('EQUIPMENT_REQUIRED');
    expect(await equipmentConfirmedAt(id)).toBeNull();
  });

  /**
   * The safety check cannot be requested while venue and equipment are unconfirmed, and no safety record is created.
   * Kills: the prerequisites check removed, so a check is requested too early.
   */
  it('CHECKLIST-ACTION-03: requesting the safety check is refused until venue and equipment are confirmed', async () => {
    // Arrange: no venue request and no equipment confirmation
    const id = await seedEvent('None');

    // Act
    const response = await post(`/api/events/${id}/safety-check/request`).expect(422);

    // Assert: the message names what is still outstanding
    expect(response.body.code).toBe('SAFETY_PREREQUISITES_NOT_MET');
    expect(response.body.message).toBe('Pending venue and equipment confirmation to proceed.');
    expect(await safetyOf(id)).toBeUndefined();
  });

  /**
   * A safety check that is already waiting for the Safety Officer cannot be requested again.
   * Kills: the "already pending" conflict removed, so a second request overwrites the first.
   */
  it('CHECKLIST-ACTION-04: requesting the safety check again while it is pending is a conflict', async () => {
    // Arrange: venue approved, no equipment needed and confirmed, safety already pending
    const id = await seedEvent('None');
    await approveVenue(id);
    await post(`/api/events/${id}/confirm-no-equipment`).expect(200);
    await insertSafety(id, 'pending');

    // Act
    const response = await post(`/api/events/${id}/safety-check/request`).expect(409);

    // Assert
    expect(response.body.code).toBe('SAFETY_CHECK_NOT_REQUESTABLE');
    expect(await safetyOf(id)).toBe('pending');
  });

  /**
   * An approved safety check cannot be requested again, and the approval is not lost.
   * Kills: the "already approved" conflict removed, so a request resets an approved check to pending.
   */
  it('CHECKLIST-ACTION-05: requesting the safety check again once it is approved is a conflict', async () => {
    // Arrange
    const id = await seedEvent('None');
    await approveVenue(id);
    await post(`/api/events/${id}/confirm-no-equipment`).expect(200);
    await insertSafety(id, 'approved');

    // Act
    const response = await post(`/api/events/${id}/safety-check/request`).expect(409);

    // Assert
    expect(response.body.code).toBe('SAFETY_CHECK_NOT_REQUESTABLE');
    expect(await safetyOf(id)).toBe('approved');
  });

  /**
   * A well-formed event id that does not exist, and a malformed id, are both "not found" for the checklist actions.
   * Kills: a malformed id reaching the database and failing as a server error; an unknown id treated as assigned.
   */
  it.each([
    ['an unknown event id', () => randomUUID()],
    ['a malformed event id', () => 'not-a-uuid'],
  ])('CHECKLIST-ACTION-06: %s is not found for both actions', async (_label, makeId) => {
    // Arrange
    const id = makeId();

    // Act + Assert
    await post(`/api/events/${id}/confirm-no-equipment`).expect(404);
    await post(`/api/events/${id}/safety-check/request`).expect(404);
  });

  /**
   * A status change without a usable target status is refused as an unsupported target, and the event is untouched.
   * Kills: a non-string targetStatus accepted or crashing; the input guard returning a value that matches Confirmed.
   */
  it.each([
    ['a number', { targetStatus: 123 }],
    ['an object', { targetStatus: { value: 'Confirmed' } }],
    ['no field at all', {}],
  ])('CHECKLIST-ACTION-07: a status change with %s as the target is refused with 400', async (_label, body) => {
    // Arrange
    const id = await seedEvent('None');

    // Act
    const response = await post(`/api/events/${id}/status-change`).send(body).expect(400);

    // Assert
    expect(response.body.code).toBe('UNSUPPORTED_TARGET_STATUS');
    const status = await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [id]);
    expect(status.rows[0].status).toBe('Planning');
  });
});
