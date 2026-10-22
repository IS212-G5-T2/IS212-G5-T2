import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/config/configure-app.js';

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)('SPM-37 draft API and PostgreSQL', () => {
  let app: INestApplication;
  let db: pg.Pool;
  let organiser: ReturnType<typeof request.agent>;
  const ids: string[] = [];
  // Draft ids stay random so parallel and repeated runs never collide on the shared database (determinism row DX-13).
  const newId = () => {
    const id = randomUUID();
    ids.push(id);
    return id;
  };
  // Operation ids are sequential within the run; each draft only needs them unique per save, so no random value is read.
  let operationSeq = 0;
  const nextOperationId = () =>
    `0d000000-0000-4000-8000-${String(++operationSeq).padStart(12, '0')}`;
  // Fixed event window far in the future: fixtures never read the wall clock.
  const FIXED_START = '2031-03-10T09:00:00.000Z';
  const FIXED_END = '2031-03-10T10:00:00.000Z';
  const save = (
    id: string,
    fields: object,
    version = 0,
    operationId = nextOperationId(),
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
    app = await configureApp(await NestFactory.create(AppModule, { logger: false, bodyParser: false }));
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
  /** EVE-DRF-01-B · AC1/2: incomplete drafts persist without creating submitted events. */
  it('saves an incomplete Draft without submitting', async () => {
    const id = newId();
    const response = await save(id, { name: 'Incomplete' }).expect(200);
    expect(response.body).toMatchObject({ id, status: 'Draft', version: 1 });
    expect(
      (await db.query('SELECT id FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(0);
  });
  /** EVE-DRF-02-A · AC3/5: fresh API reads retrieve every field from PostgreSQL, including files. */
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
  /** EVE-DRF-04-A, EVE-DRF-04-B, EVE-DRF-05-A, EVE-DRF-05-B, EVE-DRF-05-C · AC4/6: retries are idempotent and later saves update the same draft row. */
  it('EVE-DRF-SUP-21 retries idempotently and rejects stale concurrent updates', async () => {
    const id = newId(),
      operation = nextOperationId();
    await save(id, { name: 'First' }, 0, operation).expect(200);
    expect(
      (await save(id, { name: 'First' }, 0, operation).expect(200)).body
        .version,
    ).toBe(1);
    // Parent AC (SUPPORTING): SPM-37 AC4
    // EVENT-DRF-05-C: a reused save identifier with different values is refused with its own message and changes nothing.
    const altered = await save(id, { name: 'Altered retry' }, 0, operation).expect(409);
    expect(altered.body.message).toBe('A save identifier cannot be reused for different values.');
    expect((await organiser.get(`/api/requests/${id}`)).body.fields.name).toBe('First');

    // EVENT-DRF-05-A: a stale version is refused with the documented "changed in another window" message.
    const responses = await Promise.all([
      save(id, { name: 'Second' }, 1),
      save(id, { name: 'Other tab' }, 1),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const stale = responses.find((r) => r.status === 409)!;
    expect(stale.body.message).toBe('This draft changed in another window. Reopen it before saving again.');
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
  it('EVE-DRF-SUP-22 retains the saved values after validation failure', async () => {
    const id = newId();
    await save(id, { name: 'Safe value' }).expect(200);
    await save(id, { name: 123 }, 1).expect(400);
    expect(
      (await organiser.get(`/api/requests/${id}`)).body
        .fields.name,
    ).toBe('Safe value');
  });
  /** EVE-DRF-07-A, EVE-DRF-07-B · AC8: submission is idempotent and permanently closes draft editing. */
  it('EVE-DRF-SUP-23 submits once and blocks later draft saves', async () => {
    const id = newId();
    const startDateTime = FIXED_START;
    const endDateTime = FIXED_END;
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
    // Parent AC (SUPPORTING): SPM-37 AC7
    // EVENT-DRF-07-A: a save to a submitted draft is refused with the documented message and leaves the fields unchanged.
    const locked = await save(id, { name: 'Illegal edit' }, 2).expect(409);
    expect(locked.body.message).toBe(
      'This request was submitted. Use Event Change Requests for further changes.',
    );
    const afterLocked = await organiser.get(`/api/requests/${id}`).expect(200);
    expect(afterLocked.body.status).toBe('Submitted');
    expect(afterLocked.body.fields.name).toBe('Submit draft');
    expect(
      (await db.query('SELECT * FROM events WHERE id=$1', [id])).rowCount,
    ).toBe(1);
  });
  /** EVE-DRF-07-C · AC2/8: submission requires complete details even though saving does not. */
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
  // Parent AC (SUPPORTING): SPM-37 AC3
  /** Q1-038: malformed and missing draft IDs return 404 without insertion. */
  it('EVE-DRF-SUP-24 malformed and missing IDs return 404 without insertion', async () => {
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
  it('EVE-DRF-SUP-25 stale submit preserves latest saved data and creates no event', async () => {
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
  /** EVE-DRF-02-B · Q1-040: saved draft data remains accessible after the app restarts. */
  it('Q1-040 data survives a backend restart and a new database connection', async () => {
    const id = newId();
    await save(id, { name: 'Restart evidence', formStep: 2 }).expect(200);
    await app.close();
    app = await configureApp(await NestFactory.create(AppModule, { logger: false, bodyParser: false }));
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
  /** EVE-DRF-07-B · Q1-041: concurrent submissions create one event and close the draft. */
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
      startDateTime: FIXED_START,
      endDateTime: FIXED_END,
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
  /** EVE-DRF-09-A · AC7: an authenticated organiser cannot access another organiser's draft. */
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

  // Parent AC (SUPPORTING): SPM-37 AC3 (low confidence: access check, no Jira AC for authentication)
  // ---- EVE-DRF-08 / EVE-DRF-09: authenticated access control (SPM-37 supporting checks) ----
  // Real session login through POST /api/auth/login (no stub tokens). Seeded accounts come from
  // database/postgresql/init/002_seed_data.sql; the password is the seed password.
  const SESSION_COOKIE = 'connectsphere_session'; // default in src/config/auth.config.ts
  const PASSWORD = 'P@55w0rd';
  type Target = {
    get(path: string): request.Test;
    put(path: string): request.Test;
    post(path: string): request.Test;
  };
  const login = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return { agent, uid: response.body.uid as string };
  };
  // Sends each request with the given Cookie header, or with no cookie at all.
  const withCookie = (cookie?: string): Target => {
    const apply = (test: request.Test) => (cookie ? test.set('Cookie', cookie) : test);
    return {
      get: (path) => apply(request(app.getHttpServer()).get(path)),
      put: (path) => apply(request(app.getHttpServer()).put(path)),
      post: (path) => apply(request(app.getHttpServer()).post(path)),
    };
  };
  const completeFields = (name: string) => ({
    name,
    purpose: 'Testing',
    description: 'Test event',
    expectedAttendance: '25',
    layout: 'Theatre',
  });
  const eventWindow = () => ({ startDateTime: FIXED_START, endDateTime: FIXED_END });
  const createDraft = async (agent: ReturnType<typeof request.agent>, name: string, extra: object = {}) => {
    const id = newId();
    await agent
      .put(`/api/requests/${id}`)
      .send({ fields: completeFields(name), version: 0, operationId: nextOperationId(), ...extra })
      .expect(200);
    return id;
  };
  // Submitting a draft creates an event with the same id (AC8), so the id also serves as an event id.
  const createSubmitted = async (agent: ReturnType<typeof request.agent>, name: string) => {
    const id = await createDraft(agent, name);
    await agent.post(`/api/requests/${id}/submit`).send({ version: 1, ...eventWindow() }).expect(201);
    return id;
  };
  const snapshot = async (id: string) =>
    (
      await db.query(
        'SELECT organiser_id, fields, version, status, updated_at::text AS updated_at FROM event_drafts WHERE id=$1',
        [id],
      )
    ).rows[0];
  const eventSnapshot = async (id: string) =>
    (await db.query('SELECT event_name, status, organiser_id FROM events WHERE id=$1', [id])).rows;
  const countEvents = async () =>
    (await db.query('SELECT count(*)::int AS n FROM events')).rows[0].n as number;
  // The seven protected routes from EVE-DRF-08, each with an otherwise-valid request.
  const accessRoutes = (draft: string, event: string) => [
    { label: 'GET /api/requests', send: (t: Target) => t.get('/api/requests') },
    { label: 'GET /api/requests/:id', send: (t: Target) => t.get(`/api/requests/${draft}`) },
    {
      label: 'PUT /api/requests/:id',
      send: (t: Target) =>
        t.put(`/api/requests/${draft}`).send({ fields: { name: 'Access probe' }, version: 1, operationId: nextOperationId() }),
    },
    {
      label: 'POST /api/requests/:id/submit',
      send: (t: Target) => t.post(`/api/requests/${draft}/submit`).send({ version: 1, ...eventWindow() }),
    },
    { label: 'GET /api/events', send: (t: Target) => t.get('/api/events') },
    { label: 'GET /api/events/:id', send: (t: Target) => t.get(`/api/events/${event}`) },
    {
      label: 'POST /api/events',
      send: (t: Target) => t.post('/api/events').send({ ...completeFields('Access probe'), ...eventWindow() }),
    },
  ];

  /** EVE-DRF-08-A: with no session and with an invalid session, every protected draft and event route returns HTTP 401 and changes nothing. */
  it('EVE-DRF-08-A returns 401 on all seven protected routes without a session or with an invalid session', async () => {
    const draft = await createDraft(organiser, 'Auth baseline');
    const event = await createSubmitted(organiser, 'Auth event');
    const draftBefore = await snapshot(draft);
    const eventBefore = await eventSnapshot(event);
    const eventsBefore = await countEvents();

    for (const target of [withCookie(), withCookie(`${SESSION_COOKIE}=invalid-token`)]) {
      for (const route of accessRoutes(draft, event)) {
        const response = await route.send(target);
        expect(response.status, route.label).toBe(401);
      }
    }

    expect(await snapshot(draft)).toEqual(draftBefore);
    expect(await eventSnapshot(event)).toEqual(eventBefore);
    expect(await countEvents()).toBe(eventsBefore);
    expect((await organiser.get(`/api/requests/${draft}`).expect(200)).body.fields.name).toBe('Auth baseline');
  });

  /** EVE-DRF-08-B: a signed-in attendee (ATTENDEE role only) gets HTTP 403 "Organiser access required." on every draft route and on POST /api/events; attendees can read only the events they are allowed to see; attendee writes have no effect. */
  it('EVE-DRF-08-B refuses an attendee on the organiser-only routes and leaves records unchanged', async () => {
    const attendee = await login('attendee1@connectsphere.test');
    const draft = await createDraft(organiser, 'Attendee baseline');
    const event = await createSubmitted(organiser, 'Attendee event');
    const draftBefore = await snapshot(draft);
    const eventBefore = await eventSnapshot(event);
    const eventsBefore = await countEvents();
    const target = attendee.agent as unknown as Target;

    const eventReadRoutes = new Set(['GET /api/events', 'GET /api/events/:id']);
    for (const route of accessRoutes(draft, event).filter((r) => !eventReadRoutes.has(r.label))) {
      const response = await route.send(target);
      expect(response.status, route.label).toBe(403);
      expect(response.body.message, route.label).toBe('Organiser access required.');
    }

    // Attendee event reads are allowed by design (Browse Events, Feature 6). The list returns only attendee-visible
    // statuses (Confirmed, Completed, Cancelled), so a Submitted event is absent, and its detail is Not Found.
    // The draft routes and POST /api/events above are the 403 cases.
    const list = await target.get('/api/events').expect(200);
    expect(list.body.some((row: { id: string }) => row.id === event)).toBe(false);
    const detail = await target.get(`/api/events/${event}`).expect(404);
    expect(detail.body.message).toBe('Event not found.');

    // Attendee writes had no effect; the organiser reads the baseline back.
    expect(await snapshot(draft)).toEqual(draftBefore);
    expect(await eventSnapshot(event)).toEqual(eventBefore);
    expect(await countEvents()).toBe(eventsBefore);
    expect((await organiser.get(`/api/requests/${draft}`).expect(200)).body.fields.name).toBe('Attendee baseline');
  });

  /** EVE-DRF-09-B: two organisers are isolated. A forged top-level organiserId is ignored, neither can read, save or submit the other's draft (404), lists are isolated and both drafts are unchanged. */
  it('EVE-DRF-09-B isolates two organisers and ignores a forged owner id', async () => {
    const a = await login('organiser1@connectsphere.test');
    const b = await login('organiser2@connectsphere.test');
    expect(a.uid).not.toBe(b.uid);

    // A sends a forged top-level organiserId naming B; the stored owner must stay A.
    const draftA = newId();
    await a.agent
      .put(`/api/requests/${draftA}`)
      .send({ fields: completeFields('Owner A draft'), version: 0, operationId: nextOperationId(), organiserId: b.uid })
      .expect(200);
    expect((await snapshot(draftA)).organiser_id).toBe(a.uid);
    const draftB = await createDraft(b.agent, 'Owner B draft');
    const snapA = await snapshot(draftA);
    const snapB = await snapshot(draftB);

    // Each organiser attempts read, save and submit on the other's draft: all 404 and no write.
    for (const [intruder, foreignDraft] of [
      [b.agent, draftA],
      [a.agent, draftB],
    ] as const) {
      await intruder.get(`/api/requests/${foreignDraft}`).expect(404);
      await intruder
        .put(`/api/requests/${foreignDraft}`)
        .send({ fields: { name: 'Cross write' }, version: 1, operationId: nextOperationId() })
        .expect(404);
      await intruder
        .post(`/api/requests/${foreignDraft}/submit`)
        .send({ version: 1, ...eventWindow() })
        .expect(404);
    }

    // Lists are isolated: each organiser sees only their own draft.
    const idsA = (await a.agent.get('/api/requests').expect(200)).body.map((row: { id: string }) => row.id);
    const idsB = (await b.agent.get('/api/requests').expect(200)).body.map((row: { id: string }) => row.id);
    expect(idsA).toContain(draftA);
    expect(idsA).not.toContain(draftB);
    expect(idsB).toContain(draftB);
    expect(idsB).not.toContain(draftA);

    // Both drafts are unchanged and no event was created from the cross-submit attempts.
    expect(await snapshot(draftA)).toEqual(snapA);
    expect(await snapshot(draftB)).toEqual(snapB);
    expect(await eventSnapshot(draftA)).toEqual([]);
    expect(await eventSnapshot(draftB)).toEqual([]);
  });

  /** EVE-DRF-09-B steps 9-10: each organiser saves and submits their own draft; the event keeps that organiser as owner, and a body-supplied organiserId is ignored. */
  it('EVE-DRF-09-B steps 9-10: each organiser saves and submits their own draft and the event keeps its owner', async () => {
    const a = await login('organiser1@connectsphere.test');
    const b = await login('organiser2@connectsphere.test');
    const draftA = newId();
    const draftB = newId();

    // Step 9: each organiser creates and then updates their own draft (version 0 -> 1 -> 2).
    await a.agent
      .put(`/api/requests/${draftA}`)
      .send({ fields: completeFields('Owner A first'), version: 0, operationId: nextOperationId() })
      .expect(200);
    await a.agent
      .put(`/api/requests/${draftA}`)
      .send({ fields: completeFields('Owner A updated'), version: 1, operationId: nextOperationId() })
      .expect(200);
    await b.agent
      .put(`/api/requests/${draftB}`)
      .send({ fields: completeFields('Owner B first'), version: 0, operationId: nextOperationId() })
      .expect(200);
    await b.agent
      .put(`/api/requests/${draftB}`)
      .send({ fields: completeFields('Owner B updated'), version: 1, operationId: nextOperationId() })
      .expect(200);
    expect((await a.agent.get(`/api/requests/${draftA}`).expect(200)).body.fields.name).toBe('Owner A updated');
    expect((await b.agent.get(`/api/requests/${draftB}`).expect(200)).body.fields.name).toBe('Owner B updated');

    // Step 10: each organiser submits their own draft. A's submit carries a forged organiserId naming B.
    await a.agent
      .post(`/api/requests/${draftA}/submit`)
      .send({ version: 2, organiserId: b.uid, ...eventWindow() })
      .expect(201);
    await b.agent
      .post(`/api/requests/${draftB}/submit`)
      .send({ version: 2, ...eventWindow() })
      .expect(201);

    // The events keep the authenticated owner of each draft, not the forged or other organiser.
    expect(await eventSnapshot(draftA)).toEqual([
      expect.objectContaining({ event_name: 'Owner A updated', organiser_id: a.uid }),
    ]);
    expect(await eventSnapshot(draftB)).toEqual([
      expect.objectContaining({ event_name: 'Owner B updated', organiser_id: b.uid }),
    ]);
    expect((await snapshot(draftA)).status).toBe('Submitted');
    expect((await snapshot(draftB)).status).toBe('Submitted');
  });
  /**
   * EVE-DRF-10-C: a request body over the 80 MB cap is refused with HTTP 413, and the 413 still carries the
   * Access-Control-Allow-Origin header for the configured frontend origin, so the cross-origin page can read it.
   * The refused save writes no draft and no event.
   */
  it('EVE-DRF-10-C refuses an oversized body with 413, keeps the CORS origin header, and writes nothing', async () => {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    const draft = newId();
    // 81 MiB of payload, above the 80mb JSON limit configured in src/config/configure-app.ts.
    const padding = Buffer.alloc(81 * 1024 * 1024, 'a');
    const body = Buffer.concat([
      Buffer.from(`{"fields":{"name":"Oversized"},"version":0,"operationId":"${nextOperationId()}","pad":"`),
      padding,
      Buffer.from('"}'),
    ]);
    const response = await organiser
      .put(`/api/requests/${draft}`)
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(413);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect((await db.query('SELECT id FROM event_drafts WHERE id=$1', [draft])).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM events WHERE id=$1', [draft])).rowCount).toBe(0);
  }, 60_000); // sending 81 MiB over loopback takes ~20 s; the default 5 s timeout is too short
});
