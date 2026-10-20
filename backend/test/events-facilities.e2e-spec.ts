import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/*
 * SPM-144 facility and accessibility submission through the real HTTP pipeline and PostgreSQL.
 * Requires database/postgresql/init 001 to 020. The suite is skipped locally
 * without a database URL and fails in CI when the required URL is missing.
 */
const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-144 facility tests require TEST_DATABASE_URL or DATABASE_URL.');

type Session = { uid: string; cookie: string };

describe.skipIf(!database)('SPM-144 facility request over HTTP and PostgreSQL', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let organiser: Session;
  let createdEventIds: string[];

  beforeAll(() => {
    process.env.DATABASE_URL = database;
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    await app.init();
    organiser = await createOrganiser();
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length)
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (organiser?.uid) await pool.query('DELETE FROM users WHERE id = $1', [organiser.uid]);
  });

  async function createOrganiser(): Promise<Session> {
    const email = `spm144-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-144 Organiser', crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email],
    );
    const uid = created.rows[0].id;
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [uid, 'ORGANISER'],
    );
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    const cookie = response.headers['set-cookie']?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected a PostgreSQL-backed organiser session.');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  function validRequest(submissionKey = randomUUID()) {
  return {
      name: 'Facility compatibility request',
      purpose: 'Verify facilities persist',
      description: 'Submitted through the event request API.',
      startDateTime: '2035-11-05T10:00:00.000Z',
      endDateTime: '2035-11-05T12:00:00.000Z',
      expectedAttendance: 80,
      layout: 'Banquet',
      facilities: ['Wired network', 'Power outlets'],
      accessibility: ['Wheelchair access', 'Hearing loop'],
      attachments: [],
      equipmentNeeds: '',
      submissionKey,
      registrationEnabled: false,
    };
  }

  /** EVE-FAC-03-B, EVE-FAC-06-A, and EVE-FAC-06-B: facility and accessibility values persist through HTTP under the authenticated owner and appear on its Submitted request. */
  it('EVE-FAC-03-B EVE-FAC-06-A EVE-FAC-06-B persists supported facilities and accessibility for its owner', async () => {
    const input = validRequest();
    const response = await request(app.getHttpServer())
      .post('/api/events')
      .set('Cookie', organiser.cookie)
      .send(input)
      .expect(201);
    const eventId = response.body.event.id as string;
    createdEventIds.push(eventId);

    expect(response.body.message).toBe('Your event request was submitted successfully.');
    expect(response.body.event).toMatchObject({
      organiserId: organiser.uid,
      status: 'submitted',
      venueRequirements: { facilities: input.facilities, accessibility: input.accessibility },
    });
    const persisted = await pool.query<{
      organiser_id: string;
      status: string;
      required_facilities: string[];
      accessibility_needs: string[];
    }>(
      'SELECT organiser_id, status, required_facilities, accessibility_needs FROM events WHERE id = $1',
      [eventId],
    );
    expect(persisted.rows[0]).toEqual({
      organiser_id: organiser.uid,
      status: 'Submitted',
      required_facilities: input.facilities,
      accessibility_needs: input.accessibility,
    });

    const list = await request(app.getHttpServer())
      .get('/api/events')
      .set('Cookie', organiser.cookie)
      .expect(200);
    expect(list.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: eventId,
        organiserId: organiser.uid,
        status: 'submitted',
        venueRequirements: expect.objectContaining({
          facilities: input.facilities,
          accessibility: input.accessibility,
        }),
      }),
    ]));
  });

  /** EVE-FAC-04-A: the real HTTP validator rejects an unsupported facility and PostgreSQL receives no event row. */
  it('EVE-FAC-04-A rejects an unsupported facility without saving an event', async () => {
    const input = { ...validRequest(), facilities: ['Unsupported facility'] };
    const response = await request(app.getHttpServer())
      .post('/api/events')
      .set('Cookie', organiser.cookie)
      .send(input)
      .expect(400);

    expect(response.body.errors.facilities).toBe('Choose valid options.');
    const persisted = await pool.query(
      'SELECT id FROM events WHERE organiser_id = $1 AND submission_key = $2',
      [organiser.uid, input.submissionKey],
    );
    expect(persisted.rows).toEqual([]);
  });

  /** EVE-FAC-04-A: the HTTP validator rejects an unsupported accessibility value and persists no event. */
  it('EVE-FAC-04-A rejects unsupported accessibility without saving an event', async () => {
    const input = { ...validRequest(), accessibility: ['Wheelchair ramps'] };
    const response = await request(app.getHttpServer())
      .post('/api/events')
      .set('Cookie', organiser.cookie)
      .send(input)
      .expect(400);

    expect(response.body.errors.accessibility).toBe('Choose valid options.');
    const persisted = await pool.query(
      'SELECT id FROM events WHERE organiser_id = $1 AND submission_key = $2',
      [organiser.uid, input.submissionKey],
    );
    expect(persisted.rows).toEqual([]);
  });
});
