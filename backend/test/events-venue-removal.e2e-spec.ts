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
  throw new Error('VENUE-REMOVE tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

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
         setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Stale Hall', $1, 200, 'Open weekdays', 0, 0
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

  /** Blocks the event's venue for its slot, which makes the approved booking unavailable. */
  async function blockVenue(venueId: string) {
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason) VALUES ($1, $2, $3, 'blocked', 'Maintenance')`,
      [venueId, SLOT_START, SLOT_END],
    );
  }

  /** Adds a second venue (at a different venue) with the given booking status to the event. */
  async function addBooking(eventId: string, status: 'pending' | 'rejected' | 'approved') {
    const other = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information,
         setup_time_minutes, turnaround_time_minutes)
       SELECT id, 'Remove Annex', $1, 50, 'Open weekdays', 0, 0
         FROM users WHERE id = $2 RETURNING id`,
      [`Level 7 ${randomUUID()}`, coordinator.uid],
    );
    createdVenueIds.push(other.rows[0].id);
    const booking = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [eventId, other.rows[0].id, SLOT_START, SLOT_END, status],
    );
    return booking.rows[0].id;
  }

  async function bookingExists(id: string) {
    const row = await pool.query('SELECT 1 FROM venue_bookings WHERE id = $1', [id]);
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

  /**
   * An unavailable (blocked-window) venue request can be removed. The response confirms removal, the
   * booking row is gone, the approved safety check is reset, and the venue section is not requested.
   */
  it('VENUE-REMOVE-01: removing the only (unavailable) venue request leaves the venue not requested', async () => {
    // Arrange: the approved booking is blocked for its window; the approved safety check is in place
    const { id, venueId } = await seedApprovedEvent();
    await blockVenue(venueId);
    expect((await checklistOf(id)).venue.status).toBe('unavailable');
    const bookingId = await onlyBookingId(id);
    expect(await safetyOf(id)).toBe('approved');

    // Act
    const response = await remove(id, bookingId).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId: id, removed: true });
    expect(await bookingExists(bookingId)).toBe(0);
    expect(await safetyOf(id)).toBeUndefined();
    const checklist = await checklistOf(id);
    expect(checklist.venue).toMatchObject({ status: 'not_requested', items: [] });
    // The reset reason names the venue change, so the coordinator knows why a re-request is needed.
    expect(checklist.safetyCheck).toMatchObject({ status: 'not_requested', resetReason: 'The venue booking changed' });
    expect(checklist.safetyCheck.resetDate).toEqual(expect.any(String));
  });

  /**
   * Removing a venue request on an event that never had a safety check records no reset reason: there was
   * nothing to reset, so the coordinator sees a plain "not requested" safety check.
   */
  it('VENUE-REMOVE (no safety record): removing a request on an event never safety-checked gives no reset reason', async () => {
    // Arrange: the event has an unavailable booking but no safety record at all
    const { id, venueId } = await seedApprovedEvent();
    await pool.query('DELETE FROM event_safety_checks WHERE event_id = $1', [id]);
    await blockVenue(venueId);
    const bookingId = await onlyBookingId(id);
    expect(await safetyOf(id)).toBeUndefined();

    // Act
    await remove(id, bookingId).expect(200);

    // Assert: no reset reason is recorded for an event that had no safety check to reset
    const checklist = await checklistOf(id);
    expect(checklist.safetyCheck.status).toBe('not_requested');
    expect(checklist.safetyCheck.resetReason).toBeUndefined();
  });

  /**
   * A confirmed (approved and not blocked) venue request is not unavailable, so it cannot be removed
   * and the booking row stays.
   */
  it('VENUE-REMOVE-02: a confirmed venue request cannot be removed', async () => {
    // Arrange
    const { id } = await seedApprovedEvent();

    // Act + Assert
    const response = await remove(id, await onlyBookingId(id)).expect(409);
    expect(response.body.code).toBe('VENUE_REQUEST_NOT_REMOVABLE');
    expect(await bookingExists(await onlyBookingId(id))).toBe(1);
  });

  /** A venue request id that does not belong to the event is reported as not found. */
  it('VENUE-REMOVE-03: an unknown venue request is not found', async () => {
    const { id } = await seedApprovedEvent();
    const response = await remove(id, randomUUID()).expect(404);
    expect(response.body.code).toBe('VENUE_REQUEST_NOT_FOUND');
  });

  /**
   * Removing one unavailable request leaves the other venue's approved booking in place. The approved
   * safety check is re-approved after the arrange step, so the reset caused by removal is observed.
   */
  it('VENUE-REMOVE-04: removing the unavailable request leaves the other venue confirmed', async () => {
    // Arrange: one booking blocked (unavailable), a second at another venue stays approved
    const { id, venueId } = await seedApprovedEvent();
    const unavailableId = await onlyBookingId(id);
    await blockVenue(venueId);
    await addBooking(id, 'approved');
    // Inserting the second booking resets the safety check, so re-approve it before acting.
    await approveSafety(id);
    const before = await checklistOf(id);
    expect(before.venue.status).toBe('unavailable');
    expect(before.venue.items).toHaveLength(2);
    expect(await safetyOf(id)).toBe('approved');

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

  /** A pending venue request is awaiting the venue's decision, so it cannot be removed (409). */
  it('VENUE-REMOVE-05: a pending venue request cannot be removed', async () => {
    // Arrange: a second request is still pending at another venue
    const { id } = await seedApprovedEvent();
    const pendingId = await addBooking(id, 'pending');

    // Act + Assert
    const response = await remove(id, pendingId).expect(409);
    expect(response.body.code).toBe('VENUE_REQUEST_NOT_REMOVABLE');
    expect(await bookingExists(pendingId)).toBe(1);
  });

  /** A rejected venue request counts as unavailable, so the coordinator can remove it (200). */
  it('VENUE-REMOVE-06: a rejected venue request is removed from the list', async () => {
    // Arrange: a second request was rejected by the venue
    const { id } = await seedApprovedEvent();
    const rejectedId = await addBooking(id, 'rejected');
    await approveSafety(id);
    expect(await safetyOf(id)).toBe('approved');

    // Act
    const response = await remove(id, rejectedId).expect(200);

    // Assert
    expect(response.body).toMatchObject({ eventId: id, venueRequestId: rejectedId, removed: true });
    expect(await bookingExists(rejectedId)).toBe(0);
    expect(await safetyOf(id)).toBeUndefined();
  });

  /** A coordinator who is not assigned to the event gets 403 and the request is left unchanged. */
  it('VENUE-REMOVE-07: a coordinator not assigned to the event is refused with 403', async () => {
    // Arrange: an unavailable request on an event assigned to Coordinator 1, and a different coordinator
    const { id, venueId } = await seedApprovedEvent();
    await blockVenue(venueId);
    const otherCoordinator = await createSession('COORDINATOR', 'Coordinator 2');

    // Act
    const response = await http()
      .delete(`/api/events/${id}/venue-requests/${await onlyBookingId(id)}`)
      .set('Cookie', otherCoordinator.cookie)
      .expect(403);

    // Assert
    expect(response.body.message).toBe('You do not have permission to confirm this event.');
    expect(await bookingExists(await onlyBookingId(id))).toBe(1);
    expect(await safetyOf(id)).toBe('approved');
  });

  /** Removal is only possible while the event is in Planning; a Confirmed event refuses it (422). */
  it('VENUE-REMOVE-08: removal on an event that is not in Planning is refused with 422', async () => {
    // Arrange: an unavailable request on an event that has already been confirmed
    const { id, venueId } = await seedApprovedEvent();
    await blockVenue(venueId);
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [id]);

    // Act
    const response = await remove(id, await onlyBookingId(id)).expect(422);

    // Assert
    expect(response.body.code).toBe('EVENT_NOT_CONFIRMABLE');
    expect(await bookingExists(await onlyBookingId(id))).toBe(1);
  });

  /** A request with no session is refused with 401 and nothing is removed. */
  it('VENUE-REMOVE-09: no session gets 401 and the venue request is kept', async () => {
    // Arrange
    const { id, venueId } = await seedApprovedEvent();
    await blockVenue(venueId);

    // Act + Assert
    await http().delete(`/api/events/${id}/venue-requests/${await onlyBookingId(id)}`).expect(401);
    expect(await bookingExists(await onlyBookingId(id))).toBe(1);
  });
});
