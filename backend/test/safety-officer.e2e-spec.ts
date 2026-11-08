import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/* SPM-129's queue and SPM-130's safety decisions through the real Nest HTTP pipeline and PostgreSQL. */
const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-129 tests require TEST_DATABASE_URL or DATABASE_URL.');

type Session = { uid: string; cookie: string };
type Seeded = { eventId: string; venueId: string; venueBookingId: string; equipmentId?: string };
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
  const venueIds: string[] = [];

  beforeAll(() => {
    process.env.DATABASE_URL = database;
    pool = new pg.Pool({ connectionString: database });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication({ logger: ['warn', 'log'] });
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
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')
       ON CONFLICT (event_id) DO UPDATE SET status = 'pending',
         requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by`,
      [expiredTentativeHoldOnly.eventId],
    );
    mixedVenueBookings = await createSafetyEvent('Approved And Pending Venue Requests', true, 'approved', 'Reserved', 'booking', 'pending');
  });

  afterEach(async () => {
    await app?.close();
    if (eventIds.length) {
      await pool.query('DELETE FROM notifications WHERE related_event_id = ANY($1::uuid[])', [eventIds]);
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    }
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds.splice(0)]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  const http = () => request(app.getHttpServer());

  async function expectSafetyDecisionUnchanged(eventId: string) {
    expect((await pool.query(
      'SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eventId],
    )).rows).toEqual([{ status: 'pending', approver_name: null, feedback: null, decided_at: null }]);
    expect((await pool.query(
      'SELECT feedback_text FROM safety_check_feedback_items WHERE event_id = $1 ORDER BY feedback_text', [eventId],
    )).rows).toEqual([]);
  }

  async function expectUnauthorizedSafetyDecision(body: { decision: string; reason?: string; changes?: string[] }) {
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).send(body).expect(401);
    await expectSafetyDecisionUnchanged(eligible.eventId);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', coordinator.cookie).send(body).expect(403);
    await expectSafetyDecisionUnchanged(eligible.eventId);
  }

  async function createSession(role: string, name: string): Promise<Session> {
    const email = `spm129-${role.toLowerCase()}-${randomUUID()}@example.test`;
    const client = await pool.connect();
    let uid!: string;
    try {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
        [email, name],
      );
      uid = created.rows[0].id;
      userIds.push(uid);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    } finally {
      client.release();
    }
    const login = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated PostgreSQL session cookie.');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  async function createVenue(ownerId: string) {
    const client = await pool.connect();
    let id!: string;
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
         VALUES ($1, $2, 'Level 2', 120, 'No open flames', 15, 10) RETURNING id`,
        [ownerId, `SPM-129 Hall ${randomUUID()}`],
      );
      id = inserted.rows[0].id;
      venueIds.push(id);
      await client.query('INSERT INTO venue_facilities (venue_id, facility_id) SELECT $1, id FROM facilities WHERE name = $2', [id, 'AV System']);
      await client.query('INSERT INTO venue_accessibility (venue_id, accessibility_id) SELECT $1, id FROM accessibility_features WHERE label = $2', [id, 'Wheelchair access']);
      await client.query('INSERT INTO venue_layouts (venue_id, layout_id) SELECT $1, id FROM room_layouts WHERE name = $2', [id, 'Theatre']);
    } finally {
      client.release();
    }
    return { id };
  }

  async function createSafetyEvent(name: string, equipmentConfirmed: boolean, bookingStatus: string, equipmentStatus: string, requestKind = 'booking', additionalBookingStatus?: string): Promise<Seeded> {
    const eventId = randomUUID();
    const client = await pool.connect();
    let venueBookingId!: string;
    let equipmentId: string | undefined;
    try {
      await client.query(
        `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
           start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities, accessibility_needs,
           equipment_needs, equipment_confirmed_at, status, submission_key)
         VALUES ($1, 'spm129-organiser', 'Fixture Organiser', 'organiser@example.test', $2, 'Safety review fixture', 'Fixture description',
           $3, $4, 80, 'Theatre', ARRAY['AV System'], ARRAY['Wheelchair access'], 'Wireless microphone', $5, 'Planning', $6)`,
        [eventId, name, SLOT_START, SLOT_END, equipmentConfirmed ? new Date('2031-06-01T00:00:00.000Z') : null, randomUUID()],
      );
      eventIds.push(eventId);
      const holdExpiresAt = requestKind === 'tentative_hold' ? '2031-06-09T00:00:00.000Z' : null;
      const booking = await client.query<{ id: string }>(
        `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [eventId, venue.id, SLOT_START, SLOT_END, bookingStatus, requestKind, holdExpiresAt],
      );
      venueBookingId = booking.rows[0].id;
      if (additionalBookingStatus)
        await client.query(
          `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status, request_kind)
           VALUES ($1, $2, $3, $4, $5, 'booking')`,
          [eventId, venue.id, SLOT_START, SLOT_END, additionalBookingStatus],
        );
      if (equipmentStatus)
        equipmentId = (await client.query<{ id: string }>(
          'INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, $2, 2, $3) RETURNING id',
          [eventId, 'Microphone', equipmentStatus],
        )).rows[0].id;
      await client.query(
        `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
         VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')`,
        [eventId],
      );
    } finally {
      client.release();
    }
    return { eventId, venueId: venue.id, venueBookingId, equipmentId };
  }

  // Traceability: Jira 129 AC1 (matrix 36831243)
  /** SAFETY-QUEUE-01: an eligible confirmed event is returned to an authenticated Safety Officer over HTTP. */
  it('SAFETY-QUEUE-01 lists the eligible event through a persisted Safety Officer session', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.find((row: { id: string }) => row.id === eligible.eventId)).toMatchObject({
      name: 'Eligible Safety Event', expectedAttendance: 80,
      venueRequirements: { layout: 'Theatre', facilities: ['AV System'], accessibility: ['Wheelchair access'] },
    });
  });

  // Traceability: Jira 129 AC1 (matrix 36831243)
  /** SAFETY-QUEUE-01: anonymous and signed-in non-Safety-Officer callers cannot read queue or details. */
  it('SAFETY-QUEUE-01 refuses unauthenticated and non-Safety-Officer reads', async () => {
    await http().get('/api/safety-officer/queue').expect(401);
    await http().get('/api/safety-officer/queue').set('Cookie', coordinator.cookie).expect(403);
    await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', coordinator.cookie).expect(403);
  });

  // Traceability: Jira 131 AC6 (matrix 36798544)
  /** SAFETY-OUTCOME-06: saved registration settings are required for initial and repeat safety requests when registration is enabled. */
  it('SAFETY-OUTCOME-06 gates initial and repeat safety requests on persisted enabled registration settings', async () => {
    await pool.query('UPDATE events SET coordinator_id = $2, registration_enabled = true, registration_opens_at = NULL, registration_closes_at = NULL WHERE id = $1', [eligible.eventId, coordinator.uid]);
    await pool.query('DELETE FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);

    const initialChecklist = await http().get(`/api/events/${eligible.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(initialChecklist.body.checklist.registration).toEqual({ enabled: true, status: 'pending' });
    expect(initialChecklist.body.checklist.blocking).toContain('registration');
    const blockedInitial = await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(blockedInitial.body.code).toBe('SAFETY_PREREQUISITES_NOT_MET');
    expect(await pool.query('SELECT count(*)::int AS n FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].n)).toBe(0);

    const settings = {
      registrationEnabled: true,
      registrationOpensAt: '2031-06-02T00:00:00.000Z',
      registrationClosesAt: '2031-06-09T00:00:00.000Z',
      capacity: 80,
      version: 0,
    };
    await http().put(`/api/events/${eligible.eventId}/registration-settings`).set('Cookie', coordinator.cookie).send(settings).expect(200);
    await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);

    await pool.query(
      `UPDATE event_safety_checks SET status = 'changes_needed', approver_name = 'Safety Officer', decided_at = now()
        WHERE event_id = $1`, [eligible.eventId],
    );
    await pool.query('UPDATE events SET registration_opens_at = NULL, registration_closes_at = NULL WHERE id = $1', [eligible.eventId]);
    const blockedRerequest = await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(blockedRerequest.body.code).toBe('SAFETY_PREREQUISITES_NOT_MET');
    expect(await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].status)).toBe('changes_needed');

    await http().put(`/api/events/${eligible.eventId}/registration-settings`).set('Cookie', coordinator.cookie).send({ ...settings, version: 1 }).expect(200);
    await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);
  });

  // Traceability: Jira 131 AC6 (matrix 36798544)
  /** SAFETY-OUTCOME-06: a disabled registration setting is treated as an intentional no-registration configuration. */
  it('SAFETY-OUTCOME-06 allows a safety request when registration is deliberately disabled', async () => {
    await pool.query('UPDATE events SET coordinator_id = $2, registration_enabled = false, registration_opens_at = NULL, registration_closes_at = NULL WHERE id = $1', [eligible.eventId, coordinator.uid]);
    await pool.query('UPDATE event_safety_checks SET status = \'changes_needed\' WHERE event_id = $1', [eligible.eventId]);
    const checklist = await http().get(`/api/events/${eligible.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(checklist.body.checklist.registration).toEqual({ enabled: false, status: 'confirmed' });
    expect(checklist.body.checklist.blocking).not.toContain('registration');
    await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(200);
  });

  // Traceability: Jira 129 AC2 (matrix 36831243)
  /** SAFETY-QUEUE-02: event attendance and requirements, venue capacity and layout, and accessibility map from PostgreSQL rows. */
  it('SAFETY-QUEUE-02 reads attendance, capacity, layout, and accessibility from linked database rows', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200).expect('Cache-Control', 'no-store');
    expect(result.body).toMatchObject({
      expectedAttendance: 80,
      venueRequirements: { layout: 'Theatre', facilities: ['AV System'], accessibility: ['Wheelchair access'] },
      venues: [{ id: expect.any(String), name: expect.stringMatching(/^SPM-129 Hall/), location: 'Level 2', capacity: 120, layouts: ['Theatre'], accessibility: ['Wheelchair access'] }],
    });
  });

  // Traceability: Jira 129 AC3 (matrix 36831243)
  /** SAFETY-QUEUE-03: technical requirements and reserved equipment are projected from their database rows. */
  it('SAFETY-QUEUE-03 returns technical arrangements and reserved equipment from PostgreSQL', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200);
    expect(result.body).toMatchObject({ equipmentNeeds: 'Wireless microphone', equipment: [{ id: expect.any(String), name: 'Microphone', quantity: 2 }] });
  });

  // Traceability: Jira 129 AC4 (matrix 36831243)
  /** SAFETY-QUEUE-04: configured venue operating restrictions are visible in event details. */
  it('SAFETY-QUEUE-04 returns the venue restrictions from PostgreSQL', async () => {
    const result = await http().get(`/api/safety-officer/queue/${eligible.eventId}`).set('Cookie', officer.cookie).expect(200);
    expect(result.body.venues[0]).toMatchObject({ restrictions: 'No open flames', facilities: ['AV System'] });
  });

  // Traceability: Jira 129 AC6 (matrix 36831243)
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

  // Traceability: Jira 129 AC6 (matrix 36831243)
  /** SAFETY-QUEUE-06-SUP-HISTORY: a confirmed replacement remains eligible beside rejected, released, or cancelled booking history. */
  it.each(['rejected', 'released', 'cancelled'] as const)('SAFETY-QUEUE-06 keeps a confirmed replacement eligible beside %s venue history', async (historyStatus) => {
    const replacement = await createSafetyEvent(`Replacement with ${historyStatus} history`, true, 'approved', 'Reserved', 'booking', historyStatus);
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).toContain(replacement.eventId);
    await http().get(`/api/safety-officer/queue/${replacement.eventId}`).set('Cookie', officer.cookie).expect(200);
  });

  /** SAFETY-QUEUE-06-SUP-HISTORY: the same persisted full-slot replacement is eligible for officer approval and coordinator Confirm. */
  it('SAFETY-QUEUE-06-SUP-HISTORY accepts a same-venue full-slot replacement through queue, decision and Confirm', async () => {
    const replacement = await createSafetyEvent('Full-slot venue replacement', true, 'approved', 'Reserved', 'booking', 'rejected');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [replacement.eventId, coordinator.uid]);

    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).toContain(replacement.eventId);
    await http().get(`/api/safety-officer/queue/${replacement.eventId}`).set('Cookie', officer.cookie).expect(200);
    await http().post(`/api/safety-officer/queue/${replacement.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(201);

    const readiness = await http().get(`/api/events/${replacement.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(readiness.body).toMatchObject({ ready: true, outstanding: [], checklist: { venue: { status: 'confirmed' } } });
    await http().post(`/api/events/${replacement.eventId}/status-change`).set('Cookie', coordinator.cookie).send({ targetStatus: 'Confirmed' }).expect(200);
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [replacement.eventId])).rows).toEqual([{ status: 'Confirmed' }]);
    expect((await pool.query('SELECT from_status, to_status, actor_id FROM event_status_history WHERE event_id = $1', [replacement.eventId])).rows)
      .toEqual([{ from_status: 'Planning', to_status: 'Confirmed', actor_id: coordinator.uid }]);
  });

  /** SAFETY-QUEUE-06-SUP-HISTORY: SQL-derived identity and both interval boundaries prevent unrelated or incomplete replacements from clearing rejection. */
  it.each([
    ['another venue', SLOT_START, SLOT_END, true],
    ['a partial start', '2031-06-10T03:00:00.000Z', SLOT_END, false],
    ['a partial end', SLOT_START, '2031-06-10T03:00:00.000Z', false],
    ['an adjacent slot', SLOT_END, '2031-06-10T05:00:00.000Z', false],
  ] as const)('SAFETY-QUEUE-06-SUP-HISTORY blocks %s replacement through queue, detail, decision and Confirm', async (_label, start, end, anotherVenue) => {
    const replacement = await createSafetyEvent('Unresolved rejected venue slot', true, 'approved', 'Reserved', 'booking', 'rejected');
    const replacementVenue = anotherVenue ? await createVenue(officer.uid) : venue;
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [replacement.eventId, coordinator.uid]);
    await pool.query(
      "UPDATE venue_bookings SET venue_id = $2, start_at = $3, end_at = $4 WHERE event_id = $1 AND status = 'approved'",
      [replacement.eventId, replacementVenue.id, start, end],
    );
    // Arrangement changes invalidate the check. Restore a stale pending request to exercise each endpoint's own gate.
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')`,
      [replacement.eventId],
    );

    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(replacement.eventId);
    await http().get(`/api/safety-officer/queue/${replacement.eventId}`).set('Cookie', officer.cookie).expect(404);
    await http().post(`/api/safety-officer/queue/${replacement.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(409);
    expect((await pool.query('SELECT status, approver_name, decided_at FROM event_safety_checks WHERE event_id = $1', [replacement.eventId])).rows)
      .toEqual([{ status: 'pending', approver_name: null, decided_at: null }]);

    // Isolate Confirm's venue gate from the intentionally pending safety outcome after verifying the refusal did not change it.
    await pool.query("UPDATE event_safety_checks SET status = 'approved' WHERE event_id = $1", [replacement.eventId]);
    const readiness = await http().get(`/api/events/${replacement.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(readiness.body).toMatchObject({ ready: false, checklist: { venue: { status: 'unavailable' } } });
    expect(readiness.body.outstanding).toContainEqual(expect.objectContaining({ type: 'venue', state: 'Rejected' }));
    const confirm = await http().post(`/api/events/${replacement.eventId}/status-change`).set('Cookie', coordinator.cookie).send({ targetStatus: 'Confirmed' }).expect(422);
    expect(confirm.body).toMatchObject({ code: 'CONFIRM_BLOCKED', outstanding: expect.arrayContaining([expect.objectContaining({ type: 'venue', state: 'Rejected' })]) });
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [replacement.eventId])).rows).toEqual([{ status: 'Planning' }]);
    expect((await pool.query('SELECT event_id FROM event_status_history WHERE event_id = $1', [replacement.eventId])).rows).toEqual([]);
  });

  // Traceability: Jira 129 AC6 (matrix 36831243)
  /** SAFETY-QUEUE-06: an approved tentative hold without an ordinary booking does not confirm an event venue. */
  it('SAFETY-QUEUE-06 excludes an approved tentative hold without a confirmed booking', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(tentativeHoldOnly.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(expiredTentativeHoldOnly.eventId);
    await http().get(`/api/safety-officer/queue/${tentativeHoldOnly.eventId}`).set('Cookie', officer.cookie).expect(404);
    await http().get(`/api/safety-officer/queue/${expiredTentativeHoldOnly.eventId}`).set('Cookie', officer.cookie).expect(404);
  });

  // Traceability: Jira 129 AC6 (matrix 36831243)
  /** SAFETY-QUEUE-06: an additional pending booking makes an otherwise approved venue arrangement incomplete. */
  it('SAFETY-QUEUE-06 excludes an event with approved and pending venue bookings', async () => {
    const result = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(result.body.map((row: { id: string }) => row.id)).toContain(eligible.eventId);
    expect(result.body.map((row: { id: string }) => row.id)).not.toContain(mixedVenueBookings.eventId);
    await http().get(`/api/safety-officer/queue/${mixedVenueBookings.eventId}`).set('Cookie', officer.cookie).expect(404);
  });

  // Traceability: Jira 130 AC1 (matrix 36798526)
  /** SAFETY-DECISION-01: an authenticated Safety Officer can approve an arrangement that is still pending. */
  it('SAFETY-DECISION-01 persists approval and removes the event from the decision queue', async () => {
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved' }).expect(201);
    expect((await pool.query('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual([{ status: 'approved', feedback: null }]);
    expect((await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200)).body.map((row: { id: string }) => row.id))
      .not.toContain(eligible.eventId);
  });

  // Traceability: Jira 130 AC2 (matrix 36798526)
  /** SAFETY-DECISION-02: a nonblank rejection reason is persisted with the rejected outcome. */
  it('SAFETY-DECISION-02 persists rejection with its required reason', async () => {
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'rejected', reason: 'Add a fire exit plan.' }).expect(201);
    expect((await pool.query('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual([{ status: 'rejected', feedback: 'Add a fire exit plan.' }]);
    expect((await pool.query('SELECT feedback_text FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual([{ feedback_text: 'Add a fire exit plan.' }]);
  });

  // Traceability: Jira 130 AC3 (matrix 36798526)
  /** SAFETY-DECISION-03: a nonblank change description is persisted with the changes-needed outcome. */
  it('SAFETY-DECISION-03 persists requested changes with their description', async () => {
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [{ text: 'Confirm a backup microphone.', venueIds: [eligible.venueBookingId], equipmentIds: [eligible.equipmentId] }] }).expect(201);
    expect((await pool.query('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual([{ status: 'changes_needed', feedback: 'Confirm a backup microphone.' }]);
    expect((await pool.query('SELECT feedback_text FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual([{ feedback_text: 'Confirm a backup microphone.' }]);
  });

  // Traceability: Jira 130 AC3 (matrix 36798526)
  /** SAFETY-DECISION-03: three submitted change rows become independent coordinator items that must all be resolved before re-request. */
  it('SAFETY-DECISION-03 persists and independently resolves multiple requested changes', async () => {
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [eligible.eventId, coordinator.uid]);
    await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [
        { text: 'Add a fire exit plan.', venueIds: [eligible.venueBookingId] },
        { text: 'Confirm occupancy.', equipmentIds: [eligible.equipmentId] },
        { text: 'Label the emergency lighting.', venueIds: [eligible.venueBookingId], equipmentIds: [eligible.equipmentId] },
      ] }).expect(201);

    const feedback = await pool.query<{ id: string; feedback_text: string; resolved_by_coordinator_at: Date | null }>(
      'SELECT id, feedback_text, resolved_by_coordinator_at FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId],
    );
    expect(feedback.rows.map((row) => row.feedback_text).sort()).toEqual([
      'Add a fire exit plan.', 'Confirm occupancy.', 'Label the emergency lighting.',
    ].sort());
    expect(feedback.rows).toHaveLength(3);
    const checklist = await http().get(`/api/events/${eligible.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(checklist.body.checklist.safetyCheck.feedback).toHaveLength(3);
    expect(checklist.body.checklist.safetyCheck.feedback.every((item: { resolvedByCoordinatorAt?: string }) => !item.resolvedByCoordinatorAt)).toBe(true);

    await http().post(`/api/events/${eligible.eventId}/safety-check/feedback/${feedback.rows[0].id}/resolve`)
      .set('Cookie', coordinator.cookie).expect(200);
    const blocked = await http().post(`/api/events/${eligible.eventId}/safety-check/request`)
      .set('Cookie', coordinator.cookie).expect(422);
    expect(blocked.body.code).toBe('SAFETY_PREREQUISITES_NOT_MET');
    expect(await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].status))
      .toBe('changes_needed');
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1 AND resolved_by_coordinator_at IS NULL', [eligible.eventId]).then((result) => result.rows[0].count))
      .toBe(2);

    await Promise.all(feedback.rows.slice(1).map((item) => http()
      .post(`/api/events/${eligible.eventId}/safety-check/feedback/${item.id}/resolve`).set('Cookie', coordinator.cookie).expect(200)));
    await http().post(`/api/events/${eligible.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    expect(await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].status))
      .toBe('changes_needed');
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].count))
      .toBe(3);
  });

  // Traceability: Jira 130 AC4 (matrix 36798526)
  /** SAFETY-DECISION-04: a blank row rejects the complete changes decision without persisting any subset. */
  it('SAFETY-DECISION-04 refuses a changes array containing a blank row atomically', async () => {
    const before = await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);
    const response = await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [{ text: 'Add a fire exit plan.', venueIds: [eligible.venueBookingId] }, { text: '  ', venueIds: [eligible.venueBookingId] }] });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Change 2');
    expect((await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual(before.rows);
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].count))
      .toBe(0);
  });

  // Traceability: Jira 131 AC4 (matrix 36798544)
  /** SAFETY-OUTCOME-04: legacy reason and string-row payloads cannot persist feedback with empty review identifiers. */
  it.each([
    ['legacy reason', { decision: 'changes_needed', reason: 'Review the microphone.' }],
    ['legacy string row', { decision: 'changes_needed', changes: ['Review the microphone.'] }],
  ])('SAFETY-OUTCOME-04 refuses %s without writing decision or feedback', async (_label, body) => {
    const before = await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);
    const response = await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie).send(body);
    expect(response.status).toBe(400);
    expect((await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual(before.rows);
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].count))
      .toBe(0);
  });

  // Traceability: Jira 130 AC4 (matrix 36798526)
  /** SAFETY-DECISION-04: rejected and changes-needed decisions with absent or whitespace-only reasons are refused without a database change. */
  it.each([
    ['rejected', undefined], ['rejected', '   '], ['changes_needed', undefined], ['changes_needed', '\t '],
  ] as const)('SAFETY-DECISION-04 refuses %s with missing or blank feedback', async (decision, reason) => {
    const storedBefore = await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId]);
    const response = await http().post(`/api/safety-officer/queue/${eligible.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision, ...(reason === undefined ? {} : { reason }) });
    expect(response.status).toBe(400);
    expect((await pool.query('SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [eligible.eventId])).rows)
      .toEqual(storedBefore.rows);
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [eligible.eventId]).then((result) => result.rows[0].count))
      .toBe(0);
  });

  // Traceability: Jira 130 AC1 (matrix 36798526)
  /** SAFETY-DECISION-01: approval with a valid payload rejects missing and non-officer sessions without changing the pending row. */
  it('SAFETY-DECISION-01 refuses unauthorized approval attempts and preserves the pending decision', async () => {
    await expectUnauthorizedSafetyDecision({ decision: 'approved' });
  });

  // Traceability: Jira 130 AC2 (matrix 36798526)
  /** SAFETY-DECISION-02: rejection with a valid reason rejects missing and non-officer sessions without changing decision or feedback. */
  it('SAFETY-DECISION-02 refuses unauthorized rejection attempts and preserves the pending decision', async () => {
    await expectUnauthorizedSafetyDecision({ decision: 'rejected', reason: 'Add a fire exit plan.' });
  });

  // Traceability: Jira 130 AC3 (matrix 36798526)
  /** SAFETY-DECISION-03: request changes with a valid row rejects missing and non-officer sessions without changing decision or feedback. */
  it('SAFETY-DECISION-03 refuses unauthorized change-request attempts and preserves the pending decision', async () => {
    await expectUnauthorizedSafetyDecision({ decision: 'changes_needed', changes: [{ text: 'Confirm occupancy.', venueIds: [eligible.venueBookingId] }] as unknown as string[] });
  });

  // Traceability: Jira 129 AC5 (matrix 36831243)
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

  // Traceability: Jira 129 AC5 (matrix 36831243)
  /** SAFETY-QUEUE-05: approval persists, exits the pending queue, and creates no feedback item. */
  it('SAFETY-QUEUE-05 persists an approval without feedback', async () => {
    const next = await createSafetyEvent('Approval Response Event', true, 'approved', 'Reserved');
    await http().post(`/api/safety-officer/queue/${next.eventId}/decision`).set('Cookie', officer.cookie).send({ decision: 'approved', reason: 'Stale rejection reason' }).expect(201);
    const stored = await pool.query<{ status: string; approver_name: string; feedback: string | null; decided_at: Date }>(
      'SELECT status, approver_name, feedback, decided_at FROM event_safety_checks WHERE event_id = $1', [next.eventId],
    );
    expect(stored.rows[0]).toMatchObject({ status: 'approved', approver_name: 'SPM-129 Safety Officer', feedback: null });
    expect(stored.rows[0].decided_at).toBeInstanceOf(Date);
    expect(await pool.query('SELECT count(*)::int AS count FROM safety_check_feedback_items WHERE event_id = $1', [next.eventId]).then((result) => result.rows[0].count)).toBe(0);
    expect((await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200)).body.map((row: { id: string }) => row.id)).not.toContain(next.eventId);
  });

  // Traceability: Jira 131 AC1 (matrix 36798544)
  /** SAFETY-OUTCOME-01: the assigned coordinator receives a durable notice when the Safety Officer responds. */
  it('SAFETY-OUTCOME-01 notifies the assigned coordinator of a safety response', async () => {
    const event = await createSafetyEvent('Coordinator Safety Response Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);

    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'approved' }).expect(201);

    const notices = await http().get('/api/notifications').set('Cookie', coordinator.cookie).expect(200);
    expect(notices.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'coordinator_safety_response',
        message: 'The Safety Officer responded to the safety check for Coordinator Safety Response Event.',
        relatedEventId: event.eventId,
        audienceUserId: coordinator.uid,
        read: false,
      }),
    ]));
  });

  // Traceability: Jira 131 AC2 (matrix 36798544)
  /** SAFETY-OUTCOME-02: the coordinator's authenticated planning read exposes the response decision and exact feedback text. */
  it('SAFETY-OUTCOME-02 shows the safety decision and comments to the assigned coordinator', async () => {
    const event = await createSafetyEvent('Visible Safety Outcome Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);

    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [{ text: 'Provide the accessible route plan.', venueIds: [event.venueBookingId] }] }).expect(201);

    const result = await http().get(`/api/events/${event.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(result.body.checklist.safetyCheck).toMatchObject({
      status: 'changes_needed',
      feedback: [expect.objectContaining({ text: 'Provide the accessible route plan.' })],
    });
  });

  /**
   * SAFETY-OUTCOME-01-SUP-ISOLATION (AC1, Isolation): only the coordinator assigned to the event is notified.
   * A second coordinator, assigned to nothing, receives no safety response notice for it.
   */
  it('SAFETY-OUTCOME-01-SUP-ISOLATION sends no safety response notice to a coordinator who is not assigned to the event', async () => {
    const event = await createSafetyEvent('Isolated Safety Response Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);
    const unassigned = await createSession('COORDINATOR', 'SPM-131 Unassigned Coordinator');

    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'approved' }).expect(201);

    // Control: the assigned coordinator did receive exactly one notice, so an empty result below is not vacuous.
    const assigned = await http().get('/api/notifications').set('Cookie', coordinator.cookie).expect(200);
    expect(assigned.body.filter((n: { relatedEventId: string }) => n.relatedEventId === event.eventId)).toHaveLength(1);
    // The unassigned coordinator sees nothing about this event, over HTTP and in storage.
    const other = await http().get('/api/notifications').set('Cookie', unassigned.cookie).expect(200);
    expect(other.body.filter((n: { relatedEventId: string; type: string }) =>
      n.relatedEventId === event.eventId || n.type === 'coordinator_safety_response')).toEqual([]);
    expect((await pool.query('SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1', [unassigned.uid])).rows[0].count).toBe(0);
  });

  /**
   * SAFETY-OUTCOME-01-SUP-SECURITY (AC1, Security): the coordinator's safety response notice is private to the assigned
   * coordinator. An organiser and an unassigned coordinator cannot list it or mark it read.
   */
  it('SAFETY-OUTCOME-01-SUP-SECURITY keeps the coordinator safety response notice unreadable by an organiser or an unassigned coordinator', async () => {
    const event = await createSafetyEvent('Private Safety Response Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);
    const unassigned = await createSession('COORDINATOR', 'SPM-131 Unassigned Coordinator');
    const organiser = await createSession('ORGANISER', 'SPM-131 Organiser');
    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'approved' }).expect(201);
    const notice = (await http().get('/api/notifications').set('Cookie', coordinator.cookie).expect(200)).body
      .find((n: { type: string }) => n.type === 'coordinator_safety_response');
    expect(notice).toBeDefined();

    for (const intruder of [organiser, unassigned]) {
      // Listing: the notice and the event never appear in the intruder's feed.
      const feed = await http().get('/api/notifications').set('Cookie', intruder.cookie).expect(200);
      expect(feed.body.map((n: { id: string }) => n.id)).not.toContain(notice.id);
      expect(JSON.stringify(feed.body)).not.toContain('Private Safety Response Event');
      // Direct access by id: refused as not found, and the notice stays unread for its owner.
      await http().post(`/api/notifications/${notice.id}/read`).set('Cookie', intruder.cookie).expect(404);
    }
    await http().get('/api/notifications').expect(401);
    expect((await pool.query('SELECT read FROM notifications WHERE id = $1', [notice.id])).rows[0].read).toBe(false);
  });

  /**
   * SAFETY-OUTCOME-02-SUP-SECURITY (AC2, Security): the decision and comments are shown only to the coordinator assigned
   * to the event. An unassigned coordinator, an organiser and an anonymous caller are refused and receive no comment text.
   */
  it('SAFETY-OUTCOME-02-SUP-SECURITY refuses the safety decision and comments to a coordinator who is not assigned to the event', async () => {
    const event = await createSafetyEvent('Confidential Safety Outcome Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);
    const unassigned = await createSession('COORDINATOR', 'SPM-131 Unassigned Coordinator');
    const organiser = await createSession('ORGANISER', 'SPM-131 Organiser');
    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [{ text: 'Provide the confidential evacuation plan.', venueIds: [event.venueBookingId] }] }).expect(201);
    const url = `/api/events/${event.eventId}/arrangements-status`;

    // Control: the assigned coordinator sees the decision and the comment.
    const visible = await http().get(url).set('Cookie', coordinator.cookie).expect(200);
    expect(visible.body.checklist.safetyCheck.feedback[0].text).toBe('Provide the confidential evacuation plan.');
    for (const intruder of [unassigned, organiser]) {
      const refused = await http().get(url).set('Cookie', intruder.cookie).expect(403);
      expect(JSON.stringify(refused.body)).not.toContain('confidential evacuation plan');
      expect(refused.body).not.toHaveProperty('checklist');
    }
    await http().get(url).expect(401);
  });

  /**
   * SAFETY-OUTCOME-02-SUP-NO-DECISION (AC2, Sad): while the Safety Officer has not responded, the coordinator's planning
   * view shows the check as awaiting a decision, with no decision outcome, approver or comments.
   */
  it('SAFETY-OUTCOME-02-SUP-NO-DECISION shows no decision or comments to the coordinator before the Safety Officer responds', async () => {
    const event = await createSafetyEvent('Awaiting Safety Decision Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);

    const result = await http().get(`/api/events/${event.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);

    expect(result.body.checklist.safetyCheck.status).toBe('pending');
    expect(result.body.checklist.safetyCheck).not.toHaveProperty('approverName');
    expect(result.body.checklist.safetyCheck).not.toHaveProperty('feedback');
    expect(['approved', 'changes_needed', 'rejected']).not.toContain(result.body.checklist.safetyCheck.status);
  });

  // Traceability: Jira 131 AC4 (matrix 36798544)
  /** SAFETY-OUTCOME-04: selected arrangements return to real staff review; feedback acknowledgement alone cannot resubmit. */
  it('SAFETY-OUTCOME-04 requires selected staff re-approval as well as coordinator acknowledgement', async () => {
    const event = await createSafetyEvent('Requested Safety Changes Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);

    const otherEquipmentId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Second microphone', 1, 'Reserved') RETURNING id`,
      [event.eventId],
    )).rows[0].id;
    const otherVenueBookingId = (await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
      [event.eventId, event.venueId, SLOT_START, SLOT_END],
    )).rows[0].id;
    // The arrangement-change trigger clears stale safety requests, so set the pending check after all fixture edits.
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', '2031-06-02T00:00:00.000Z', 'spm129-coordinator')
       ON CONFLICT (event_id) DO UPDATE SET status = 'pending', requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by`,
      [event.eventId],
    );
    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'changes_needed', changes: [{
        text: 'Review the venue evacuation route and microphone setup.',
        venueIds: [event.venueBookingId], equipmentIds: [event.equipmentId],
      }] }).expect(201);

    const planning = await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.eventId]);
    const result = await http().get(`/api/events/${event.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(planning.rows[0].status).toBe('Planning');
    expect(result.body.checklist.safetyCheck).toMatchObject({
      status: 'changes_needed',
      feedback: [expect.objectContaining({
        text: 'Review the venue evacuation route and microphone setup.',
        reviewArrangements: { venueIds: [event.venueBookingId], equipmentIds: [event.equipmentId] },
      })],
    });
    expect(result.body.checklist.venue.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: event.venueBookingId, status: 'pending', safetyReviewStatus: 'Pending review' }),
      expect.objectContaining({ id: otherVenueBookingId, status: 'confirmed' }),
    ]));
    expect(result.body.checklist.equipment.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: event.equipmentId, status: 'pending', safetyReviewStatus: 'Pending review' }),
      expect.objectContaining({ id: otherEquipmentId, status: 'confirmed' }),
    ]));
    for (const arrangement of [...result.body.checklist.venue.items, ...result.body.checklist.equipment.items]) {
      if ([event.venueBookingId, event.equipmentId].includes(arrangement.id))
        expect(arrangement.safetyReviewStatus).toBe('Pending review');
      else
        expect(arrangement).not.toHaveProperty('safetyReviewStatus');
    }
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(event.eventId);

    const feedbackId = result.body.checklist.safetyCheck.feedback[0].id as string;
    await http().post(`/api/events/${event.eventId}/safety-check/feedback/${feedbackId}/resolve`).set('Cookie', coordinator.cookie).expect(200);
    await http().post(`/api/events/${event.eventId}/safety-check/request`).set('Cookie', coordinator.cookie).expect(422);
    const unchangedQueue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(unchangedQueue.body.map((row: { id: string }) => row.id)).not.toContain(event.eventId);
  });

  // Traceability: Jira 131 AC5 (matrix 36798544)
  /** SAFETY-OUTCOME-05: rejection feedback remains visible while every active arrangement returns to staff review. */
  it('SAFETY-OUTCOME-05 keeps the event and bookings active when the Safety Officer rejects it', async () => {
    const event = await createSafetyEvent('Rejected Safety Outcome Event', true, 'approved', 'Reserved');
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [event.eventId, coordinator.uid]);
    const extraVenueBookingId = (await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, 'approved') RETURNING id`, [event.eventId, event.venueId, SLOT_START, SLOT_END],
    )).rows[0].id;
    const extraEquipmentId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Second microphone', 1, 'Reserved') RETURNING id`, [event.eventId],
    )).rows[0].id;
    const inactiveEquipmentId = (await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Released projector', 1, 'Released') RETURNING id`, [event.eventId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
       VALUES ($1, 'pending', now(), 'spm131-coordinator')
       ON CONFLICT (event_id) DO UPDATE SET status = 'pending', requested_at = EXCLUDED.requested_at, requested_by = EXCLUDED.requested_by`, [event.eventId],
    );

    await http().post(`/api/safety-officer/queue/${event.eventId}/decision`).set('Cookie', officer.cookie)
      .send({ decision: 'rejected', reason: 'Revise the venue and equipment plan.' }).expect(201);

    const stored = await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.eventId]);
    const booking = await pool.query<{ id: string; status: string }>('SELECT id, status FROM venue_bookings WHERE event_id = $1', [event.eventId]);
    const equipment = await pool.query<{ id: string; status: string }>('SELECT id, status FROM equipment_reservations WHERE event_id = $1', [event.eventId]);
    const safety = await pool.query<{ status: string; feedback: string }>('SELECT status, feedback FROM event_safety_checks WHERE event_id = $1', [event.eventId]);
    expect(stored.rows[0].status).toBe('Planning');
    expect(booking.rows).toHaveLength(2);
    expect(booking.rows.every((row) => row.status === 'pending')).toBe(true);
    expect(equipment.rows).toHaveLength(3);
    expect(equipment.rows.filter((row) => row.id !== inactiveEquipmentId).every((row) => row.status === 'Requested')).toBe(true);
    expect(safety.rows[0]).toMatchObject({ status: 'rejected', feedback: 'Revise the venue and equipment plan.' });
    const marker = await pool.query<{ review_arrangements: { venueIds: string[]; equipmentIds: string[] } }>(
      'SELECT review_arrangements FROM safety_check_feedback_items WHERE event_id = $1', [event.eventId],
    );
    expect(marker.rows[0].review_arrangements.venueIds).toEqual(expect.arrayContaining([event.venueBookingId, extraVenueBookingId]));
    expect(marker.rows[0].review_arrangements.equipmentIds).toEqual(expect.arrayContaining([event.equipmentId, extraEquipmentId]));
    expect(marker.rows[0].review_arrangements.venueIds).toHaveLength(2);
    expect(marker.rows[0].review_arrangements.equipmentIds).toHaveLength(2);
    const result = await http().get(`/api/events/${event.eventId}/arrangements-status`).set('Cookie', coordinator.cookie).expect(200);
    expect(result.body.checklist.venue.items).toHaveLength(2);
    expect(result.body.checklist.venue.items.every((item: { safetyReviewStatus?: string }) => item.safetyReviewStatus === 'Pending review')).toBe(true);
    expect(result.body.checklist.equipment.items).toHaveLength(2);
    expect(result.body.checklist.equipment.items.every((item: { safetyReviewStatus?: string }) => item.safetyReviewStatus === 'Pending review')).toBe(true);
    expect(result.body.checklist.equipment.items.map((item: { id: string }) => item.id)).not.toContain(inactiveEquipmentId);
    const queue = await http().get('/api/safety-officer/queue').set('Cookie', officer.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(event.eventId);
  });

  // Traceability: Jira 129 AC5 (matrix 36831243)
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

  // Traceability: Jira 129 AC5 (matrix 36831243)
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
