/*
 * Integration tests for SPM-40 approval decisions against the real Nest HTTP
 * pipeline and PostgreSQL database. These cases sit below the Playwright
 * functional checks and above service unit tests: real sessions, routes,
 * transactions, persistence, and notification rows are all exercised.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Events approval decisions (SPM-40 e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (createdEventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
        createdEventIds,
      ]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        createdUserIds,
      ]);
    }
  });

  // SPM-40 AC2/AC3/AC4/AC5: approving through the real route persists status
  // and notification atomically, then removes the event from Submitted lists.
  it('approves an assigned Submitted request and persists the organiser notification', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
      status: 'Submitted',
      name: 'SPM-40 Integration Approval',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(201);

    expect(response.body).toMatchObject({
      id: eventId,
      status: 'approved',
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    // Persistence proof: the event row has moved to Approved and no rejection
    // reason leaked into the approval workflow.
    const eventRow = await pool.query<{
      status: string;
      rejection_reason: string | null;
    }>('SELECT status, rejection_reason FROM events WHERE id = $1', [eventId]);
    expect(eventRow.rows[0]).toEqual({
      status: 'Approved',
      rejection_reason: null,
    });

    // AC4: organiser receives one approval notification linked to the event.
    const notifications = await pool.query<{
      recipient_id: string;
      type: string;
      message: string;
      related_event_id: string;
      read: boolean;
    }>(
      `SELECT recipient_id, type, message, related_event_id, read
       FROM notifications
       WHERE related_event_id = $1`,
      [eventId],
    );
    expect(notifications.rows).toEqual([
      expect.objectContaining({
        recipient_id: organiser.uid,
        type: 'approval',
        related_event_id: eventId,
        read: false,
      }),
    ]);
    expect(notifications.rows[0].message).toContain(
      'SPM-40 Integration Approval',
    );
    const notificationId = await findNotificationId(eventId);

    // AC4 through the public API: the owning organiser can retrieve and mark
    // the approval notification read, while another organiser cannot see it.
    const organiserNotifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(organiserNotifications.body).toEqual([
      expect.objectContaining({
        id: notificationId,
        audienceUserId: organiser.uid,
        type: 'approval',
        relatedEventId: eventId,
        read: false,
      }),
    ]);

    const otherOrganiser = await createDatabaseUser(
      'ORGANISER',
      'Other Organiser',
    );
    const otherNotifications = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', otherOrganiser.cookie)
      .expect(200);
    expect(
      otherNotifications.body.some(
        (notification: { relatedEventId?: string }) =>
          notification.relatedEventId === eventId,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/notifications/${notificationId}/read`)
      .set('Cookie', organiser.cookie)
      .send({})
      .expect(201);
    const readState = await pool.query<{ read: boolean }>(
      'SELECT read FROM notifications WHERE id = $1',
      [notificationId],
    );
    expect(readState.rows[0].read).toBe(true);

    // AC5: the coordinator's Submitted pending list no longer includes it, but
    // the Approved record remains visible through the same scoped event list.
    const listResponse = await request(app.getHttpServer())
      .get('/api/events')
      .set('Cookie', coordinator.cookie)
      .expect(200);
    const listedEvent = listResponse.body.find(
      (event: { id: string }) => event.id === eventId,
    );
    expect(listedEvent).toMatchObject({ id: eventId, status: 'approved' });
    expect(
      listResponse.body.some(
        (event: { id: string; status: string }) =>
          event.id === eventId && event.status === 'submitted',
      ),
    ).toBe(false);
  });

  // SPM-40 AC6: an Approved request is terminal for the approval endpoint and
  // cannot be processed again or moved back by this review flow.
  it('refuses to approve an already Approved request without duplicating notifications', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
      status: 'Approved',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(409);

    const eventRow = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(eventRow.rows[0].status).toBe('Approved');

    const notificationCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM notifications WHERE related_event_id = $1',
      [eventId],
    );
    expect(notificationCount.rows[0].count).toBe('0');
  });

  // SPM-40 state guard: Rejected is also terminal for approval in the current
  // database lifecycle and must not produce approval notifications.
  it('refuses to approve a Rejected request', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
      status: 'Rejected',
      rejectionReason: 'Insufficient venue booking details',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(409);

    const eventRow = await pool.query<{
      status: string;
      rejection_reason: string | null;
    }>('SELECT status, rejection_reason FROM events WHERE id = $1', [eventId]);
    expect(eventRow.rows[0]).toEqual({
      status: 'Rejected',
      rejection_reason: 'Insufficient venue booking details',
    });
    await expectNoNotifications(eventId);
  });

  // SPM-40 authorization: only the coordinator assigned to the Submitted
  // request can approve it.
  it('rejects approval by another coordinator and leaves the event untouched', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const assignedCoordinator = await createDatabaseUser(
      'COORDINATOR',
      'Marcus Lee',
    );
    const otherCoordinator = await createDatabaseUser(
      'COORDINATOR',
      'Someone Else',
    );
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: assignedCoordinator.uid,
      status: 'Submitted',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', otherCoordinator.cookie)
      .send({})
      .expect(403);

    const persisted = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(persisted.rows[0].status).toBe('Submitted');
    await expectNoNotifications(eventId);
  });

  // SPM-40 role guard: the organiser who owns the event can view it, but cannot
  // execute the coordinator approval decision.
  it('rejects approval by the owning organiser and leaves the event untouched', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
      status: 'Submitted',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', organiser.cookie)
      .send({})
      .expect(403);

    await expectEventStatus(eventId, 'Submitted');
    await expectNoNotifications(eventId);
  });

  // SPM-40 assignment guard: a generic coordinator cannot approve an unassigned
  // request; assignment is part of the decision boundary.
  it('rejects approval of an unassigned Submitted request', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: null,
      status: 'Submitted',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(403);

    await expectEventStatus(eventId, 'Submitted');
    await expectNoNotifications(eventId);
  });

  // Protected approval routes require the PostgreSQL-backed browser session.
  it('requires authentication before approving a request', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
      status: 'Submitted',
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .send({})
      .expect(401);
  });

  // SPM-40 id guard: malformed event IDs fail before opening an event lookup,
  // and unknown UUIDs do not leak any existence details.
  it('returns 404 for malformed and unknown event IDs', async () => {
    const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');

    await request(app.getHttpServer())
      .post('/api/events/not-a-uuid/approve')
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/events/${randomUUID()}/approve`)
      .set('Cookie', coordinator.cookie)
      .send({})
      .expect(404);
  });

  async function seedEvent(options: {
    organiserId: string;
    coordinatorId: string | null;
    status?: string;
    name?: string;
    rejectionReason?: string;
  }): Promise<string> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        status, rejection_reason, submission_key)
       VALUES ($1,$2,'Test Organiser','organiser@example.test',$3,'Testing',
        'SPM-40 integration event', now() + interval '1 day',
        now() + interval '1 day 2 hours', 50, $4, 'Test Coordinator', $5, $6, $1)`,
      [
        eventId,
        options.organiserId,
        options.name ?? 'SPM-40 E2E Test Event',
        options.coordinatorId,
        options.status ?? 'Submitted',
        options.rejectionReason ?? null,
      ],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  async function createDatabaseUser(
    role: string,
    displayName: string,
  ): Promise<{ email: string; cookie: string; uid: string }> {
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, displayName, password],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [uid, role],
    );
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const cookie = response.headers['set-cookie']?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie)
      throw new Error('Expected a PostgreSQL authentication session cookie');
    return { email, cookie: cookie.split(';', 1)[0], uid };
  }

  async function expectEventStatus(
    eventId: string,
    expectedStatus: string,
  ): Promise<void> {
    const persisted = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(persisted.rows[0].status).toBe(expectedStatus);
  }

  async function expectNoNotifications(eventId: string): Promise<void> {
    const notificationCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM notifications WHERE related_event_id = $1',
      [eventId],
    );
    expect(notificationCount.rows[0].count).toBe('0');
  }

  async function findNotificationId(eventId: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM notifications WHERE related_event_id = $1',
      [eventId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Expected approval notification to exist');
    return id;
  }
});
