/*
 * SPM-64 Request a Change to a Submitted Event through the real HTTP pipeline:
 * AppModule, the PostgreSQL-backed AuthenticationMiddleware (session cookies
 * from /api/auth/login), ChangeRequestsController and real PostgreSQL.
 *
 * Needs DATABASE_URL for a database initialized with
 * database/postgresql/init 001 to 018 (018 adds event_change_requests; existing
 * databases apply backend/migrations/012_spm64_change_requests.sql).
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-64 (REQ-CHANGE-NN-X).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

const START = '2030-04-14T10:00:00.000Z';
const END = '2030-04-14T13:00:00.000Z';

type DatabaseUser = { uid: string; name: string; cookie: string };

describe('SPM-64 change requests over HTTP (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];

  let organiser: DatabaseUser;
  let otherOrganiser: DatabaseUser;
  let coordinator: DatabaseUser;
  let otherCoordinator: DatabaseUser;
  let eventId: string;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    organiser = await createDatabaseUser('ORGANISER', 'CR Organiser');
    otherOrganiser = await createDatabaseUser('ORGANISER', 'CR Other Organiser');
    coordinator = await createDatabaseUser('COORDINATOR', 'CR Coordinator');
    otherCoordinator = await createDatabaseUser('COORDINATOR', 'CR Other Coordinator');
    eventId = await seedEvent(organiser.uid, coordinator.uid, 'Planning');
  });

  afterEach(async () => {
    await app.close();
    // Change requests and notifications cascade with the event.
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdUserIds.length)
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
  });

  const url = (id = eventId) => `/api/events/${id}/change-requests`;
  const submit = (user: DatabaseUser, body: unknown, id = eventId) =>
    request(app.getHttpServer()).post(url(id)).set('Cookie', user.cookie).send(body as object);

  /** REQ-CHANGE-01-A, 04-A: the owner submits; the request is stored Pending with original and proposed values. */
  it('REQ-CHANGE-01-A stores a pending request with original and proposed values', async () => {
    const response = await submit(organiser, {
      changes: { expectedAttendance: 140, layout: 'Theatre' },
      reason: 'More guests confirmed.',
    }).expect(201);
    expect(response.body).toMatchObject({
      eventId,
      eventName: 'CR Welcome Evening',
      status: 'Pending',
      requestedBy: 'CR Organiser',
      reason: 'More guests confirmed.',
      requiresSafetyCheck: true,
      changes: [
        { field: 'expectedAttendance', originalValue: 80, proposedValue: 140 },
        { field: 'layout', originalValue: 'Banquet', proposedValue: 'Theatre' },
      ],
    });
    const stored = await pool.query(
      'SELECT status, requested_by_id FROM event_change_requests WHERE id = $1',
      [response.body.id],
    );
    expect(stored.rows).toEqual([{ status: 'Pending', requested_by_id: organiser.uid }]);
  });

  /** REQ-CHANGE-01-G: submitting changes nothing on the live event and does not reset its safety check. */
  it('REQ-CHANGE-01-G leaves the event and its safety check untouched', async () => {
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'approved', now(), 'CR Coordinator')`,
      [eventId],
    );
    const before = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    await submit(organiser, {
      changes: { startDateTime: '2030-04-15T10:00:00Z', endDateTime: '2030-04-15T13:00:00Z', expectedAttendance: 140 },
    }).expect(201);
    const after = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const safety = await pool.query('SELECT status FROM event_safety_checks WHERE event_id = $1', [eventId]);
    expect(safety.rows).toEqual([{ status: 'approved' }]);
  });

  /** REQ-CHANGE-02-B, 06-A: a request naming the event name is refused whole, with a message per field. */
  it('REQ-CHANGE-02-B refuses a change to the event name and stores nothing', async () => {
    const response = await submit(organiser, {
      changes: { name: 'Renamed', organiserId: otherOrganiser.uid, description: 'New text' },
    }).expect(400);
    expect(response.body.message).toBe(
      'Event name and organiser cannot be changed. Remove these changes and try again.',
    );
    expect(response.body.errors).toEqual({
      name: 'Event name cannot be changed.',
      organiserId: 'Event organiser cannot be changed.',
    });
    expect(await requestCount()).toBe(0);
  });

  /** REQ-CHANGE-01-H: two parallel submissions settle to exactly one pending request. */
  it('REQ-CHANGE-01-H lets only one of two parallel submissions through', async () => {
    const results = await Promise.all([
      submit(organiser, { changes: { description: 'First' } }),
      submit(organiser, { changes: { description: 'Second' } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('change_request_pending');
    expect(await requestCount()).toBe(1);
  });

  /** REQ-CHANGE-01-F: a request on a closed event is refused. */
  it('REQ-CHANGE-01-F refuses a request on a cancelled event', async () => {
    const cancelled = await seedEvent(organiser.uid, coordinator.uid, 'Cancelled');
    const response = await submit(organiser, { changes: { description: 'New' } }, cancelled).expect(409);
    expect(response.body.code).toBe('change_request_closed');
  });

  /** REQ-CHANGE-03-A: the assigned coordinator gets the in-app notification and can read the request. */
  it('REQ-CHANGE-03-A notifies the assigned coordinator, who can read the request', async () => {
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    const notifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(notifications.body).toEqual([
      expect.objectContaining({
        type: 'coordinator_change_request',
        audienceRole: 'coordinator',
        relatedEventId: eventId,
        message: 'CR Organiser requested a change to "CR Welcome Evening": expected attendance.',
        read: false,
      }),
    ]);
    const list = await request(app.getHttpServer()).get(url()).set('Cookie', coordinator.cookie).expect(200);
    expect(list.body).toHaveLength(1);
  });

  /** REQ-CHANGE-03-B, 05-C: other coordinators and organisers are neither notified nor able to read it. */
  it('REQ-CHANGE-03-B keeps the request away from everyone else', async () => {
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    for (const user of [otherCoordinator, otherOrganiser]) {
      await request(app.getHttpServer()).get(url()).set('Cookie', user.cookie).expect(404);
      const mine = await request(app.getHttpServer()).get('/api/change-requests').set('Cookie', user.cookie).expect(200);
      expect(mine.body).toEqual([]);
    }
    const notifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', otherCoordinator.cookie)
      .expect(200);
    expect(notifications.body).toEqual([]);
  });

  /** REQ-CHANGE-03-D: the request follows the event to a newly assigned coordinator. */
  it('REQ-CHANGE-03-D follows the event when it is reassigned', async () => {
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [eventId, otherCoordinator.uid]);
    await request(app.getHttpServer()).get(url()).set('Cookie', coordinator.cookie).expect(404);
    const list = await request(app.getHttpServer()).get(url()).set('Cookie', otherCoordinator.cookie).expect(200);
    expect(list.body).toHaveLength(1);
  });

  /** REQ-CHANGE-05-A, 05-D: the dashboard list shows the pending request from the server, filterable by status. */
  it('REQ-CHANGE-05-A lists the organiser\'s pending request on the dashboard endpoint', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    const pending = await request(app.getHttpServer())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(pending.body).toEqual([
      expect.objectContaining({ id: created.body.id, eventId, eventName: 'CR Welcome Evening', status: 'Pending' }),
    ]);
    await request(app.getHttpServer())
      .get('/api/change-requests?status=Bogus')
      .set('Cookie', organiser.cookie)
      .expect(400);
  });

  /** The owner can withdraw a pending request once; a new request can then be made. */
  it('withdraws a pending request, refuses a second withdrawal, and allows a new request', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    const withdrawUrl = `${url()}/${created.body.id}/withdraw`;
    await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', otherOrganiser.cookie).expect(404);
    const withdrawn = await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', organiser.cookie).expect(200);
    expect(withdrawn.body).toMatchObject({ status: 'Withdrawn', decidedBy: 'CR Organiser' });
    await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', organiser.cookie).expect(409);
    await submit(organiser, { changes: { description: 'Second try' } }).expect(201);
  });

  /** REQ-CHANGE-08-A: anonymous and non-owner callers are refused on every route. */
  it('REQ-CHANGE-08-A refuses anonymous, non-organiser and non-owner submissions', async () => {
    const server = app.getHttpServer();
    await request(server).post(url()).send({ changes: { description: 'x' } }).expect(401);
    await request(server).get(url()).expect(401);
    await request(server).get('/api/change-requests').expect(401);
    await submit(coordinator, { changes: { description: 'x' } }).expect(403);
    await submit(otherOrganiser, { changes: { description: 'x' } }).expect(404);
    await submit(organiser, { changes: { description: 'x' } }, randomUUID()).expect(404);
    expect(await requestCount()).toBe(0);
  });

  /** The database refuses a second pending row even if the service check were bypassed. */
  it('enforces one pending request per event in the schema', async () => {
    const insert = () =>
      pool.query(
        `INSERT INTO event_change_requests (id, event_id, requested_by_id, requested_by, changes)
         VALUES ($1, $2, $3, 'x', '[{"field":"description","originalValue":"a","proposedValue":"b"}]')`,
        [randomUUID(), eventId, organiser.uid],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: '23505' });
  });

  async function requestCount() {
    const result = await pool.query('SELECT count(*)::int AS n FROM event_change_requests WHERE event_id = $1', [
      eventId,
    ]);
    return result.rows[0].n as number;
  }

  async function seedEvent(organiserId: string, coordinatorId: string, status: string) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'CR Organiser','organiser@example.test','CR Welcome Evening','Purpose','Description',
               $3,$4,80,'Banquet',ARRAY['Catering'],ARRAY['Wheelchair ramps'],'Two microphones',
               $5,$6,'CR Coordinator',$7)`,
      [id, organiserId, START, END, status, coordinatorId, randomUUID()],
    );
    createdEventIds.push(id);
    return id;
  }

  async function createDatabaseUser(role: string, name: string): Promise<DatabaseUser> {
    const email = `e2e-change-request-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 4))) RETURNING id`,
      [email, name, password],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(201);
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, name, cookie: cookie.split(';', 1)[0] };
  }
});
