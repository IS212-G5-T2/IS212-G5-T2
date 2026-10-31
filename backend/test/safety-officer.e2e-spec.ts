import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/* SPM-129's queue and response contract through the real Nest HTTP pipeline and PostgreSQL. */
const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-129 tests require TEST_DATABASE_URL or DATABASE_URL.');

type Session = { uid: string; cookie: string };
type Seeded = { eventId: string; venueId: string };
const SLOT_START = '2031-06-10T02:00:00.000Z';
const SLOT_END = '2031-06-10T04:00:00.000Z';

describe.skipIf(!database)('SPM-129 Safety Officer queue and decision (PostgreSQL HTTP)', () => {
  let app: INestApplication<Server>;
  let pool: pg.Pool;
  let officer: Session;
  let coordinator: Session;
  let venue: { id: string };
  let eligible: Seeded;
  let venuePending: Seeded;
  let reservedEquipmentWithoutNoneConfirmation: Seeded;
  let equipmentRequested: Seeded;
  let tentativeHoldOnly: Seeded;
  let expiredTentativeHoldOnly: Seeded;
  let mixedVenueBookings: Seeded;
  const userIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(() => {
    process.env.DATABASE_URL = database;
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    await app.init();
    officer = await createSession('SAFETY_OFFICER', 'SPM-129 Safety Officer');
    coordinator = await createSession('COORDINATOR', 'SPM-129 Coordinator');
    venue = await createVenue(officer.uid);
    eligible = await createSafetyEvent('Eligible Safety Event', true, 'approved', 'Reserved');
    venuePending = await createSafetyEvent('Venue Still Pending', true, 'pending', 'Reserved');
    reservedEquipmentWithoutNoneConfirmation = await createSafetyEvent('Reserved Equipment Needs No None Confirmation', false, 'approved', 'Reserved');
    equipmentRequested = await createSafetyEvent('Equipment Still Requested', true, 'approved', 'Requested');
    tentativeHoldOnly = await createSafetyEvent('Tentative Hold Is Not A Booking', true, 'approved', 'Reserved', 'tentative_hold');
    expiredTentativeHoldOnly = await createSafetyEvent('Expired Tentative Hold Is Not A Booking', true, 'approved', 'Reserved', 'tentative_hold');
    await pool.query("UPDATE venue_bookings SET hold_expires_at = '2000-01-01T00:00:00Z' WHERE event_id = $1", [expiredTentativeHoldOnly.eventId]);
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')`,
      [expiredTentativeHoldOnly.eventId],
    );
    mixedVenueBookings = await createSafetyEvent('Approved And Pending Venue Requests', true, 'approved', 'Reserved', 'booking', 'pending');
  });

  afterEach(async () => {
    await app?.close();
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    if (venue?.id) await pool.query('DELETE FROM venues WHERE id = $1', [venue.id]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  const http = () => request(app.getHttpServer());

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `spm129-${role.toLowerCase()}-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const login = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated PostgreSQL session cookie.');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  async function createVenue(ownerId: string) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, 'Level 2', 120, 'No open flames', 15, 10) RETURNING id`,
      [ownerId, `SPM-129 Hall ${randomUUID()}`],
    );
    const id = inserted.rows[0].id;
    await pool.query('INSERT INTO venue_facilities (venue_id, facility_id) SELECT $1, id FROM facilities WHERE name = $2', [id, 'AV System']);
    await pool.query('INSERT INTO venue_accessibility (venue_id, accessibility_id) SELECT $1, id FROM accessibility_features WHERE label = $2', [id, 'Wheelchair access']);
    await pool.query('INSERT INTO venue_layouts (venue_id, layout_id) SELECT $1, id FROM room_layouts WHERE name = $2', [id, 'Theatre']);
    return { id };
  }

  async function createSafetyEvent(name: string, equipmentConfirmed: boolean, bookingStatus: string, equipmentStatus: string, requestKind = 'booking', additionalBookingStatus?: string): Promise<Seeded> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs,
         equipment_needs, equipment_confirmed_at, status, submission_key)
       VALUES ($1, 'spm129-organiser', 'Fixture Organiser', 'organiser@example.test', $2, 'Safety review fixture', 'Fixture description',
         $3, $4, 80, 'Theatre', ARRAY['AV System'], ARRAY['Wheelchair access'], 'Wireless microphone', $5, 'Planning', $6)`,
      [eventId, name, SLOT_START, SLOT_END, equipmentConfirmed ? new Date('2031-06-01T00:00:00.000Z') : null, randomUUID()],
    );
    eventIds.push(eventId);
    const holdExpiresAt = requestKind === 'tentative_hold' ? '2031-06-09T00:00:00.000Z' : null;
    await pool.query(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, venue.id, SLOT_START, SLOT_END, bookingStatus, requestKind, holdExpiresAt],
    );
    if (additionalBookingStatus)
      await pool.query(
        `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, request_kind)
         VALUES ($1, $2, $3, $4, $5, 'booking')`,
        [eventId, venue.id, SLOT_START, SLOT_END, additionalBookingStatus],
      );
    if (equipmentStatus)
      await pool.query(
        'INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, $2, 2, $3)',
        [eventId, 'Microphone', equipmentStatus],
      );
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')`,
      [eventId],
    );
    return { eventId, venueId: venue.id };
  }

  /** SAFETY-QUEUE-01: an eligible confirmed event is returned to an authenticated Safety Officer over HTTP. */
  it('SAFETY-QUEUE-01 lists the eligible event through a persisted Safety Officer session', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.find((row: { id: string }) => row.id === eligible.eventId)).toMatchObject({
      name: 'Eligible Safety Event', expectedAttendance: 80,
      venueRequirements: { layout: 'Theatre', facilities: ['AV System'], accessibility: ['Wheelchair access'] },
    });
  });

  /** SAFETY-QUEUE-01: anonymous and signed-in non-Safety-Officer callers cannot read queue or details. */
  it('SAFETY-QUEUE-01 refuses unauthenticated and non-Safety-Officer reads', async () => {
    await http().get('/api/safety-officer/queue').expect(401);
    await http().get('/api/safety-officer/queue').set('Cookie', coordinator.cookie).expect(403);
    await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', coordinator.cookie).expect(403);
  });

  /** SAFETY-QUEUE-02: event attendance and requirements, venue capacity and layout, and accessibility map from PostgreSQL rows. */
  it('SAFETY-QUEUE-02 reads attendance, capacity, layout, and accessibility from linked database rows', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200);
    expect(result.body).toMatchObject({
      expectedAttendance: 80,
      venueRequirements: { layout: 'Theatre', facilities: ['AV System'], accessibility: ['Wheelchair access'] },
      venues: [{ id: expect.any(String), name: expect.stringMatching(/^SPM-129 Hall/), location: 'Level 2', capacity: 120, layouts: ['Theatre'], accessibility: ['Wheelchair access'] }],
    });
  });

  /** SAFETY-QUEUE-03: technical requirements and reserved equipment are projected from their database rows. */
  it('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200);
    expect(result.body).toMatchObject({ equipmentNeeds: 'Wireless microphone', equipment: [{ name: 'Microphone', quantity: 2 }] });
  });

  /** SAFETY-QUEUE-04: configured venue operating restrictions are visible in event details. */
  it('SAFETY-QUEUE-04 returns the venue restrictions from PostgreSQL', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200);
    expect(result.body.venues[0]).toMatchObject({ restrictions: 'No open flames', facilities: ['AV System'] });
  });

  /** SAFETY-QUEUE-06: pending venue and requested equipment are excluded, while a Reserved equipment line is itself confirmation. */
  it('SAFETY-QUEUE-06 excludes each event with incomplete venue or technical arrangements', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    const ids = result.body.map((row: { id: string }) => row.id);
    expect(ids).toContain(eligible.eventId);
    expect(ids).toContain(reservedEquipmentWithoutNoneConfirmation.eventId);
    expect(ids).not.toContain(venuePending.eventId);
    expect(ids).not.toContain(equipmentRequested.eventId);
    expect(ids).not.toContain(tentativeHoldOnly.eventId);
    expect(ids).not.toContain(expiredTentativeHoldOnly.eventId);
    expect(ids).not.toContain(mixedVenueBookings.eventId);
    await http().get(`/api/safety-officer/queue/${venuePending.eventId}`).set('Cookie', officer.cookie).expect(404);
    await http().get(`/api/safety-officer/queue/${reservedEquipmentWithoutNoneConfirmation.eventId}`).set('Cookie', officer.cookie).expect(200);
  });

  /** SAFETY-QUEUE-06-SUP-HISTORY: a confirmed replacement remains eligible beside rejected, released, or cancelled booking history. */
  it.each(['rejected', 'released', 'cancelled'] as const)('SAFETY-QUEUE-06 keeps a confirmed replacement eligible beside %s venue history', async (historyStatus) => {
    const replacement = await createSafetyEvent(`Replacement with ${historyStatus} history`, true, 'approved', 'Reserved', 'booking', historyStatus);
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).toContain(replacement.eventId);
    await http().get(`/api/safety-officer/queue/${replacement.eventId}`).set('Cookie', officer.cookie).expect(200);
  });

  /** SAFETY-QUEUE-06: an approved tentative hold without an ordinary booking does not confirm an event venue. */
  it('SAFETY-QUEUE-06 excludes an approved tentative hold without a confirmed booking', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(tentativeHoldOnly.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(expiredTentativeHoldOnly.eventId);
    await http().get(`/api/safety-officer/queue/${tentativeHoldOnly.eventId}`).set('Cookie', officer.cookie).expect(404);
    await http().get(`/api/safety-officer/queue/${expiredTentativeHoldOnly.eventId}`).set('Cookie', officer.cookie).expect(404);
  });

  /** SAFETY-QUEUE-06: an additional pending booking makes an otherwise approved venue arrangement incomplete. */
  it('SAFETY-QUEUE-06 excludes an event with approved and pending venue bookings', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(mixedVenueBookings.eventId);
    await http().get(`/api/safety-officer/queue/${mixedVenueBookings.eventId}`).set('Cookie', officer.cookie).expect(404);
  });

  /** SAFETY-QUEUE-05: only a Safety Officer may respond; the response, feedback, queue removal, and repeat refusal persist in PostgreSQL. */
  it('SAFETY-QUEUE-05 persists a response and removes the event from the subsequent queue', async () => {
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).send({ decision: 'rejected', reason: 'Add a fire exit plan.' }).expect(401);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', coordinator.cookie).send({ decision: 'approved' }).expect(403);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'rejected', reason: 'Add a fire exit plan.' }).expect(201);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(409);
    const stored = await pool.query<{ status: string; approver_name: string; feedback: string; decided_at: Date }>(
      'SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId],
    );
    expect(stored.rows[0]).toMatchObject({ status: 'rejected', approver_name: 'SPM-129 Safety Officer', feedback: 'Add a fire exit plan.' });
    expect(stored.rows[0].decided_at).toBeInstanceOf(Date);
    const feedback = await pool.query<{ feedback_text: string }>('SELECT feedback_text FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId]);
    expect(feedback.rows).toEqual([{ feedback_text: 'Add a fire exit plan.' }]);
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(eligible.eventId);
    const unchanged = await pool.query<{ status: string; feedback: string }>('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);
    expect(unchanged.rows[0]).toMatchObject({ status: 'rejected', feedback: 'Add a fire exit plan.' });
  });

  /** SAFETY-QUEUE-05: approval persists, exits the pending queue, and creates no feedback item. */
  it('SAFETY-QUEUE-05 persists an approval without feedback', async () => {
    const next = await createSafetyEvent('Approval Response Event', true, 'approved', 'Reserved');
    await http().post(`/api/safety-officer/queue/${next.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(201);
    const stored = await pool.query<{ status: string; approver_name: string; feedback: string | null; decided_at: Date }>(
      'SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [next.eventId],
    );
    expect(stored.rows[0]).toMatchObject({ status: 'approved', approver_name: 'SPM-129 Safety Officer', feedback: null });
    expect(stored.rows[0].decided_at).toBeInstanceOf(Date);
    expect((await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200)).body.map((row: { id: string }) => row.id)).not.toContain(next.eventId);
  });

  /** SAFETY-QUEUE-05: an event whose arrangements became incomplete cannot receive a response or change state. */
  it('SAFETY-QUEUE-05 refuses a response when the venue is no longer confirmed', async () => {
    await pool.query("UPDATE venue_bookings SET status = 'pending' WHERE event_id = $1", [eligible.eventId]);
    // Restore the pending row after the normal invalidation trigger deletes it, so this verifies
    // the response endpoint's own arrangement recheck against a stale persisted pending request.
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')`,
      [eligible.eventId],
    );
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(409);
    const stored = await pool.query<{ status: string; approver_name: string | null; decided_at: Date | null }>(
      'SELECT status, approver_name, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId],
    );
    expect(stored.rows[0]).toEqual({ status: 'pending', approver_name: null, decided_at: null });
  });

  /** SAFETY-QUEUE-05: current venue availability is rechecked before a pending safety response can be persisted. */
  it('SAFETY-QUEUE-05 refuses a decision when a confirmed venue later becomes unavailable', async () => {
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
       VALUES ($1, $2, $3, 'blocked', 'Maintenance')`,
      [eligible.venueId, SLOT_START, SLOT_END],
    );
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(eligible.eventId);
    await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(404);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(409);
    const stored = await pool.query<{ status: string }>('SELECT status FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);
    expect(stored.rows[0].status).toBe('pending');
  });
});
