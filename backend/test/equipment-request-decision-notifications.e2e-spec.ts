/*
 * SPM-172 integration coverage (equipment request decision notification, Coordinator) through the real Nest HTTP
 * pipeline, session middleware and PostgreSQL: Technical Support reserve a request or mark it cannot be provided, and
 * the event's Coordinator receives one notification in the bell feed. Every user signs in through the real login route.
 * Test cases: EQUIP-REQ-NOTIF-01-E, 01-F, 02-E, 03-B, 04-B, 05-A, 05-B, 05-C, 06-B, 06-C, 07-C.
 * Needs DATABASE_URL with the full database/postgresql/init folder applied, as CI does: 001, 002, the equipment
 * migrations and 035 are applied here, but 03-B, 05-C, 06-B and 06-C also need tables from other init files
 * (safety_check_feedback_items, event_change_requests).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const databaseUrl = process.env.DATABASE_URL;
// The injected clock: every decision in this suite is made at this instant.
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-172 equipment decision notification PostgreSQL tests must run in CI: set DATABASE_URL.');

type TestUser = { id: string; cookie: string };
type FeedItem = {
  id: string;
  type: string;
  message: string;
  relatedEventId: string | null;
  relatedEquipmentRequestId: string | null;
  read: boolean;
  createdAt: string;
};

describe.skipIf(!databaseUrl)('SPM-172 equipment request decision notifications HTTP and PostgreSQL', () => {
  let app: INestApplication;
  // One fixed loopback listener (see the SPM-137 suite): supertest's per-request ephemeral port can be shadowed.
  let baseUrl: string;
  let pool: pg.Pool;
  const eventIds: string[] = [];
  const userIds: string[] = [];
  const equipmentIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
    await pool.query(await readFile(new URL('../../database/postgresql/init/001_schema.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/postgresql/init/002_seed_data.sql', import.meta.url), 'utf8'));
    for (const file of [
      '010_spm135_confirm_event.sql',
      '012_spm57_equipment_requests.sql',
      '014_spm57_request_reservations.sql',
      '020_spm58_cannot_provide.sql',
      '035_spm172_equipment_decision_notification.sql',
    ])
      await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => fixedNow })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    if (!pool) return;
    // Deleting the events removes their requests and those requests' notifications.
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (equipmentIds.length) await pool.query('DELETE FROM equipment WHERE id = ANY($1::uuid[])', [equipmentIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  // ---- fixtures ----------------------------------------------------------------------------------------------------

  async function createUser(role: 'COORDINATOR' | 'TECH_SUPPORT' | 'COORDINATOR_LEAD' | 'ORGANISER'): Promise<TestUser> {
    const email = `spm172-${randomUUID()}@example.test`;
    const client = await pool.connect();
    let id!: string;
    try {
      const saved = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, 'SPM-172 Test User', crypt('password123', gen_salt('bf', 4))) RETURNING id`,
        [email],
      );
      id = saved.rows[0].id;
      userIds.push(id);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [id, role]);
    } finally {
      client.release();
    }
    const login = await request(baseUrl).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected an authenticated test session cookie');
    return { id, cookie: cookie.split(';', 1)[0] };
  }

  async function createEvent(coordinatorId: string | null, name: string, status = 'Planning') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
         expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, 'spm172-owner', 'Owner', 'owner@example.test', $2, 'Equipment decision notification',
         '2030-02-03T10:00:00Z', '2030-02-03T12:00:00Z', 20, $3, 'SPM-172 Coordinator', $1, $4)`,
      [id, name, coordinatorId, status],
    );
    eventIds.push(id);
    return id;
  }

  /** Active stock for a uniquely named item, so a reservation can succeed (or, with quantity 0, be refused). */
  async function addStock(activeQuantity: number) {
    const id = randomUUID();
    const name = `SPM-172 Microphone ${id}`;
    equipmentIds.push(id);
    await pool.query(
      `INSERT INTO equipment (id, equipment_name, equipment_type, quantity, maintenance_status,
                              active_quantity, under_maintenance_quantity, retired_quantity, location)
       VALUES ($1, $2, 'Audio', 5, 'Active', $3, 5 - $3, 0, 'Test Store')`,
      [id, name, activeQuantity],
    );
    return name;
  }

  /** One Coordinator, one Technical Support user, an assigned event and one submitted (Pending Review) request. */
  async function world(eventName = 'SPM-172 Gala', stock = 5) {
    const coordinator = await createUser('COORDINATOR');
    const support = await createUser('TECH_SUPPORT');
    const equipmentName = await addStock(stock);
    const eventId = await createEvent(coordinator.id, eventName);
    const created = await request(baseUrl).post('/api/equipment/requests').set('Cookie', coordinator.cookie)
      .send({ eventId, items: [{ equipmentName, equipmentType: 'Audio', quantity: 1 }] }).expect(201);
    return { coordinator, support, eventId, eventName, equipmentName, requestId: created.body.id as string };
  }

  const reserve = (requestId: string, user: TestUser) =>
    request(baseUrl).patch(`/api/equipment/requests/${requestId}/reserve`).set('Cookie', user.cookie);
  const cannotProvide = (requestId: string, user: TestUser, reason = 'Only 8 available for this period.') =>
    request(baseUrl).patch(`/api/equipment/requests/${requestId}/cannot-provide`).set('Cookie', user.cookie).send({ reason });
  const feed = async (user: TestUser) =>
    (await request(baseUrl).get('/api/notifications').set('Cookie', user.cookie).expect(200)).body as FeedItem[];
  const noticesFor = async (user: TestUser, requestId: string) => (await feed(user)).filter((n) => n.relatedEquipmentRequestId === requestId);
  const storedFor = async (requestId: string) =>
    (await pool.query<{ recipient_id: string; type: string; message: string; read: boolean; created_at: Date }>(
      'SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_equipment_request_id = $1 ORDER BY created_at, id',
      [requestId],
    )).rows;
  const editRequest = (w: Awaited<ReturnType<typeof world>>) =>
    request(baseUrl).put(`/api/equipment/requests/${w.requestId}`).set('Cookie', w.coordinator.cookie)
      .send({ eventId: w.eventId, items: [{ equipmentName: w.equipmentName, equipmentType: 'Audio', quantity: 2 }] }).expect(200);

  // ---- AC1 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-01-E (SPM-172 AC1): Technical Support reserve a request; the assigned Coordinator's feed holds
   * exactly one equipment_request_reserved notice for it, another Coordinator's and the Technical Support user's feeds
   * hold none, and one row is stored, addressed to the assignee.
   * Kills: no notice, a duplicate, broadcasting to every Coordinator, addressing Technical Support.
   */
  it('EQUIP-REQ-NOTIF-01-E a reservation gives the assigned Coordinator one notification and nobody else any', async () => {
    const w = await world();
    const bystander = await createUser('COORDINATOR');

    await reserve(w.requestId, w.support).expect(200);

    expect(await noticesFor(w.coordinator, w.requestId)).toMatchObject([
      { type: 'equipment_request_reserved', relatedEventId: w.eventId, relatedEquipmentRequestId: w.requestId },
    ]);
    expect(await noticesFor(bystander, w.requestId)).toEqual([]);
    expect((await storedFor(w.requestId)).map((row) => row.recipient_id)).toEqual([w.coordinator.id]);
  });

  /**
   * EQUIP-REQ-NOTIF-01-F (SPM-172 AC1): a cannot-provide decision gives the assigned Coordinator one
   * equipment_request_cannot_provide notice and nobody else any.
   * Kills: the cannot-provide path writing nothing or the reserved type.
   */
  it('EQUIP-REQ-NOTIF-01-F a cannot-provide decision gives the assigned Coordinator one notification', async () => {
    const w = await world();
    const bystander = await createUser('COORDINATOR');

    await cannotProvide(w.requestId, w.support).expect(200);

    expect(await noticesFor(w.coordinator, w.requestId)).toMatchObject([{ type: 'equipment_request_cannot_provide' }]);
    expect(await noticesFor(bystander, w.requestId)).toEqual([]);
    expect(await storedFor(w.requestId)).toHaveLength(1);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-02-E (SPM-172 AC2): the stored and returned text is exactly the specified sentence for each
   * decision (the cannot-provide reason is not in it), and the timestamp is the decision time.
   * Kills: different wording, the reason in the message, a created_at that is not the decision time.
   */
  it('EQUIP-REQ-NOTIF-02-E stores the specified wording and the decision time, and keeps the reason out of the text', async () => {
    const reserved = await world('SPM-172 Reserved Gala');
    const refused = await world('SPM-172 Refused Gala');

    await reserve(reserved.requestId, reserved.support).expect(200);
    await cannotProvide(refused.requestId, refused.support, 'Secret reason text').expect(200);

    const [reservedNotice] = await noticesFor(reserved.coordinator, reserved.requestId);
    const [refusedNotice] = await noticesFor(refused.coordinator, refused.requestId);
    expect(reservedNotice.message).toBe('Your equipment request for "SPM-172 Reserved Gala" has been reserved.');
    expect(refusedNotice.message).toBe('Your equipment request for "SPM-172 Refused Gala" cannot be provided.');
    expect(reservedNotice.createdAt).toBe(fixedNow.toISOString());
    expect(refusedNotice.createdAt).toBe(fixedNow.toISOString());
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-03-B (SPM-172 AC3): the feed's notice identifies the request it is about, and that request is the
   * one the Coordinator's "My Equipment Requests" list returns with the matching status (and, for cannot-provide, the
   * reason).
   * Kills: a link to another request, a feed without the request id.
   */
  it('EQUIP-REQ-NOTIF-03-B the notice carries the id of a request the Coordinator list shows with its status and reason', async () => {
    const w = await world();
    await cannotProvide(w.requestId, w.support, 'Only 8 available.').expect(200);

    const [notice] = await noticesFor(w.coordinator, w.requestId);
    const mine = (await request(baseUrl).get('/api/equipment/requests').set('Cookie', w.coordinator.cookie).expect(200)).body as Array<{ id: string; status: string; decisionReason?: string }>;

    expect(mine.find((item) => item.id === notice.relatedEquipmentRequestId)).toMatchObject({ status: 'Cannot Provide', decisionReason: 'Only 8 available.' });
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-04-B (SPM-172 AC4): a new notice is unread; the Coordinator marks it read through the read route;
   * another user cannot mark it read.
   * Kills: a notice stored as read, the read allow-list missing the type, a read route not scoped to the recipient.
   */
  it('EQUIP-REQ-NOTIF-04-B a new notice is unread and only its Coordinator can mark it read', async () => {
    const w = await world();
    const bystander = await createUser('COORDINATOR');
    await reserve(w.requestId, w.support).expect(200);
    const [notice] = await noticesFor(w.coordinator, w.requestId);
    expect(notice.read).toBe(false);

    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', bystander.cookie).expect(404);
    expect((await storedFor(w.requestId))[0].read).toBe(false);
    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', w.coordinator.cookie).expect(201);

    expect((await storedFor(w.requestId))[0].read).toBe(true);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-05-A (SPM-172 AC5, atomic): if the notice cannot be saved, the decision is rolled back with it, for
   * both decisions: the failure is reported (5xx), the request is still Pending Review with no decision reason, no
   * notice is stored, and Technical Support can decide again once the fault is gone.
   * Kills: a notice written outside the decision's transaction (the decision would commit without it).
   */
  it('EQUIP-REQ-NOTIF-05-A a notice that cannot be saved rolls the decision back', async () => {
    const w = await world();
    const statusOf = async () =>
      (await pool.query<{ status: string; decision_reason: string | null }>('SELECT status, decision_reason FROM equipment_requests WHERE id = $1', [w.requestId])).rows[0];
    await pool.query(`CREATE OR REPLACE FUNCTION spm172_block_notice() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'spm172 blocked'; END; $$ LANGUAGE plpgsql`);
    // Scoped to this test's own Coordinator (a fresh user id), so suites running in parallel are not affected.
    await pool.query(`CREATE TRIGGER spm172_block BEFORE INSERT ON notifications FOR EACH ROW WHEN (NEW.recipient_id = '${w.coordinator.id}') EXECUTE FUNCTION spm172_block_notice()`);
    try {
      const refusedReserve = await reserve(w.requestId, w.support);
      const refusedCannot = await cannotProvide(w.requestId, w.support);
      expect(refusedReserve.status).toBeGreaterThanOrEqual(500);
      expect(refusedCannot.status).toBeGreaterThanOrEqual(500);
      expect(await statusOf()).toEqual({ status: 'Pending Review', decision_reason: null });
      expect(await storedFor(w.requestId)).toEqual([]);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm172_block ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS spm172_block_notice()');
    }

    await reserve(w.requestId, w.support).expect(200);
    expect(await storedFor(w.requestId)).toHaveLength(1);
  });

  /**
   * EQUIP-REQ-NOTIF-05-B (SPM-172 AC5): a second reserve attempt on an already Reserved request is refused (409) and
   * adds no notice; a cannot-provide attempt on it is refused too.
   * Kills: a notice written on a refused repeat decision.
   */
  it('EQUIP-REQ-NOTIF-05-B a repeated decision on a decided request is refused and writes no second notice', async () => {
    const w = await world();
    await reserve(w.requestId, w.support).expect(200);

    await reserve(w.requestId, w.support).expect(409);
    await cannotProvide(w.requestId, w.support).expect(409);

    expect(await storedFor(w.requestId)).toHaveLength(1);
  });

  /**
   * EQUIP-REQ-NOTIF-05-C (SPM-172 AC5): after a decision the Coordinator edits the request (back to Pending Review) and
   * Technical Support decide again; the Coordinator then holds one notice per decision (a cannot-provide, then a
   * reserved), and the earlier notice is not rewritten.
   * Kills: de-duplicating by request so the second decision writes nothing, overwriting the first notice.
   */
  it('EQUIP-REQ-NOTIF-05-C an edit and a new decision give a new notice and keep the earlier one', async () => {
    const w = await world();
    await cannotProvide(w.requestId, w.support, 'Not enough stock.').expect(200);
    await editRequest(w);

    await reserve(w.requestId, w.support).expect(200);

    const stored = await storedFor(w.requestId);
    expect(stored.map((row) => row.type).sort()).toEqual(['equipment_request_cannot_provide', 'equipment_request_reserved']);
    expect(await noticesFor(w.coordinator, w.requestId)).toHaveLength(2);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /** Reassigns the event through the Lead's real API route. */
  async function reassign(eventId: string, from: TestUser, to: TestUser) {
    const lead = await createUser('COORDINATOR_LEAD');
    await request(baseUrl)
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: to.id, currentCoordinatorId: from.id })
      .expect(201);
  }

  /**
   * EQUIP-REQ-NOTIF-06-B (SPM-172 AC6): the event is reassigned before the decision; the new Coordinator receives the
   * notice and the previous one receives none.
   * Kills: addressing the notice to the Coordinator who submitted the request.
   */
  it('EQUIP-REQ-NOTIF-06-B sends the notification to the Coordinator assigned at decision time', async () => {
    const w = await world();
    const b = await createUser('COORDINATOR');
    await reassign(w.eventId, w.coordinator, b);

    await reserve(w.requestId, w.support).expect(200);

    expect(await noticesFor(b, w.requestId)).toMatchObject([{ type: 'equipment_request_reserved' }]);
    expect(await noticesFor(w.coordinator, w.requestId)).toEqual([]);
    expect((await storedFor(w.requestId)).map((row) => row.recipient_id)).toEqual([b.id]);
  });

  /**
   * EQUIP-REQ-NOTIF-06-C (SPM-172 AC6): when the event is reassigned, the previous Coordinator's unread equipment
   * decision notices for that event are marked read and the new Coordinator gets none of them. A notice of the previous
   * Coordinator for another event, and another user's notice for this event, stay unread.
   * Kills: leaving the old notices unread, clearing every notice of the recipient or another user's, moving them on.
   */
  it('EQUIP-REQ-NOTIF-06-C marks the previous Coordinator\'s unread equipment notices for the event read after a reassignment', async () => {
    const w = await world();
    const b = await createUser('COORDINATOR');
    const bystander = await createUser('COORDINATOR');
    const other = await world('SPM-172 Other event');
    // The other event belongs to the same previous Coordinator for the isolation check.
    await pool.query('UPDATE events SET coordinator_id = $2 WHERE id = $1', [other.eventId, w.coordinator.id]);
    await cannotProvide(w.requestId, w.support).expect(200);
    await reserve(other.requestId, other.support).expect(200);
    await pool.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_equipment_request_id)
       VALUES ($1, $2, 'equipment_request_reserved', 'SPM-172 bystander notice', $3, $4)`,
      [randomUUID(), bystander.id, w.eventId, w.requestId],
    );
    expect(await noticesFor(w.coordinator, w.requestId)).toMatchObject([{ read: false }]);

    await reassign(w.eventId, w.coordinator, b);

    expect(await noticesFor(w.coordinator, w.requestId)).toMatchObject([{ type: 'equipment_request_cannot_provide', read: true }]);
    expect(await noticesFor(w.coordinator, other.requestId)).toMatchObject([{ type: 'equipment_request_reserved', read: false }]);
    expect(await noticesFor(bystander, w.requestId)).toMatchObject([{ read: false }]);
    expect(await noticesFor(b, w.requestId)).toEqual([]);
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  /**
   * EQUIP-REQ-NOTIF-07-C (SPM-172 AC7): refused decisions write nothing: an unknown request (404), an event that is
   * Confirmed (409), a reservation without enough active stock (409; the units are under maintenance), a cannot-provide with no reason (400), and a
   * non-Technical-Support caller (403).
   * Kills: a notice written before a refusal check, or by a refused caller.
   */
  it('EQUIP-REQ-NOTIF-07-C refused decisions leave the notifications table unchanged', async () => {
    const confirmed = await world('SPM-172 Confirmed');
    await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [confirmed.eventId]);
    const short = await world('SPM-172 Short stock', 0);
    const plain = await world('SPM-172 Plain');
    const outsider = await createUser('ORGANISER');
    const count = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications')).rows[0].n;
    const before = await count();

    await reserve(randomUUID(), plain.support).expect(404);
    await reserve(confirmed.requestId, confirmed.support).expect(409);
    await cannotProvide(confirmed.requestId, confirmed.support).expect(409);
    await reserve(short.requestId, short.support).expect(409);
    await cannotProvide(plain.requestId, plain.support, '   ').expect(400);
    await reserve(plain.requestId, outsider).expect(403);
    await cannotProvide(plain.requestId, outsider).expect(403);

    expect(await count()).toBe(before);
  });
});
