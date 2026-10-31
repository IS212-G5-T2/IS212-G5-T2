/*
 * SPM-88 Request Approval and Rejection Notifications: HTTP and PostgreSQL
 * integration tests for the real Nest pipeline (routes, sessions, transactions,
 * notification rows). Covers ACs 1, 2, 3, 5 and 6 at the persistence and API
 * level. The rendered date, link and read-state behaviour is covered by the
 * frontend suites for ACs 2 to 5.
 *
 * Fixture users are real PostgreSQL rows with real login sessions. Every row
 * created here is removed in afterEach (events cascade their notifications,
 * users cascade their auth sessions).
 *
 * Assumption index (assumption -> tests relying on it):
 *   A1: a successful reject returns HTTP 201, the same POST success status as
 *       approve (Nest default for @Post). No existing reject e2e fixes this
 *       status; tests that rely on it: DECISION-NOTIFY-01-B, 03-B, 05-STATE-2
 *       and 06-C (the rejection is created through the reject route).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PASSWORD = 'password123';
const SESSION_COOKIE = 'connectsphere_session=';

describe('SPM-88 request decision notifications (e2e)', () => {
  let app: INestApplication;
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

  describe('AC1: one notification for the owning organiser only', () => {
    /**
     * DECISION-NOTIFY-01-A: approving a request writes exactly one unread
     * 'approval' notification for the owning organiser, linked to the event.
     * Kills: approval notification not written; written read=true; written twice;
     * written to the coordinator instead of the organiser.
     */
    it('DECISION-NOTIFY-01-A: approve gives the owner exactly one unread approval notification', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'Welcome Evening',
      });

      // Act
      await request(app.getHttpServer())
        .post(`/api/events/${eventId}/approve`)
        .set('Cookie', coordinator.cookie)
        .send({})
        .expect(201);

      // Assert
      const feed = await getFeed(organiser.cookie);
      expect(feed).toEqual([
        expect.objectContaining({
          audienceUserId: organiser.uid,
          type: 'approval',
          relatedEventId: eventId,
          read: false,
        }),
      ]);
    });

    /**
     * DECISION-NOTIFY-01-B: rejecting a request writes exactly one unread
     * 'rejection' notification for the owning organiser.
     * The feed also carries the event's current name (relatedEventName) for the bell's headline cut.
     * Kills: rejection notification not written; type approval instead of rejection;
     * duplicated on reject; relatedEventName dropped or nulled.
     * ASSUMPTION A1: reject returns 201.
     */
    it('DECISION-NOTIFY-01-B: reject gives the owner exactly one unread rejection notification', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'Welcome Evening',
      });

      // Act
      await rejectAs(eventId, coordinator.cookie, 'Venue clash on that date').expect(201);

      // Assert
      const feed = await getFeed(organiser.cookie);
      expect(feed).toEqual([
        expect.objectContaining({
          audienceUserId: organiser.uid,
          type: 'rejection',
          relatedEventId: eventId,
          relatedEventName: 'Welcome Evening',
          read: false,
        }),
      ]);
    });

    /**
     * DECISION-NOTIFY-01-SEC-1: a second organiser and the assigned coordinator
     * cannot see the decision notification for another organiser's event.
     * Kills: notification fanned out to all organisers; coordinator feed leaks
     * organiser decision types; recipient chosen from the wrong column.
     */
    it('DECISION-NOTIFY-01-SEC-1: other organisers and the assigned coordinator do not see the decision', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const otherOrganiser = await createDatabaseUser('ORGANISER', 'Other Organiser');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await approveAs(eventId, coordinator.cookie).expect(201);

      // Act
      const otherFeed = await getFeed(otherOrganiser.cookie);
      const coordinatorFeed = await getFeed(coordinator.cookie);

      // Assert
      expect(otherFeed).toEqual([]);
      expect(coordinatorFeed).toEqual([]);
    });

    /**
     * DECISION-NOTIFY-01-SEC-2: a second organiser cannot mark the owner's
     * notification read; the owner's notification stays unread.
     * Kills: mark-read not scoped to recipient_id; 404 replaced by a silent success.
     */
    it('DECISION-NOTIFY-01-SEC-2: a second organiser gets 404 when marking the owner notification read', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const otherOrganiser = await createDatabaseUser('ORGANISER', 'Other Organiser');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await approveAs(eventId, coordinator.cookie).expect(201);
      const notificationId = await findNotificationId(eventId);

      // Act
      await request(app.getHttpServer())
        .post(`/api/notifications/${notificationId}/read`)
        .set('Cookie', otherOrganiser.cookie)
        .send({})
        .expect(404);

      // Assert
      expect(await readStateOf(notificationId)).toBe(false);
      expect(await getFeed(organiser.cookie)).toEqual([
        expect.objectContaining({ id: notificationId, read: false }),
      ]);
    });

    /**
     * DECISION-NOTIFY-01-SEC-3: without a session the feed and the mark-read
     * route both refuse, and nothing is marked read.
     * Kills: notification routes left unguarded; read flag flipped before the guard.
     */
    it('DECISION-NOTIFY-01-SEC-3: no session gets 401 on the feed and on mark-read', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await approveAs(eventId, coordinator.cookie).expect(201);
      const notificationId = await findNotificationId(eventId);

      // Act + Assert
      await request(app.getHttpServer()).get('/api/notifications').expect(401);
      await request(app.getHttpServer())
        .post(`/api/notifications/${notificationId}/read`)
        .send({})
        .expect(401);
      expect(await readStateOf(notificationId)).toBe(false);
    });
  });

  describe('AC2 and AC3: decision content is stored with the decision', () => {
    /**
     * DECISION-NOTIFY-02-B: the approval message names the event, and the
     * notification's created_at equals the event's updated_at (same transaction).
     * Kills: decision date taken from a second now() or the client clock;
     * message without the event name.
     */
    it('DECISION-NOTIFY-02-B: approval message contains the event name and created_at equals updated_at', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'SPM-88 Approved Evening',
      });

      // Act
      await approveAs(eventId, coordinator.cookie).expect(201);

      // Assert
      const row = await pool.query<{
        message: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT n.message, n.created_at, e.updated_at
           FROM notifications n
           JOIN events e ON e.id = n.related_event_id
          WHERE n.related_event_id = $1`,
        [eventId],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].message).toContain('SPM-88 Approved Evening');
      expect(row.rows[0].created_at).toEqual(row.rows[0].updated_at);
    });

    /**
     * DECISION-NOTIFY-03-B: a reason with surrounding spaces is stored trimmed on the event, and the
     * rejection notification carries only the headline (no reason; AC3 amended 30 Oct 2026).
     * Kills: reason stored untrimmed; the reason leaking into the notification message.
     */
    it('DECISION-NOTIFY-03-B: the event stores the trimmed reason and the notification message has no reason', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'SPM-88 Trim Check',
      });

      // Act
      await rejectAs(eventId, coordinator.cookie, '  Venue clash on that date  ').expect(201);

      // Assert: trimmed literal "Venue clash on that date" (25 characters)
      const event = await pool.query<{ rejection_reason: string }>(
        'SELECT rejection_reason FROM events WHERE id = $1',
        [eventId],
      );
      expect(event.rows[0].rejection_reason).toBe('Venue clash on that date');
      const notification = await pool.query<{ message: string }>(
        'SELECT message FROM notifications WHERE related_event_id = $1',
        [eventId],
      );
      expect(notification.rows[0].message).toBe(
        'Your event request "SPM-88 Trim Check" was rejected',
      );
      expect(notification.rows[0].message).not.toContain('Venue clash');
    });
  });

  describe('AC5 and AC6: state, read persistence and failed decisions', () => {
    /**
     * DECISION-NOTIFY-01-STATE-1: approving twice refuses the second decision and
     * leaves exactly one notification.
     * Kills: second approval writes another notification; 409 mapped to 200.
     */
    it('DECISION-NOTIFY-01-STATE-1: a second approve gets 409 and exactly one notification remains', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await approveAs(eventId, coordinator.cookie).expect(201);

      // Act
      await approveAs(eventId, coordinator.cookie).expect(409);

      // Assert
      expect(await countNotifications(eventId)).toBe(1);
    });

    /**
     * DECISION-NOTIFY-05-STATE-1: a notification marked read stays read after the
     * organiser signs out and signs in again (a new session).
     * Kills: read flag kept only in the session or client; mark-read not persisted.
     */
    it('DECISION-NOTIFY-05-STATE-1: read state survives sign-out and sign-in', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await approveAs(eventId, coordinator.cookie).expect(201);
      const notificationId = await findNotificationId(eventId);
      await markReadAs(notificationId, organiser.cookie).expect(201);

      // Act: sign out, then sign in again for a new session
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', organiser.cookie)
        .expect(204);
      const newCookie = await loginCookie(organiser.email);

      // Assert
      expect(await getFeed(newCookie)).toEqual([
        expect.objectContaining({ id: notificationId, read: true }),
      ]);
    });

    /**
     * DECISION-NOTIFY-05-STATE-2: marking one notification read leaves the other
     * unread, and a second mark-read on the same notification succeeds and keeps it read.
     * Kills: mark-read updates every notification of the recipient; second
     * mark-read returns 404 once read; read flag toggled back to unread.
     * ASSUMPTION A1 is used only to create the decisions through the reject route.
     */
    it('DECISION-NOTIFY-05-STATE-2: marking A read leaves B unread and a repeat mark-read is idempotent', async () => {
      // Arrange: two decisions for one organiser, on two events
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventA = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'SPM-88 Event A',
      });
      const eventB = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
        name: 'SPM-88 Event B',
      });
      await approveAs(eventA, coordinator.cookie).expect(201);
      await rejectAs(eventB, coordinator.cookie, 'Venue clash on that date').expect(201);
      const notificationA = await findNotificationId(eventA);
      const notificationB = await findNotificationId(eventB);

      // Act
      await markReadAs(notificationA, organiser.cookie).expect(201);
      await markReadAs(notificationA, organiser.cookie).expect(201);

      // Assert
      expect(await readStateOf(notificationA)).toBe(true);
      expect(await readStateOf(notificationB)).toBe(false);
    });

    /**
     * DECISION-NOTIFY-06-A: a rejection whose reason is too short is refused with
     * 400, writes no notification and leaves the request Submitted.
     * Kills: notification written before validation; status changed on a refused reason.
     */
    it('DECISION-NOTIFY-06-A: a too-short rejection reason gets 400 and writes nothing', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });

      // Act: "no fit ok" is 9 characters, below the 10-character minimum
      await rejectAs(eventId, coordinator.cookie, 'no fit ok').expect(400);

      // Assert
      expect(await countNotifications(eventId)).toBe(0);
      expect(await statusOf(eventId)).toBe('Submitted');
    });

    /**
     * DECISION-NOTIFY-06-B: a coordinator who is not assigned to the request is
     * refused with 403 and writes no notification.
     * Kills: notification written before the assignment check; assignment check skipped.
     */
    it('DECISION-NOTIFY-06-B: approve by a non-assigned coordinator gets 403 and writes nothing', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const assigned = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const otherCoordinator = await createDatabaseUser('COORDINATOR', 'Someone Else');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: assigned.uid,
      });

      // Act
      await approveAs(eventId, otherCoordinator.cookie).expect(403);

      // Assert
      expect(await countNotifications(eventId)).toBe(0);
      expect(await statusOf(eventId)).toBe('Submitted');
    });

    /**
     * DECISION-NOTIFY-06-C: approving a request that is already Rejected gets 409
     * and leaves only the original rejection notification.
     * Kills: approval notification written over a rejection; status overwritten.
     */
    it('DECISION-NOTIFY-06-C: approve after rejection gets 409 and only the rejection notification exists', async () => {
      // Arrange: a real rejection through the reject route
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });
      await rejectAs(eventId, coordinator.cookie, 'Venue clash on that date').expect(201);

      // Act
      await approveAs(eventId, coordinator.cookie).expect(409);

      // Assert
      const rows = await pool.query<{ type: string }>(
        'SELECT type FROM notifications WHERE related_event_id = $1',
        [eventId],
      );
      expect(rows.rows).toEqual([{ type: 'rejection' }]);
      expect(await statusOf(eventId)).toBe('Rejected');
    });

    /**
     * DECISION-NOTIFY-06-CONC-1: two simultaneous approvals of one request give
     * one 201 and one 409, and exactly one notification.
     * Kills: row lock removed (both transactions win); notification written outside
     * the locked transaction.
     */
    it('DECISION-NOTIFY-06-CONC-1: two simultaneous approves give 201 and 409 with one notification', async () => {
      // Arrange
      const organiser = await createDatabaseUser('ORGANISER', 'Priya Nair');
      const coordinator = await createDatabaseUser('COORDINATOR', 'Marcus Lee');
      const eventId = await seedEvent({
        organiserId: organiser.uid,
        coordinatorId: coordinator.uid,
      });

      // Act
      const [first, second] = await Promise.all([
        approveAs(eventId, coordinator.cookie),
        approveAs(eventId, coordinator.cookie),
      ]);

      // Assert
      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
      expect(await countNotifications(eventId)).toBe(1);
    });
  });

  // ---------------------------------------------------------------- helpers

  function approveAs(eventId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', cookie)
      .send({});
  }

  function rejectAs(eventId: string, cookie: string, reason: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/reject`)
      .set('Cookie', cookie)
      .send({ reason });
  }

  function markReadAs(notificationId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/notifications/${notificationId}/read`)
      .set('Cookie', cookie)
      .send({});
  }

  async function getFeed(cookie: string): Promise<Array<Record<string, unknown>>> {
    const response = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', cookie)
      .expect(200);
    return response.body;
  }

  async function seedEvent(options: {
    organiserId: string;
    coordinatorId: string | null;
    name?: string;
  }): Promise<string> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        status, rejection_reason, submission_key)
       VALUES ($1,$2,'Test Organiser','organiser@example.test',$3,'Testing',
        'SPM-88 integration event', now() + interval '1 day',
        now() + interval '1 day 2 hours', 50, $4, 'Test Coordinator', 'Submitted', NULL, $1)`,
      [eventId, options.organiserId, options.name ?? 'SPM-88 E2E Test Event', options.coordinatorId],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  async function createDatabaseUser(
    role: string,
    displayName: string,
  ): Promise<{ email: string; cookie: string; uid: string }> {
    const email = `e2e-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, displayName, PASSWORD],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [uid, role],
    );
    const cookie = await loginCookie(email);
    return { email, cookie, uid };
  }

  async function loginCookie(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    const setCookie: string | string[] | undefined = response.headers['set-cookie'];
    const cookies = typeof setCookie === 'string' ? [setCookie] : (setCookie ?? []);
    const cookie = cookies.find((value) => value.startsWith(SESSION_COOKIE));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return cookie.split(';', 1)[0];
  }

  async function findNotificationId(eventId: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM notifications WHERE related_event_id = $1 ORDER BY created_at, id LIMIT 1',
      [eventId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Expected a decision notification to exist');
    return id;
  }

  async function readStateOf(notificationId: string): Promise<boolean> {
    const result = await pool.query<{ read: boolean }>(
      'SELECT read FROM notifications WHERE id = $1',
      [notificationId],
    );
    return result.rows[0].read;
  }

  async function countNotifications(eventId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT count(*) FROM notifications WHERE related_event_id = $1',
      [eventId],
    );
    return Number(result.rows[0].count);
  }

  async function statusOf(eventId: string): Promise<string> {
    const result = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    return result.rows[0].status;
  }
});
