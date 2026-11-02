import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { SAFETY_OUTCOME_SOURCE, type SafetyOutcomeSource } from '../src/events/status/arrangements.reader.js';

/*
 * SPM-153 Event Status Changes from Confirmed to Completed, over HTTP against real PostgreSQL.
 *
 * Boundary double (Guide 5D): only the SPM-126 safety source is replaced. Events, venue bookings, history and the
 * completion record are real rows. The clock is injected and set per test; it defaults to T0 = 2026-10-12 12:00 SGT.
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 029 applied.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-153 completion tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const T0 = '2026-10-12T04:00:00.000Z';
const ENDED_START = '2026-10-10T02:00:00.000Z';
const ENDED_END = '2026-10-10T04:00:00.000Z';
const FUTURE_START = '2026-10-20T02:00:00.000Z';
const FUTURE_END = '2026-10-20T06:00:00.000Z';
const BOUNDARY_END = '2026-12-10T13:00:00.000Z'; // 21:00 SGT
const COMP_OK = {
  attendanceCount: 42,
  operationalNotes: 'Setup began 08:00; doors opened 09:30.',
  issues: [{ description: 'Projector bulb failed during keynote.' }],
};

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-153 Event Status Changes from Confirmed to Completed (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let clockNow: string;
  let createdEventIds: string[];
  let createdVenueIds: string[];
  let createdUserIds: string[];

  let coordinator: Session;
  let otherCoordinator: Session;
  let lead: Session;
  let organiser: Session;
  let attendee: Session;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    clockNow = T0;
    createdEventIds = [];
    createdVenueIds = [];
    createdUserIds = [];
    const safety: SafetyOutcomeSource = { read: async () => ({ state: 'Approved' }) };
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SAFETY_OUTCOME_SOURCE)
      .useValue(safety)
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(clockNow) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // Five logins (bcrypt) per test; under load they can exceed the 30 s default hook limit.
    coordinator = await createSession('COORDINATOR');
    otherCoordinator = await createSession('COORDINATOR');
    lead = await createSession('COORDINATOR_LEAD');
    organiser = await createSession('ORGANISER');
    attendee = await createSession('ATTENDEE');
  }, 60_000);

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  const http = () => request(app.getHttpServer());
  const as = (session: Session | undefined) => (req: request.Test) => (session ? req.set('Cookie', session.cookie) : req);

  const statusChange = (session: Session | undefined, eventId: string, targetStatus: string) =>
    as(session)(http().post(`/api/events/${eventId}/status-change`)).send(
      targetStatus === 'Cancelled' ? { targetStatus, confirmed: true } : { targetStatus },
    );
  const recordPut = (session: Session | undefined, eventId: string, body: unknown) =>
    as(session)(http().put(`/api/events/${eventId}/completion-record`)).send(body as object);
  const recordGet = (session: Session | undefined, eventId: string) =>
    as(session)(http().get(`/api/events/${eventId}/completion-record`));
  const historyGet = (session: Session | undefined, eventId: string) =>
    as(session)(http().get(`/api/events/${eventId}/status-history`));

  async function createSession(role: string): Promise<Session> {
    const email = `e2e-completion-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, role],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  async function seedEvent(options: { status: string; start?: string; end?: string; name?: string }) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',
               $4,$5,80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',$6,$7,'Coordinator 1',$8)`,
      [
        id,
        organiser.uid,
        options.name ?? 'Product Launch Mixer',
        options.start ?? FUTURE_START,
        options.end ?? FUTURE_END,
        options.status,
        coordinator.uid,
        randomUUID(),
      ],
    );
    createdEventIds.push(id);
    return id;
  }

  /** A venue owned by a Venue Staff member, with one approved booking for the event. */
  async function seedVenueBooking(eventId: string, status: 'approved' | 'pending') {
    const owner = await createSession('VENUE_STAFF');
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,$2,$3,200,'Open weekdays',0,0) RETURNING id`,
      [owner.uid, 'Main Hall', `Level 1 ${randomUUID()}`],
    );
    createdVenueIds.push(venue.rows[0].id);
    const booking = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1,$2,'2026-10-10T02:00:00Z','2026-10-10T04:00:00Z',$3) RETURNING id`,
      [eventId, venue.rows[0].id, status],
    );
    return { staff: owner, bookingId: booking.rows[0].id };
  }

  async function statusOf(eventId: string) {
    return (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status;
  }
  async function historyRows(eventId: string) {
    return (
      await pool.query<{ from_status: string; to_status: string; actor_id: string; created_at: Date }>(
        'SELECT from_status, to_status, actor_id, created_at FROM event_status_history WHERE event_id = $1 ORDER BY created_at, id',
        [eventId],
      )
    ).rows;
  }

  // COMPLETE-EVENT-01-A: the assigned coordinator marks an ended Confirmed event as Completed.
  it('COMPLETE-EVENT-01-A: the assigned coordinator marks an ended Confirmed event Completed (200, MSG-CP-01)', async () => {
    // Arrange: EVT "Product Launch Mixer" Confirmed, ended 2 days before T0; one approved venue booking
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    const { bookingId } = await seedVenueBooking(eventId, 'approved');

    // Act
    const response = await statusChange(coordinator, eventId, 'Completed').expect(200);

    // Assert: response literals (MSG-CP-01), status, history row, arrangements unchanged
    expect(response.body).toMatchObject({
      eventId,
      status: 'Completed',
      message: 'Product Launch Mixer has been marked as Completed.',
    });
    expect(await statusOf(eventId)).toBe('Completed');
    const rows = await historyRows(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_status: 'Confirmed', to_status: 'Completed', actor_id: coordinator.uid });
    expect(rows[0].created_at.toISOString()).toBe(T0);
    const booking = await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('approved');
  });

  // COMPLETE-EVENT-01-B: an event whose end has not passed is refused (422 MSG-CP-02).
  it('COMPLETE-EVENT-01-B: a Confirmed event that has not ended is refused with 422 MSG-CP-02', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: FUTURE_START, end: FUTURE_END });

    const response = await statusChange(coordinator, eventId, 'Completed').expect(422);

    expect(response.body).toMatchObject({
      code: 'EVENT_NOT_ENDED',
      message: 'An event can only be marked as Completed after its event date has passed.',
    });
    expect(await statusOf(eventId)).toBe('Confirmed');
    expect(await historyRows(eventId)).toEqual([]);
  });

  // COMPLETE-EVENT-01-C: eligible from the end instant, inclusive (BR3), by the server clock.
  it.each([
    ['2026-12-10T12:59:59.000Z', 422], // 20:59:59 SGT
    ['2026-12-10T13:00:00.000Z', 200], // 21:00:00 SGT, the end instant
    ['2026-12-10T13:00:01.000Z', 200], // 21:00:01 SGT
  ])('COMPLETE-EVENT-01-C: at %s the response is %i', async (now, expected) => {
    const eventId = await seedEvent({ status: 'Confirmed', start: '2026-12-10T10:00:00.000Z', end: BOUNDARY_END });
    clockNow = now;

    await statusChange(coordinator, eventId, 'Completed').expect(expected);

    expect(await statusOf(eventId)).toBe(expected === 200 ? 'Completed' : 'Confirmed');
  });

  // COMPLETE-EVENT-01-D: only the assigned coordinator; others 403, no token 401; nothing changes.
  it.each([
    ['another coordinator (not assigned)', 403, () => otherCoordinator],
    ['the Coordinator Lead (not assigned)', 403, () => lead],
    ['the owning organiser', 403, () => organiser],
    ['an attendee', 403, () => attendee],
    ['no session', 401, () => undefined],
  ])('COMPLETE-EVENT-01-D: %s gets %i and the event stays Confirmed', async (_label, expected, session) => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });

    await statusChange(session(), eventId, 'Completed').expect(expected);

    expect(await statusOf(eventId)).toBe('Confirmed');
    expect(await historyRows(eventId)).toEqual([]);
  });

  // COMPLETE-EVENT-02-B/C: any status other than Confirmed is refused with 409 MSG-CP-03.
  it.each([
    ['Planning', 'Planning'],
    ['Approved', 'Approved'],
    ['Cancelled', 'Cancelled'],
    ['Completed', 'Completed'],
  ])('COMPLETE-EVENT-02-C: a %s event is refused with 409 EVENT_NOT_COMPLETABLE', async (_label, status) => {
    const eventId = await seedEvent({ status, start: ENDED_START, end: ENDED_END });
    const before = await historyRows(eventId);

    const response = await statusChange(coordinator, eventId, 'Completed').expect(409);

    expect(response.body).toMatchObject({
      code: 'EVENT_NOT_COMPLETABLE',
      message: 'Only a Confirmed event can be marked as Completed.',
    });
    expect(await statusOf(eventId)).toBe(status);
    expect(await historyRows(eventId)).toEqual(before);
  });

  // COMPLETE-EVENT-02-C (order): the status is checked before the date (409 before 422), so a Planning event
  // whose end has not passed is refused as not Confirmed, not as too early.
  it('COMPLETE-EVENT-02-C: a Planning event that has not ended gets 409 EVENT_NOT_COMPLETABLE, not 422', async () => {
    const eventId = await seedEvent({ status: 'Planning', start: FUTURE_START, end: FUTURE_END });

    const response = await statusChange(coordinator, eventId, 'Completed').expect(409);

    expect(response.body.code).toBe('EVENT_NOT_COMPLETABLE');
    expect(await statusOf(eventId)).toBe('Planning');
  });

  // COMPLETE-EVENT-02-D: an already Completed event cannot be completed again.
  it('COMPLETE-EVENT-02-D: a second completion of a Completed event is refused and keeps one history row', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    await statusChange(coordinator, eventId, 'Completed').expect(200);
    const first = await historyRows(eventId);

    await statusChange(coordinator, eventId, 'Completed').expect(409);

    expect(await historyRows(eventId)).toEqual(first);
  });

  // COMPLETE-EVENT-02-E: simultaneous completions complete the event once.
  it('COMPLETE-EVENT-02-E: five parallel completions give one 200 and four 409, with one history row', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });

    const responses = await Promise.all(Array.from({ length: 5 }, () => statusChange(coordinator, eventId, 'Completed')));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(await historyRows(eventId)).toHaveLength(1);
  });

  // COMPLETE-EVENT-02-E (cancel race): a completion and a cancellation of the same event give exactly one winner.
  it('COMPLETE-EVENT-02-E: a parallel completion and cancellation leave exactly one winner and one history row', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });

    const [complete, cancel] = await Promise.all([
      statusChange(coordinator, eventId, 'Completed'),
      statusChange(coordinator, eventId, 'Cancelled'),
    ]);

    const outcomes = [complete.status, cancel.status].sort();
    expect(outcomes).toEqual([200, 409]);
    // The request that got 200 decides the final status, and that status is the only history row written.
    const winner = complete.status === 200 ? 'Completed' : 'Cancelled';
    expect(await statusOf(eventId)).toBe(winner);
    const rows = await historyRows(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_status: 'Confirmed', to_status: winner });
  });

  // COMPLETE-EVENT-02-F: Completed is terminal (BR5).
  it.each([
    ['Confirmed', 422, 'EVENT_NOT_CONFIRMABLE'],
    ['Cancelled', 409, 'EVENT_NOT_CANCELLABLE'],
    ['Planning', 400, 'UNSUPPORTED_TARGET_STATUS'],
  ])('COMPLETE-EVENT-02-F: a Completed event refuses target %s with %i', async (target, expected, code) => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });

    const response = await statusChange(coordinator, eventId, target).expect(expected);

    expect(response.body.code).toBe(code);
    expect(await statusOf(eventId)).toBe('Completed');
    expect(await historyRows(eventId)).toEqual([]);
  });

  // COMPLETE-EVENT-03-A: the history shows the change with its actor and the injected time.
  it('COMPLETE-EVENT-03-A: the status history reports Confirmed to Completed by the coordinator at the marking time', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    clockNow = '2026-11-10T16:30:00.000Z'; // 11 Nov 2026 00:30 SGT, BR11

    await statusChange(coordinator, eventId, 'Completed').expect(200);
    const response = await historyGet(coordinator, eventId).expect(200);

    const last = response.body.at(-1);
    expect(last).toMatchObject({
      fromStatus: 'Confirmed',
      toStatus: 'Completed',
      changedAt: '2026-11-10T16:30:00.000Z',
      changedBy: { id: coordinator.uid },
    });
    expect((await historyRows(eventId)).at(-1)?.created_at.toISOString()).toBe('2026-11-10T16:30:00.000Z');
  });

  // COMPLETE-EVENT-05-A: the record is saved and read back; the status and history do not change.
  it('COMPLETE-EVENT-05-A: the assigned coordinator saves the completion record on a Completed event', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    const historyBefore = await historyRows(eventId);

    const saved = await recordPut(coordinator, eventId, COMP_OK).expect(200);

    expect(saved.body).toMatchObject({ ...COMP_OK, message: 'Completion details saved.' });
    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject(COMP_OK);
    expect(await statusOf(eventId)).toBe('Completed');
    expect(await historyRows(eventId)).toEqual(historyBefore);
  });

  // COMPLETE-EVENT-05-B: a subset save keeps the items it does not carry.
  it('COMPLETE-EVENT-05-B: saving only attendance keeps the saved notes and issues', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await recordPut(coordinator, eventId, COMP_OK).expect(200);

    await recordPut(coordinator, eventId, { attendanceCount: 118 }).expect(200);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject({
      attendanceCount: 118,
      operationalNotes: COMP_OK.operationalNotes,
      issues: COMP_OK.issues,
    });
  });

  // COMPLETE-EVENT-05-A (empty): a fresh event has an empty record.
  it('COMPLETE-EVENT-05-A: a fresh event has an empty record (nulls and an empty list)', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });

    const read = await recordGet(coordinator, eventId).expect(200);

    expect(read.body).toMatchObject({ attendanceCount: null, operationalNotes: null, issues: [], updatedAt: null, updatedBy: null });
  });

  // COMPLETE-EVENT-05-B (notes only): saving only notes keeps the saved attendance.
  it('COMPLETE-EVENT-05-B: saving notes only keeps the saved attendance and issues', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await recordPut(coordinator, eventId, COMP_OK).expect(200);

    await recordPut(coordinator, eventId, { operationalNotes: 'Revised notes.' }).expect(200);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject({ attendanceCount: COMP_OK.attendanceCount, operationalNotes: 'Revised notes.', issues: COMP_OK.issues });
  });

  // COMPLETE-EVENT-05-F (unknown): a malformed or unknown event id is 404 for the record, not 500.
  it.each([
    ['a malformed id', 'not-a-uuid'],
    ['an unknown event', '00000000-0000-4000-8000-00000000ffff'],
  ])('COMPLETE-EVENT-05-F: a record read of %s is 404', async (_label, id) => {
    await recordGet(coordinator, id).expect(404);
  });

  // COMPLETE-EVENT-05-B (empty notes kept): a save that does not send notes keeps the empty notes already saved.
  it('COMPLETE-EVENT-05-B: a save without notes keeps empty notes', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await recordPut(coordinator, eventId, { attendanceCount: 5 }).expect(200);

    await recordPut(coordinator, eventId, { attendanceCount: 6 }).expect(200);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject({ attendanceCount: 6, operationalNotes: null });
  });

  // COMPLETE-EVENT-05-C: a record cannot be saved on an event that is not Completed.
  it.each([
    ['Confirmed', 'Confirmed'],
    ['Planning', 'Planning'],
    ['Cancelled', 'Cancelled'],
  ])('COMPLETE-EVENT-05-C: a %s event refuses the record with 409 and stores nothing', async (_label, status) => {
    const eventId = await seedEvent({ status, start: ENDED_START, end: ENDED_END });

    const response = await recordPut(coordinator, eventId, COMP_OK).expect(409);

    expect(response.body).toMatchObject({
      code: 'COMPLETION_RECORD_NOT_ALLOWED',
      message: 'Completion details can only be recorded for a Completed event.',
    });
    const stored = await pool.query('SELECT 1 FROM completion_records WHERE event_id = $1', [eventId]);
    expect(stored.rowCount).toBe(0);
  });

  // COMPLETE-EVENT-05-D: invalid values are refused with the field named and nothing is saved.
  it.each([
    [{ attendanceCount: -1 }, 'attendanceCount'],
    [{ attendanceCount: 12.5 }, 'attendanceCount'],
    [{ attendanceCount: 'abc' }, 'attendanceCount'],
    [{ issues: [{ description: '' }] }, 'issues'],
    [{ issues: [{ description: '   ' }] }, 'issues'],
    [{}, 'body'],
  ])('COMPLETE-EVENT-05-D: %j is refused with 422 INVALID_COMPLETION_RECORD on %s', async (body, field) => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });

    const response = await recordPut(coordinator, eventId, body).expect(422);

    expect(response.body).toMatchObject({
      code: 'INVALID_COMPLETION_RECORD',
      message: 'Please enter a valid attendance, notes and issues.',
      field,
    });
    const stored = await pool.query('SELECT 1 FROM completion_records WHERE event_id = $1', [eventId]);
    expect(stored.rowCount).toBe(0);
  });

  // COMPLETE-EVENT-05-F: only the assigned coordinator reads or writes the record (D3).
  it.each([
    ['another coordinator', 403, () => otherCoordinator],
    ['the owning organiser', 403, () => organiser],
    ['an attendee', 403, () => attendee],
    ['no session', 401, () => undefined],
  ])('COMPLETE-EVENT-05-F: %s cannot write or read the record (%i)', async (_label, expected, session) => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await recordPut(coordinator, eventId, COMP_OK).expect(200);

    await recordPut(session(), eventId, { attendanceCount: 1 }).expect(expected);
    await recordGet(session(), eventId).expect(expected);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body.attendanceCount).toBe(COMP_OK.attendanceCount);
  });

  // COMPLETE-EVENT-06-B: the date and time of a Completed event cannot change (BR9, MSG-CP-06).
  it('COMPLETE-EVENT-06-B: the assigned coordinator cannot move a Completed event by its planning update', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });

    const response = await as(coordinator)(http().patch(`/api/events/${eventId}/planning`))
      .send({
        name: 'Product Launch Mixer',
        purpose: 'Purpose',
        description: 'Description',
        layout: 'Banquet',
        startDateTime: '2030-01-01T02:00:00.000Z',
        endDateTime: '2030-01-01T04:00:00.000Z',
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'EVENT_COMPLETED',
      message: 'The date, time, venue and equipment of a Completed event cannot be changed.',
    });
    const stored = await pool.query<{ start_date_time: Date }>('SELECT start_date_time FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].start_date_time.toISOString()).toBe(ENDED_START);
  });

  // COMPLETE-EVENT-06-C: a venue booking of a Completed event cannot be approved (BR9).
  it('COMPLETE-EVENT-06-C: venue staff cannot approve a pending booking of a Completed event', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    const { staff, bookingId } = await seedVenueBooking(eventId, 'pending');

    const response = await as(staff)(http().post(`/api/venues/bookings/${bookingId}/approve`)).expect(409);

    expect(response.body).toMatchObject({ code: 'EVENT_COMPLETED' });
    const booking = await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [bookingId]);
    expect(booking.rows[0].status).toBe('pending');
  });

  // COMPLETE-EVENT-06-C (reject, cancel): a venue booking of a Completed event cannot be rejected or cancelled.
  it('COMPLETE-EVENT-06-C: venue staff cannot reject a pending booking, and the coordinator cannot cancel an approved one, of a Completed event', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    const pending = await seedVenueBooking(eventId, 'pending');
    const approved = await seedVenueBooking(eventId, 'approved');

    const rejected = await as(pending.staff)(http().post(`/api/venues/bookings/${pending.bookingId}/reject`))
      .send({ reason: 'Venue clash' })
      .expect(409);
    expect(rejected.body.code).toBe('EVENT_COMPLETED');

    const cancelled = await as(coordinator)(http().post(`/api/venues/bookings/${approved.bookingId}/cancel`))
      .send({ confirmed: true })
      .expect(409);
    expect(cancelled.body.code).toBe('EVENT_COMPLETED');

    const bookings = await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM venue_bookings WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[pending.bookingId, approved.bookingId]],
    );
    const byId = Object.fromEntries(bookings.rows.map((row) => [row.id, row.status]));
    expect(byId[pending.bookingId]).toBe('pending');
    expect(byId[approved.bookingId]).toBe('approved');
  });

  // COMPLETE-EVENT-06-D: the equipment requests of a Completed event cannot be changed, reserved or cannot-provided.
  it('COMPLETE-EVENT-06-D: a Completed event refuses equipment update, reserve and cannot-provide with 409 EVENT_COMPLETED and changes nothing', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    const requestId = randomUUID();
    await pool.query(
      `INSERT INTO equipment_requests (id, event_id, requested_by, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Pending Review', now(), now())`,
      [requestId, eventId, coordinator.uid],
    );
    await pool.query(
      `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, created_at, item_order)
       VALUES ($1, 'Projector', 'Visual', 1, now(), 1)`,
      [requestId],
    );
    const techSupport = await createSession('TECH_SUPPORT');

    const update = await as(coordinator)(http().put(`/api/equipment/requests/${requestId}`))
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 2 }] })
      .expect(409);
    expect(update.body.code).toBe('EVENT_COMPLETED');

    const reserve = await as(techSupport)(http().patch(`/api/equipment/requests/${requestId}/reserve`)).expect(409);
    expect(reserve.body.code).toBe('EVENT_COMPLETED');

    const cannot = await as(techSupport)(http().patch(`/api/equipment/requests/${requestId}/cannot-provide`))
      .send({ reason: 'Out for repair' })
      .expect(409);
    expect(cannot.body.code).toBe('EVENT_COMPLETED');

    const request = await pool.query<{ status: string }>('SELECT status FROM equipment_requests WHERE id = $1', [requestId]);
    expect(request.rows[0].status).toBe('Pending Review');
    const items = await pool.query<{ equipment_name: string; quantity: number }>(
      'SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1',
      [requestId],
    );
    expect(items.rows).toEqual([{ equipment_name: 'Projector', quantity: 1 }]);
  });

  // COMPLETE-EVENT-01-E: an event that has started but not ended is refused (422 MSG-CP-02).
  it('COMPLETE-EVENT-01-E: an event that has started but not ended is refused with 422 and stays Confirmed', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: '2026-10-12T02:00:00.000Z', end: '2026-10-12T06:00:00.000Z' });

    const response = await statusChange(coordinator, eventId, 'Completed').expect(422);

    expect(response.body.code).toBe('EVENT_NOT_ENDED');
    expect(await statusOf(eventId)).toBe('Confirmed');
    expect(await historyRows(eventId)).toEqual([]);
  });

  // COMPLETE-EVENT-01-F: no time limit after the event; an event that ended long ago can still be completed.
  it('COMPLETE-EVENT-01-F: an event that ended 90 days ago can be completed, and the history shows the marking time', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: '2026-07-14T02:00:00.000Z', end: '2026-07-14T04:00:00.000Z' });

    await statusChange(coordinator, eventId, 'Completed').expect(200);

    expect(await statusOf(eventId)).toBe('Completed');
    expect((await historyRows(eventId)).at(-1)?.created_at.toISOString()).toBe(T0);
  });

  // COMPLETE-EVENT-02-A: the assigned coordinator sees the Confirmed event under the Confirmed filter.
  it('COMPLETE-EVENT-02-A: an ended Confirmed event is listed under the coordinator queue filter Confirmed', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });

    const response = await as(coordinator)(http().get('/api/coordinator/queue?status=Confirmed')).expect(200);

    expect((response.body as { id: string }[]).map((row) => row.id)).toContain(eventId);
  });

  // COMPLETE-EVENT-03-B: refused attempts leave the status history of every event exactly as it was.
  it('COMPLETE-EVENT-03-B: refused completion attempts add no history row to any of the events', async () => {
    const tooEarly = await seedEvent({ status: 'Confirmed', start: FUTURE_START, end: FUTURE_END });
    const approved = await seedEvent({ status: 'Approved', start: ENDED_START, end: ENDED_END });
    const notAssigned = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [notAssigned, otherCoordinator.uid]);
    const ids = [tooEarly, approved, notAssigned];
    const before = await Promise.all(ids.map((id) => historyRows(id)));

    await statusChange(coordinator, tooEarly, 'Completed').expect(422);
    await statusChange(coordinator, approved, 'Completed').expect(409);
    await statusChange(coordinator, notAssigned, 'Completed').expect(403);

    expect(await Promise.all(ids.map((id) => historyRows(id)))).toEqual(before);
  });

  // COMPLETE-EVENT-03-C: the marking time is stored in UTC; 11 Nov 2026 00:30 SGT is 10 Nov 16:30 UTC.
  it('COMPLETE-EVENT-03-C: a change at 11 Nov 2026 00:30 SGT is stored as 2026-11-10T16:30:00Z', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    clockNow = '2026-11-10T16:30:00.000Z';

    await statusChange(coordinator, eventId, 'Completed').expect(200);

    const stored = await pool.query<{ created_at: Date }>('SELECT created_at FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(stored.rows[0].created_at.toISOString()).toBe('2026-11-10T16:30:00.000Z');
  });

  // COMPLETE-EVENT-03-D: the actor and the time come from the session and the server, never from the body.
  it('COMPLETE-EVENT-03-D: a body naming another coordinator and a 2020 time does not change the recorded actor or time', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });

    await as(coordinator)(http().post(`/api/events/${eventId}/status-change`))
      .send({ targetStatus: 'Completed', changedBy: otherCoordinator.uid, changedAt: '2020-01-01T00:00:00.000Z' })
      .expect(200);

    const rows = await historyRows(eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(coordinator.uid);
    expect(rows[0].created_at.toISOString()).toBe(T0);
  });

  // COMPLETE-EVENT-04-B: an event leaves the Confirmed filter and appears once under Completed.
  it('COMPLETE-EVENT-04-B: after completion the event is under Completed only, once', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    const ids = async (status: string) =>
      ((await as(coordinator)(http().get(`/api/coordinator/queue?status=${status}`)).expect(200)).body as { id: string }[]).map((row) => row.id);

    expect(await ids('Confirmed')).toContain(eventId);
    await statusChange(coordinator, eventId, 'Completed').expect(200);

    expect(await ids('Confirmed')).not.toContain(eventId);
    expect((await ids('Completed')).filter((id) => id === eventId)).toHaveLength(1);
  });

  // COMPLETE-EVENT-04-C: a coordinator with no events gets an empty Completed list; another coordinator's Completed event is not listed.
  it('COMPLETE-EVENT-04-C: an empty Completed list for a coordinator with no events, and other coordinators\' events are not listed', async () => {
    const othersEvent = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [othersEvent, otherCoordinator.uid]);
    const newcomer = await createSession('COORDINATOR');

    const empty = await as(newcomer)(http().get('/api/coordinator/queue?status=Completed')).expect(200);
    expect(empty.body).toEqual([]);

    const mine = await as(coordinator)(http().get('/api/coordinator/queue?status=Completed')).expect(200);
    expect((mine.body as { id: string }[]).map((row) => row.id)).not.toContain(othersEvent);
  });

  // COMPLETE-EVENT-05-G: script and SQL text is stored and returned as the coordinator entered it (plain text).
  it('COMPLETE-EVENT-05-G: script and SQL text is stored and returned as plain text, and the events table is intact', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    const notes = '<script>alert(1)</script>';
    const issue = "'; DROP TABLE events; --";

    await recordPut(coordinator, eventId, { operationalNotes: notes, issues: [{ description: issue }] }).expect(200);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject({ operationalNotes: notes, issues: [{ description: issue }] });
    expect(await statusOf(eventId)).toBe('Completed');
  });

  // COMPLETE-EVENT-06-F: marking a venue unavailable for a Completed event's slot leaves its venue booking and status unchanged.
  // The venue-unavailable flag is accepted as not needed on Completed events (spec conflict SC-153-002).
  it('COMPLETE-EVENT-06-F: marking the venue unavailable for a Completed event slot leaves its booking approved and its status Completed', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: '2026-12-05T02:00:00.000Z', end: '2026-12-05T04:00:00.000Z', name: 'Future completed' });
    const owner = await createSession('VENUE_STAFF');
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1,$2,$3,200,'Open weekdays',0,0) RETURNING id`,
      [owner.uid, 'Hall 06F', `Level 6 ${randomUUID()}`],
    );
    createdVenueIds.push(venue.rows[0].id);
    const booking = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status)
       VALUES ($1,$2,'2026-12-05T02:00:00Z','2026-12-05T04:00:00Z','approved') RETURNING id`,
      [eventId, venue.rows[0].id],
    );

    await as(owner)(http().post(`/api/venues/${venue.rows[0].id}/unavailable-periods`))
      .send({ start: '2026-12-05T02:00:00.000Z', end: '2026-12-05T04:00:00.000Z', reason: 'Maintenance' })
      .expect(201);

    const after = await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [booking.rows[0].id]);
    expect(after.rows[0].status).toBe('approved');
    expect(await statusOf(eventId)).toBe('Completed');
  });

  // COMPLETE-EVENT-06-G: the coordinator cannot change even the name of a Completed event (deviation SC-153-001), and a mixed request is refused whole.
  it('COMPLETE-EVENT-06-G: a name-only or mixed planning update of a Completed event is refused with 409 and nothing is saved', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: '2026-12-05T02:00:00.000Z', end: '2026-12-05T04:00:00.000Z', name: 'Future completed' });
    const body = { purpose: 'Purpose', description: 'Description', layout: 'Banquet', startDateTime: '2026-12-05T02:00:00.000Z', endDateTime: '2026-12-05T04:00:00.000Z' };

    const nameOnly = await as(coordinator)(http().patch(`/api/events/${eventId}/planning`)).send({ ...body, name: 'Renamed' }).expect(409);
    expect(nameOnly.body.code).toBe('EVENT_COMPLETED');

    const mixed = await as(coordinator)(http().patch(`/api/events/${eventId}/planning`))
      .send({ ...body, name: 'Renamed', startDateTime: '2026-12-05T03:00:00.000Z' })
      .expect(409);
    expect(mixed.body.code).toBe('EVENT_COMPLETED');

    const stored = await pool.query<{ event_name: string }>('SELECT event_name FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].event_name).toBe('Future completed');
  });

  // COMPLETE-EVENT-06-A (read): a Completed event's planning information stays readable for the coordinator.
  it('COMPLETE-EVENT-06-A: the planning view of a Completed event is readable (200) and shows status Completed', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });

    const response = await as(coordinator)(http().get(`/api/events/${eventId}/planning`)).expect(200);

    expect(response.body.event.status).toBe('completed');
    expect(response.body.readOnly).toBe(true);
  });

  // COMPLETE-EVENT-04-A: the Coordinator's Completed filter lists the event.
  it('COMPLETE-EVENT-04-A: the coordinator queue filtered by Completed lists the event and no other', async () => {
    const eventId = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END });
    const otherConfirmed = await seedEvent({ status: 'Confirmed', start: ENDED_START, end: ENDED_END, name: 'Still Confirmed' });
    await statusChange(coordinator, eventId, 'Completed').expect(200);

    const response = await as(coordinator)(http().get('/api/coordinator/queue?status=Completed')).expect(200);

    const ids = (response.body as { id: string }[]).map((row) => row.id);
    expect(ids).toContain(eventId);
    expect(ids).not.toContain(otherConfirmed);
  });

  // COMPLETE-EVENT-05-B (clear): null clears attendance and notes over HTTP.
  it('COMPLETE-EVENT-05-B: sending null clears the saved attendance and notes', async () => {
    const eventId = await seedEvent({ status: 'Completed', start: ENDED_START, end: ENDED_END });
    await recordPut(coordinator, eventId, COMP_OK).expect(200);

    await recordPut(coordinator, eventId, { attendanceCount: null, operationalNotes: null }).expect(200);

    const read = await recordGet(coordinator, eventId).expect(200);
    expect(read.body).toMatchObject({ attendanceCount: null, operationalNotes: null, issues: COMP_OK.issues });
  });
});
