/*
 * End-to-end tests for SPM-37 coordinator assignment persistence
 * (POST /api/events/:id/assign) and the events list omitting attachment blobs,
 * against a real PostgreSQL database. Mirrors test/clarifications.e2e-spec.ts's
 * fixture pattern. GET /api/events and GET /api/events/:id now require a
 * verified Firebase Bearer token (SPM-38), so this suite overrides
 * FirebaseTokenService with a fixed token->identity map instead of depending
 * on a live Firebase Auth Emulator. POST /api/events/:id/assign remains a
 * manual-override endpoint with no auth requirement.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { FirebaseTokenService } from '../src/auth/authentication/firebase-token.service.js';
import type { AuthenticatedUser } from '../src/auth/models/auth.models.js';

const ORGANISER: AuthenticatedUser = {
  uid: 'organiser-1',
  roles: ['ORGANISER'],
  email: 'organiser@example.test',
  name: 'Demo Organiser',
};
const COORDINATOR: AuthenticatedUser = {
  uid: 'coordinator-1',
  roles: ['COORDINATOR'],
  email: 'coordinator@example.test',
  name: 'Demo Coordinator',
};
const OTHER_COORDINATOR: AuthenticatedUser = {
  uid: 'coordinator-2',
  roles: ['COORDINATOR'],
  email: 'other-coordinator@example.test',
  name: 'Other Coordinator',
};
const AUTH_TOKENS: Record<string, AuthenticatedUser> = {
  'organiser-token': ORGANISER,
  'coordinator-token': COORDINATOR,
  'other-coordinator-token': OTHER_COORDINATOR,
};

function authHeader(token: keyof typeof AUTH_TOKENS): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

describe('Events coordinator assignment (e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FirebaseTokenService)
      .useValue({
        verifyIdToken: async (token: string) => {
          const user = AUTH_TOKENS[token];
          if (!user) throw new Error('Invalid authentication token');
          return user;
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (createdEventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    await app.close();
  });

  async function seedEvent(
    options: { status?: string; coordinatorId?: string | null; attachments?: unknown[] } = {},
  ): Promise<string> {
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        attachments, status, submission_key)
       VALUES ($1,$6,'Demo Organiser','organiser@example.test','E2E Assign Event','Testing',
        '', now() + interval '1 day', now() + interval '1 day 2 hours', 50, $2, $3,
        $4, $5, $1)`,
      [
        eventId,
        options.coordinatorId ?? null,
        options.coordinatorId ? 'Existing Coordinator' : null,
        JSON.stringify(options.attachments ?? []),
        options.status ?? 'Submitted',
        ORGANISER.uid,
      ],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  // Assignment alone no longer advances status — only a clarification
  // request does that (see clarifications.e2e-spec.ts).
  it('assigns a coordinator and persists it without changing status', async () => {
    const eventId = await seedEvent({ status: 'Submitted', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set(...authHeader('organiser-token'))
      .send({ coordinatorId: COORDINATOR.uid, coordinatorName: COORDINATOR.name })
      .expect(201);
    expect(res.body).toMatchObject({
      id: eventId,
      coordinatorId: COORDINATOR.uid,
      coordinatorName: COORDINATOR.name,
      status: 'submitted',
    });

    // The assignment survives a fresh read by the now-assigned coordinator
    // (this is what made it "stick").
    const detail = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set(...authHeader('coordinator-token'))
      .expect(200);
    expect(detail.body).toMatchObject({ coordinatorId: COORDINATOR.uid, status: 'submitted' });

    const row = await pool.query(
      'SELECT coordinator_id, coordinator_name, status FROM events WHERE id=$1',
      [eventId],
    );
    expect(row.rows[0]).toMatchObject({
      coordinator_id: COORDINATOR.uid,
      coordinator_name: COORDINATOR.name,
      status: 'Submitted',
    });
  });

  it('leaves an already-approved event status unchanged while still recording the coordinator', async () => {
    const eventId = await seedEvent({ status: 'Approved', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set(...authHeader('organiser-token'))
      .send({ coordinatorId: COORDINATOR.uid, coordinatorName: COORDINATOR.name })
      .expect(201);
    expect(res.body).toMatchObject({ coordinatorId: COORDINATOR.uid, status: 'approved' });
  });

  it('rejects an assignment that is missing the coordinator identity', async () => {
    const eventId = await seedEvent();
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .set(...authHeader('organiser-token'))
      .send({ coordinatorName: 'No Id' })
      .expect(400);
  });

  it('returns 404 when assigning a coordinator to a non-existent event', async () => {
    await request(app.getHttpServer())
      .post(`/api/events/${randomUUID()}/assign`)
      .set(...authHeader('organiser-token'))
      .send({ coordinatorId: COORDINATOR.uid, coordinatorName: COORDINATOR.name })
      .expect(404);
  });

  it('omits attachment dataUrl from the events list but keeps it on the detail', async () => {
    const attachment = {
      id: 'att-1',
      name: 'note.txt',
      type: 'text/plain',
      size: 5,
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    };
    const eventId = await seedEvent({ attachments: [attachment] });

    const list = await request(app.getHttpServer())
      .get('/api/events')
      .set(...authHeader('organiser-token'))
      .expect(200);
    const listed = (list.body as Array<{ id: string; attachments: unknown[] }>).find(
      (e) => e.id === eventId,
    );
    expect(listed?.attachments).toEqual([
      { id: 'att-1', name: 'note.txt', type: 'text/plain', size: 5 },
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set(...authHeader('organiser-token'))
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
    const eventId = await seedEvent({ status: 'Submitted', coordinatorId: COORDINATOR.uid });

    await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .set(...authHeader('other-coordinator-token'))
      .expect(404);

    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(401);
  });
});
