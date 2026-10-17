import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)('SPM-37 draft API and PostgreSQL', () => {
  let app: INestApplication;
  let db: pg.Pool;
  let organiser: ReturnType<typeof request.agent>;
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
  ) =>
    organiser
      .put(`/api/requests/${id}`)
      .send({ fields, version, operationId });
  beforeAll(async () => {
    // Use only the explicitly configured test database, never the application URL by default.
    process.env.DATABASE_URL = database;
    db = new pg.Pool({ connectionString: database });
    await db.query(
      await readFile(
        new URL(
          '../../database/postgresql/init/001_schema.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.query(
      await readFile(
        new URL('../migrations/001_event_drafts.sql', import.meta.url),
        'utf8',
      ),
    );
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    organiser = request.agent(app.getHttpServer());
    await organiser
      .post('/api/auth/login')
      .send({
        email: 'organiser1@connectsphere.test',
        password: 'P@55w0rd',
      })
      .expect(201);
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
    await app?.close();
  });
  /** AC1/2: incomplete drafts persist without creating submitted events. */
  it('saves an incomplete Draft without submitting', async () => {
    const id = newId();
    const response = await save(id, { name: 'Incomplete' }).expect(200);
    expect(response.body).toMatchObject({ id, status: 'Draft', version: 1 });
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  /** AC3/5: fresh API reads retrieve every field from PostgreSQL, including files. */
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
        await organiser
          .get(`/api/requests/${id}`)
          .expect(200)
      ).body.fields,
    ).toEqual(fields);
    expect(
      (
        await organiser.get('/api/requests').expect(200)
      ).body.some((row: { id: string }) => row.id === id),
    ).toBe(true);
  });
  /** AC4/6: retries are idempotent and later saves update the same draft row. */
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
      (await organiser.get(`/api/requests/${id}`)).body
        .fields,
    ).toEqual(latest.fields);
    expect(
      (await db.query('SELECT * FROM event_drafts WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });
  /** AC6: rejected input leaves the previous successful draft untouched. */
  it('retains the saved values after validation failure', async () => {
    const id = newId();
    await save(id, { name: 'Safe value' }).expect(200);
    await save(id, { name: 123 }, 1).expect(400);
    expect(
      (await organiser.get(`/api/requests/${id}`)).body
        .fields.name,
    ).toBe('Safe value');
  });
  /** AC8: submission is idempotent and permanently closes draft editing. */
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
    const first = await organiser
      .post(`/api/requests/${id}/submit`)
      .send(payload)
      .expect(201);
    const retry = await organiser
      .post(`/api/requests/${id}/submit`)
      .send(payload)
      .expect(201);
    expect(first.body.event.id).toBe(id);
    expect(retry.body.event.id).toBe(id);
    await save(id, { name: 'Illegal edit' }, 2).expect(409);
    expect(
      (await organiser.get(`/api/requests/${id}`)).body
        .status,
    ).toBe('Submitted');
    expect(
      (await db.query('SELECT * FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });
  /** AC2/8: submission requires complete details even though saving does not. */
  it('rolls back an invalid submission and leaves the draft editable', async () => {
    const id = newId();
    await save(id, {}).expect(200);
    await organiser
      .post(`/api/requests/${id}/submit`)
      .send({ version: 1 })
      .expect(400);
    await save(id, { name: 'Still editable' }, 1).expect(200);
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  /** Q1-038: malformed and missing draft IDs return 404 without insertion. */
  it('Q1-038 malformed and missing IDs return 404 without insertion', async () => {
    for (const id of ['bad-id', newId()]) {
      await organiser.get(`/api/requests/${id}`).expect(404);
      await save(id, {}, 1).expect(404);
      await organiser
        .post(`/api/requests/${id}/submit`)
        .send({ version: 1 })
        .expect(404);
    }
  });
  /** Q1-039: a stale submit preserves the latest draft and creates no event. */
  it('Q1-039 stale submit preserves latest saved data and creates no event', async () => {
    const id = newId();
    await save(id, { name: 'First' }).expect(200);
    await save(id, { name: 'Latest' }, 1).expect(200);
    await organiser
      .post(`/api/requests/${id}/submit`)
      .send({ version: 1 })
      .expect(409);
    expect(
      (await organiser.get(`/api/requests/${id}`)).body,
    ).toMatchObject({
      status: 'Draft',
      version: 2,
      fields: { name: 'Latest' },
    });
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  /** Q1-040: saved draft data remains accessible after the app restarts. */
  it('Q1-040 data survives a backend restart and a new database connection', async () => {
    const id = newId();
    await save(id, { name: 'Restart evidence', formStep: 2 }).expect(200);
    await app.close();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    organiser = request.agent(app.getHttpServer());
    await organiser
      .post('/api/auth/login')
      .send({
        email: 'organiser1@connectsphere.test',
        password: 'P@55w0rd',
      })
      .expect(201);
    expect(
      (
        await organiser
          .get(`/api/requests/${id}`)
          .expect(200)
      ).body,
    ).toMatchObject({
      id,
      status: 'Draft',
      fields: { name: 'Restart evidence', formStep: 2 },
    });
  });
  /** Q1-041: concurrent submissions create one event and close the draft. */
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
        organiser
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
  /** AC7: an authenticated organiser cannot access another organiser's draft. */
  it('does not expose a row belonging to a different server-side owner', async () => {
    const id = newId();
    await db.query(
      "INSERT INTO event_drafts (id, organiser_id, fields) VALUES ($1,'other-owner','{}')",
      [id],
    );
    await organiser.get(`/api/requests/${id}`).expect(404);
    await save(id, {}).expect(404);
    expect(
      (await organiser.get('/api/requests')).body.some(
        (row: { id: string }) => row.id === id,
      ),
    ).toBe(false);
  });
});
