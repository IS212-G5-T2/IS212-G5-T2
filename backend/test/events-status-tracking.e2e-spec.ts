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
 * Oracles are literals from the SPM-94 AC text and the Decision Register (D3, D5, D6), never from the
 * implementation. "Under Review" is not a stored status (the events table CHECK), so the non-Submitted
 * case uses Approved (ASSUMPTION A1).
 *
 * ASSUMPTION index
 * A1: "Under Review" is not stored; Approved stands in for the non-Submitted case -> 02-A, 01-A
 * A5: a coordinator assignment does not change the status (D11) -> 02-B
 * A4: the refusal message for another organiser's event is the service's literal -> 01-C
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-94 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const PASSWORD = 'password123';
// A4: the literal message the service returns when an organiser asks for another organiser's event (D6).
const OTHER_ORGANISER_MESSAGE = 'You can only view your own events.';

describe.skipIf(!database)('SPM-94 Track My Event Status (organiser, e2e)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let createdEventIds: string[];
  let createdUserIds: string[];
  let createdDraftIds: string[];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    createdEventIds = [];
    createdUserIds = [];
    createdDraftIds = [];
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (createdEventIds.length) {
      await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    }
    if (createdDraftIds.length) {
      await pool.query('DELETE FROM event_drafts WHERE id = ANY($1::uuid[])', [createdDraftIds]);
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
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a PostgreSQL authentication session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  type Listed = {
    id: string;
    name: string;
    status: string;
    awaitingCoordinatorAssignment: boolean;
    safetyIndicator: string | null;
  };

  async function listFor(cookie: string, query = '') {
    return request(app.getHttpServer()).get(`/api/events${query}`).set('Cookie', cookie).expect(200);
  }

  async function detailFor(cookie: string, id: string) {
    return request(app.getHttpServer()).get(`/api/events/${id}`).set('Cookie', cookie);
  }

  // TRACK-EVENT-STATUS-01-A (AC1): the organiser's list holds their own events, scoped from the token.
  // Kills: M1 (scope taken from the mine parameter), M2 (owner filter removed); Draft rows are not in the events list (see the drafts section).
  it("TRACK-EVENT-STATUS-01-A: the list holds only the caller's events, whatever the mine parameter says", async () => {
    // Arrange: ORG-A owns three events; ORG-B owns one that must never appear.
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

    // Assert: exactly ORG-A's three events in every form, each with every output field.
    const expected = [
      { id: a1, name: 'A Submitted', status: 'submitted', awaitingCoordinatorAssignment: true, safetyIndicator: null },
      { id: a2, name: 'A Planning', status: 'planning', awaitingCoordinatorAssignment: false, safetyIndicator: null },
      { id: a3, name: 'A Approved', status: 'approved', awaitingCoordinatorAssignment: false, safetyIndicator: null },
    ];
    const byIdAsc = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : 1);
    const sortedExpected = [...expected].sort(byIdAsc);
    for (const body of [mine.body, plain.body, notMine.body] as Listed[][]) {
      expect(body.length).toBe(sortedExpected.length);
      [...body].sort(byIdAsc).forEach((row, i) => expect(row).toMatchObject(sortedExpected[i]));
    }
    expect((mine.body as Listed[]).find((e) => e.id === bOnly)).toBeUndefined();
  });

  // TRACK-EVENT-STATUS-01-B (AC1): the list row and the planning (detail) page show the same literal status.
  // Kills: M11 (list and page read different sources), status casing drift.
  it('TRACK-EVENT-STATUS-01-B: the list row and the detail show the same status for the same event', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const submitted = await seedEvent({ organiserId: org.uid, name: 'B1', status: 'Submitted' });
    const planning = await seedEvent({ organiserId: org.uid, name: 'B2', status: 'Planning' });
    const confirmed = await seedEvent({ organiserId: org.uid, name: 'B3', status: 'Confirmed' });

    const list = (await listFor(org.cookie)).body as Listed[];
    const literals: Array<[string, string]> = [
      [submitted, 'submitted'],
      [planning, 'planning'],
      [confirmed, 'confirmed'],
    ];
    for (const [id, status] of literals) {
      const detail = await detailFor(org.cookie, id);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe(status);
      expect(list.find((e) => e.id === id)?.status).toBe(status);
    }
  });

  // TRACK-EVENT-STATUS-01-C (AC1, D6): another organiser's event is 403 with the literal message and no event data; no token is 401.
  // Kills: M3 (detail route without owner check), M2 (owner filter removed from the list).
  it('TRACK-EVENT-STATUS-01-C: another organiser gets 403 with the literal message and no data; no token gets 401', async () => {
    const owner = await createDatabaseUser('ORGANISER', 'SPM94 Owner');
    const other = await createDatabaseUser('ORGANISER', 'SPM94 Other');
    const eventId = await seedEvent({ organiserId: owner.uid, name: 'Private Gala', status: 'Submitted' });

    // A: not in the other organiser's list.
    const otherList = await listFor(other.cookie);
    expect((otherList.body as Listed[]).find((e) => e.id === eventId)).toBeUndefined();

    // B: direct access to the detail is refused with the literal message and no event data.
    const refused = await detailFor(other.cookie, eventId);
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe(OTHER_ORGANISER_MESSAGE);
    expect(JSON.stringify(refused.body)).not.toContain('Private Gala');
    expect(JSON.stringify(refused.body)).not.toContain(owner.uid);

    // C: no token is 401 on the list and the detail.
    await request(app.getHttpServer()).get('/api/events').expect(401);
    await request(app.getHttpServer()).get(`/api/events/${eventId}`).expect(401);
  });

  // TRACK-EVENT-STATUS-02-A (AC2): an unassigned Submitted event shows awaiting assignment; assigned or non-Submitted does not.
  // Kills: M6 (indicator on any unassigned event), M7 (indicator persists after assignment).
  it('TRACK-EVENT-STATUS-02-A: awaiting Coordinator assignment only for an unassigned Submitted event', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const unassigned = await seedEvent({ organiserId: org.uid, name: 'Unassigned', status: 'Submitted' });
    const approved = await seedEvent({ organiserId: org.uid, name: 'Approved', status: 'Approved' });
    const rejected = await seedEvent({ organiserId: org.uid, name: 'Rejected', status: 'Rejected' });

    const list = (await listFor(org.cookie)).body as Listed[];
    expect(list.find((e) => e.id === unassigned)).toMatchObject({ awaitingCoordinatorAssignment: true });
    expect(list.find((e) => e.id === approved)).toMatchObject({ awaitingCoordinatorAssignment: false });
    expect(list.find((e) => e.id === rejected)).toMatchObject({ awaitingCoordinatorAssignment: false });
    expect(list.find((e) => e.id === rejected)).toMatchObject({ status: 'rejected' });
    expect((await detailFor(org.cookie, unassigned)).body).toMatchObject({ awaitingCoordinatorAssignment: true });
  });

  // TRACK-EVENT-STATUS-02-B (AC2): the Lead's assignment clears the indicator on the list and the detail.
  // Kills: M7 (indicator persists after assignment). Oracle A5 (D11): the status stays Submitted.
  it('TRACK-EVENT-STATUS-02-B: the Lead assigning the event clears the indicator for the organiser', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const lead = await createDatabaseUser('COORDINATOR_LEAD', 'SPM94 Lead');
    const coordinator = await createDatabaseUser('COORDINATOR', 'SPM94 Coordinator');
    const eventId = await seedEvent({ organiserId: org.uid, name: 'To Assign', status: 'Submitted' });

    expect(((await listFor(org.cookie)).body as Listed[]).find((e) => e.id === eventId)).toMatchObject({
      awaitingCoordinatorAssignment: true,
    });

    await request(app.getHttpServer())
      .post(`/api/lead/queue/${eventId}/assign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: coordinator.uid })
      .expect(201);

    const list = (await listFor(org.cookie)).body as Listed[];
    expect(list.find((e) => e.id === eventId)).toMatchObject({
      status: 'submitted',
      awaitingCoordinatorAssignment: false,
    });
    expect((await detailFor(org.cookie, eventId)).body).toMatchObject({
      status: 'submitted',
      awaitingCoordinatorAssignment: false,
    });
  });

  // TRACK-EVENT-STATUS-03-A (AC3): a pending safety check on a Planning event shows AWAITING_CHECK; no record shows none.
  // Kills: M8 (safety mapping swapped), no-record case shows a guess.
  it('TRACK-EVENT-STATUS-03-A: a pending safety check shows AWAITING_CHECK; an event without a record shows none', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const pending = await seedEvent({ organiserId: org.uid, name: 'Pending Safety', status: 'Planning', coordinatorId: null, safety: 'pending' });
    const none = await seedEvent({ organiserId: org.uid, name: 'No Safety', status: 'Planning', coordinatorId: null });

    const list = (await listFor(org.cookie)).body as Listed[];
    expect(list.find((e) => e.id === pending)).toMatchObject({ safetyIndicator: 'AWAITING_CHECK' });
    expect(list.find((e) => e.id === none)).toMatchObject({ safetyIndicator: null });
    expect((await detailFor(org.cookie, pending)).body).toMatchObject({ safetyIndicator: 'AWAITING_CHECK' });
  });

  // TRACK-EVENT-STATUS-03-B (AC3): each safety state gives exactly its own indicator; a terminal event shows none (D5).
  // Kills: M8 (changes requested and cleared swapped). M9 (two indicators at once) is checked at component level, not here: the API holds one value.
  it('TRACK-EVENT-STATUS-03-B: each safety state gives exactly its own indicator, and a terminal event shows none', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const changes = await seedEvent({ organiserId: org.uid, name: 'Changes', status: 'Planning', coordinatorId: null, safety: 'changes_needed' });
    const cleared = await seedEvent({ organiserId: org.uid, name: 'Cleared', status: 'Confirmed', coordinatorId: null, safety: 'approved' });
    const cancelled = await seedEvent({ organiserId: org.uid, name: 'Cancelled', status: 'Cancelled', coordinatorId: null, safety: 'approved' });

    const list = (await listFor(org.cookie)).body as Listed[];
    expect(list.find((e) => e.id === changes)).toMatchObject({ safetyIndicator: 'CHANGES_REQUESTED' });
    expect(list.find((e) => e.id === cleared)).toMatchObject({ safetyIndicator: 'CLEARED' });
    expect(list.find((e) => e.id === cancelled)).toMatchObject({ safetyIndicator: null });
    expect(list.find((e) => e.id === cancelled)).toMatchObject({ status: 'cancelled' });
  });

  // TRACK-EVENT-STATUS-03-C (AC3): once the Safety Officer responds, the awaiting indicator is replaced.
  // Kills: awaiting indicator kept after a Safety Officer response (no spec mutant id). The stored status after changes are requested is not asserted (F3: Unknown).
  it('TRACK-EVENT-STATUS-03-C: the awaiting indicator is gone once the Safety Officer responds', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const approvedClone = await seedEvent({ organiserId: org.uid, name: 'Clone Approve', status: 'Planning', coordinatorId: null, safety: 'pending' });
    const changesClone = await seedEvent({ organiserId: org.uid, name: 'Clone Changes', status: 'Planning', coordinatorId: null, safety: 'pending' });

    // The Safety Officer's response is written to the safety record (the source the indicator reads).
    await pool.query("UPDATE event_safety_checks SET status = 'approved', approver_name = 'SAF-01', decided_at = now() WHERE event_id = $1", [approvedClone]);
    await pool.query("UPDATE event_safety_checks SET status = 'changes_needed', approver_name = 'SAF-01', decided_at = now() WHERE event_id = $1", [changesClone]);

    const list = (await listFor(org.cookie)).body as Listed[];
    expect(list.find((e) => e.id === approvedClone)).toMatchObject({ safetyIndicator: 'CLEARED' });
    expect(list.find((e) => e.id === changesClone)).toMatchObject({ safetyIndicator: 'CHANGES_REQUESTED' });
  });

  // TRACK-EVENT-STATUS-04-A (AC4): after the coordinator approves, the organiser sees Approved; both GET responses are no-store.
  // Kills: M4 (stale status), M5 (Cache-Control removed from the list).
  it('TRACK-EVENT-STATUS-04-A: after the coordinator approves, the organiser sees Approved and nothing is cached', async () => {
    const org = await createDatabaseUser('ORGANISER', 'SPM94 Organiser');
    const coordinator = await createDatabaseUser('COORDINATOR', 'SPM94 Coordinator');
    const eventId = await seedEvent({ organiserId: org.uid, name: 'Fresh Status', status: 'Submitted', coordinatorId: coordinator.uid });

    // Before: the organiser reads Submitted.
    expect(((await listFor(org.cookie)).body as Listed[]).find((e) => e.id === eventId)).toMatchObject({ status: 'submitted' });

    // Act: the assigned coordinator approves through the existing approval path.
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/approve`)
      .set('Cookie', coordinator.cookie)
      .expect(201);

    // Assert: the next visit shows Approved on the list and the detail, and both responses are no-store.
    const after = await request(app.getHttpServer()).get('/api/events').set('Cookie', org.cookie).expect(200);
    expect(after.headers['cache-control']).toBe('no-store');
    expect((after.body as Listed[]).find((e) => e.id === eventId)).toMatchObject({ status: 'approved' });

    const detail = await detailFor(org.cookie, eventId);
    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.body.status).toBe('approved');
  });

  // TRACK-EVENT-STATUS-01-A (matrix fixture): EVT-501 to EVT-506 and EVT-508 for ORG-01, EVT-507 for ORG-02.
  // Matrix rows: Submitted, Under Review, Planning, Planning, Confirmed, Rejected, Draft.
  // Under Review is not a stored status, so EVT-502 is seeded Approved (ASSUMPTION A1, see the spec-conflict register).
  // Draft EVT-508 is read from the drafts API and shown in its own section (owner decision, see the spec-conflict register).
  // Kills: M2 (owner filter removed: EVT-507 would appear), status drift on any row, a draft merged into the event rows.
  it('TRACK-EVENT-STATUS-01-A (matrix fixture): six events and one draft for ORG-01; EVT-507 absent', async () => {
    // Arrange: the seven matrix rows, plus ORG-02's EVT-507.
    const org1 = await createDatabaseUser('ORGANISER', 'SPM94 Organiser One');
    const org2 = await createDatabaseUser('ORGANISER', 'SPM94 Organiser Two');
    const coordinator = await createDatabaseUser('COORDINATOR', 'SPM94 Coordinator One');
    const evt501 = await seedEvent({ organiserId: org1.uid, name: 'EVT-501 Student Mixer', status: 'Submitted' });
    const evt502 = await seedEvent({ organiserId: org1.uid, name: 'EVT-502 Charity Bazaar', status: 'Approved', coordinatorId: coordinator.uid });
    const evt503 = await seedEvent({ organiserId: org1.uid, name: 'EVT-503 Tech Showcase', status: 'Planning', coordinatorId: coordinator.uid, safety: 'pending' });
    const evt504 = await seedEvent({ organiserId: org1.uid, name: 'EVT-504 Sports Day', status: 'Planning', coordinatorId: coordinator.uid, safety: 'changes_needed' });
    const evt505 = await seedEvent({ organiserId: org1.uid, name: 'EVT-505 Orientation Talk', status: 'Confirmed', coordinatorId: coordinator.uid, safety: 'approved' });
    const evt506 = await seedEvent({ organiserId: org1.uid, name: 'EVT-506 Late Request', status: 'Rejected' });
    const evt507 = await seedEvent({ organiserId: org2.uid, name: 'EVT-507 Poetry Night', status: 'Submitted' });
    const draftId = randomUUID();
    await pool.query(
      `INSERT INTO event_drafts (id, organiser_id, fields, status, version)
       VALUES ($1, $2, $3, 'Draft', 1)`,
      [draftId, org1.uid, JSON.stringify({ name: 'EVT-508 Draft Concert', purpose: 'Concert', description: '' })],
    );
    createdDraftIds.push(draftId);

    // Act: the organiser's event list (mine=true, plain) and the drafts list.
    const list = (await listFor(org1.cookie, '?mine=true')).body as Listed[];
    const plain = (await listFor(org1.cookie)).body as Listed[];
    const drafts = (await request(app.getHttpServer()).get('/api/requests').set('Cookie', org1.cookie).expect(200)).body as Array<{ id: string; fields: { name: string }; status: string }>;

    // Assert: six event rows with the literal statuses, in both forms of the list.
    const expected = [
      { id: evt501, name: 'EVT-501 Student Mixer', status: 'submitted', awaitingCoordinatorAssignment: true },
      { id: evt502, name: 'EVT-502 Charity Bazaar', status: 'approved', awaitingCoordinatorAssignment: false },
      { id: evt503, name: 'EVT-503 Tech Showcase', status: 'planning', safetyIndicator: 'AWAITING_CHECK' },
      { id: evt504, name: 'EVT-504 Sports Day', status: 'planning', safetyIndicator: 'CHANGES_REQUESTED' },
      { id: evt505, name: 'EVT-505 Orientation Talk', status: 'confirmed', safetyIndicator: 'CLEARED' },
      { id: evt506, name: 'EVT-506 Late Request', status: 'rejected' },
    ];
    expect(list.map((e) => e.id).sort()).toEqual(expected.map((e) => e.id).sort());
    expect(plain.map((e) => e.id).sort()).toEqual(expected.map((e) => e.id).sort());
    const byId = new Map(list.map((e) => [e.id, e]));
    for (const row of expected) expect(byId.get(row.id)).toMatchObject(row);

    // Assert: the draft is in the drafts list (EVT-508), not in the event rows; EVT-507 is in neither.
    expect(drafts.map((d) => ({ id: d.id, name: d.fields.name, status: d.status }))).toEqual([
      { id: draftId, name: 'EVT-508 Draft Concert', status: 'Draft' },
    ]);
    expect(list.find((e) => e.id === draftId)).toBeUndefined();
    expect(list.find((e) => e.id === evt507)).toBeUndefined();
    expect(drafts.find((d) => d.id === evt507)).toBeUndefined();
    expect(list.length + drafts.length).toBe(7);
  });
});

