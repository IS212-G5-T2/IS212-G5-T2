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
 * SPM-94 Track My Event Status (Organiser). Real Nest pipeline, real PostgreSQL.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 017 applied.
 *
 * Test cases: TRACK-EVENT-STATUS-01-A, 01-B, 01-C, 02-A, 02-B, 03-A, 03-B, 03-C, 04-A.
 * 04-B (A, B, C) is a browser-side store and remount behaviour and lives in the frontend tests.
 *
 * Oracles are literals from the SPM-94 AC text and the Decision Register (D3, D5, D6). The status vocabulary is the one
 * the events table stores; "Under Review" does not exist there, so the non-Submitted case uses Approved (see results doc).
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-94 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const PASSWORD = 'password123';

describe.skipIf(!database)('SPM-94 Track My Event Status (organiser, e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  async function seedEvent(options: {
    organiserId: string;
    name: string;
    status?: string;
    coordinatorId?: string | null;
    safety?: 'pending' | 'changes_needed' | 'approved';
  }): Promise<string> {
    const eventId = randomUUID();
    const coordinatorName = options.coordinatorId ? 'SPM94 Coordinator' : null;
    await pool.query(
      `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name,
        attachments, status, submission_key, rejection_reason)
       VALUES ($1,$2,'SPM94 Organiser','organiser@example.test',$3,'Testing',
        '', now() + interval '1 day', now() + interval '1 day 2 hours', 50, $4, $5,
        '[]', $6, $1, $7)`,
      [
        eventId,
        options.organiserId,
        options.name,
        options.coordinatorId ?? null,
        coordinatorName,
        options.status ?? 'Submitted',
        // events_rejection_reason_check requires a reason of 10 to 500 characters on a Rejected event.
        options.status === 'Rejected' ? 'Not suitable for this venue' : null,
      ],
    );
    if (options.safety) {
      await pool.query(
        `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by)
         VALUES ($1, $2, now(), 'SPM94 Coordinator')`,
        [eventId, options.safety],
      );
    }
    createdEventIds.push(eventId);
    return eventId;
  }

  async function createDatabaseUser(role: string, name: string): Promise<{ uid: string; cookie: string }> {
    const email = `spm94-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id`,
      [email, name, PASSWORD],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [uid, role],
    );
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    const cookie = response.headers['set-cookie']?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  type Listed = { id: string; name: string; status: string; awaitingCoordinatorAssignment: boolean; safetyIndicator: string | null };

  async function listFor(cookie: string, query = '') {
    return request(app.getHttpServer()).get(`/api/events${query}`).set('Cookie', cookie).expect(200);
  }

  async function detailFor(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie);
  }

  // TRACK-EVENT-STATUS-01-A (AC1): the organiser's list holds their own events, with the scope taken from the token.
  it('TRACK-EVENT-STATUS-01-A: the list holds only the caller\'s events, whatever the mine parameter says', async () => {
    // Arrange: two organisers, each with events. ORG-A owns three; ORG-B owns one.
    const orgA = await createDatabaseUser('ORGANISER', 'SPM94 Organiser A');
    const orgB = await createDatabaseUser('ORGANISER', 'SPM94 Organiser B');
    const a1 = await seedEvent({ organiserId: orgA.uid, name: 'A Submitted', status: 'Submitted' });
    const a2 = await seedEvent({ organiserId: orgA.uid, name: 'A Planning', status: 'Planning' });
    const a3 = await seedEvent({ organiserId: orgA.uid, name: 'A Approved', status: 'Approved' });
    const bOnly = await seedEvent({ organiserId: orgB.uid, name: 'B Submitted', status: 'Submitted' });

    // Act: the same token with mine=true, no parameter, and mine=false.
    const mine = await listFor(orgA.cookie, '?mine=true');
    const plain = await listFor(orgA.cookie);
    const notMine = await listFor(orgA.cookie, '?mine=false');

    // Assert: exactly ORG-A's three events, by id and status, in every form.
    const expected = [a1, a2, a3].sort();
    for (const body of [mine.body, plain.body, notMine.body] as Listed[][]) {
      expect(body.map((e) => e.id).sort()).toEqual(expected);
    }
    expect(mine.body.find((e: Listed) => e.id === a1)?.status).toBe('submitted');
    expect(mine.body.find((e: Listed) => e.id === a2)?.status).toBe('planning');
    expect(mine.body.find((e: Listed) => e.id === bOnly)).toBeUndefined();
  });

  // TRACK-EVENT-STATUS-01-B (AC1): the list and the planning (detail) page read one status and show the same value.
  it('TRACK-EVENT-STATUS-01-B: the list row and the detail show the same status for the same event', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const eventIds = [
      await seedEvent({ organiserId: org.uid, name: 'B1', status: 'Submitted' }),
      await seedEvent({ organiserId: org.uid, name: 'B2', status: 'Planning', coordinatorId: null }),
      await seedEvent({ organiserId: org.uid, name: 'B3', status: 'Confirmed' }),
    ];

    const list = await listFor(org.cookie);
    for (const id of eventIds) {
      const row = list.body.find((e: Listed) => e.id === id);
      const detail = await detailFor(org.cookie, id);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe(row.status);
    }
  });

  // TRACK-EVENT-STATUS-01-C (AC1, D6): another organiser's event is 403 with no event data; no token is 401.
  it('TRACK-EVENT-STATUS-01-C: another organiser gets 403 with no data; no token gets 401', async () => {
    const owner = await createDatabaseUser('ORGANISER', 'SPM94 Owner');
    const other = await createDatabaseUser('ORGANISER', 'SPM94 Other');
    const eventId = await seedEvent({ organiserId: owner.uid, name: 'Private Gala', status: 'Submitted' });

    // A: not in the other organiser's list.
    const otherList = await listFor(other.cookie);
    expect(otherList.body.find((e: Listed) => e.id === eventId)).toBeUndefined();

    // B: direct access to the detail is refused with no event data (Decision Register D6).
    const refused = await detailFor(other.cookie, eventId);
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).not.toContain('Private Gala');
    expect(JSON.stringify(refused.body)).not.toContain(owner.uid);

    // C: no token is 401 on the list and the detail.
    await request(app.getHttpServer()).get('/api/events').expect(401);
    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(401);
  });

  // TRACK-EVENT-STATUS-02-A (AC2): an unassigned Submitted event shows awaiting assignment; assigned or non-Submitted does not.
  it('TRACK-EVENT-STATUS-02-A: awaiting Coordinator assignment only for an unassigned Submitted event', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const unassigned = await seedEvent({ organiserId: org.uid, name: 'Unassigned', status: 'Submitted' });
    const approved = await seedEvent({ organiserId: org.uid, name: 'Approved', status: 'Approved' });
    const rejected = await seedEvent({ organiserId: org.uid, name: 'Rejected', status: 'Rejected' });

    const list = await listFor(org.cookie);
    const byId = (id: string) => list.body.find((e: Listed) => e.id === id);
    expect(byId(unassigned)).toMatchObject({ awaitingCoordinatorAssignment: true });
    expect(byId(approved)).toMatchObject({ awaitingCoordinatorAssignment: false });
    expect(byId(rejected)).toMatchObject({ awaitingCoordinatorAssignment: false });
    expect((await detailFor(org.cookie, unassigned)).body.awaitingCoordinatorAssignment).toBe(true);
  });

  // TRACK-EVENT-STATUS-02-B (AC2): the Lead's assignment clears the indicator on the list and the detail.
  // D11: assignment does not change the status, so the status stays Submitted (the document's "Under Review" is not a stored status).
  it('TRACK-EVENT-STATUS-02-B: the Lead assigning the event clears the indicator for the organiser', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'SPM94 Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'SPM94 Coordinator');
    const eventId = await seedEvent({ organiserId: org.uid, name: 'To Assign', status: 'Submitted' });

    expect((await listFor(org.cookie)).body.find((e: Listed) => e.id === eventId)).toMatchObject({
      awaitingCoordinatorAssignment: true,
    });

    await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.uid })
      .expect(201);

    const list = await listFor(org.cookie);
    expect(list.body.find((e: Listed) => e.id === eventId)).toMatchObject({
      status: 'submitted',
      awaitingCoordinatorAssignment: false,
    });
    expect((await detailFor(org.cookie, eventId)).body).toMatchObject({ awaitingCoordinatorAssignment: false });
  });

  // TRACK-EVENT-STATUS-03-A (AC3): a pending safety check on a Planning event shows AWAITING_CHECK; no record shows none.
  it('TRACK-EVENT-STATUS-03-A: a pending safety check shows AWAITING_CHECK; an event without a record shows none', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const pending = await seedEvent({ organiserId: org.uid, name: 'Pending Safety', status: 'Planning', coordinatorId: null, safety: 'pending' });
    const none = await seedEvent({ organiserId: org.uid, name: 'No Safety', status: 'Planning', coordinatorId: null });

    const list = await listFor(org.cookie);
    const byId = (id: string) => list.body.find((e: Listed) => e.id === id);
    expect(byId(pending)).toMatchObject({ safetyIndicator: 'AWAITING_CHECK' });
    expect(byId(none)).toMatchObject({ safetyIndicator: null });
    expect((await detailFor(org.cookie, pending)).body).toMatchObject({ safetyIndicator: 'AWAITING_CHECK' });
  });

  // TRACK-EVENT-STATUS-03-B (AC3): exactly one safety indicator, from the state; terminal events show none (D5).
  it('TRACK-EVENT-STATUS-03-B: each safety state gives exactly its own indicator, and a terminal event shows none', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const changes = await seedEvent({ organiserId: org.uid, name: 'Changes', status: 'Planning', coordinatorId: null, safety: 'changes_needed' });
    const cleared = await seedEvent({ organiserId: org.uid, name: 'Cleared', status: 'Confirmed', coordinatorId: null, safety: 'approved' });
    const cancelled = await seedEvent({ organiserId: org.uid, name: 'Cancelled', status: 'Cancelled', coordinatorId: null, safety: 'approved' });

    const list = await listFor(org.cookie);
    const byId = (id: string) => list.body.find((e: Listed) => e.id === id);
    expect(byId(changes).safetyIndicator).toBe('CHANGES_REQUESTED');
    expect(byId(cleared).safetyIndicator).toBe('CLEARED');
    expect(byId(cancelled).safetyIndicator).toBeNull();
  });

  // TRACK-EVENT-STATUS-03-C (AC3): after the Safety Officer responds, the awaiting indicator is replaced by the response indicator.
  // Stored event status after changes are requested is not asserted (document F3: Unknown).
  it('TRACK-EVENT-STATUS-03-C: the awaiting indicator is gone once the Safety Officer responds', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const approvedClone = await seedEvent({ organiserId: org.uid, name: 'Clone Approve', status: 'Planning', coordinatorId: null, safety: 'pending' });
    const changesClone = await seedEvent({ organiserId: org.uid, name: 'Clone Changes', status: 'Planning', coordinatorId: null, safety: 'pending' });

    // The Safety Officer's response is written to the safety record (the source the port reads).
    await pool.query("UPDATE event_safety_checks SET status = 'approved', approver_name = 'SAF-01', decided_at = now() WHERE event_id = $1", [approvedClone]);
    await pool.query("UPDATE event_safety_checks SET status = 'changes_needed', approver_name = 'SAF-01', decided_at = now() WHERE event_id = $1", [changesClone]);

    const list = await listFor(org.cookie);
    const byId = (id: string) => list.body.find((e: Listed) => e.id === id);
    expect(byId(approvedClone)).toMatchObject({ safetyIndicator: 'CLEARED' });
    expect(byId(changesClone)).toMatchObject({ safetyIndicator: 'CHANGES_REQUESTED' });
    expect(byId(approvedClone).safetyIndicator).not.toBe('AWAITING_CHECK');
    expect(byId(changesClone).safetyIndicator).not.toBe('AWAITING_CHECK');
  });

  // TRACK-EVENT-STATUS-04-A (AC4): the status is fresh after a change; both GET responses carry no-store.
  it('TRACK-EVENT-STATUS-04-A: after the coordinator approves, the organiser sees Approved and nothing is cached', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'SPM94 Coordinator');
    const eventId = await seedEvent({ organiserId: org.uid, name: 'Fresh Status', status: 'Submitted', coordinatorId: coordinator.uid });

    // Before: the organiser reads Submitted.
    const before = await listFor(org.cookie);
    expect(before.body.find((e: Listed) => e.id === eventId)).toMatchObject({ status: 'submitted' });

    // Act: the assigned coordinator approves through the existing approval path.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .expect(201);

    // Assert: the next visit shows Approved on the list and the detail, and both responses are no-store.
    const after = await request(app.getHttpServer()).get('/api/events').set('Cookie', org.cookie).expect(200);
    expect(after.headers['cache-control']).toBe('no-store');
    expect(after.body.find((e: Listed) => e.id === eventId)).toMatchObject({ status: 'approved' });

    const detail = await detailFor(org.cookie, eventId);
    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.body.status).toBe('approved');
  });
});
