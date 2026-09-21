/*
 * End-to-end tests for SPM-37 coordinator assignment persistence
 * (POST /api/events/:id/assign) and the events list omitting attachment blobs,
 * against a real PostgreSQL database. Mirrors test/clarifications.e2e-spec.ts's
 * fixture pattern. The events routes carry no auth in local/demo mode, so no
 * Firebase emulator user is needed; the coordinator identity is supplied in the
 * request body exactly as the frontend sends it.
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

  beforeAll(() => {
    // get()/list() derive ownership from the demo identity ('current-user').
    process.env.DEMO_ORGANISER_ENABLED = 'true';
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
       VALUES ($1,'current-user','Demo Organiser','organiser@example.test','E2E Assign Event','Testing',
        '', now() + interval '1 day', now() + interval '1 day 2 hours', 50, $2, $3,
        $4, $5, $1)`,
      [
        eventId,
        options.coordinatorId ?? null,
        options.coordinatorId ? 'Existing Coordinator' : null,
        JSON.stringify(options.attachments ?? []),
        options.status ?? 'Submitted',
      ],
    );
    createdEventIds.push(eventId);
    return eventId;
  }

  it('assigns a coordinator, advances submitted -> under_review, and persists to the database', async () => {
    const eventId = await seedEvent({ status: 'Submitted', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .send({ coordinatorId: 'coordinator-1', coordinatorName: 'Demo Coordinator' })
      .expect(201);
    expect(res.body).toMatchObject({
      id: eventId,
      coordinatorId: 'coordinator-1',
      coordinatorName: 'Demo Coordinator',
      status: 'under_review',
    });

    // The assignment survives a fresh read (this is what made it "stick").
    const detail = await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(200);
    expect(detail.body).toMatchObject({ coordinatorId: 'coordinator-1', status: 'under_review' });

    const row = await pool.query(
      'SELECT coordinator_id, coordinator_name, status FROM events WHERE id=$1',
      [eventId],
    );
    expect(row.rows[0]).toMatchObject({
      coordinator_id: 'coordinator-1',
      coordinator_name: 'Demo Coordinator',
      status: 'Under_Review',
    });
  });

  it('leaves an already-approved event status unchanged while still recording the coordinator', async () => {
    const eventId = await seedEvent({ status: 'Approved', coordinatorId: null });

    const res = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .send({ coordinatorId: 'coordinator-1', coordinatorName: 'Demo Coordinator' })
      .expect(201);
    expect(res.body).toMatchObject({ coordinatorId: 'coordinator-1', status: 'approved' });
  });

  it('rejects an assignment that is missing the coordinator identity', async () => {
    const eventId = await seedEvent();
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/assign`)
      .send({ coordinatorName: 'No Id' })
      .expect(400);
  });

  it('returns 404 when assigning a coordinator to a non-existent event', async () => {
    await request(app.getHttpServer())
      .post(`/api/events/${randomUUID()}/assign`)
      .send({ coordinatorId: 'coordinator-1', coordinatorName: 'Demo Coordinator' })
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

    const list = await request(app.getHttpServer()).get('/api/events').expect(200);
    const listed = (list.body as Array<{ id: string; attachments: unknown[] }>).find(
      (e) => e.id === eventId,
    );
    expect(listed?.attachments).toEqual([
      { id: 'att-1', name: 'note.txt', type: 'text/plain', size: 5 },
    ]);

    const detail = await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(200);
    expect(detail.body.attachments[0]).toMatchObject({
      name: 'note.txt',
      dataUrl: 'data:text/plain;base64,SGVsbG8=',
    });
  });
});
