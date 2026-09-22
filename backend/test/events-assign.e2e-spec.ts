/*
 * End-to-end tests for SPM-37 coordinator assignment persistence
 * (POST /api/events/:id/assign) and the events list omitting attachment blobs,
 * against a real PostgreSQL database. Mirrors test/clarifications.e2e-spec.ts's
 * fixture pattern. Protected event routes use real PostgreSQL-backed session
 * cookies, rather than a mocked identity provider.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Events coordinator assignment (e2e)', () => {
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
    await app.close();
    if (createdEventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  async function seedEvent(
    options: {
      organiserId: string;
      status?: string;
      coordinatorId?: string | null;
      attachments?: unknown[];
    },
  ): Promise<string> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        attachments, status, submission_key)
        VALUES ($1,$2,'Demo Organiser','organiser@example.test','E2E Assign Event','Testing',
        '', now() + interval '1 day', now() + interval '1 day 2 hours', 50, $3, $4,
        $5, $6, $1)`,
      [
        eventId,
        options.organiserId,
        options.coordinatorId ?? null,
        options.coordinatorId ? 'Existing Coordinator' : null,
        JSON.stringify(options.attachments ?? []),
        options.status ?? 'Submitted',
      ],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  // Assignment alone no longer advances status — only a clarification
  // request does that (see clarifications.e2e-spec.ts).
  it('assigns a coordinator and persists it without changing status', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Demo Coordinator');
    const eventId = await seedEvent({ organiserId: organiser.uid, status: 'Submitted', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set('Cookie', organiser.cookie)
      .send({ coordinatorId: coordinator.uid, coordinatorName: coordinator.name })
      .expect(201);
    expect(res.body).toMatchObject({
      id: eventId,
      coordinatorId: coordinator.uid,
      coordinatorName: coordinator.name,
      status: 'submitted',
    });

    // The assignment survives a fresh read by the now-assigned coordinator
    // (this is what made it "stick").
    const detail = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set('Cookie', coordinator.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ coordinatorId: coordinator.uid, status: 'submitted' });

    const row = await pool.query(
      'SELECT coordinator_id, coordinator_name, status FROM events WHERE id=$1',
      [eventId],
    );
    expect(row.rows[0]).toMatchObject({
      coordinator_id: coordinator.uid,
      coordinator_name: coordinator.name,
      status: 'Submitted',
    });
  });

  it('leaves an already-approved event status unchanged while still recording the coordinator', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Demo Coordinator');
    const eventId = await seedEvent({ organiserId: organiser.uid, status: 'Approved', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set('Cookie', organiser.cookie)
      .send({ coordinatorId: coordinator.uid, coordinatorName: coordinator.name })
      .expect(201);
    expect(res.body).toMatchObject({ coordinatorId: coordinator.uid, status: 'approved' });
  });

  it('rejects an assignment that is missing the coordinator identity', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const eventId = await seedEvent({ organiserId: organiser.uid });
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set('Cookie', organiser.cookie)
      .send({ coordinatorName: 'No Id' })
      .expect(400);
  });

  it('returns 404 when assigning a coordinator to a non-existent event', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Demo Coordinator');
    await request(app.getHttpServer())
      .post(`/api/events/${randomUUID()}/assign`)
      .set('Cookie', organiser.cookie)
      .send({ coordinatorId: coordinator.uid, coordinatorName: coordinator.name })
      .expect(404);
  });

  it('omits attachment dataUrl from the events list but keeps it on the detail', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const attachment = {
      id: 'att-1',
      name: 'note.txt',
      type: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    };
    const eventId = await seedEvent({ organiserId: organiser.uid, attachments: [attachment] });

    const list = await request(app.getHttpServer())
      .get('/api/events')
      .set('Cookie', organiser.cookie)
      .expect(200);
    const listed = (list.body as Array<{ id: string; attachments: unknown[] }>).find(
      (e) => e.id === eventId,
    );
    expect(listed?.attachments).toEqual([
      { id: 'att-1', name: 'note.txt', type: 'text/plain', size: 5 },
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(detail.body.attachments[0]).toMatchObject({
      name: 'note.txt',
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    });
  });

  // SPM-38 AC4: a coordinator the event is not assigned to gets the same 404
  // as a non-existent event when reading it through the real HTTP pipeline,
  // and an unauthenticated request is rejected before it ever reaches that check.
  it('EVE-REV-04-F returns 404 for a coordinator the event is not assigned to', async () => {
    const organiser = await createDatabaseUser('ORGANISER', 'Demo Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'Demo Coordinator');
    const otherCoordinator = await createDatabaseUser('COORDINATOR', 'Other Coordinator');
    const eventId = await seedEvent({
      organiserId: organiser.uid,
      status: 'Submitted',
      coordinatorId: coordinator.uid,
    });

    await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set('Cookie', otherCoordinator.cookie)
      .expect(404);

    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(401);
  });

  async function createDatabaseUser(role: string, name: string): Promise<{
    uid: string;
    name: string;
    cookie: string;
  }> {
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'password123';
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, name, password],
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
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, name, cookie: cookie.split(';', 1)[0] };
  }
});
