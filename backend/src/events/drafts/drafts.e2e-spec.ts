import 'reflect-metadata';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module.js';

const database = process.env.DATABASE_URL;
const ORGANISER_EMAIL = 'organiser1@connectsphere.test';
const ORGANISER_PASSWORD = 'P@55w0rd';
describe.skipIf(!database)('SPM-37 draft API and PostgreSQL', () => {
  let app: INestApplication;
  let db: pg.Pool;
  let client: ReturnType<typeof request.agent>;
  const ids: string[] = [];
  const newId = () => {
    const id = randomUUID();
    ids.push(id);
    return id;
  };
  const save = (
    id: string,
    fields: object,
    version = 0,
    operationId = randomUUID(),
  ) => client.put(`/api/requests/${id}`).send({ fields, version, operationId });
  const createApplication = async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const application = moduleFixture.createNestApplication();
    await application.init();
    return application;
  };
  const authenticateOrganiser = async () => {
    client = request.agent(app.getHttpServer());
    await client
      .post('/api/auth/login')
      .send({ email: ORGANISER_EMAIL, password: ORGANISER_PASSWORD })
      .expect(201);
  };
  beforeAll(async () => {
    // Use the shared local database configuration used by the other backend E2E suites.
    db = new pg.Pool({ connectionString: database });
  });
  // Log in as a seeded organiser so requests carry the session required by DraftsController.
  beforeEach(async () => {
    app = await createApplication();
    await authenticateOrganiser();
  });
  afterEach(async () => {
    if (client) await client.post('/api/auth/logout').expect(204);
    await app?.close();
  });
  afterAll(async () => {
    // Remove only records created by this suite, preserving the shared database.
    if (db) {
      await db.query('DELETE FROM event_drafts WHERE id = ANY($1::uuid[])', [
        ids,
      ]);
      await db.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [ids]);
      await db.end();
    }
  });
  // AC1/2: incomplete drafts persist without creating submitted events.
  it('saves an incomplete Draft without submitting', async () => {
    const id = newId();
    const response = await save(id, { name: 'Incomplete' }).expect(200);
    expect(response.body).toMatchObject({ id, status: 'Draft', version: 1 });
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  // AC3/5: fresh API reads retrieve every field from PostgreSQL, including files.
  it('lists and reopens all saved values', async () => {
    const id = newId();
    const fields = {
      name: 'Persisted',
      purpose: 'Purpose',
      description: 'Description',
      startDate: '2030-02-01',
      startTime: '',
      endDate: '',
      endTime: '',
      expectedAttendance: '0',
      layout: 'Theatre',
      facilities: ['Projector'],
      accessibility: ['Hearing loop'],
      equipmentNeeds: 'Microphone',
      formStep: 2,
      attachments: [
        {
          id: 'file',
          name: 'note.txt',
          type: 'text/plain',
          size: 2,
          dataUrl: 'data:text/plain;base64,aGk=',
        },
      ],
    };
    await save(id, fields).expect(200);
    expect(
      (
        await client
          .get(`/api/requests/${id}`)
          .expect(200)
      ).body.fields,
    ).toEqual(fields);
    expect(
      (
        await client.get('/api/requests').expect(200)
      ).body.some((row: { id: string }) => row.id === id),
    ).toBe(true);
  });
  // AC4/6: an uncertain response can be retried and later saves update the same row.
  it('retries idempotently and rejects stale concurrent updates', async () => {
    const id = newId(),
      operation = randomUUID();
    await save(id, { name: 'First' }, 0, operation).expect(200);
    expect(
      (await save(id, { name: 'First' }, 0, operation).expect(200)).body
        .version,
    ).toBe(1);
    await save(id, { name: 'Altered retry' }, 0, operation).expect(409);
    const responses = await Promise.all([
      save(id, { name: 'Second' }, 1),
      save(id, { name: 'Other tab' }, 1),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const latest = responses.find((r) => r.status === 200)!.body;
    expect(
      (await client.get(`/api/requests/${id}`)).body
        .fields,
    ).toEqual(latest.fields);
    expect(
      (await db.query('SELECT * FROM event_drafts WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });
  // AC6: rejected input leaves the previous successful draft untouched.
  it('retains the saved values after validation failure', async () => {
    const id = newId();
    await save(id, { name: 'Safe value' }).expect(200);
    await save(id, { name: 123 }, 1).expect(400);
    expect(
      (await client.get(`/api/requests/${id}`)).body
        .fields.name,
    ).toBe('Safe value');
  });
  // AC8: real submission is atomic, idempotent and permanently closes draft editing.
  it('submits once and blocks later draft saves', async () => {
    const id = newId();
    const startDateTime = new Date(Date.now() + 86400000 * 14).toISOString();
    const endDateTime = new Date(
      Date.now() + 86400000 * 14 + 3600000,
    ).toISOString();
    await save(id, {
      name: 'Submit draft',
      purpose: 'Testing',
      description: 'Test event',
      expectedAttendance: '25',
      layout: 'Theatre',
    }).expect(200);
    const payload = { version: 1, startDateTime, endDateTime };
    const first = await client
      .post(`/api/requests/${id}/submit`)
      .send(payload)
      .expect(201);
    const retry = await client
      .post(`/api/requests/${id}/submit`)
      .send(payload)
      .expect(201);
    expect(first.body.event.id).toBe(id);
    expect(retry.body.event.id).toBe(id);
    await save(id, { name: 'Illegal edit' }, 2).expect(409);
    expect(
      (await client.get(`/api/requests/${id}`)).body
        .status,
    ).toBe('Submitted');
    expect(
      (await db.query('SELECT * FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });
  // AC2/8: submission requires complete valid details even though saving does not.
  it('rolls back an invalid submission and leaves the draft editable', async () => {
    const id = newId();
    await save(id, {}).expect(200);
    await client
      .post(`/api/requests/${id}/submit`)
      .send({ version: 1 })
      .expect(400);
    await save(id, { name: 'Still editable' }, 1).expect(200);
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  it('Q1-038 malformed and missing IDs return 404 without insertion', async () => {
    for (const id of ['bad-id', newId()]) {
      await client.get(`/api/requests/${id}`).expect(404);
      await save(id, {}, 1).expect(404);
      await client
        .post(`/api/requests/${id}/submit`)
        .send({ version: 1 })
        .expect(404);
    }
  });
  it('Q1-039 stale submit preserves latest saved data and creates no event', async () => {
    const id = newId();
    await save(id, { name: 'First' }).expect(200);
    await save(id, { name: 'Latest' }, 1).expect(200);
    await client
      .post(`/api/requests/${id}/submit`)
      .send({ version: 1 })
      .expect(409);
    expect(
      (await client.get(`/api/requests/${id}`)).body,
    ).toMatchObject({
      status: 'Draft',
      version: 2,
      fields: { name: 'Latest' },
    });
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  it('Q1-040 data survives a backend restart and a new database connection', async () => {
    const id = newId();
    await save(id, { name: 'Restart evidence', formStep: 2 }).expect(200);
    await client.post('/api/auth/logout').expect(204);
    await app.close();
    app = await createApplication();
    await authenticateOrganiser();
    expect(
      (
        await client
          .get(`/api/requests/${id}`)
          .expect(200)
      ).body,
    ).toMatchObject({
      id,
      status: 'Draft',
      fields: { name: 'Restart evidence', formStep: 2 },
    });
  });
  it('Q1-041 simultaneous submissions create one event and close the draft', async () => {
    const id = newId();
    await save(id, {
      name: 'Concurrent submit',
      purpose: 'Test',
      description: 'Test',
      layout: 'Theatre',
      expectedAttendance: '1',
    }).expect(200);
    const body = {
      version: 1,
      startDateTime: new Date(Date.now() + 86400000).toISOString(),
      endDateTime: new Date(Date.now() + 90000000).toISOString(),
    };
    const responses = await Promise.all(
      [1, 2].map(() =>
        client
          .post(`/api/requests/${id}/submit`)
          .send(body),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses.map((r) => r.body.event.id)).toEqual([id, id]);
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(1);
    await save(id, { name: 'Forbidden' }, 2).expect(409);
    expect(
      (await db.query('SELECT event_name FROM events WHERE id=$1', [id]))
        .rows[0].event_name,
    ).toBe('Concurrent submit');
  });
  // Ownership filtering is retained; original AC7 real organisation authentication is explicitly deferred.
  it('does not expose a row belonging to a different server-side owner', async () => {
    const id = newId();
    await db.query(
      "INSERT INTO event_drafts (id, organiser_id, fields) VALUES ($1,'other-owner','{}')",
      [id],
    );
    await client.get(`/api/requests/${id}`).expect(404);
    await save(id, {}).expect(404);
    expect(
      (await client.get('/api/requests')).body.some(
        (row: { id: string }) => row.id === id,
      ),
    ).toBe(false);
  });
});
