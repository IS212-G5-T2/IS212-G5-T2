/*
 * SPM-123 integration coverage through the real Nest HTTP pipeline, session
 * middleware and PostgreSQL: the unassigned queue, coordinator workload and
 * availability, the Lead's assignment, its notification and access control.
 * Test cases: LEAD-ASN-01-B, 02-D, 03-B, 03-C, 04-B, 05-B, 06-B, 09-E, 10-C,
 * 11-A, 11-SEC-3, 11-SEC-5, 11-SEC-7.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';

type TestUser = { id: string; name: string; cookie: string };

describe('Lead assignment (SPM-123 e2e)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let createdUserIds: string[];
  let createdEventIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // A fresh app and fixture lists per test; every row a test creates is removed afterwards.
    createdUserIds = [];
    createdEventIds = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (createdEventIds.length) {
      await pool.query('DELETE FROM notifications WHERE related_event_id = ANY($1::uuid[])', [createdEventIds]);
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  // AC1: a request submitted through the API waits, unassigned, in the Lead's queue.
  it('LEAD-ASN-01-B puts a request submitted through the API into the unassigned queue', async () => {
    // Arrange: a signed-in organiser and the Lead.
    const organiser = await createDatabaseUser('ORGANISER', 'Lead E2E Organiser');
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');

    // Act: submit a request.
    const submitted = await request(app.getHttpServer())
      .post('/api/events')
      .set('Cookie', organiser.cookie)
      .send(validEventRequest('SPM-123 Submitted Through API'))
      .expect(201);
    createdEventIds.push(submitted.body.event.id);

    // Assert: stored with no coordinator, and listed in the Lead's queue.
    const stored = await pool.query('SELECT coordinator_id, coordinator_name, status FROM events WHERE id = $1', [
      submitted.body.event.id,
    ]);
    expect(stored.rows[0]).toEqual({ coordinator_id: null, coordinator_name: null, status: 'Submitted' });
    const queue = await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', lead.cookie).expect(200);
    expect(queue.body.map((item: { id: string }) => item.id)).toContain(submitted.body.event.id);
  });

  // AC2: only unassigned requests, oldest first.
  it('LEAD-ASN-02-D lists unassigned requests oldest first and leaves out assigned ones', async () => {
    // Arrange: two unassigned requests (newer, older) and one assigned request.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Coordinator');
    const newer = await seedEvent({ name: 'Newer request', createdAt: '2026-10-02T09:00:00Z' });
    const older = await seedEvent({ name: 'Older request', createdAt: '2026-10-01T09:00:00Z' });
    const assigned = await seedEvent({ name: 'Assigned request', coordinator });

    // Act: read the queue.
    const queue = await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', lead.cookie).expect(200);

    // Assert: our two unassigned requests appear oldest first, with their basic details; the assigned one does not.
    const ours = queue.body.filter((item: { id: string }) => [newer, older, assigned].includes(item.id));
    expect(ours.map((item: { id: string }) => item.id)).toEqual([older, newer]);
    expect(ours[0]).toMatchObject({ name: 'Older request', purpose: 'Lead assignment test', expectedAttendance: 40 });
  });

  // AC3: only Submitted, Approved and Confirmed events count towards workload.
  it('LEAD-ASN-03-B counts only Submitted, Approved and Confirmed events as active', async () => {
    // Arrange: one coordinator with one event in each status.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Busy Coordinator');
    for (const status of ['Submitted', 'Approved', 'Confirmed', 'Rejected', 'Completed', 'Cancelled']) {
      await seedEvent({ name: `${status} event`, status, coordinator });
    }

    // Act: read the coordinators.
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);

    // Assert: 3 active, and available by default.
    expect(list.body.find((c: { id: string }) => c.id === coordinator.id)).toEqual({
      id: coordinator.id,
      name: 'Lead E2E Busy Coordinator',
      available: true,
      activeAssignments: 3,
    });
  });

  // AC3: the list is coordinators only.
  it('LEAD-ASN-03-C leaves inactive accounts, non-coordinators and the Lead out of the list', async () => {
    // Arrange: an active coordinator, an inactive coordinator, an organiser and the Lead.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const active = await createDatabaseUser('COORDINATOR', 'Lead E2E Active Coordinator');
    const inactive = await createDatabaseUser('COORDINATOR', 'Lead E2E Inactive Coordinator');
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [inactive.id]);
    const organiser = await createDatabaseUser('ORGANISER', 'Lead E2E Organiser');

    // Act: read the coordinators.
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);

    // Assert: only the active coordinator is listed.
    const ids = list.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(organiser.id);
    expect(ids).not.toContain(lead.id);
  });

  // AC4: real data comes back fewest active first.
  it('LEAD-ASN-04-B returns real coordinators fewest active first', async () => {
    // Arrange: coordinators with 2, 0 and 1 active events.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const two = await createDatabaseUser('COORDINATOR', 'Lead E2E Two');
    const zero = await createDatabaseUser('COORDINATOR', 'Lead E2E Zero');
    const one = await createDatabaseUser('COORDINATOR', 'Lead E2E One');
    await seedEvent({ name: 'Two A', coordinator: two });
    await seedEvent({ name: 'Two B', coordinator: two });
    await seedEvent({ name: 'One A', coordinator: one });

    // Act: read the coordinators.
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);

    // Assert: among ours, zero, then one, then two; and counts never decrease down the list.
    const ours = list.body.filter((c: { id: string }) => [two.id, zero.id, one.id].includes(c.id));
    expect(ours.map((c: { id: string }) => c.id)).toEqual([zero.id, one.id, two.id]);
    const counts = list.body.map((c: { activeAssignments: number }) => c.activeAssignments);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  // AC5 + AC9: assigning moves the request to the coordinator and notifies them.
  it('LEAD-ASN-05-B moves an assigned request out of the queue and into the coordinator\'s events', async () => {
    // Arrange: one queued request and an available coordinator.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Assignee');
    const eventId = await seedEvent({ name: 'Request to assign' });

    // Act: assign it.
    const assigned = await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.id })
      .expect(201);

    // Assert: confirmed, gone from the queue, and in the coordinator's events.
    expect(assigned.body.message).toBe('Event request "Request to assign" assigned to Lead E2E Assignee.');
    const queue = await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', lead.cookie).expect(200);
    expect(queue.body.map((item: { id: string }) => item.id)).not.toContain(eventId);
    const events = await request(app.getHttpServer()).get('/api/events').set('Cookie', coordinator.cookie).expect(200);
    expect(events.body.map((e: { id: string }) => e.id)).toContain(eventId);
  });

  // AC6: availability is checked when assigning, not only when the list was loaded.
  it('LEAD-ASN-06-B refuses a coordinator who became unavailable after the list loaded', async () => {
    // Arrange: the Lead loads the list while the coordinator is available.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Leaving Coordinator');
    const eventId = await seedEvent({ name: 'Request for a leaving coordinator' });
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === coordinator.id).available).toBe(true);

    // Act: the coordinator marks themselves unavailable, then the Lead assigns.
    await request(app.getHttpServer())
      .put('/api/coordinators/me/availability')
      .set('Cookie', coordinator.cookie)
      .send({ available: false })
      .expect(200);
    const refused = await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.id })
      .expect(409);

    // Assert: refused, still unassigned and still queued.
    expect(refused.body.message).toBe('This coordinator is unavailable.');
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBeNull();
    const queue = await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', lead.cookie).expect(200);
    expect(queue.body.map((item: { id: string }) => item.id)).toContain(eventId);
  });

  // AC9: the coordinator receives the notification through their own feed.
  it('LEAD-ASN-09-E delivers the assignment notification to the coordinator\'s notifications', async () => {
    // Arrange: a queued request and a coordinator.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Notified Coordinator');
    const eventId = await seedEvent({ name: 'Request with notification' });

    // Act: assign, then read the coordinator's notifications.
    await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.id })
      .expect(201);
    const feed = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', coordinator.cookie).expect(200);

    // Assert: exactly one unread assignment notification for this request.
    const forEvent = feed.body.filter((n: { relatedEventId: string }) => n.relatedEventId === eventId);
    expect(forEvent).toEqual([
      expect.objectContaining({
        type: 'coordinator_assignment',
        message: 'New event request "Request with notification" is awaiting your review.',
        read: false,
      }),
    ]);
  });

  // AC10: approving does not change the assigned coordinator.
  it('LEAD-ASN-10-C keeps the coordinator in the database after approval', async () => {
    // Arrange: a request assigned to a coordinator.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Approver');
    const eventId = await seedEvent({ name: 'Request to approve', coordinator });

    // Act: the coordinator approves it.
    await request(app.getHttpServer()).post(`/api/events/${eventId}/approve`).set('Cookie', coordinator.cookie).expect(201);

    // Assert: Approved, and still assigned to the same coordinator.
    const stored = await pool.query('SELECT status, coordinator_id, coordinator_name FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0]).toEqual({ status: 'Approved', coordinator_id: coordinator.id, coordinator_name: 'Lead E2E Approver' });
  });

  // AC11: the seeded Lead account signs in with only the Lead role.
  it('LEAD-ASN-11-A lets the seeded Lead sign in with only the Lead role', async () => {
    // Act: sign in as the seeded Lead.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'lead@connectsphere.test', password: 'P@55w0rd' })
      .expect(201);

    // Assert: the session's user holds only COORDINATOR_LEAD.
    expect(login.body).toMatchObject({ email: 'lead@connectsphere.test', roles: ['COORDINATOR_LEAD'] });
  });

  // AC11: through the real middleware, only the Lead gets in.
  it('LEAD-ASN-11-SEC-3 returns 403 to coordinators and organisers and 401 without a session', async () => {
    // Arrange: a coordinator, an organiser and a queued request.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Curious Coordinator');
    const organiser = await createDatabaseUser('ORGANISER', 'Lead E2E Curious Organiser');
    const eventId = await seedEvent({ name: 'Request nobody else may assign' });

    // Act + Assert: forbidden for both roles on all three endpoints.
    for (const user of [coordinator, organiser]) {
      await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', user.cookie).expect(403);
      await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', user.cookie).expect(403);
      await request(app.getHttpServer())
        .post(`/api/lead/queue/${eventId}/assign`)
        .set('Cookie', user.cookie)
        .send({ coordinatorId: coordinator.id })
        .expect(403);
    }

    // Act + Assert: no session is refused, and nothing was assigned.
    await request(app.getHttpServer()).get('/api/lead/queue').expect(401);
    await request(app.getHttpServer()).post(`/api/lead/queue/${eventId}/assign`).send({ coordinatorId: coordinator.id }).expect(401);
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBeNull();
  });

  // AC11: the old open assign endpoint is gone.
  it('LEAD-ASN-11-SEC-5 no longer serves the old open assign endpoint', async () => {
    // Arrange: a signed-in coordinator and a queued request.
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Old Endpoint');
    const eventId = await seedEvent({ name: 'Request for the old endpoint' });

    // Act: try the removed route.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set('Cookie', coordinator.cookie)
      .send({ coordinatorId: coordinator.id, coordinatorName: coordinator.name })
      .expect(404);

    // Assert: nothing was assigned.
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBeNull();
  });

  function validEventRequest(name: string) {
    const start = new Date(Date.now() + 30 * 86_400_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return {
      name,
      purpose: 'Lead assignment test',
      description: 'Created by the SPM-123 integration test.',
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      expectedAttendance: 40,
      layout: 'Classroom',
      facilities: [],
      accessibility: [],
      attachments: [],
      equipmentNeeds: '',
      submissionKey: randomUUID(),
    };
  }

  // AC11: an account wrongly given both the Lead and Coordinator roles can neither act as the Lead nor be assigned work.
  it('LEAD-ASN-11-SEC-7 keeps an account holding both roles out of the Lead endpoints and the coordinator list', async () => {
    // Arrange: a real Lead, one queued request, and an account granted both roles directly in the database.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const both = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead And Coordinator', ['COORDINATOR']);
    const eventId = await seedEvent({ name: 'Request nobody with both roles may take' });

    // Act: the dual-role account tries the Lead queue; the real Lead lists coordinators and tries to assign to it.
    const ownQueue = await request(app.getHttpServer()).get('/api/lead/queue').set('Cookie', both.cookie).expect(403);
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);
    const refused = await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: both.id })
      .expect(400);

    // Assert: forbidden as Lead, absent from the list, not assignable, and the request is still unassigned.
    expect(ownQueue.body.message).toBe('An Event Coordinator Lead cannot also be an Event Coordinator.');
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(both.id);
    expect(refused.body.message).toBe('Choose an active Event Coordinator.');
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBeNull();
  });

  async function seedEvent(options: {
    name: string;
    status?: string;
    coordinator?: TestUser;
    createdAt?: string;
  }): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, status, rejection_reason, coordinator_id,
         coordinator_name, submission_key, created_at)
       VALUES ($1, 'lead-e2e-organiser', 'E2E Organiser', 'organiser@example.test', $2, 'Lead assignment test',
         now() + interval '30 days', now() + interval '30 days 2 hours', 40, $3, $4, $5, $6, $1,
         COALESCE($7::timestamptz, now()))`,
      [
        id,
        options.name,
        options.status ?? 'Submitted',
        // The schema requires a reason on Rejected events.
        options.status === 'Rejected' ? 'Rejected by the SPM-123 integration test.' : null,
        options.coordinator?.id ?? null,
        options.coordinator?.name ?? null,
        options.createdAt ?? null,
      ],
    );
    createdEventIds.push(id);
    return id;
  }

  async function createDatabaseUser(role: string, name: string, extraRoles: string[] = []): Promise<TestUser> {
    const email = `lead-e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, name, password],
    );
    createdUserIds.push(created.rows[0].id);
    // Grant the main role plus any extra roles before signing in, so the session carries them all.
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])', [
      created.rows[0].id,
      [role, ...extraRoles],
    ]);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(201);
    // supertest types set-cookie as a string, but it is a list of header values.
    const setCookie = login.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = setCookie?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { id: created.rows[0].id, name, cookie: cookie.split(';', 1)[0] };
  }
});
