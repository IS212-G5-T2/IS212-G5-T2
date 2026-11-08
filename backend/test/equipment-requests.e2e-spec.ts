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
  const equipmentIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
    await pool.query(await readFile(new URL('../../database/postgresql/init/001_schema.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/postgresql/init/002_seed_data.sql', import.meta.url), 'utf8'));
    for (const file of ['010_spm135_confirm_event.sql', '012_spm57_equipment_requests.sql', '014_spm57_request_reservations.sql', '020_spm58_cannot_provide.sql', '035_spm172_equipment_decision_notification.sql'])
      await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: ['warn', 'log'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (!pool) return;
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (equipmentIds.length) await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [equipmentIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  async function createUser(role: 'COORDINATOR' | 'TECH_SUPPORT') {
    const email = `spm57-${randomUUID()}@example.test`;
    const client = await pool.connect();
    let id!: string;
    try {
      const saved = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, 'SPM-57 Test User', crypt('password123', gen_salt('bf', 4))) RETURNING id`, [email]);
      id = saved.rows[0].id;
      userIds.push(id);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [id, role]);
    } finally {
      client.release();
    }
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = login.headers['set-cookie']?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated test session cookie');
    return { id, cookie: cookie.split(';', 1)[0] };
  }

  async function createEvent(coordinatorId: string, status: string, window: { start: string; end: string } = { start: '2030-02-03T10:00:00Z', end: '2030-02-03T12:00:00Z' }) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name, submission_key, status, rejection_reason)
       VALUES ($1, 'spm57-owner', 'Owner', 'owner@example.test', 'SPM-57 Showcase', 'Equipment request',
        $4::timestamptz, $5::timestamptz, 120, $2, 'Coordinator', $1, $3,
        CASE WHEN $3 = 'Rejected' THEN 'Event not suitable for approval.' ELSE NULL END)`, [id, coordinatorId, status, window.start, window.end]);
    eventIds.push(id);
    return id;
  }

  async function waitForSubmissionLockWaiter() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiters = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query ILIKE '%FROM events WHERE id%'
            AND query ILIKE '%coordinator_id%'
            AND query ILIKE '%FOR UPDATE%'`,
      );
      if (waiters.rows[0].count > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }

  // Traceability: Jira 57 AC1 (matrix 28868989)
  /** EQUIP-REQUEST-01-N: the real event picker returns the event name for open assigned events and excludes Confirmed events. */
  it('EQUIP-REQUEST-01-N returns only open assigned event names from the eligible-events HTTP endpoint', async () => {
    const coordinator = await createUser('COORDINATOR');
    const approvedId = await createEvent(coordinator.id, 'Approved');
    const planningId = await createEvent(coordinator.id, 'Planning');
    await createEvent(coordinator.id, 'Confirmed');

    const response = await request(app.getHttpServer()).get('/api/equipment/requests/eligible-events')
      .set('Cookie', coordinator.cookie).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([approvedId, planningId]));
    expect(response.body.every((row: { status: string }) => ['approved', 'planning'].includes(row.status))).toBe(true);
    expect(response.body.every((row: { name: string }) => row.name === 'SPM-57 Showcase')).toBe(true);
    expect(response.body.some((row: { status: string }) => row.status === 'confirmed')).toBe(false);
  });

  // Traceability: Jira 57 AC1 (matrix 28868989)
  /** EQUIP-REQUEST-01-N: a Confirmed event cannot receive a new equipment request through HTTP. */
  it('EQUIP-REQUEST-01-N refuses a Confirmed event without request, reservation, or history writes', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Confirmed');
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(409);
    expect((await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId])).rows).toEqual([]);
    expect((await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId])).rows).toEqual([]);
    expect((await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId])).rows).toEqual([]);
  });

  // Traceability: Jira 58 AC8 (matrix 33292299)
  /** EQUIP-RESERVE-08-A (Reserved half only; DECIDED SC-SPM58-03, chaw678 2026-11-06: reserve and Cannot Provide are accepted only from a Pending Review request): approval creates missing reservation rows and reuses existing placeholders without duplication. */
  it('persists exactly one Reserved row per request item whether placeholders were missing or already present', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const equipmentId = randomUUID();
    const placeholderStock = `SPM-58 Missing Placeholder Test ${equipmentId}`; // unique, so an aborted earlier run cannot collide
    equipmentIds.push(equipmentId);
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status,
                              active_quantity, under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Audio', 4, 'Active', 4, 0, 0, 'Test Store')`,
      [equipmentId, placeholderStock],
    );

    const missingEventId = await createEvent(coordinator.id, 'Planning');
    const missingRequest = await request(app.getHttpServer()).post('/api/equipment/requests')
      .set('Cookie', coordinator.cookie)
      .send({ eventId: missingEventId, items: [{ equipmentName: placeholderStock, equipmentType: 'Audio', quantity: 1 }] })
      .expect(201);
    await pool.query(
      'DELETE FROM equipment_reservations WHERE equipment_request_item_id IN (SELECT id FROM equipment_request_items WHERE request_id = $1::uuid)',
      [missingRequest.body.id],
    );
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${missingRequest.body.id}/reserve`)
      .set('Cookie', support.cookie).expect(200);
    const createdRows = await pool.query(
      `SELECT reservation.equipment_name, reservation.quantity, reservation.status
         FROM equipment_reservations reservation
         JOIN equipment_request_items item ON item.id = reservation.equipment_request_item_id
        WHERE item.request_id = $1::uuid`, [missingRequest.body.id]);
    expect(createdRows.rows).toEqual([{ equipment_name: placeholderStock, quantity: 1, status: 'Reserved' }]);

    const existingEventId = await createEvent(coordinator.id, 'Planning');
    const existingRequest = await request(app.getHttpServer()).post('/api/equipment/requests')
      .set('Cookie', coordinator.cookie)
      .send({ eventId: existingEventId, items: [{ equipmentName: placeholderStock, equipmentType: 'Audio', quantity: 1 }] })
      .expect(201);
    const before = await pool.query(
      'SELECT count(*)::integer AS count FROM equipment_reservations WHERE equipment_request_item_id IN (SELECT id FROM equipment_request_items WHERE request_id = $1::uuid)',
      [existingRequest.body.id],
    );
    expect(before.rows[0].count).toBe(1);
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${existingRequest.body.id}/reserve`)
      .set('Cookie', support.cookie).expect(200);
    const existingRows = await pool.query(
      'SELECT status FROM equipment_reservations WHERE equipment_request_item_id IN (SELECT id FROM equipment_request_items WHERE request_id = $1::uuid)',
      [existingRequest.body.id],
    );
    expect(existingRows.rows).toEqual([{ status: 'Reserved' }]);
  });

  // Traceability: Jira 58 AC9 (matrix 33292299)
  /** EQUIP-RESERVE-09-A (DECIDED SC-SPM58-03 and SC-SPM58-01, chaw678 2026-11-06: Pending Review only, one request-level status): Technical Support marks a request Cannot Provide with a required reason; it persists, retires placeholders, and the coordinator reads it. */
  it('records a Cannot Provide decision with its reason, retires placeholders, and shows it to the coordinator', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const submitted = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'SPM-58 Cannot Provide Cameras', equipmentType: 'Visual', quantity: 10 }] }).expect(201);

    // AC9: a reason is required.
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${submitted.body.id}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: '   ' }).expect(400);

    // AC8: marking Cannot Provide persists the status and reason and retires the placeholder reservations.
    const decided = await request(app.getHttpServer()).patch(`/api/equipment/requests/${submitted.body.id}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: '  Only 8 cameras available for this period; 10 requested.  ' }).expect(200);
    expect(decided.body).toMatchObject({ kind: 'cannot-provided', requestReference: submitted.body.requestReference });

    const persisted = await pool.query('SELECT status, decision_reason FROM equipment_requests WHERE id = $1::uuid', [submitted.body.id]);
    expect(persisted.rows[0]).toEqual({ status: 'Cannot Provide', decision_reason: 'Only 8 cameras available for this period; 10 requested.' });

    const reservations = await pool.query(
      'SELECT status FROM equipment_reservations WHERE equipment_request_item_id IN (SELECT id FROM equipment_request_items WHERE request_id = $1::uuid)',
      [submitted.body.id]);
    expect(reservations.rows).toEqual([{ status: 'Unavailable' }]);

    // AC10: the event coordinator sees the status and reason on their request.
    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    const own = mine.body.find((row: { id: string }) => row.id === submitted.body.id);
    expect(own).toMatchObject({ status: 'Cannot Provide', decisionReason: 'Only 8 cameras available for this period; 10 requested.' });

    // A request that is no longer Pending Review cannot be marked again.
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${submitted.body.id}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: 'Still cannot provide.' }).expect(409);
  });

  // SPM-58 overlap fixtures (real PostgreSQL). Event A holds 2030-03-10 10:00-12:00Z. B overlaps A, C is a
  // different day, D starts exactly when A ends and E ends exactly when A starts (touching, not overlapping).
  const overlapWindows = {
    A: { start: '2030-03-10T10:00:00Z', end: '2030-03-10T12:00:00Z' },
    B: { start: '2030-03-10T11:00:00Z', end: '2030-03-10T13:00:00Z' },
    C: { start: '2030-03-11T10:00:00Z', end: '2030-03-11T12:00:00Z' },
    D: { start: '2030-03-10T12:00:00Z', end: '2030-03-10T14:00:00Z' },
    E: { start: '2030-03-10T08:00:00Z', end: '2030-03-10T10:00:00Z' },
  };

  async function seedStock(label: string, active: number) {
    const id = randomUUID();
    equipmentIds.push(id);
    const name = `SPM-58 ${label} ${id}`;
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status,
                              active_quantity, under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Audio', $3, 'Active', $3, 0, 0, 'Test Store')`, [id, name, active]);
    return name;
  }

  async function requestOn(coordinator: { cookie: string; id: string }, equipmentName: string, quantity: number, window: { start: string; end: string }) {
    const eventId = await createEvent(coordinator.id, 'Planning', window);
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName, equipmentType: 'Audio', quantity }] }).expect(201);
    return created.body.id as string;
  }

  async function itemFor(cookie: string, requestId: string) {
    const list = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', cookie).expect(200);
    return list.body.find((row: { id: string }) => row.id === requestId) as {
      status: string; items: { availableQuantity: number; sufficient: boolean }[];
    };
  }

  const reserveRequest = (cookie: string, requestId: string) =>
    request(app.getHttpServer()).patch(`/api/equipment/requests/${requestId}/reserve`).set('Cookie', cookie);

  // Traceability: Jira 58 AC6 (matrix 33292299)
  /** EQUIP-RESERVE-06-A (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request): reserving N units reduces the availability shown for an overlapping event by exactly N (T = 6, N = 2). */
  it('EQUIP-RESERVE-06-A reduces the available quantity of an overlapping event by exactly the reserved amount', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('06-A', 6);
    const first = await requestOn(coordinator, stock, 2, overlapWindows.A);
    const overlapping = await requestOn(coordinator, stock, 1, overlapWindows.B);
    expect((await itemFor(coordinator.cookie, overlapping)).items[0].availableQuantity).toBe(6);

    await reserveRequest(support.cookie, first).expect(200);

    expect((await itemFor(coordinator.cookie, overlapping)).items[0]).toMatchObject({ availableQuantity: 4, sufficient: true });
  });

  // Traceability: Jira 58 AC6 (matrix 33292299)
  /** EQUIP-RESERVE-06-B: a reservation does not reduce availability for a disjoint event (T = 6, N = 2). */
  it('EQUIP-RESERVE-06-B leaves the available quantity of a disjoint event unchanged', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('06-B', 6);
    const first = await requestOn(coordinator, stock, 2, overlapWindows.A);
    const disjoint = await requestOn(coordinator, stock, 1, overlapWindows.C);
    expect((await itemFor(coordinator.cookie, disjoint)).items[0].availableQuantity).toBe(6);

    await reserveRequest(support.cookie, first).expect(200);

    expect((await itemFor(coordinator.cookie, disjoint)).items[0]).toMatchObject({ availableQuantity: 6, sufficient: true });
  });

  // Traceability: Jira 58 AC6 (matrix 33292299)
  /** EQUIP-RESERVE-06-BND-1 (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request): reserving all T units leaves exactly 0 (not negative) and refuses a further reserve (T = 3). */
  it('EQUIP-RESERVE-06-BND-1 reserving the whole stock leaves an overlapping event at exactly zero and refuses another reserve', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('06-BND-1', 3);
    const first = await requestOn(coordinator, stock, 3, overlapWindows.A);
    const overlapping = await requestOn(coordinator, stock, 1, overlapWindows.B);

    await reserveRequest(support.cookie, first).expect(200);

    expect((await itemFor(coordinator.cookie, overlapping)).items[0]).toMatchObject({ availableQuantity: 0, sufficient: false });
    await reserveRequest(support.cookie, overlapping).expect(409);
    expect((await itemFor(coordinator.cookie, overlapping)).status).toBe('Pending Review');
  });

  // Traceability: Jira 58 AC2 (matrix 33292299)
  /** EQUIP-RESERVE-02-BND-1: available equal to requested is sufficient; one overlapping unit reserved elsewhere makes it insufficient (T = 3, request 3). */
  it('EQUIP-RESERVE-02-BND-1 flips from sufficient to insufficient when one overlapping unit is reserved', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('02-BND-1', 3);
    const subject = await requestOn(coordinator, stock, 3, overlapWindows.A);
    const other = await requestOn(coordinator, stock, 1, overlapWindows.B);
    expect((await itemFor(coordinator.cookie, subject)).items[0]).toMatchObject({ availableQuantity: 3, sufficient: true });

    await reserveRequest(support.cookie, other).expect(200);

    expect((await itemFor(coordinator.cookie, subject)).items[0]).toMatchObject({ availableQuantity: 2, sufficient: false });
  });

  // Traceability: Jira 58 AC4 (matrix 33292299)
  /** EQUIP-RESERVE-04-A: reserving more than the units free for the event window (4 requested, 3 in stock) is refused and nothing is created. */
  it('EQUIP-RESERVE-04-A refuses a reserve for more units than are available and persists nothing', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('04-A', 3);
    const tooMany = await requestOn(coordinator, stock, 4, overlapWindows.A);

    const refused = await reserveRequest(support.cookie, tooMany).expect(409);
    expect(refused.body.message).toContain('Not enough active equipment');

    expect((await itemFor(coordinator.cookie, tooMany)).status).toBe('Pending Review');
    const rows = await pool.query(
      `SELECT res.status FROM equipment_reservations res JOIN equipment_request_items i ON i.id = res.equipment_request_item_id
        WHERE i.request_id = $1::uuid`, [tooMany]);
    expect(rows.rows).toEqual([{ status: 'Requested' }]);
  });

  // Traceability: Jira 58 AC5 (matrix 33292299)
  /** EQUIP-RESERVE-05-B: stock that is only Under Maintenance or Retired (no Active units) cannot be reserved and nothing is persisted. */
  it.each([
    ['Under Maintenance', 0, 2, 0],
    ['Retired', 0, 0, 2],
  ])('EQUIP-RESERVE-05-B refuses to reserve stock that is only %s', async (_label, active, maintenance, retired) => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const id = randomUUID();
    equipmentIds.push(id);
    const name = `SPM-58 05-B ${id}`;
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status,
                              active_quantity, under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Audio', 2, 'Active', $3, $4, $5, 'Test Store')`, [id, name, active, maintenance, retired]);
    const subject = await requestOn(coordinator, name, 1, overlapWindows.A);

    await reserveRequest(support.cookie, subject).expect(409);

    expect((await itemFor(coordinator.cookie, subject)).status).toBe('Pending Review');
    const rows = await pool.query(
      `SELECT res.status FROM equipment_reservations res JOIN equipment_request_items i ON i.id = res.equipment_request_item_id
        WHERE i.request_id = $1::uuid`, [subject]);
    expect(rows.rows).toEqual([{ status: 'Requested' }]);
  });

  const rowsFor = (requestId: string) => pool.query(
    `SELECT r.status AS request_status, res.status AS reservation_status
       FROM equipment_requests r JOIN equipment_request_items i ON i.request_id = r.id
       JOIN equipment_reservations res ON res.equipment_request_item_id = i.id WHERE r.id = $1::uuid`, [requestId]);

  // Traceability: Jira 58 AC1 (matrix 33292299)
  /** EQUIP-RESERVE-01-A: the Technical Support queue shows the event name, date and time and each item's type, name and quantity. */
  it('EQUIP-RESERVE-01-A lists a Pending Review request with its event name, window and item details in the queue', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('01-A', 5);
    const requestId = await requestOn(coordinator, stock, 3, overlapWindows.A);

    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    const row = queue.body.find((entry: { id: string }) => entry.id === requestId);
    expect(row).toMatchObject({
      status: 'Pending Review', eventName: 'SPM-57 Showcase',
      eventStart: '2030-03-10T10:00:00.000Z', eventEnd: '2030-03-10T12:00:00.000Z',
      items: [{ equipmentName: stock, equipmentType: 'Audio', quantity: 3 }],
    });
  });

  // Traceability: Jira 58 AC1 (matrix 33292299)
  /** EQUIP-RESERVE-01-B: requests that are Reserved or Cannot Provide are absent from the queue while a Pending Review request is present. */
  it('EQUIP-RESERVE-01-B leaves resolved requests out of the queue and keeps the Pending Review one', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('01-B', 5);
    const reserved = await requestOn(coordinator, stock, 1, overlapWindows.A);
    const refused = await requestOn(coordinator, stock, 1, overlapWindows.C);
    const pending = await requestOn(coordinator, stock, 1, overlapWindows.D);
    await reserveRequest(support.cookie, reserved).expect(200);
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${refused}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: 'No stock.' }).expect(200);

    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    const ids = queue.body.map((entry: { id: string }) => entry.id);
    expect(ids).toContain(pending);
    expect(ids).not.toContain(reserved);
    expect(ids).not.toContain(refused);
  });

  // Traceability: Jira 58 AC3 (matrix 33292299)
  /** EQUIP-RESERVE-03-B: when an overlapping event already holds every unit, reserving 1 unit is refused and nothing is created (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request). */
  it('EQUIP-RESERVE-03-B refuses a reserve when an overlapping event holds every unit and creates nothing', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('03-B', 2);
    const holder = await requestOn(coordinator, stock, 2, overlapWindows.A);
    const subject = await requestOn(coordinator, stock, 1, overlapWindows.B);
    await reserveRequest(support.cookie, holder).expect(200);

    await reserveRequest(support.cookie, subject).expect(409);

    expect((await rowsFor(subject)).rows).toEqual([{ request_status: 'Pending Review', reservation_status: 'Requested' }]);
  });

  // Traceability: Jira 58 AC3 (matrix 33292299)
  /** EQUIP-RESERVE-03-BND-1: reserving the entire available quantity (4 of 4) succeeds, available becomes 0 and a further reserve is refused (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request). */
  it('EQUIP-RESERVE-03-BND-1 reserves the entire available quantity, leaves zero and refuses a further reserve', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('03-BND-1', 4);
    const full = await requestOn(coordinator, stock, 4, overlapWindows.A);
    const further = await requestOn(coordinator, stock, 1, overlapWindows.A);
    expect((await itemFor(coordinator.cookie, further)).items[0].availableQuantity).toBe(4);

    await reserveRequest(support.cookie, full).expect(200);

    expect((await itemFor(coordinator.cookie, further)).items[0]).toMatchObject({ availableQuantity: 0, sufficient: false });
    await reserveRequest(support.cookie, further).expect(409);
  });

  // Traceability: Jira 58 AC4 (matrix 33292299)
  /** EQUIP-RESERVE-04-BND-1: reserving exactly the free quantity (F = 2 of 3, one held elsewhere) succeeds and one more unit is refused (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request). */
  it('EQUIP-RESERVE-04-BND-1 reserves exactly the free quantity and refuses one more', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('04-BND-1', 3);
    const held = await requestOn(coordinator, stock, 1, overlapWindows.A);
    const exact = await requestOn(coordinator, stock, 2, overlapWindows.B);
    const oneMore = await requestOn(coordinator, stock, 1, overlapWindows.B);
    await reserveRequest(support.cookie, held).expect(200);

    await reserveRequest(support.cookie, exact).expect(200);

    await reserveRequest(support.cookie, oneMore).expect(409);
    expect((await rowsFor(oneMore)).rows).toEqual([{ request_status: 'Pending Review', reservation_status: 'Requested' }]);
  });

  // Traceability: Jira 58 AC5 (matrix 33292299)
  /** EQUIP-RESERVE-05-C: stock held for an overlapping event is refused (more than the remaining free quantity); the same units for a disjoint event succeed. */
  it('EQUIP-RESERVE-05-C refuses the overlapping request and accepts the disjoint one', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('05-C', 2);
    const held = await requestOn(coordinator, stock, 2, overlapWindows.A);
    const overlapping = await requestOn(coordinator, stock, 1, overlapWindows.B);
    const disjoint = await requestOn(coordinator, stock, 2, overlapWindows.C);
    await reserveRequest(support.cookie, held).expect(200);

    await reserveRequest(support.cookie, overlapping).expect(409);
    expect((await rowsFor(overlapping)).rows).toEqual([{ request_status: 'Pending Review', reservation_status: 'Requested' }]);
    await reserveRequest(support.cookie, disjoint).expect(200);
    expect((await itemFor(coordinator.cookie, disjoint)).status).toBe('Reserved');
  });

  // Traceability: Jira 58 AC12 (matrix 33292299)
  /** EQUIP-RESERVE-12-BND-1: an update is accepted in the last pre-Confirmed state and refused (naming the confirmed event) immediately after the event becomes Confirmed. */
  it('EQUIP-RESERVE-12-BND-1 accepts the last pre-Confirmed update and refuses the next one once Confirmed', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Boundary original', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Boundary last allowed', equipmentType: 'Audio', quantity: 2 }] }).expect(200);
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Boundary too late', equipmentType: 'Audio', quantity: 3 }] }).expect(409)
      .expect((response) => expect(response.body.message).toMatch(/confirmed/i));
    const items = await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    expect(items.rows).toEqual([{ equipment_name: 'Boundary last allowed', quantity: 2 }]);
  });

  // Traceability: Jira 58 AC5 (matrix 33292299)
  /** EQUIP-RESERVE-05-BND-1 (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request): an overlapping reserve is refused; windows that only touch (end == start) do not consume stock (T = 2). */
  it('EQUIP-RESERVE-05-BND-1 refuses an overlapping reserve but allows windows that only touch the held window', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('05-BND-1', 2);
    const held = await requestOn(coordinator, stock, 2, overlapWindows.A);
    const overlapping = await requestOn(coordinator, stock, 1, overlapWindows.B);
    const touchingAfter = await requestOn(coordinator, stock, 2, overlapWindows.D);
    const touchingBefore = await requestOn(coordinator, stock, 2, overlapWindows.E);
    await reserveRequest(support.cookie, held).expect(200);

    // Overlap: only 0 of 2 units remain, so nothing is persisted for the overlapping request.
    await reserveRequest(support.cookie, overlapping).expect(409);
    const refused = await pool.query(
      `SELECT r.status AS request_status, res.status AS reservation_status
         FROM equipment_requests r JOIN equipment_request_items i ON i.request_id = r.id
         JOIN equipment_reservations res ON res.equipment_request_item_id = i.id WHERE r.id = $1::uuid`, [overlapping]);
    expect(refused.rows).toEqual([{ request_status: 'Pending Review', reservation_status: 'Requested' }]);

    // Touching windows do not overlap, so the full 2 units are still free for each.
    expect((await itemFor(coordinator.cookie, touchingAfter)).items[0]).toMatchObject({ availableQuantity: 2, sufficient: true });
    await reserveRequest(support.cookie, touchingAfter).expect(200);
    expect((await itemFor(coordinator.cookie, touchingBefore)).items[0]).toMatchObject({ availableQuantity: 2, sufficient: true });
    await reserveRequest(support.cookie, touchingBefore).expect(200);
  });

  // Traceability: Jira 58 AC8 (matrix 33292299)
  /**
   * EQUIP-RESERVE-08-BND-1 (DECIDED SC-SPM58-01, chaw678 2026-11-06: status is per equipment request; the test only shows that
   * deciding one request never changes another request).
   */
  it('EQUIP-RESERVE-08-BND-1 keeps the Reserved, Cannot Provide and Pending Review statuses of separate requests independent', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('08-BND-1', 10);
    const toReserve = await requestOn(coordinator, stock, 1, overlapWindows.A);
    const toRefuse = await requestOn(coordinator, stock, 1, overlapWindows.C);
    const untouched = await requestOn(coordinator, stock, 1, overlapWindows.D);

    await reserveRequest(support.cookie, toReserve).expect(200);
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${toRefuse}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: 'Not available for this slot.' }).expect(200);

    const list = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    const statusOf = (id: string) => list.body.find((row: { id: string }) => row.id === id)?.status;
    expect(statusOf(toReserve)).toBe('Reserved');
    expect(statusOf(toRefuse)).toBe('Cannot Provide');
    expect(statusOf(untouched)).toBe('Pending Review');
  });

  // Traceability: Jira 57 AC3 (matrix 28868989)
  /** EQUIP-REQUEST-03-A, EQUIP-RESERVE-01-A: a multi-item Approved-event submission is persisted and moves the event to Planning. */
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
    // EQUIP-RESERVE-01-A: the queue row names the event and its date and time window.
    expect(queued).toMatchObject({ eventName: 'SPM-57 Showcase', eventStart: '2030-02-03T10:00:00.000Z', eventEnd: '2030-02-03T12:00:00.000Z' });
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

  // Traceability: Jira 57 AC3 (matrix 28868989)
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

  // Traceability: Jira 57 AC5 (matrix 28868989)
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

  // Traceability: Jira 57 AC2 (matrix 28868989)
  /** EQUIP-REQUEST-02-N: an unknown or inaccessible event cannot be submitted and creates no request data. */
  it('EQUIP-REQUEST-02-N refuses an unknown event id without persistence', async () => {
    const coordinator = await createUser('COORDINATOR');
    const unknownEventId = '00000000-0000-4000-8000-000000000057';
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId: unknownEventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(404);
    const saved = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [unknownEventId]);
    expect(saved.rows).toEqual([]);
  });

  // Traceability: Jira 57 AC2 (matrix 28868989)
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

  // Traceability: Jira 57 AC4 (matrix 28868989)
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

  // Traceability: Jira 57 AC4 (matrix 28868989)
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

  // Traceability: Jira 57 AC4 (matrix 28868989)
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

  // Traceability: Jira 57 AC3 (matrix 28868989)
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

  // Traceability: Jira 57 AC8 (matrix 28868989)
  /** EQUIP-REQUEST-08-N: Cancelled and Rejected events cannot receive a new equipment request. */
  it('EQUIP-REQUEST-08-N refuses a Cancelled event request without side effects', async () => {
    const coordinator = await createUser('COORDINATOR');
    const status = 'Cancelled';
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

  // Traceability: Jira 57 AC8 (matrix 28868989)
  /** EQUIP-REQUEST-08-N: a Rejected event cannot receive a new equipment request. */
  it('EQUIP-REQUEST-08-N refuses a Rejected event request without side effects', async () => {
    const coordinator = await createUser('COORDINATOR');
    const status = 'Rejected';
    const eventId = await createEvent(coordinator.id, status);
    await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(409);
    expect((await pool.query('SELECT count(*)::int AS n FROM equipment_requests WHERE event_id = $1', [eventId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status).toBe(status);
    expect((await pool.query('SELECT id FROM equipment_reservations WHERE event_id = $1', [eventId])).rows).toEqual([]);
    expect((await pool.query('SELECT id FROM event_status_history WHERE event_id = $1', [eventId])).rows).toEqual([]);
  });

  /** EQUIP-REQUEST-08-SUP-HISTORY: requests for Cancelled or Rejected events disappear from both views while their database history is retained. */
  it.each(['Cancelled', 'Rejected'])('EQUIP-REQUEST-08-SUP-HISTORY hides a retained request after its event becomes %s', async (status) => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);

    await pool.query(`UPDATE events SET status = $2,
      rejection_reason = CASE WHEN $2 = 'Rejected' THEN 'Request visibility test rejection.' ELSE NULL END
      WHERE id = $1`, [eventId, status]);

    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    expect(mine.body.map((row: { id: string }) => row.id)).not.toContain(created.body.id);
    expect(queue.body.map((row: { id: string }) => row.id)).not.toContain(created.body.id);
    const retained = await pool.query(`SELECT r.id, r.status, i.equipment_name FROM equipment_requests r
      JOIN equipment_request_items i ON i.request_id = r.id WHERE r.id = $1`, [created.body.id]);
    expect(retained.rows).toEqual([{ id: created.body.id, status: 'Pending Review', equipment_name: 'Microphone' }]);
  });

  // Traceability: Jira 57 AC10 (matrix 28868989)
  /** EQUIP-REQUEST-10-N: direct duplicate submission is refused and leaves the original request, reference, items, reservations, event, and history unchanged. */
  it('refuses a duplicate request while preserving the original request and Approved-to-Planning history', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Approved');
    const original = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    const priorHistory = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(priorHistory.rows).toEqual([{ from_status: 'Approved', to_status: 'Planning' }]);
    const duplicate = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Folding chair', equipmentType: 'Furniture', quantity: 1 }] }).expect(409);
    expect(duplicate.body.message).toMatch(/already exists.*Update the existing request/i);
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([{ id: original.body.id }]);
    const items = await pool.query('SELECT equipment_name, equipment_type, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [original.body.id]);
    expect(items.rows).toEqual([{ equipment_name: 'Microphone', equipment_type: 'Audio', quantity: 1 }]);
    const reservations = await pool.query('SELECT equipment_name, quantity, status, equipment_request_item_id FROM equipment_reservations WHERE event_id = $1 ORDER BY equipment_name', [eventId]);
    expect(reservations.rows).toHaveLength(1);
    expect(reservations.rows[0]).toMatchObject({ equipment_name: 'Microphone', quantity: 1, status: 'Requested' });
    const mine = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', coordinator.cookie).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ id: original.body.id, reference: original.body.requestReference });
    expect(mine.body[0].items).toHaveLength(1);
    expect((await request(app.getHttpServer()).get('/api/equipment/requests/eligible-events').set('Cookie', coordinator.cookie).expect(200))
      .body.some((row: { id: string }) => row.id === eventId)).toBe(false);
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows).toEqual([{ status: 'Planning' }]);
    const history = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(history.rows).toEqual(priorHistory.rows);
  });

  // Traceability: Jira 57 AC9 (matrix 28868989)
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

  // Traceability: Jira 57 AC6 (matrix 28868989)
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

  // Traceability: Jira 58 AC10 (matrix 33292299)
  /** EQUIP-RESERVE-10-B: after Technical Support reserves one request and marks another Cannot Provide on event E, a non-owning coordinator does not see either status; the owner does. */
  it('EQUIP-RESERVE-10-B hides Technical Support status updates from a coordinator who does not own the event', async () => {
    const owner = await createUser('COORDINATOR');
    const other = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('10-B', 5);
    const reservedId = await requestOn(owner, stock, 1, overlapWindows.A);
    const refusedId = await requestOn(owner, stock, 1, overlapWindows.C);
    await reserveRequest(support.cookie, reservedId).expect(200);
    await request(app.getHttpServer()).patch(`/api/equipment/requests/${refusedId}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: 'No stock.' }).expect(200);

    const ownerList = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', owner.cookie).expect(200);
    const ownerStatuses = Object.fromEntries(ownerList.body.map((row: { id: string; status: string }) => [row.id, row.status]));
    expect(ownerStatuses[reservedId]).toBe('Reserved');
    expect(ownerStatuses[refusedId]).toBe('Cannot Provide');

    const otherList = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', other.cookie).expect(200);
    const otherIds = otherList.body.map((row: { id: string }) => row.id);
    expect(otherIds).not.toContain(reservedId);
    expect(otherIds).not.toContain(refusedId);
  });

  // Traceability: Jira 57 AC7 (matrix 28868989)
  /** EQUIP-REQUEST-07-A, EQUIP-RESERVE-01-B: Technical Support sees Pending Review rows but excludes requests already Reserved. */
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

  // Traceability: Jira 57 AC10 (matrix 28868989)
  /** EQUIP-REQUEST-10-BND-1: a second simultaneous first submission waits on the event lock, then gets the duplicate conflict with one coherent persisted request. */
  it('EQUIP-REQUEST-10-BND-1 serializes concurrent submits to one request and side-effect set', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Approved');
    const send = () => request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] });

    const locker = await pool.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    const pending = Promise.all([send(), send()]);
    let observedSubmissionWait = false;
    try {
      observedSubmissionWait = await waitForSubmissionLockWaiter();
    } finally {
      await locker.query('COMMIT');
      locker.release();
    }
    const [first, second] = await pending;
    expect(observedSubmissionWait).toBe(true);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const created = first.status === 201 ? first : second;
    const refused = first.status === 409 ? first : second;
    expect(refused.body.message).toMatch(/already exists.*Update the existing request/i);
    expect(created.body.event.status).toBe('planning');
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(requests.rows).toEqual([{ id: created.body.id }]);
    const persistedItems = await pool.query('SELECT id, equipment_name, equipment_type, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    expect(persistedItems.rows).toEqual([{ id: expect.any(String), equipment_name: 'Microphone', equipment_type: 'Audio', quantity: 1 }]);
    const reservations = await pool.query('SELECT equipment_name, quantity, status, equipment_request_item_id FROM equipment_reservations WHERE event_id = $1 ORDER BY equipment_name', [eventId]);
    expect(reservations.rows).toHaveLength(1);
    expect(reservations.rows[0]).toMatchObject({ equipment_name: 'Microphone', quantity: 1, status: 'Requested' });
    expect(reservations.rows[0].equipment_request_item_id).toBe(persistedItems.rows[0].id);
    const history = await pool.query("SELECT from_status, to_status FROM event_status_history WHERE event_id = $1", [eventId]);
    expect(history.rows).toEqual([{ from_status: 'Approved', to_status: 'Planning' }]);
  });

  // Traceability: Jira 57 AC10 (matrix 28868989)
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

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: a reviewed request remains updateable while its event is still Planning,
   *  and updating it returns the request to the Technical Support review queue (SPM-58). */
  it('returns a Reserved request to Pending Review when it is updated before event confirmation', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Original', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await pool.query("UPDATE equipment_requests SET status = 'Reserved' WHERE id = $1", [created.body.id]);

    const updated = await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`)
      .set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Revised microphone', equipmentType: 'Audio', quantity: 3 }] }).expect(200);

    expect(updated.body).toMatchObject({ kind: 'updated', id: created.body.id, requestReference: created.body.requestReference });
    expect((await pool.query('SELECT status FROM equipment_requests WHERE id = $1', [created.body.id])).rows).toEqual([{ status: 'Pending Review' }]);
    expect((await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1', [created.body.id])).rows)
      .toEqual([{ equipment_name: 'Revised microphone', quantity: 3 }]);
    expect((await pool.query("SELECT equipment_name, quantity FROM equipment_reservations WHERE event_id = $1 AND status = 'Requested'", [eventId])).rows)
      .toEqual([{ equipment_name: 'Revised microphone', quantity: 3 }]);
    expect((await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId])).rows).toEqual([{ id: created.body.id }]);
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: only the request owner can update; rejected foreign writes leave all request data unchanged. */
  it('EQUIP-REQUEST-10-SUP-ACCESS refuses a non-owner update without changing request items or reservations', async () => {
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

  /** EQUIP-REQUEST-10-SUP-ACCESS: reassignment removes the former coordinator’s list and update access while granting it to the current coordinator. */
  it('EQUIP-REQUEST-10-SUP-ACCESS follows the current event coordinator after reassignment', async () => {
    const formerCoordinator = await createUser('COORDINATOR');
    const currentCoordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const eventId = await createEvent(formerCoordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', formerCoordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Original microphone', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await pool.query('UPDATE events SET coordinator_id = $2, coordinator_name = $3 WHERE id = $1', [eventId, currentCoordinator.id, 'Current Coordinator']);

    const formerList = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', formerCoordinator.cookie).expect(200);
    expect(formerList.body.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', formerCoordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Unauthorized replacement', equipmentType: 'Audio', quantity: 3 }] }).expect(404);
    let persisted = await pool.query(`SELECT i.equipment_name, i.quantity FROM equipment_request_items i
      JOIN equipment_requests r ON r.id = i.request_id WHERE r.id = $1`, [created.body.id]);
    expect(persisted.rows).toEqual([{ equipment_name: 'Original microphone', quantity: 1 }]);

    const currentList = await request(app.getHttpServer()).get('/api/equipment/requests').set('Cookie', currentCoordinator.cookie).expect(200);
    expect(currentList.body).toHaveLength(1);
    expect(currentList.body[0]).toMatchObject({ id: created.body.id, requestedBy: formerCoordinator.id, coordinatorName: 'Current Coordinator' });
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', currentCoordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Current replacement', equipmentType: 'Audio', quantity: 2 }] }).expect(200);
    persisted = await pool.query(`SELECT i.equipment_name, i.quantity FROM equipment_request_items i
      JOIN equipment_requests r ON r.id = i.request_id WHERE r.id = $1`, [created.body.id]);
    expect(persisted.rows).toEqual([{ equipment_name: 'Current replacement', quantity: 2 }]);

    const queue = await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', support.cookie).expect(200);
    expect(queue.body.find((row: { id: string }) => row.id === created.body.id)?.items).toEqual([
      expect.objectContaining({ equipmentName: 'Current replacement', quantity: 2 }),
    ]);
  });

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: updates succeed before confirmation and are refused after the event becomes Confirmed. */
  it('EQUIP-REQUEST-10-SUP-LIFECYCLE allows a pre-Confirmed edit and rejects the next edit at Confirmed', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Original', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Before confirmation', equipmentType: 'Audio', quantity: 2 }] }).expect(200);
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'After confirmation', equipmentType: 'Audio', quantity: 3 }] }).expect(409)
      .expect((response) => expect(response.body.message).toMatch(/confirmed/i));

    const items = await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    const reservations = await pool.query('SELECT equipment_name, quantity FROM equipment_reservations WHERE event_id = $1 AND status = \'Requested\'', [eventId]);
    const requests = await pool.query('SELECT id FROM equipment_requests WHERE event_id = $1', [eventId]);
    expect(items.rows).toEqual([{ equipment_name: 'Before confirmation', quantity: 2 }]);
    expect(reservations.rows).toEqual([{ equipment_name: 'Before confirmation', quantity: 2 }]);
    expect(requests.rows).toEqual([{ id: created.body.id }]);
  });

  // Traceability: Jira 58 AC12 (matrix 33292299)
  /** EQUIP-RESERVE-12-A: an edit is accepted and persisted while the event is Approved (the other pre-Confirmed state). */
  it('EQUIP-RESERVE-12-A accepts and persists an edit while the event is Approved', async () => {
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'Planning');
    const created = await request(app.getHttpServer()).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Original', equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    await pool.query("UPDATE events SET status = 'Approved' WHERE id = $1", [eventId]);
    await request(app.getHttpServer()).put(`/api/equipment/requests/${created.body.id}`).set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName: 'Edited while Approved', equipmentType: 'Audio', quantity: 2 }] }).expect(200);
    const items = await pool.query('SELECT equipment_name, quantity FROM equipment_request_items WHERE request_id = $1 ORDER BY item_order', [created.body.id]);
    expect(items.rows).toEqual([{ equipment_name: 'Edited while Approved', quantity: 2 }]);
  });

  // Traceability: Jira 58 AC12 (matrix 33292299)
  /** EQUIP-RESERVE-12-B: once the event is Confirmed, Technical Support can neither reserve nor mark Cannot Provide; the refusal says the event is confirmed and the request is unchanged. */
  it('EQUIP-RESERVE-12-B refuses Technical Support reserve and Cannot Provide on a Confirmed event and leaves the request unchanged', async () => {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const stock = await seedStock('12-B', 5);
    const requestId = await requestOn(coordinator, stock, 1, overlapWindows.A);
    const eventId = (await pool.query<{ event_id: string }>('SELECT event_id FROM equipment_requests WHERE id = $1::uuid', [requestId])).rows[0].event_id;
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);

    const reserved = await reserveRequest(support.cookie, requestId).expect(409);
    expect(reserved.body.message).toMatch(/confirmed/i);
    const refused = await request(app.getHttpServer()).patch(`/api/equipment/requests/${requestId}/cannot-provide`)
      .set('Cookie', support.cookie).send({ reason: 'Too late.' }).expect(409);
    expect(refused.body.message).toMatch(/confirmed/i);

    const stored = await pool.query(
      `SELECT r.status AS request_status, r.decision_reason, res.status AS reservation_status
         FROM equipment_requests r JOIN equipment_request_items i ON i.request_id = r.id
         JOIN equipment_reservations res ON res.equipment_request_item_id = i.id WHERE r.id = $1::uuid`, [requestId]);
    expect(stored.rows).toEqual([{ request_status: 'Pending Review', decision_reason: null, reservation_status: 'Requested' }]);
  });

  // Traceability: Jira 57 AC7 (matrix 28868989)
  /** EQUIP-REQUEST-07-A: only Technical Support can see the review queue. */
  it('refuses the review queue to a coordinator', async () => {
    const coordinator = await createUser('COORDINATOR');
    await request(app.getHttpServer()).get('/api/equipment/requests/review-queue').set('Cookie', coordinator.cookie).expect(403);
  });

  // Traceability: Jira 58 AC3 (matrix 33292299)
  /** EQUIP-RESERVE-03-SEC-1: an unauthenticated caller gets 401 and a coordinator gets 403 on both the review queue and reserve, and no reservation is created. */
  it('EQUIP-RESERVE-03-SEC-1 refuses the review queue and reserve to unauthenticated and non-Technical-Support callers and creates nothing', async () => {
    const coordinator = await createUser('COORDINATOR');
    const stock = await seedStock('03-SEC-1', 5);
    const requestId = await requestOn(coordinator, stock, 1, overlapWindows.A);
    const http = () => request(app.getHttpServer());

    await http().get('/api/equipment/requests/review-queue').expect(401);
    await http().patch(`/api/equipment/requests/${requestId}/reserve`).expect(401);
    await http().get('/api/equipment/requests/review-queue').set('Cookie', coordinator.cookie).expect(403);
    await http().patch(`/api/equipment/requests/${requestId}/reserve`).set('Cookie', coordinator.cookie).expect(403);

    const stored = await pool.query(
      `SELECT r.status AS request_status, res.status AS reservation_status
         FROM equipment_requests r JOIN equipment_request_items i ON i.request_id = r.id
         JOIN equipment_reservations res ON res.equipment_request_item_id = i.id WHERE r.id = $1::uuid`, [requestId]);
    expect(stored.rows).toEqual([{ request_status: 'Pending Review', reservation_status: 'Requested' }]);
  });
});
