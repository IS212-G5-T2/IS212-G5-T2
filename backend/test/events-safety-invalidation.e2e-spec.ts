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
 * SAFETY-STALE: a safety approval (or pending request) is only valid for the arrangements it
 * was requested for. A change to the venue booking, the equipment lines or the event details
 * moves it to "changes needed", so the coordinator must re-request it before confirming.
 * Real PostgreSQL, real AppModule, no fixture ports. Needs TEST_DATABASE_URL (or DATABASE_URL)
 * with database/postgresql/init 001 to 013 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SAFETY-STALE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('SAFETY-STALE: safety approval is invalidated by arrangement changes (e2e)', () => {
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

  it('SAFETY-STALE-01: a changed equipment line after approval resets the safety check to not requested', async () => {
    // Arrange: approved safety, ready arrangements
    const { id } = await seedApprovedEvent();
    expect(await safetyOf(id)).toBe('approved');

    // Act: the equipment quantity changes
    await pool.query("UPDATE equipment_reservations SET quantity = 2 WHERE event_id = $1", [id]);

    // Assert
    expect(await safetyOf(id)).toBeUndefined();
    const status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(status.body.ready).toBe(false);
    expect(status.body.outstanding).toEqual([
      { type: 'safety', label: 'Safety Officer approval', detail: 'Awaiting check', state: 'No record' },
    ]);
    expect(status.body.checklist.safetyCheck).toMatchObject({
      status: 'not_requested',
      resetReason: 'The equipment request changed',
    });
  });

  it('SAFETY-STALE-02: a changed venue booking after approval resets the safety check to not requested', async () => {
    // Arrange
    const { id, venueId } = await seedApprovedEvent();

    // Act: the booking is moved to a new slot
    await pool.query("UPDATE venue_bookings SET start_at = $2 WHERE event_id = $1 AND venue_id = $3", [
      id,
      '2026-11-05T03:00:00.000Z',
      venueId,
    ]);

    // Assert
    expect(await safetyOf(id)).toBeUndefined();
  });

  it('SAFETY-STALE-03: a changed event detail after approval resets the safety check to not requested', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act: the expected attendance changes
    await pool.query('UPDATE events SET expected_attendance = 120 WHERE id = $1', [id]);

    // Assert
    expect(await safetyOf(id)).toBeUndefined();
  });

  it('SAFETY-STALE-05: a new venue request or a pending equipment request sends the safety check back to not requested', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act 1: a new venue booking request is made for the event
    const other = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Stale Annex', $1, 50, 'Open weekdays', ARRAY['Thursday'], '08:00', '22:00', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 8 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(other.rows[0].id);
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'pending')`,
      [id, other.rows[0].id, SLOT_START, SLOT_END],
    );

    // Assert 1
    expect(await safetyOf(id)).toBeUndefined();

    // Arrange 2: approve again, then the equipment request goes back to pending
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
       VALUES ($1, 'approved', now(), $2, 'Safety Officer 1', now())`,
      [id, coordinator.uid],
    );
    expect(await safetyOf(id)).toBe('approved');

    // Act 2: the equipment line is re-requested (status back to Requested)
    await pool.query("UPDATE equipment_reservations SET status = 'Requested' WHERE event_id = $1", [id]);

    // Assert 2
    expect(await safetyOf(id)).toBeUndefined();
  });

  it('SAFETY-STALE-06: saving any event detail through the planning update resets the check and records why', async () => {
    // Arrange: approved safety
    const { id } = await seedApprovedEvent();

    // Act: the coordinator saves a description-only change (not a booking-sensitive field)
    const saved = await http()
      .patch(`/api/events/${id}/planning`)
      .set('Cookie', coordinator.cookie)
      .send({ description: 'A reworded description' })
      .expect(200);

    // Assert: the response says the check was reset; the checklist explains why
    expect(saved.body.applied).toEqual(['description']);
    expect(saved.body.safetyCheckReset).toBe(true);
    expect(await safetyOf(id)).toBeUndefined();
    const status = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(status.body.checklist.safetyCheck).toMatchObject({
      status: 'not_requested',
      resetReason: 'Event details were updated',
    });
    expect(status.body.checklist.safetyCheck.resetDate).toEqual(expect.any(String));

    // Act: the coordinator requests the safety check again
    await http().post(`/api/events/${id}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);

    // Assert: the reset reason is cleared once re-requested
    const after = await http().get(`/api/events/${id}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(after.body.checklist.safetyCheck.status).toBe('pending');
    expect(after.body.checklist.safetyCheck.resetReason).toBeUndefined();
  });

  it('SAFETY-STALE-07: a save that changes nothing does not reset the safety check', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act: the same name as stored
    const saved = await http()
      .patch(`/api/events/${id}/planning`)
      .set('Cookie', coordinator.cookie)
      .send({ name: 'Stale Check Event' })
      .expect(200);

    // Assert
    expect(saved.body.applied).toEqual([]);
    expect(saved.body.safetyCheckReset).toBe(false);
    expect(await safetyOf(id)).toBe('approved');
  });

  it('SAFETY-STALE-04: a status change alone (Planning to Confirmed) does not invalidate the approval', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act: the event status changes, as confirmation does
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [id]);

    // Assert
    expect(await safetyOf(id)).toBe('approved');
  });
});
