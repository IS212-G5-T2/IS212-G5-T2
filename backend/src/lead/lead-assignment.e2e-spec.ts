/*
 * SPM-123 integration coverage through the real Nest HTTP pipeline, session
 * middleware and PostgreSQL: the unassigned queue, coordinator workload and
 * availability, the Lead's assignment, its notification and access control.
 * Test cases: LEAD-ASN-01-B, 02-D, 03-B, 03-C, 04-B, 05-B, 06-B, 09-E, 10-C,
 * 11-A, 11-SEC-3, 11-SEC-5, 11-SEC-7.
 * SPM-47 (reassignment): LEAD-REASN-01-B, 03-F, 04-B, 05-B, 06-A, 08-D,
 * 09-SEC-3, 09-SEC-6, 10-F.
 * SPM-46 (viewing a reassigned event): REASN-VIEW-01-A, 02-E, 03-C, 04-B.
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
    // SPM-47 AC10 notifications go to every Lead and name the test coordinator.
    await pool.query("DELETE FROM notifications WHERE type = 'coordinator_unavailable' AND message LIKE 'Lead E2E %'");
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

  // ---------------------------------------------------------------------------
  // SPM-47 Reassign an Event to Another Coordinator (Lead)
  // ---------------------------------------------------------------------------

  // Reassign through the API as the Lead; the page sends the coordinator it showed.
  function reassign(lead: TestUser, eventId: string, to: TestUser, current: TestUser) {
    return request(app.getHttpServer())
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: to.id, currentCoordinatorId: current.id });
  }

  // SPM-47 AC1: only assigned, active events are listed, soonest first.
  it('LEAD-REASN-01-B lists assigned active events soonest first and leaves out unassigned and finished ones', async () => {
    // Arrange: a coordinator's events in every status, plus one unassigned request.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Owner');
    const later = await seedEvent({ name: 'Later approved event', status: 'Approved', coordinator, startsInDays: 40 });
    const sooner = await seedEvent({ name: 'Sooner submitted event', status: 'Submitted', coordinator, startsInDays: 20 });
    const confirmed = await seedEvent({ name: 'Confirmed event', status: 'Confirmed', coordinator, startsInDays: 30 });
    const hidden = [
      await seedEvent({ name: 'Unassigned request' }),
      await seedEvent({ name: 'Rejected event', status: 'Rejected', coordinator }),
      await seedEvent({ name: 'Completed event', status: 'Completed', coordinator }),
      await seedEvent({ name: 'Cancelled event', status: 'Cancelled', coordinator }),
    ];

    // Act: the Lead loads the reassignment list.
    const list = await request(app.getHttpServer()).get('/api/lead/assigned').set('Cookie', lead.cookie).expect(200);

    // Assert: the three active events, soonest first, each with its coordinator; the others are absent.
    const mine = list.body.filter((e: { id: string }) => [later, sooner, confirmed].includes(e.id));
    expect(mine.map((e: { name: string }) => e.name)).toEqual(['Sooner submitted event', 'Confirmed event', 'Later approved event']);
    expect(mine[0]).toMatchObject({ status: 'Submitted', coordinatorId: coordinator.id, coordinatorName: 'Lead E2E Owner', coordinatorAvailable: true });
    const ids = list.body.map((e: { id: string }) => e.id);
    for (const id of hidden) expect(ids).not.toContain(id);
  });

  // SPM-47 AC3: the event moves to the new coordinator, who now sees it.
  it('LEAD-REASN-03-F moves an event to the new coordinator and keeps its status', async () => {
    // Arrange: an approved event with one coordinator, and a second coordinator.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Event to reassign', status: 'Approved', coordinator: original });

    // Act: the Lead reassigns it.
    const response = await reassign(lead, eventId, replacement, original).expect(201);

    // Assert: confirmed, stored with the new coordinator and the same status, and in their events.
    expect(response.body.message).toBe('Event "Event to reassign" reassigned to Lead E2E Replacement.');
    const stored = await pool.query('SELECT coordinator_id, coordinator_name, status FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0]).toEqual({ coordinator_id: replacement.id, coordinator_name: 'Lead E2E Replacement', status: 'Approved' });
    const events = await request(app.getHttpServer()).get('/api/events').set('Cookie', replacement.cookie).expect(200);
    expect(events.body.map((e: { id: string }) => e.id)).toContain(eventId);
  });

  // SPM-47 AC4: a coordinator who went unavailable after the list loaded is still refused.
  it('LEAD-REASN-04-B refuses a coordinator who became unavailable after the list loaded', async () => {
    // Arrange: the Lead sees the replacement as available.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Leaving Replacement');
    const eventId = await seedEvent({ name: 'Event for a leaving coordinator', status: 'Approved', coordinator: original });
    const list = await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === replacement.id).available).toBe(true);

    // Act: the replacement marks themselves unavailable, then the Lead reassigns.
    await request(app.getHttpServer())
      .put('/api/coordinators/me/availability')
      .set('Cookie', replacement.cookie)
      .send({ available: false })
      .expect(200);
    const refused = await reassign(lead, eventId, replacement, original).expect(409);

    // Assert: refused and still with the original coordinator.
    expect(refused.body.message).toBe('This coordinator is unavailable.');
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBe(original.id);
  });

  // SPM-47 AC5: existing clarifications stay, and the new coordinator can read and reply to them.
  it('LEAD-REASN-05-B keeps the clarification history and lets the new coordinator reply', async () => {
    // Arrange: the original coordinator asks a clarification on a submitted request.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Event with a clarification', status: 'Submitted', coordinator: original });
    const asked = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Cookie', original.cookie)
      .send({ message: 'Please confirm the catering numbers.' })
      .expect(201);

    // Act: the Lead reassigns, then the new coordinator reads the history and replies.
    await reassign(lead, eventId, replacement, original).expect(201);
    const history = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', replacement.cookie).expect(200);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${asked.body.id}/reply`)
      .set('Cookie', replacement.cookie)
      .send({ message: 'Following up as the new coordinator.' })
      .expect(201);

    // Assert: the original clarification is still there, unchanged, and the reply is saved under it.
    expect(JSON.stringify(history.body)).toContain('Please confirm the catering numbers.');
    const comments = await pool.query('SELECT type, message, author_id FROM event_comments WHERE event_id = $1 ORDER BY created_at', [eventId]);
    expect(comments.rows).toEqual([
      { type: 'clarification', message: 'Please confirm the catering numbers.', author_id: original.id },
      { type: 'reply', message: 'Following up as the new coordinator.', author_id: replacement.id },
    ]);
  });

  // SPM-47 AC6: the original coordinator loses the event entirely.
  it('LEAD-REASN-06-A stops the original coordinator from seeing, approving, rejecting or replying on the event', async () => {
    // Arrange: a submitted request reassigned away from the original coordinator.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Event moved away', status: 'Submitted', coordinator: original });
    const asked = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Cookie', original.cookie)
      .send({ message: 'Asked before the event moved.' })
      .expect(201);
    await reassign(lead, eventId, replacement, original).expect(201);

    // Act: the original coordinator tries the list, the detail, approving, rejecting, the history and replying.
    const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', original.cookie).expect(200);
    // Refused without any event data; SPM-46 (REASN-VIEW-04-B) owns the exact reassigned message.
    const detail = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', original.cookie);
    expect([403, 404]).toContain(detail.status);
    expect(JSON.stringify(detail.body)).not.toContain('Event moved away');
    const approve = await request(app.getHttpServer()).post(`/api/events/${eventId}/approve`).set('Cookie', original.cookie).expect(403);
    const reject = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/reject`)
      .set('Cookie', original.cookie)
      .send({ reason: 'Venue unavailable for the requested date.' })
      .expect(403);
    const history = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', original.cookie).expect(403);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${asked.body.id}/reply`)
      .set('Cookie', original.cookie)
      .send({ message: 'Replying after the event moved.' })
      .expect(403);

    // Assert: not listed, refused with the existing messages, and the event is still Submitted with only the original clarification.
    expect(list.body.map((e: { id: string }) => e.id)).not.toContain(eventId);
    expect(approve.body.message).toBe('This request is assigned to another coordinator.');
    expect(reject.body.message).toBe('This request is assigned to another coordinator.');
    expect(history.body.message).toBe("You don't have access to this event's comment history.");
    const stored = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].status).toBe('Submitted');
    const comments = await pool.query('SELECT message FROM event_comments WHERE event_id = $1', [eventId]);
    expect(comments.rows).toEqual([{ message: 'Asked before the event moved.' }]);
  });

  // SPM-47 AC8: both coordinators are notified, and the stale assignment notice is cleared.
  it('LEAD-REASN-08-D notifies both coordinators and marks the original assignment notification read', async () => {
    // Arrange: the Lead first assigns a queued request to the original coordinator (SPM-123).
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Event with notifications' });
    await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: original.id })
      .expect(201);

    // Act: the Lead reassigns it, then both coordinators read their notifications.
    await reassign(lead, eventId, replacement, original).expect(201);
    const toNew = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', replacement.cookie).expect(200);
    const toOriginal = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', original.cookie).expect(200);

    // Assert: the new coordinator is told it is theirs; the original is told who has it, and their old notice is read.
    type Notice = { relatedEventId: string; type: string; read: boolean; message: string };
    const forEvent = (body: Notice[]) => body.filter((n) => n.relatedEventId === eventId);
    expect(forEvent(toNew.body)).toEqual([
      expect.objectContaining({ type: 'coordinator_reassignment', message: 'Event "Event with notifications" has been reassigned to you.', read: false }),
    ]);
    const originalTypes = Object.fromEntries(forEvent(toOriginal.body).map((n) => [n.type, n.read]));
    expect(originalTypes).toEqual({ coordinator_assignment: true, coordinator_unassignment: false });
    expect(forEvent(toOriginal.body).find((n) => n.type === 'coordinator_unassignment')).toMatchObject({
      message: 'Event "Event with notifications" has been reassigned to Lead E2E Replacement.',
    });
  });

  // SPM-47 AC9: only the Lead can list or reassign, through the real middleware.
  it('LEAD-REASN-09-SEC-3 returns 403 to coordinators and organisers and 401 without a session', async () => {
    // Arrange: an assigned event and two other coordinators plus an organiser.
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const other = await createDatabaseUser('COORDINATOR', 'Lead E2E Other');
    const organiser = await createDatabaseUser('ORGANISER', 'Lead E2E Organiser');
    const eventId = await seedEvent({ name: 'Event nobody else may move', status: 'Approved', coordinator: original });

    // Act + Assert: each non-Lead is forbidden on both endpoints; no session is unauthorised.
    for (const user of [other, organiser]) {
      await request(app.getHttpServer()).get('/api/lead/assigned').set('Cookie', user.cookie).expect(403);
      await request(app.getHttpServer())
        .post(`/api/lead/events/${eventId}/reassign`)
        .set('Cookie', user.cookie)
        .send({ coordinatorId: other.id, currentCoordinatorId: original.id })
        .expect(403);
    }
    await request(app.getHttpServer()).get('/api/lead/assigned').expect(401);
    await request(app.getHttpServer())
      .post(`/api/lead/events/${eventId}/reassign`)
      .send({ coordinatorId: other.id, currentCoordinatorId: original.id })
      .expect(401);

    // Assert: the event still has its original coordinator.
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBe(original.id);
  });

  // SPM-47 AC3/AC9: an account holding both the Lead and Coordinator roles can't be chosen.
  it('LEAD-REASN-09-SEC-6 refuses to reassign an event to an account holding both the Lead and Coordinator roles', async () => {
    // Arrange: an assigned event and an account granted both roles in the database.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const both = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead And Coordinator', ['COORDINATOR']);
    const eventId = await seedEvent({ name: 'Event nobody with both roles may take', status: 'Approved', coordinator: original });

    // Act: the Lead tries to reassign to that account.
    const refused = await reassign(lead, eventId, both, original).expect(400);

    // Assert: refused, and the event keeps its coordinator.
    expect(refused.body.message).toBe('Choose an active Event Coordinator.');
    const stored = await pool.query('SELECT coordinator_id FROM events WHERE id = $1', [eventId]);
    expect(stored.rows[0].coordinator_id).toBe(original.id);
  });

  // SPM-47 AC10: going unavailable with an active event tells the Lead; going back clears it.
  it('LEAD-REASN-10-F notifies the Lead when a coordinator with an active event goes unavailable and clears it when they return', async () => {
    // Arrange: a coordinator with one approved event, and the Lead.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Lead E2E Busy Coordinator');
    await seedEvent({ name: 'Busy coordinator event', status: 'Approved', coordinator });
    const message = 'Lead E2E Busy Coordinator is now unavailable and has 1 active event that may need reassignment.';
    const leadNotice = async () => {
      const response = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', lead.cookie).expect(200);
      return response.body.filter((n: { message: string }) => n.message === message);
    };

    // Act: the coordinator marks themselves unavailable.
    await request(app.getHttpServer()).put('/api/coordinators/me/availability').set('Cookie', coordinator.cookie).send({ available: false }).expect(200);

    // Assert: the Lead has one unread notice about them.
    expect(await leadNotice()).toEqual([expect.objectContaining({ type: 'coordinator_unavailable', read: false })]);

    // Act: the coordinator marks themselves available again.
    await request(app.getHttpServer()).put('/api/coordinators/me/availability').set('Cookie', coordinator.cookie).send({ available: true }).expect(200);

    // Assert: the notice is now read.
    expect(await leadNotice()).toEqual([expect.objectContaining({ type: 'coordinator_unavailable', read: true })]);
  });

  // ---------------------------------------------------------------------------
  // SPM-46 View a Reassigned Event
  // ---------------------------------------------------------------------------

  // SPM-46 AC1: the new coordinator's notice points to an event they can actually open.
  it('REASN-VIEW-01-A gives the new coordinator a notice that links to an event they can open', async () => {
    // Arrange: an approved event reassigned from the original to the replacement.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Event to follow from a notice', status: 'Approved', coordinator: original });
    await reassign(lead, eventId, replacement, original).expect(201);

    // Act: the replacement reads their notifications, then opens the linked event.
    const notices = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', replacement.cookie).expect(200);
    const notice = notices.body.find((n: { type: string; relatedEventId: string }) => n.type === 'coordinator_reassignment' && n.relatedEventId === eventId);
    const opened = await request(app.getHttpServer()).get(`/api/events/${notice.relatedEventId}`).set('Cookie', replacement.cookie).expect(200);

    // Assert: the notice names the event and the link opens it, showing them as its coordinator.
    expect(notice.message).toBe('Event "Event to follow from a notice" has been reassigned to you.');
    expect(opened.body).toMatchObject({ id: eventId, coordinatorId: replacement.id, coordinatorName: 'Lead E2E Replacement' });
  });

  // SPM-46 AC2: the current coordinator's list and event data say who it came from and when, after two moves.
  it('REASN-VIEW-02-E records every reassignment and shows the current coordinator the most recent previous one', async () => {
    // Arrange: the event moves first -> second -> third.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const first = await createDatabaseUser('COORDINATOR', 'Lead E2E First');
    const second = await createDatabaseUser('COORDINATOR', 'Lead E2E Second');
    const third = await createDatabaseUser('COORDINATOR', 'Lead E2E Third');
    const eventId = await seedEvent({ name: 'Event moved twice', status: 'Approved', coordinator: first });
    const before = Date.now();
    await reassign(lead, eventId, second, first).expect(201);
    await reassign(lead, eventId, third, second).expect(201);

    // Act: the third coordinator loads their list and the event.
    const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', third.cookie).expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', third.cookie).expect(200);

    // Assert: both name the second coordinator with a time from this test; two history rows were saved in order.
    const listed = list.body.find((e: { id: string }) => e.id === eventId);
    for (const event of [listed, detail.body]) {
      expect(event.reassignedFrom.coordinatorName).toBe('Lead E2E Second');
      expect(Date.parse(event.reassignedFrom.reassignedAt)).toBeGreaterThanOrEqual(before - 1000);
    }
    const history = await pool.query(
      'SELECT from_coordinator_name, to_coordinator_name, reassigned_by FROM event_reassignments WHERE event_id = $1 ORDER BY reassigned_at',
      [eventId],
    );
    expect(history.rows).toEqual([
      { from_coordinator_name: 'Lead E2E First', to_coordinator_name: 'Lead E2E Second', reassigned_by: lead.id },
      { from_coordinator_name: 'Lead E2E Second', to_coordinator_name: 'Lead E2E Third', reassigned_by: lead.id },
    ]);
  });

  // SPM-46 AC3: the new coordinator sees the status and the existing clarification history.
  it('REASN-VIEW-03-C lets the new coordinator read the event status and its existing clarification history', async () => {
    // Arrange: the original asks a clarification on an approved event, then it is reassigned.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const eventId = await seedEvent({ name: 'Approved event with history', status: 'Approved', coordinator: original });
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Cookie', original.cookie)
      .send({ message: 'Is the stage still needed?' })
      .expect(201);
    await reassign(lead, eventId, replacement, original).expect(201);

    // Act: the replacement opens the event and its history.
    const detail = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', replacement.cookie).expect(200);
    const history = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', replacement.cookie).expect(200);

    // Assert: the approval decision and the original coordinator's question are both visible.
    expect(detail.body.status).toBe('approved');
    expect(history.body).toEqual([
      expect.objectContaining({ type: 'clarification', message: 'Is the stage still needed?', authorName: 'Lead E2E Original' }),
    ]);
  });

  // SPM-46 AC4: the original coordinator is told it moved; a stranger still gets "not found".
  it('REASN-VIEW-04-B tells the original coordinator the event was reassigned and keeps "not found" for others', async () => {
    // Arrange: an event reassigned away from the original; another coordinator never had it.
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'Lead E2E Lead');
    const original = await createDatabaseUser('COORDINATOR', 'Lead E2E Original');
    const replacement = await createDatabaseUser('COORDINATOR', 'Lead E2E Replacement');
    const stranger = await createDatabaseUser('COORDINATOR', 'Lead E2E Stranger');
    const eventId = await seedEvent({ name: 'Event that moved on', status: 'Approved', coordinator: original });
    await reassign(lead, eventId, replacement, original).expect(201);

    // Act: the original checks their list and opens the event; the stranger opens it too.
    const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', original.cookie).expect(200);
    const moved = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', original.cookie).expect(403);
    const unknown = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', stranger.cookie).expect(404);

    // Assert: gone from the list; a clear message that names nobody; the stranger learns nothing.
    expect(list.body.map((e: { id: string }) => e.id)).not.toContain(eventId);
    expect(moved.body.message).toBe('This event has been reassigned to another Coordinator.');
    expect(JSON.stringify(moved.body)).not.toContain('Lead E2E Replacement');
    expect(unknown.body.message).toBe('Event not found.');
  });

  async function seedEvent(options: {
    name: string;
    status?: string;
    coordinator?: TestUser;
    createdAt?: string;
    startsInDays?: number;
  }): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, status, rejection_reason, coordinator_id,
         coordinator_name, submission_key, created_at)
       VALUES ($1, 'lead-e2e-organiser', 'E2E Organiser', 'organiser@example.test', $2, 'Lead assignment test',
         now() + make_interval(days => $8), now() + make_interval(days => $8, hours => 2), 40, $3, $4, $5, $6, $1,
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
        options.startsInDays ?? 30,
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
