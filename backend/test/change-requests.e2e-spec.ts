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
      // No safety check on the event yet, so none to redo (REQ-CHANGE-07-A).
      requiresSafetyCheck: false,
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

  /** REQ-CHANGE-03-B: other coordinators and organisers are neither notified nor able to read it; the assigned coordinator can. */
  it('REQ-CHANGE-03-B keeps the request away from everyone else', async () => {
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    // Positive control: the assigned coordinator reads it on both routes.
    const assigned = await request(app.getHttpServer()).get(url()).set('Cookie', coordinator.cookie).expect(200);
    expect(assigned.body).toHaveLength(1);
    const assignedMine = await request(app.getHttpServer()).get('/api/change-requests').set('Cookie', coordinator.cookie).expect(200);
    expect(assignedMine.body).toHaveLength(1);
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

  /** REQ-CHANGE-05-C: an organiser sees only requests on their own events, on both read routes. */
  it('REQ-CHANGE-05-C shows an organiser only their own events\' requests', async () => {
    const otherEvent = await seedEvent(otherOrganiser.uid, otherCoordinator.uid, 'Planning');
    const theirs = await submit(otherOrganiser, { changes: { description: 'Theirs' } }, otherEvent).expect(201);
    const mine = await submit(organiser, { changes: { description: 'Mine' } }).expect(201);
    const server = app.getHttpServer();
    // Positive control: each owner reads their own request.
    const own = await request(server).get(url(otherEvent)).set('Cookie', otherOrganiser.cookie).expect(200);
    expect(own.body.map((r: { id: string }) => r.id)).toEqual([theirs.body.id]);
    // Negative: ORG-01 cannot read ORG-02's event list (404, existence not revealed) and its dashboard omits it.
    const refused = await request(server).get(url(otherEvent)).set('Cookie', organiser.cookie).expect(404);
    expect(refused.body.message).toBe('Event not found.');
    const dashboard = await request(server).get('/api/change-requests').set('Cookie', organiser.cookie).expect(200);
    expect(dashboard.body.map((r: { id: string }) => r.id)).toEqual([mine.body.id]);
  });

  /** Change request notices a coordinator has, newest first. */
  async function changeNotices(user: DatabaseUser) {
    const response = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', user.cookie).expect(200);
    return (response.body as { type: string; read: boolean; relatedEventId: string; message: string }[]).filter(
      (n) => n.type === 'coordinator_change_request' && n.relatedEventId === eventId,
    );
  }

  /** REQ-CHANGE-03-C: a request on an unassigned event waits; when the Lead assigns the event, that coordinator is notified. */
  it('REQ-CHANGE-03-C notifies the coordinator the Lead assigns afterwards', async () => {
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'CR Lead');
    eventId = await seedEvent(organiser.uid, null, 'Submitted');
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    expect(await changeNotices(coordinator)).toEqual([]);

    await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.uid })
      .expect(201);
    expect(await changeNotices(coordinator)).toEqual([
      expect.objectContaining({
        read: false,
        message: 'CR Organiser requested a change to "CR Welcome Evening": expected attendance.',
      }),
    ]);
    const list = await request(app.getHttpServer()).get(url()).set('Cookie', coordinator.cookie).expect(200);
    expect(list.body).toHaveLength(1);
  });

  /** REQ-CHANGE-03-D: on reassignment the request follows the event, the new coordinator is notified and the old notice is cleared. */
  it('REQ-CHANGE-03-D follows the event when it is reassigned', async () => {
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'CR Lead');
    await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    expect(await changeNotices(coordinator)).toEqual([expect.objectContaining({ read: false })]);

    await request(app.getHttpServer())
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: otherCoordinator.uid, currentCoordinatorId: coordinator.uid })
      .expect(201);

    await request(app.getHttpServer()).get(url()).set('Cookie', coordinator.cookie).expect(404);
    expect(await changeNotices(coordinator)).toEqual([expect.objectContaining({ read: true })]);
    const list = await request(app.getHttpServer()).get(url()).set('Cookie', otherCoordinator.cookie).expect(200);
    expect(list.body).toHaveLength(1);
    expect(await changeNotices(otherCoordinator)).toEqual([
      expect.objectContaining({
        read: false,
        message: 'CR Organiser requested a change to "CR Welcome Evening": expected attendance.',
      }),
    ]);
  });

  /** REQ-CHANGE-03-D: a withdrawn request is not announced to a newly assigned coordinator. */
  it('REQ-CHANGE-03-D sends no notice for a request that is no longer pending', async () => {
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'CR Lead');
    const created = await submit(organiser, { changes: { expectedAttendance: 140 } }).expect(201);
    await request(app.getHttpServer())
      .post(`${url()}/${created.body.id}/withdraw`)
      .set('Cookie', organiser.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: otherCoordinator.uid, currentCoordinatorId: coordinator.uid })
      .expect(201);
    expect(await changeNotices(otherCoordinator)).toEqual([]);
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

  /** REQ-CHANGE-07-A: the flag follows the event's safety check, including one requested while the request waits. */
  it('REQ-CHANGE-07-A flags a request when the event has a safety check', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    expect(created.body.requiresSafetyCheck).toBe(false);
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'pending', now(), 'CR Coordinator')`,
      [eventId],
    );
    const list = await request(app.getHttpServer()).get(url()).set('Cookie', organiser.cookie).expect(200);
    expect(list.body[0]).toMatchObject({ id: created.body.id, requiresSafetyCheck: true });
    const mine = await request(app.getHttpServer())
      .get('/api/change-requests?status=Pending')
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(mine.body[0]).toMatchObject({ id: created.body.id, requiresSafetyCheck: true });

    // A request submitted while the safety check exists stores the flag.
    const confirmedId = await seedEvent(organiser.uid, coordinator.uid, 'Confirmed');
    await pool.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'approved', now(), 'CR Coordinator')`,
      [confirmedId],
    );
    const flagged = await submit(organiser, { changes: { equipmentNeeds: 'Two microphones.' } }, confirmedId).expect(201);
    expect(flagged.body.requiresSafetyCheck).toBe(true);
    const stored = await pool.query('SELECT requires_safety_check FROM event_change_requests WHERE id = $1', [flagged.body.id]);
    expect(stored.rows).toEqual([{ requires_safety_check: true }]);
  });

  /** REQ-CHANGE-09-A: nobody but the owning organiser can withdraw, and the request stays pending. */
  it('REQ-CHANGE-09-A refuses to withdraw for anyone but the owner', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    const withdrawUrl = `${url()}/${created.body.id}/withdraw`;
    const server = app.getHttpServer();
    await request(server).post(withdrawUrl).expect(401);
    await request(server).post(withdrawUrl).set('Cookie', coordinator.cookie).expect(403);
    await request(server).post(withdrawUrl).set('Cookie', otherOrganiser.cookie).expect(404);
    // A request id under another event is not found.
    const otherEvent = await seedEvent(organiser.uid, coordinator.uid, 'Planning');
    await request(server)
      .post(`${url(otherEvent)}/${created.body.id}/withdraw`)
      .set('Cookie', organiser.cookie)
      .expect(404);
    const stored = await pool.query('SELECT status FROM event_change_requests WHERE id = $1', [created.body.id]);
    expect(stored.rows).toEqual([{ status: 'Pending' }]);
  });

  /** REQ-CHANGE-09-B: a request that is already decided or withdrawn cannot be withdrawn. */
  it('REQ-CHANGE-09-B refuses to withdraw a decided or withdrawn request', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    const withdrawUrl = `${url()}/${created.body.id}/withdraw`;
    await pool.query(
      `UPDATE event_change_requests
          SET status = 'Denied', decided_by = 'CR Coordinator', decided_by_id = $2, decided_at = now(), decision_reason = 'No room.'
        WHERE id = $1`,
      [created.body.id, coordinator.uid],
    );
    const denied = await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', organiser.cookie).expect(409);
    expect(denied.body.message).toBe('This change request has already been decided.');
    const stored = await pool.query('SELECT status FROM event_change_requests WHERE id = $1', [created.body.id]);
    expect(stored.rows).toEqual([{ status: 'Denied' }]);
  });

  /** REQ-CHANGE-09-C: the owner withdraws a pending request once; a second withdrawal is refused and a new request is allowed. */
  it('REQ-CHANGE-09-C withdraws a pending request and allows a new one', async () => {
    const created = await submit(organiser, { changes: { description: 'New' } }).expect(201);
    const withdrawUrl = `${url()}/${created.body.id}/withdraw`;
    const withdrawn = await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', organiser.cookie).expect(200);
    expect(withdrawn.body).toMatchObject({ status: 'Withdrawn', decidedBy: 'CR Organiser' });
    await request(app.getHttpServer()).post(withdrawUrl).set('Cookie', organiser.cookie).expect(409);
    await submit(organiser, { changes: { description: 'Second try' } }).expect(201);
  });

  /** REQ-CHANGE-08-D: prototype keys in the raw JSON body get a 400 naming the key, never a 500, and nothing is stored. */
  it('REQ-CHANGE-08-D answers 400 for __proto__ and constructor keys', async () => {
    for (const raw of [
      '{"changes":{"__proto__":{"description":"x"}}}',
      '{"changes":{"__proto__":"a","description":"New"}}',
      '{"changes":{"constructor":"x"}}',
      '{"__proto__":{"status":"Approved"},"changes":{"description":"New"}}',
    ]) {
      const response = await request(app.getHttpServer())
        .post(url())
        .set('Cookie', organiser.cookie)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(400);
      const key = raw.includes('constructor') ? 'constructor' : '__proto__';
      expect(Object.keys(response.body.errors)).toContain(key);
    }
    expect(await requestCount()).toBe(0);
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

  async function seedEvent(organiserId: string, coordinatorId: string | null, status: string) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'CR Organiser','organiser@example.test','CR Welcome Evening','Purpose','Description',
               $3,$4,80,'Banquet',ARRAY['Catering'],ARRAY['Wheelchair ramps'],'Two microphones',
               $5,$6,CASE WHEN $6::text IS NULL THEN NULL ELSE 'CR Coordinator' END,$7)`,
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
