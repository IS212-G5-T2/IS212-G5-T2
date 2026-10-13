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
 * VENUE-REMOVE: only an unavailable venue request can be removed from the event's list, and the
 * venue section then reflects the remaining requests. Real PostgreSQL, real AppModule.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 016 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SAFETY-STALE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const SLOT_START = '2026-11-05T02:00:00.000Z';
const SLOT_END = '2026-11-05T04:00:00.000Z';

describe.skipIf(!database)('VENUE-REMOVE: coordinator removes an unavailable venue request (e2e)', () => {
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

  async function safetyOf(eventId: string) {
    const row = await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]);
    return row.rows[0]?.status;
  }

  /** Blocks the event's venue for its slot, which makes the approved booking unavailable. */
  async function blockVenue(venueId: string) {
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason) VALUES ($1, $2, $3, 'blocked', 'Maintenance')`,
      [venueId, SLOT_START, SLOT_END],
    );
  }

  async function bookingExists(id: string) {
    const row = await pool.query('SELECT 1 FROM venue_bookings WHERE event_id = $1', [id]);
    return row.rows.length;
  }

  const remove = (eventId: string, requestId: string) =>
    http().delete(`/api/events/${eventId}/venue-requests/${requestId}`).set('Cookie', coordinator.cookie);

  async function checklistOf(eventId: string) {
    const status = await http().get(`/api/events/${eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    return status.body.checklist;
  }

  async function onlyBookingId(eventId: string) {
    const row = await pool.query<{ id: string }>('SELECT id FROM venue_bookings WHERE event_id = $1', [eventId]);
    return row.rows[0].id;
  }

  it('VENUE-REMOVE-01: removing the only (unavailable) venue request leaves the venue not requested', async () => {
    // Arrange
    const { id, venueId } = await seedApprovedEvent();
    await blockVenue(venueId);
    expect((await checklistOf(id)).venue.status).toBe('unavailable');

    // Act
    const response = await remove(id, await onlyBookingId(id)).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId: id, removed: true });
    expect(await bookingExists(id)).toBe(0);
    expect(await safetyOf(id)).toBeUndefined();
    const checklist = await checklistOf(id);
    expect(checklist.venue).toMatchObject({ status: 'not_requested', items: [] });
  });

  it('VENUE-REMOVE-02: a confirmed venue request cannot be removed', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act + Assert
    const response = await remove(id, await onlyBookingId(id)).expect(409);
    expect(response.body.code).toBe('VENUE_REQUEST_NOT_REMOVABLE');
    expect(await bookingExists(id)).toBe(1);
  });

  it('VENUE-REMOVE-03: an unknown venue request is not found', async () => {
    const { id } = await seedApprovedEvent();
    const response = await remove(id, randomUUID()).expect(404);
    expect(response.body.code).toBe('VENUE_REQUEST_NOT_FOUND');
  });

  it('VENUE-REMOVE-04: removing the unavailable request leaves the other venue confirmed', async () => {
    // Arrange: one booking blocked (unavailable), a second at another venue stays approved
    const { id, venueId } = await seedApprovedEvent();
    const unavailableId = await onlyBookingId(id);
    await blockVenue(venueId);
    const other = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         operating_days, operating_start_time, operating_end_time, setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Remove Annex', $1, 50, 'Open weekdays', ARRAY['Thursday'], '08:00', '22:00', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 7 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(other.rows[0].id);
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, 'approved')`,
      [id, other.rows[0].id, SLOT_START, SLOT_END],
    );
    const before = await checklistOf(id);
    expect(before.venue.status).toBe('unavailable');
    expect(before.venue.items).toHaveLength(2);

    // Act
    await remove(id, unavailableId).expect(200);

    // Assert: removing the request resets the approved safety check
    expect(await safetyOf(id)).toBeUndefined();
    // Assert: only the confirmed venue remains, so the section is confirmed
    const after = await checklistOf(id);
    expect(after.venue.status).toBe('confirmed');
    expect(after.venue.items.map((item: { status: string }) => item.status)).toEqual(['confirmed']);
    expect(after.blocking).not.toContain('venue');
  });
});
