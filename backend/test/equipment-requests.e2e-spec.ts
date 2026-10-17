import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error('SPM-57 PostgreSQL tests must run in CI: set DATABASE_URL.');

describe.skipIf(!databaseUrl)('SPM-57 equipment request HTTP and PostgreSQL', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(await readFile(new URL('../../database/postgresql/init/001_schema.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/postgresql/init/002_seed_data.sql', import.meta.url), 'utf8'));
    for (const file of ['010_spm135_confirm_event.sql', '012_spm57_equipment_requests.sql', '014_spm57_request_reservations.sql'])
      await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (!pool) return;
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  async function createUser(role: 'COORDINATOR' | 'TECH_SUPPORT') {
    const email = `spm57-${randomUUID()}@example.test`;
    const saved = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-57 Test User', crypt('password123', gen_salt('bf', 4))) RETURNING id`, [email]);
    const id = saved.rows[0].id;
    userIds.push(id);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [id, role]);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = login.headers['set-cookie']?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated test session cookie');
    return { id, cookie: cookie.split(';', 1)[0] };
  }

  async function createEvent(coordinatorId: string, status: string) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name, submission_key, status, rejection_reason)
       VALUES ($1, 'spm57-owner', 'Owner', 'owner@example.test', 'SPM-57 Showcase', 'Equipment request',
        '2030-02-03T10:00:00Z', '2030-02-03T12:00:00Z', 120, $2, 'Coordinator', $1, $3,
        CASE WHEN $3 = 'Rejected' THEN 'Event not suitable for approval.' ELSE NULL END)`, [id, coordinatorId, status]);
    eventIds.push(id);
    return id;
  }

  /** EQUIP-REQUEST-03-A: a multi-item Approved-event submission is persisted and moves the event to Planning. */
  it('EQUIP-REQUEST-03-A creates a Pending Review request, exposes it to both lists, and records Approved to Planning', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(coordinator.id, 'Approved');
    const response = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie).send({
      eventId,
      items: [
        { equipmentName: '  Wireless microphones  ', equipmentType: 'Audio', quantity: 1 },
        { equipmentName: 'Projector', equipmentType: 'Visual', quantity: 2 },
      ],
    }).expect(201);
    expect(response.body).toMatchObject({ kind: 'created', requestReference: expect.stringMatching(/^ER-[A-F0-9]{8}$/), event: { status: 'planning' } });
    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(response.body.id);
    expect(mine.body[0].reference).toBe(response.body.requestReference);
    expect(mine.body[0]).toMatchObject({ status: 'Pending Review', eventName: 'SPM-57 Showcase', expectedAttendance: 120, items: [
      { equipmentName: 'Wireless microphones', equipmentType: 'Audio', quantity: 1 },
      { equipmentName: 'Projector', equipmentType: 'Visual', quantity: 2 },
    ] });
    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    const queued = queue.body.find((row: { id: string }) => row.id === response.body.id);
    expect(queued).toBeDefined();
    expect(queued.reference).toBe(response.body.requestReference);
    expect(queued.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipmentName: 'Wireless microphones', equipmentType: 'Audio', quantity: 1 }),
      expect.objectContaining({ equipmentName: 'Projector', equipmentType: 'Visual', quantity: 2 }),
    ]));
    const persistedItems = await pool.query('SELECT equipment_name, equipment_type, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [response.body.id]);
    expect(persistedItems.rows).toEqual([
      { equipment_name: 'Wireless microphones', equipment_type: 'Audio', quantity: 1 },
      { equipment_name: 'Projector', equipment_type: 'Visual', quantity: 2 },
    ]);
    const status = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    expect(status.rows[0].status).toBe('Planning');
    const history = await pool.query("SELECT from_status, to_status, actor_id FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(history.rows).toEqual([{ from_status: 'Approved', to_status: 'Planning', actor_id: coordinator.id }]);
    const planningItems = await pool.query("SELECT equipment_name, quantity, status FROM equipment_reservations WHERE event_id = $1 ORDER BY created_at, id", [eventId]);
    expect(planningItems.rows).toHaveLength(2);
    expect(planningItems.rows).toEqual(expect.arrayContaining([
      { equipment_name: 'Wireless microphones', quantity: 1, status: 'Requested' },
      { equipment_name: 'Projector', quantity: 2, status: 'Requested' },
    ]));
  });

  /** EQUIP-REQUEST-03-A: upgrading a legacy request preserves its association, backfills its equipment name, and removes the obsolete column. */
  it('EQUIP-REQUEST-03-A upgrades legacy technical-requirements rows without losing requests', async () => {
    const client = await pool.connect();
    const schema = `spm57_migration_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TABLE equipment_requests (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, requested_by uuid NOT NULL,
        status text NOT NULL DEFAULT 'Pending Review', created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TABLE equipment_request_items (
        id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES equipment_requests(id) ON DELETE CASCADE,
        technical_requirements text NOT NULL, equipment_type text NOT NULL, quantity integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      const requestId = '00000000-0000-4000-8000-000000000057';
      const itemId = '00000000-0000-4000-8000-000000000058';
      await client.query('INSERT INTO equipment_requests (id, event_id, requested_by) VALUES ($1, $2, $3)', [requestId, '00000000-0000-4000-8000-000000000059', '00000000-0000-4000-8000-000000000060']);
      await client.query(`INSERT INTO equipment_request_items (id, request_id, technical_requirements, equipment_type, quantity)
        VALUES ($1, $2, 'Legacy 3.5mm input', 'Audio', 2)`, [itemId, requestId]);

      const migration = await readFile(new URL('../migrations/012_spm57_equipment_requests.sql', import.meta.url), 'utf8');
      await client.query(migration);

      const preserved = await client.query(`SELECT r.id AS request_id, i.id AS item_id, i.equipment_name, i.equipment_type, i.quantity
        FROM equipment_requests r JOIN equipment_request_items i ON i.request_id = r.id WHERE r.id = $1`, [requestId]);
      expect(preserved.rows).toHaveLength(1);
      expect(preserved.rows[0]).toMatchObject({ request_id: requestId, item_id: itemId, equipment_type: 'Audio', quantity: 2 });
      expect(preserved.rows[0].equipment_name.trim()).not.toBe('');
      const oldColumn = await client.query(`SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'equipment_request_items' AND column_name = 'technical_requirements'`, [schema]);
      expect(oldColumn.rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  /** EQUIP-REQUEST-05-A: confirmation identifies the same request returned by both persisted read views. */
  it('EQUIP-REQUEST-05-A returns the persisted request id and reference in confirmation and lists', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const response = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'LED uplights', equipmentType: 'Lighting', quantity: 1 }] }).expect(201);
    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    const own = mine.body.find((row: { id: string }) => row.id === response.body.id);
    const queued = queue.body.find((row: { id: string }) => row.id === response.body.id);
    expect(own).toBeDefined();
    expect(queued).toBeDefined();
    expect(response.body.requestReference).toBe(own.reference);
    expect(response.body.requestReference).toBe(queued.reference);
  });

  /** EQUIP-REQUEST-02-N: an unknown or inaccessible event cannot be submitted and creates no request data. */
  it('EQUIP-REQUEST-02-N refuses an unknown event id without persistence', async () => {
    const coordinator = await createUser('COORDINATOR');
    const unknownEventId = '00000000-0000-4000-8000-000000000057';
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId: unknownEventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(404);
    const saved = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [unknownEventId]);
    expect(saved.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-02-N: a coordinator cannot submit for another coordinator’s existing eligible event. */
  it('EQUIP-REQUEST-02-N refuses a foreign coordinator event without request or status side effects', async () => {
    const owner = await createUser('COORDINATOR');
    const otherCoordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(owner.id, 'Approved');
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', otherCoordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(404);

    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    const requestItems = await pool.query(`SELECT i.id FROM equipment_request_items i
      JOIN equipment_requests r ON r.id = i.request_id WHERE r.event_id = $1`, [eventId]);
    const arrangements = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    const event = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([]);
    expect(requestItems.rows).toEqual([]);
    expect(arrangements.rows).toEqual([]);
    expect(event.rows).toEqual([{ status: 'Approved' }]);
    expect(history.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-04-A and EQUIP-REQUEST-04-N: missing or invalid fields return validation errors and do not persist partial requests. */
  it.each([
    [{ equipmentName: 'Microphone', equipmentType: 'Audio' }, 'quantity'],
    [{ equipmentName: 'Microphone', quantity: 1 }, 'equipmentType'],
    [{ equipmentName: 'Microphone', equipmentType: 'Unknown', quantity: 1 }, 'equipmentType'],
    [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 0 }, 'quantity'],
    [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: -1 }, 'quantity'],
    [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1.5 }, 'quantity'],
  ])('EQUIP-REQUEST-04-A rejects invalid item %j without creating request rows', async (item) => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie).send({ eventId, items: [item] }).expect(400);
    const count = await pool.query('SELECT count(*)::int AS n FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(count.rows[0].n).toBe(0);
  });

  /** EQUIP-REQUEST-04-N: a non-numeric quantity sent over HTTP is rejected without writing request data or changing event state. */
  it('EQUIP-REQUEST-04-N rejects a non-numeric quantity through HTTP without side effects', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const response = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 'abc' }] }).expect(400);

    expect(response.body.errors['items.0.quantity']).toBeDefined();
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    const items = await pool.query(`SELECT i.id FROM equipment_request_items i
      JOIN equipment_requests r ON r.id = i.request_id WHERE r.event_id = $1`, [eventId]);
    const reservations = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    const event = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([]);
    expect(items.rows).toEqual([]);
    expect(reservations.rows).toEqual([]);
    expect(event.rows).toEqual([{ status: 'Planning' }]);
    expect(history.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-04-N: an invalid later item rejects the complete multi-item HTTP submission without partial persistence. */
  it('EQUIP-REQUEST-04-N rejects a valid-first invalid-second submission without partial writes', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const response = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [
        { equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 },
        { equipmentName: 'Projector', equipmentType: 'Visual', quantity: 0 },
      ] }).expect(400);

    expect(response.body.errors['items.1.quantity']).toBeDefined();
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    const items = await pool.query(`SELECT i.id FROM equipment_request_items i
      JOIN equipment_requests r ON r.id = i.request_id WHERE r.event_id = $1`, [eventId]);
    const reservations = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    const event = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([]);
    expect(items.rows).toEqual([]);
    expect(reservations.rows).toEqual([]);
    expect(event.rows).toEqual([{ status: 'Planning' }]);
    expect(history.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-03-N: missing or blank equipment names are refused before any request, item, or reservation is persisted. */
  it.each([undefined, '', '   '])('EQUIP-REQUEST-03-N refuses an absent or blank equipment name %j', async (equipmentName) => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName, equipmentType: 'Audio', quantity: 1 }] }).expect(400);
    const saved = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    const reservations = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    expect(saved.rows).toEqual([]);
    expect(reservations.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-08-N: Cancelled and Rejected event requests are refused without changing event state or creating request data. */
  it.each(['Cancelled', 'Rejected'])('refuses a %s event request without side effects', async (status) => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, status);
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie).send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(409);
    const count = await pool.query('SELECT count(*)::int AS n FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(count.rows[0].n).toBe(0);
    const event = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    expect(event.rows[0].status).toBe(status);
    const arrangements = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    expect(arrangements.rows).toEqual([]);
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(history.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-11-N: a second request cannot be submitted for an event; the request must be updated in place. */
  it('refuses a duplicate request while preserving the original request and Approved-to-Planning history', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Approved');
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    const priorHistory = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(priorHistory.rows).toEqual([{ from_status: 'Approved', to_status: 'Planning' }]);
    const duplicate = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Folding chair', equipmentType: 'Furniture', quantity: 1 }] }).expect(409);
    expect(duplicate.body.message).toMatch(/already exists.*Update the existing request/i);
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([{ id: expect.any(String) }]);
    const items = await pool.query('SELECT equipment_name FROM equipment_request_items WHERE request_id = $1', [requests.rows[0].id]);
    expect(items.rows).toEqual([{ equipment_name: 'Microphone' }]);
    const history = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(history.rows).toEqual(priorHistory.rows);
  });

  /** EQUIP-REQUEST-09-A: failed Approved-to-Planning persistence rolls back request, items, reservations, and history. */
  it('EQUIP-REQUEST-09-A rolls back request data when the Approved-to-Planning status write fails', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Approved');
    await pool.query(`CREATE OR REPLACE FUNCTION spm57_fail_planning_transition() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected SPM-57 planning failure'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER spm57_fail_planning_transition BEFORE UPDATE OF status ON events
      FOR EACH ROW WHEN (OLD.status = 'Approved' AND NEW.status = 'Planning')
      EXECUTE FUNCTION spm57_fail_planning_transition()`);
    try {
      await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
        .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(500);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm57_fail_planning_transition ON events');
      await pool.query('DROP FUNCTION IF EXISTS spm57_fail_planning_transition()');
    }
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    const arrangements = await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId]);
    const eventRows = await pool.query('SELECT status FROM events WHERE id = $1', [eventId]);
    const history = await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([]);
    expect(arrangements.rows).toEqual([]);
    expect(eventRows.rows).toEqual([{ status: 'Approved' }]);
    expect(history.rows).toEqual([]);
  });

  /** EQUIP-REQUEST-06-A: a coordinator sees their own requests and not another coordinator’s rows. */
  it('EQUIP-REQUEST-06-A isolates coordinator request lists', async () => {
    const first = await createUser('COORDINATOR');
    const second = await createUser('COORDINATOR');
    const firstEvent = await createEvent(first.id, 'Planning');
    const secondEvent = await createEvent(second.id, 'Planning');
    const payload = { items: [{ equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 }] };
    const firstCreated = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', first.cookie).send({ ...payload, eventId: firstEvent }).expect(201);
    const secondCreated = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', second.cookie).send({ ...payload, eventId: secondEvent }).expect(201);
    const firstMine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', first.cookie).expect(200);
    const secondMine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', second.cookie).expect(200);
    expect(firstMine.body.map((row: { id: string }) => row.id)).toEqual([firstCreated.body.id]);
    expect(secondMine.body.map((row: { id: string }) => row.id)).toEqual([secondCreated.body.id]);
    expect(firstMine.body.map((row: { id: string }) => row.id)).not.toContain(secondCreated.body.id);
    expect(secondMine.body.map((row: { id: string }) => row.id)).not.toContain(firstCreated.body.id);
  });

  /** EQUIP-REQUEST-07-A: Technical Support sees Pending Review rows but excludes requests already Reserved. */
  it('EQUIP-REQUEST-07-A excludes non-Pending Review requests from the support queue', async () => {
    const first = await createUser('COORDINATOR');
    const second = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const firstEvent = await createEvent(first.id, 'Planning');
    const secondEvent = await createEvent(second.id, 'Planning');
    const payload = { items: [{ equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 }] };
    const firstCreated = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', first.cookie).send({ ...payload, eventId: firstEvent }).expect(201);
    const secondCreated = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', second.cookie).send({ ...payload, eventId: secondEvent }).expect(201);
    await pool.query("UPDATE equipment_requests SET status = 'Reserved' WHERE id = $1", [secondCreated.body.id]);
    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    expect(queue.body.map((row: { id: string }) => row.id)).toContain(firstCreated.body.id);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(secondCreated.body.id);
    expect(queue.body.every((row: { status: string }) => row.status === 'Pending Review')).toBe(true);
  });

  /** EQUIP-REQUEST-11-N: concurrent first submissions serialize so one creates a request and the other must update it. */
  it('serializes concurrent submits so only one request is created and records one status transition', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Approved');
    const send = () => request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] });
    const [first, second] = await Promise.all([send(), send()]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const created = first.status === 201 ? first : second;
    expect(created.body.event.status).toBe('planning');
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(requests.rows).toHaveLength(1);
    const history = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(history.rows).toEqual([{ from_status: 'Approved', to_status: 'Planning' }]);
  });

  /** EQUIP-REQUEST-10-A: editing a coordinator-owned request updates the same ID/reference and both request read views. */
  it('EQUIP-REQUEST-10-A updates the existing request and its planning reservations in place', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Old microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    const updated = await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`)
      .set('Cookie', coordinator.cookie)
      .send({ eventId, items: [
        { equipmentName: 'Wireless microphones', equipmentType: 'Audio', quantity: 2 },
        { equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 },
      ] }).expect(200);

    expect(updated.body).toEqual({ kind: 'updated', id: created.body.id, requestReference: created.body.requestReference });
    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ id: created.body.id, reference: created.body.requestReference, eventStatus: 'Planning', items: [
      { equipmentName: 'Wireless microphones', equipmentType: 'Audio', quantity: 2 },
      { equipmentName: 'Display screen', equipmentType: 'Visual', quantity: 1 },
    ] });
    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    expect(queue.body.find((row: { id: string }) => row.id === created.body.id)).toMatchObject({ reference: created.body.requestReference, items: [
      expect.objectContaining({ equipmentName: 'Wireless microphones', quantity: 2 }),
      expect.objectContaining({ equipmentName: 'Display screen', quantity: 1 }),
    ] });
    const reservations = await pool.query(`SELECT equipment_name, quantity FROM equipment_reservations
      WHERE event_id = $1 AND status = 'Requested' ORDER BY equipment_name`, [eventId]);
    expect(reservations.rows).toEqual([
      { equipment_name: 'Display screen', quantity: 1 },
      { equipment_name: 'Wireless microphones', quantity: 2 },
    ]);
    const rows = await pool.query('SELECT id, count(*) OVER ()::int AS count FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(rows.rows).toEqual([{ id: created.body.id, count: 1 }]);
  });

  /** EQUIP-REQUEST-10-N: only the request owner can update; rejected foreign writes leave all request data unchanged. */
  it('EQUIP-REQUEST-10-N refuses a non-owner update without changing request items or reservations', async () => {
    const owner = await createUser('COORDINATOR');
    const other = await createUser('COORDINATOR');
    const eventId = await createEvent(owner.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', owner.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);

    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', other.cookie)
      .send({ eventId, items: [{ equipmentName: 'Changed microphone', equipmentType: 'Audio', quantity: 3 }] }).expect(404);
    const items = await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    const reservations = await pool.query('SELECT equipment_name, quantity FROM equipment_reservations WHERE event_id = $1 AND status = \'Requested\'', [eventId]);
    const requests = await pool.query('SELECT id, status FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(items.rows).toEqual([{ equipment_name: 'Microphone', quantity: 1 }]);
    expect(reservations.rows).toEqual([{ equipment_name: 'Microphone', quantity: 1 }]);
    expect(requests.rows).toEqual([{ id: created.body.id, status: 'Pending Review' }]);
  });

  /** EQUIP-REQUEST-10-BND-1: updates succeed before confirmation and are refused after the same event becomes Confirmed. */
  it('EQUIP-REQUEST-10-BND-1 allows a pre-Confirmed edit and rejects the next edit at Confirmed', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Original', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Before confirmation', equipmentType: 'Audio', quantity: 2 }] }).expect(200);
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'After confirmation', equipmentType: 'Audio', quantity: 3 }] }).expect(409);

    const items = await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    const reservations = await pool.query('SELECT equipment_name, quantity FROM equipment_reservations WHERE event_id = $1 AND status = \'Requested\'', [eventId]);
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(items.rows).toEqual([{ equipment_name: 'Before confirmation', quantity: 2 }]);
    expect(reservations.rows).toEqual([{ equipment_name: 'Before confirmation', quantity: 2 }]);
    expect(requests.rows).toEqual([{ id: created.body.id }]);
  });

  /** EQUIP-REQUEST-07-A: only Technical Support can see the review queue. */
  it('refuses the review queue to a coordinator', async () => {
    const coordinator = await createUser('COORDINATOR');
    await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', coordinator.cookie).expect(403);
  });
});
