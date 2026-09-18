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

  it('runs the full create -> view -> reply cycle', async () => {
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

    // AC4: status forced to Under_Review, surfaced as 'under_review' by EventsService's record().
    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Under_Review');

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
    expect(threadAfterReply.body[0]).toMatchObject({ id: clarificationId, awaitingReply: false });
    expect(threadAfterReply.body[1]).toMatchObject({
      parentId: clarificationId,
      authorRole: 'organiser',
      authorName: 'Priya Nair',
    });
  });

  // AC2/AC3
  it('returns 400 for a blank clarification message and does not mutate status', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      coordinatorId: coordinator.uid,
    });

    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/clarifications`)
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: '   ' })
      .expect(400);

    const statusResult = await pool.query<{ status: string }>(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    expect(statusResult.rows[0].status).toBe('Submitted');
  });

  // AC9
  it('returns 403 for a coordinator not assigned to the event', async () => {
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

  it('returns 403 when someone other than the organiser replies', async () => {
    const coordinator = await createEmulatorUser('COORDINATOR', 'Marcus Lee');
    const organiser = await createEmulatorUser('ORGANISER', 'Priya Nair');
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
      .set('Authorization', `Bearer ${coordinator.idToken}`)
      .send({ message: 'Replying to my own request.' })
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
