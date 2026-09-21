/*
 * End-to-end tests for SPM-39 (coordinator clarification/amendment requests)
 * against a real PostgreSQL database and the Firebase Auth Emulator, mirroring
 * test/auth.e2e-spec.ts's fixture pattern.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Clarifications (e2e)', () => {
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
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    await Promise.all(
      createdUserIds.map((uid) => getAuth(getFirebaseEmulatorApp()).deleteUser(uid)),
    );
  });

  // REQ-CLAR-01-A
  it('REQ-CLAR-01-A: Event Coordinator can send a clarification request without changing status, and Organiser is notified', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Please confirm whether livestream needs a second camera angle.' })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      eventId,
      parentId: null,
      type: 'clarification',
      authorId: coordinator.uid,
      authorName: 'Marcus Lee',
      authorRole: 'coordinator',
      awaitingReply: true,
    });
    const clarificationId = createResponse.body.id as string;

    // "Under Review" was retired as a distinct status (SPM-38 follow-up): a
    // clarification request no longer changes the event's status.
    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Submitted');

    // CLAR-01-A / AC6: organiser is notified in-app when the clarification is opened.
    const notificationsAfterCreate = await pool.query<{
      recipient_id: string;
      type: string;
      related_event_id: string;
    }>('SELECT recipient_id, type, related_event_id FROM notifications WHERE related_event_id = $1', [
      eventId,
    ]);
    expect(notificationsAfterCreate.rows).toEqual([
      expect.objectContaining({
        recipient_id: organiser.uid,
        type: 'clarification',
        related_event_id: eventId,
      }),
    ]);

    // AC7/AC8
    const threadBeforeReply = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/comments`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .expect(200);
    expect(threadBeforeReply.body).toHaveLength(1);
    expect(threadBeforeReply.body[0].awaitingReply).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${clarificationId}/reply`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .send({ message: 'Yes, please add a second angle on the main stage.' })
      .expect(201)
      .expect((response) => {
        if (response.body.authorRole !== 'organiser' || response.body.awaitingReply !== false) {
          throw new Error('Reply did not clear awaitingReply as organiser');
        }
      });

    const threadAfterReply = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/comments`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .expect(200);
    expect(threadAfterReply.body).toHaveLength(2);
    // A reply no longer auto-closes the thread — it stays pending until
    // someone explicitly resolves it, so the exchange can continue.
    expect(threadAfterReply.body[0]).toMatchObject({
      id: clarificationId,
      awaitingReply: true,
      resolved: false,
    });
    expect(threadAfterReply.body[1]).toMatchObject({
      parentId: clarificationId,
      authorRole: 'organiser',
      authorName: 'Priya Nair',
    });

    // CLAR-02-B / AC6: coordinator is notified in-app once the organiser replies.
    const notificationsAfterReply = await pool.query<{ recipient_id: string; type: string }>(
      'SELECT recipient_id, type FROM notifications WHERE related_event_id = $1 ORDER BY created_at ASC',
      [eventId],
    );
    expect(notificationsAfterReply.rows).toEqual([
      expect.objectContaining({ recipient_id: organiser.uid, type: 'clarification' }),
      expect.objectContaining({ recipient_id: coordinator.uid, type: 'clarification_reply' }),
    ]);

    // The coordinator can keep replying — the thread isn't closed by the
    // organiser's first reply.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${clarificationId}/reply`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Great, thanks for confirming.' })
      .expect(201)
      .expect((response) => {
        if (response.body.authorRole !== 'coordinator') {
          throw new Error('Reply did not record the coordinator as author');
        }
      });

    // Only an explicit resolve closes the thread.
    const resolveResponse = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${clarificationId}/resolve`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .expect(201);
    expect(resolveResponse.body).toMatchObject({
      id: clarificationId,
      resolved: true,
      awaitingReply: false,
    });

    const threadAfterResolve = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/comments`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .expect(200);
    expect(threadAfterResolve.body[0]).toMatchObject({ id: clarificationId, resolved: true });

    // Replying to a resolved clarification is rejected.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${clarificationId}/reply`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .send({ message: 'Too late.' })
      .expect(400);

    const notificationsAfterResolve = await pool.query<{ recipient_id: string; type: string }>(
      'SELECT recipient_id, type FROM notifications WHERE related_event_id = $1 ORDER BY created_at ASC',
      [eventId],
    );
    expect(notificationsAfterResolve.rows).toContainEqual(
      expect.objectContaining({ recipient_id: organiser.uid, type: 'clarification_resolved' }),
    );
  });

  // AC2/AC3
  // REQ-CLAR-01-B
  it('REQ-CLAR-01-B: Event Coordinator cannot submit a blank clarification message', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: '' })
      .expect(400);

    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Submitted');

    const commentCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM event_comments WHERE event_id = $1',
      [eventId],
    );
    expect(commentCount.rows[0].count).toBe('0');

    const notificationCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM notifications WHERE related_event_id = $1',
      [eventId],
    );
    expect(notificationCount.rows[0].count).toBe('0');
  });

  // REQ-CLAR-01-C
  it('REQ-CLAR-01-C: Event Coordinator cannot submit a whitespace-only clarification message', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: '   \n\t  ' })
      .expect(400);

    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Submitted');

    const commentCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM event_comments WHERE event_id = $1',
      [eventId],
    );
    expect(commentCount.rows[0].count).toBe('0');
  });

  // REQ-CLAR-02-A
  it('REQ-CLAR-02-A: Event Coordinator can see full chronological history with attribution and distinguishable types', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    const first = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'What is the expected room layout?' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${first.body.id}/reply`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .send({ message: 'Room layout will be Banquet.' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Please confirm expected attendance.' })
      .expect(201);

    const thread = await request(app.getHttpServer())
      .get(`/api/events/${eventId}/comments`)
      .set('Authorization', `Bearer ${organiser.idToken}`)
      .expect(200);

    expect(thread.body).toHaveLength(3);
    // Chronological order, oldest first.
    const timestamps = thread.body.map((entry: { createdAt: string }) =>
      new Date(entry.createdAt).getTime(),
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));

    expect(thread.body[0]).toMatchObject({
      id: first.body.id,
      type: 'clarification',
      authorName: 'Marcus Lee',
      authorRole: 'coordinator',
      // A reply no longer auto-closes the thread; it stays pending until
      // explicitly resolved.
      awaitingReply: true,
      resolved: false,
    });
    expect(thread.body[1]).toMatchObject({
      parentId: first.body.id,
      type: 'reply',
      authorName: 'Priya Nair',
      authorRole: 'organiser',
    });
    expect(thread.body[2]).toMatchObject({
      id: second.body.id,
      type: 'clarification',
      authorName: 'Marcus Lee',
      authorRole: 'coordinator',
      awaitingReply: true,
    });
    thread.body.forEach((entry: { createdAt: string }) => {
      expect(Number.isNaN(new Date(entry.createdAt).getTime())).toBe(false);
    });
  });

  // REQ-CLAR-03
  it('REQ-CLAR-03: Event Coordinator cannot request clarification on an event assigned to another Coordinator', async () => {
    const assignedCoordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const otherCoordinator = await createEmulatorUser('COORDINATOR', 'Someone Else');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: assignedCoordinator.uid,
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${otherCoordinator.idToken}`)
      .send({ message: 'Trying to act on someone else\'s event.' })
      .expect(403);

    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Submitted');
  });

  it('returns 403 when someone unrelated to the event replies', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const outsider = await createEmulatorUser('ORGANISER', 'Someone Else');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });
    const createResponse = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Please confirm the layout.' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${createResponse.body.id}/reply`)
      .set('Authorization', `Bearer ${outsider.idToken}`)
      .send({ message: 'Replying to someone else\'s event.' })
      .expect(403);
  });

  it('returns 403 when someone unrelated to the event resolves a clarification', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const outsiderCoordinator = await createEmulatorUser('COORDINATOR', 'Someone Else');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });
    const createResponse = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Please confirm the layout.' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications/${createResponse.body.id}/resolve`)
      .set('Authorization', `Bearer ${outsiderCoordinator.idToken}`)
      .expect(403);
  });

  it('returns 401 when authentication is missing', async () => {
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({ organiserId: organiser.uid, coordinatorId: null });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .send({ message: 'Hi' })
      .expect(401);
  });

  async function seedEvent(options: {
    organiserId: string;
    coordinatorId: string | null;
    status?: string;
  }): Promise<string> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        status, submission_key)
       VALUES ($1,$2,'Test Organiser','organiser@example.test','E2E Test Event','Testing',
        '', now() + interval '1 day', now() + interval '1 day 2 hours', 50, $3, 'Test Coordinator',
        $4, $1)`,
      [eventId, options.organiserId, options.coordinatorId, options.status ?? 'Submitted'],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  async function createEmulatorUser(
    role: string,
    displayName: string,
  ): Promise<{ email: string; idToken: string; uid: string }> {
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const emulatorUrl = getFirebaseEmulatorUrl();

    const signUpResponse = await fetch(
      `${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
      },
    );
    const signUp = (await signUpResponse.json()) as { localId?: string };
    if (!signUpResponse.ok || !signUp.localId) {
      throw new Error(`Could not create Firebase emulator user: ${JSON.stringify(signUp)}`);
    }

    await getAuth(getFirebaseEmulatorApp()).setCustomUserClaims(signUp.localId, {
      roles: [role],
    });
    createdUserIds.push(signUp.localId);

    const signInResponse = await fetch(
      `${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const signIn = (await signInResponse.json()) as { idToken?: string };
    if (!signInResponse.ok || !signIn.idToken) {
      throw new Error(`Could not sign in Firebase emulator user: ${JSON.stringify(signIn)}`);
    }

    return { email, idToken: signIn.idToken, uid: signUp.localId };
  }

  function getFirebaseEmulatorUrl(): string {
    return `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
  }

  function getFirebaseEmulatorApp() {
    return (
      getApps()[0] ??
      initializeApp({
        projectId: process.env.GCLOUD_PROJECT ?? 'demo-is212',
      })
    );
  }
});
