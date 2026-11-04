/*
 * SPM-171 Event Cancellation Request Notification (Coordinator), over HTTP against real PostgreSQL. The Organiser submits
 * a cancellation request (SPM-155) and the assigned Coordinator receives one notice in the bell feed; a request made
 * before assignment reaches the Coordinator assigned later, and reassignment moves it. Every user signs in through the
 * real login route; the clock is the injected CLOCK frozen at T0. Events, requests and notifications are rows in PostgreSQL.
 *
 * Story: SPM-171. Test cases: CANCEL-REQ-NOTIF-01-C, 01-SEC-1, 02-E, 03-D, 04-E, 05-A, 05-B, 06-H, 06-I, 06-J, 07-C,
 * 07-D.
 * Messages and types are literal copies of the Jira wording; this file never imports the production message module.
 * Runs against TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init applied. Skipped locally when neither
 * is set; in CI a missing database fails the run.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI) throw new Error('SPM-171 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');
if (database && !process.env.DATABASE_URL) process.env.DATABASE_URL = database;

const T0 = '2026-11-02T08:30:00.000Z';
const SLOT_START = '2026-12-05T02:00:00.000Z';
const SLOT_END = '2026-12-05T04:00:00.000Z';
const SUBMITTED = 'cancellation_request_submitted';
const EVENT_NAME = 'Autumn Gala';

type Session = { uid: string; cookie: string };
type FeedItem = { id: string; type: string; message: string; relatedEventId: string | null; audienceRole: string; read: boolean; createdAt: string };
type Stored = { recipient_id: string; type: string; message: string; read: boolean; created_at: Date };

describe.skipIf(!database)('SPM-171 cancellation request submitted notifications over HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let pool: pg.Pool;
  let eventIds: string[];
  let userIds: string[];
  let org: Session;
  let otherOrg: Session;
  let coo: Session;
  let otherCoo: Session;
  let lead: Session;
  let att: Session;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    eventIds = [];
    userIds = [];
    await buildApp();
    org = await createSession('ORGANISER');
    otherOrg = await createSession('ORGANISER');
    coo = await createSession('COORDINATOR');
    otherCoo = await createSession('COORDINATOR');
    lead = await createSession('COORDINATOR_LEAD');
    att = await createSession('ATTENDEE');
  });
  afterEach(async () => {
    await closeApp();
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [userIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
  });

  // ---- fixtures ----------------------------------------------------------------------------------------------------

  async function closeApp() {
    if (app) await app.close();
    app = undefined;
  }

  async function buildApp() {
    await closeApp();
    const builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue({ now: () => new Date(T0) });
    app = (await builder.compile()).createNestApplication();
    await app.init();
    // Bound to 127.0.0.1 so supertest cannot reach another local listener.
    await app.listen(0, '127.0.0.1');
  }

  const http = () => {
    if (!app) throw new Error('The test application is not running.');
    return request(app.getHttpServer());
  };
  const as = <T extends request.Test>(req: T, session: Session): T => req.set('Cookie', session.cookie) as T;
  const postRequest = (session: Session, eventId: string, body: object = { reason: 'No longer needed' }) =>
    as(http().post(`/api/events/${eventId}/cancellation-requests`), session).send(body);
  const decide = (session: Session, requestId: string, body: unknown) =>
    as(http().post(`/api/cancellation-requests/${requestId}/decision`), session).send(body as object);
  const assign = (session: Session, eventId: string, to: Session) =>
    as(http().post(`/api/lead/queue/${eventId}/assign`), session).send({ coordinatorId: to.uid });
  const reassign = (session: Session, eventId: string, to: Session, current: Session) =>
    as(http().post(`/api/lead/events/${eventId}/reassign`), session).send({ coordinatorId: to.uid, currentCoordinatorId: current.uid });
  const feed = async (session: Session) => (await as(http().get('/api/notifications'), session).expect(200)).body as FeedItem[];
  const markRead = (session: Session, id: string) => as(http().post(`/api/notifications/${id}/read`), session);
  const requestNotices = async (session: Session) => (await feed(session)).filter((n) => n.type === SUBMITTED);

  async function createSession(role: string): Promise<Session> {
    const email = `e2e-cancel-notif-${randomUUID()}@example.com`;
    const client = await pool.connect();
    let uid!: string;
    try {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
        [email, `SPM-171 ${role}`],
      );
      uid = created.rows[0].id;
      userIds.push(uid);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    } finally {
      client.release();
    }
    return { uid, cookie: await loginCookie(email) };
  }

  async function loginCookie(email: string) {
    const attempt = await http().post('/api/auth/login').send({ email, password: 'password123' });
    if (attempt.status !== 201) throw new Error(`login returned ${attempt.status}`);
    const cookie = (attempt.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return cookie.split(';', 1)[0];
  }

  /** A Confirmed event owned by `org`, assigned to `coo`, with one Registered attendee. */
  async function seedEvent(status = 'Confirmed', assigned: Session | null = coo) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',$4,$5,80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',$6,$7,$9,$8)`,
      [id, org.uid, EVENT_NAME, SLOT_START, SLOT_END, status, assigned?.uid ?? null, randomUUID(), assigned ? 'Coordinator' : null],
    );
    eventIds.push(id);
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email) VALUES ($1, $2, 'Registered', 'Attendee', 'attendee@example.test')`,
      [id, att.uid],
    );
    return id;
  }

  const stored = async (eventId: string) =>
    (await pool.query<Stored>('SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_event_id = $1 ORDER BY recipient_id, type', [eventId])).rows;
  const storedFor = async (eventId: string, uid: string) => (await stored(eventId)).filter((row) => row.recipient_id === uid);

  // ---- AC1 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-01-C (SPM-171 AC1): the Organiser submits; the assigned Coordinator's feed holds exactly one
   * notice, typed submitted, for that event, labelled a Coordinator notice and unread; one row is stored for them.
   * Kills: no notice, a duplicate, the wrong type, the notice addressed to someone else.
   */
  it('CANCEL-REQ-NOTIF-01-C submitting a request gives the assigned Coordinator one notification', async () => {
    const eventId = await seedEvent();

    await postRequest(org, eventId).expect(201);

    expect(await requestNotices(coo)).toMatchObject([{ type: SUBMITTED, relatedEventId: eventId, audienceRole: 'coordinator', read: false }]);
    expect((await storedFor(eventId, coo.uid)).filter((row) => row.type === SUBMITTED)).toHaveLength(1);
  });

  /**
   * CANCEL-REQ-NOTIF-01-SEC-1 (SPM-171 AC1, security): the submitting Organiser, another Organiser, another Coordinator,
   * the Lead and an attendee never see the notice in their feeds, and only one row is stored.
   * Kills: broadcasting the notice, or showing it to the Organiser or the Lead.
   */
  it('CANCEL-REQ-NOTIF-01-SEC-1 nobody but the assigned Coordinator receives the notice', async () => {
    const eventId = await seedEvent();

    await postRequest(org, eventId).expect(201);

    for (const other of [org, otherOrg, otherCoo, lead, att]) expect((await feed(other)).filter((n) => n.type === SUBMITTED)).toEqual([]);
    expect((await stored(eventId)).filter((row) => row.type === SUBMITTED).map((row) => row.recipient_id)).toEqual([coo.uid]);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-02-E (SPM-171 AC2): the notice reads exactly as the Jira wording, with the Organiser's display
   * name, carries the submission time and never the reason.
   * Kills: changed wording, a timestamp other than the submission time, the reason in the text.
   */
  it('CANCEL-REQ-NOTIF-02-E the notification has the exact message, the submission time and no reason', async () => {
    const eventId = await seedEvent();

    await postRequest(org, eventId, { reason: 'Venue flooded' }).expect(201);

    const [notice] = await requestNotices(coo);
    expect(notice.message).toBe('SPM-171 ORGANISER requested to cancel "Autumn Gala".');
    expect(notice.createdAt).toBe(T0);
    expect(notice.message).not.toContain('Venue flooded');
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-03-D (SPM-171 AC3): the event the notice links to shows the Coordinator the pending request with
   * the Organiser's reason.
   * Kills: a notice whose event link does not lead to the pending request.
   */
  it('CANCEL-REQ-NOTIF-03-D the linked event shows the Coordinator the pending request and its reason', async () => {
    const eventId = await seedEvent();
    await postRequest(org, eventId, { reason: 'Venue flooded' }).expect(201);
    const [notice] = await requestNotices(coo);

    const listed = (await as(http().get(`/api/events/${notice.relatedEventId}/cancellation-requests`), coo).expect(200)).body as Array<{ status: string; reason: string }>;

    expect(listed).toMatchObject([{ status: 'pending', reason: 'Venue flooded' }]);
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-04-E (SPM-171 AC4): the notice is unread until the Coordinator marks it read, and once read it
   * stays read when they sign in again with a fresh session.
   * Kills: a notice created read, a read flag that does not persist, marking another person's notice.
   */
  it('CANCEL-REQ-NOTIF-04-E stays unread until marked read and remains read after signing in again', async () => {
    const eventId = await seedEvent();
    await postRequest(org, eventId).expect(201);
    const [notice] = await requestNotices(coo);
    expect(notice.read).toBe(false);

    await markRead(otherCoo, notice.id).expect(404);
    expect((await requestNotices(coo))[0].read).toBe(false);
    await markRead(coo, notice.id).expect(201);

    const email = (await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [coo.uid])).rows[0].email;
    const again = { uid: coo.uid, cookie: await loginCookie(email) };
    expect((await requestNotices(again))[0].read).toBe(true);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-05-A (SPM-171 AC5): one request produces one notice; a second request refused while the first is
   * pending adds none.
   * Kills: a notice written before the pending check, a duplicate per request.
   */
  it('CANCEL-REQ-NOTIF-05-A one request gives one notice and a refused second request adds none', async () => {
    const eventId = await seedEvent();

    await postRequest(org, eventId).expect(201);
    await postRequest(org, eventId).expect(409);

    expect(await requestNotices(coo)).toHaveLength(1);
  });

  /**
   * CANCEL-REQ-NOTIF-05-B (SPM-171 AC5): after the Coordinator declines, a new request gives a new notice, so the
   * Coordinator holds two, one per request.
   * Kills: de-duplicating by event, so a later request is never notified.
   */
  it('CANCEL-REQ-NOTIF-05-B a new request after a decision gives the Coordinator a new notice', async () => {
    const eventId = await seedEvent();
    const first = (await postRequest(org, eventId).expect(201)).body.request.id as string;
    await decide(coo, first, { decision: 'decline' }).expect(200);

    await postRequest(org, eventId).expect(201);

    const notices = await requestNotices(coo);
    expect(notices).toHaveLength(2);
    expect(new Set(notices.map((n) => n.id)).size).toBe(2);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-06-H (SPM-171 AC6): a request filed while no Coordinator is assigned notifies nobody; the Lead's
   * assignment then gives the new Coordinator the notice, worded as the AC and stamped with the submission time, and
   * no other Coordinator gets it.
   * Kills: no notice on assignment, the assignment time used, a notice sent at submission to nobody-or-everybody.
   */
  it('CANCEL-REQ-NOTIF-06-H a request made before assignment reaches the Coordinator assigned later', async () => {
    const eventId = await seedEvent('Submitted', null);
    await postRequest(org, eventId).expect(201);
    expect((await stored(eventId)).filter((row) => row.type === SUBMITTED)).toEqual([]);

    await assign(lead, eventId, coo).expect(201);

    const [notice] = await requestNotices(coo);
    expect(notice).toMatchObject({ message: 'SPM-171 ORGANISER requested to cancel "Autumn Gala".', relatedEventId: eventId, read: false, createdAt: T0 });
    expect(await requestNotices(otherCoo)).toEqual([]);
  });

  /**
   * CANCEL-REQ-NOTIF-06-I (SPM-171 AC6): reassigning while the request is pending gives the new Coordinator the notice
   * with the AC2 wording stamped with the request's original submission time, and removes the previous Coordinator's unread one from their feed.
   * Kills: no notice for the new Coordinator, a reassignment-time stamp, the old Coordinator keeping an unread notice for an event that is no longer theirs.
   */
  it('CANCEL-REQ-NOTIF-06-I reassigning a pending request moves the notice to the new Coordinator', async () => {
    const eventId = await seedEvent();
    await postRequest(org, eventId).expect(201);
    expect(await requestNotices(coo)).toHaveLength(1);
    // The clock stub gives the request and the reassignment the same T0, so move the submission earlier to tell them apart.
    const submittedAt = '2026-11-02T07:00:00.000Z';
    await pool.query(`UPDATE event_cancellation_requests SET requested_at = $2 WHERE event_id = $1`, [eventId, submittedAt]);

    await reassign(lead, eventId, otherCoo, coo).expect(201);

    expect(await requestNotices(otherCoo)).toMatchObject([
      { type: SUBMITTED, message: 'SPM-171 ORGANISER requested to cancel "Autumn Gala".', relatedEventId: eventId, read: false, createdAt: submittedAt },
    ]);
    expect(await requestNotices(coo)).toMatchObject([{ read: true }]);
    expect((await storedFor(eventId, coo.uid)).filter((row) => row.type === SUBMITTED && !row.read)).toEqual([]);
  });

  /**
   * CANCEL-REQ-NOTIF-06-J (SPM-171 AC6): a request that was already decided is not handed to a Coordinator assigned
   * or reassigned afterwards.
   * Kills: notifying for any request on the event instead of the pending one.
   */
  it('CANCEL-REQ-NOTIF-06-J a decided request is not re-sent on reassignment', async () => {
    const eventId = await seedEvent();
    const requestId = (await postRequest(org, eventId).expect(201)).body.request.id as string;
    await decide(coo, requestId, { decision: 'decline' }).expect(200);

    await reassign(lead, eventId, otherCoo, coo).expect(201);

    expect(await requestNotices(otherCoo)).toEqual([]);
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-REQ-NOTIF-07-C (SPM-171 AC7): requests the service refuses (event Completed or Cancelled, a reason over 500
   * characters, a stranger, an unknown event) leave the Coordinator's notice list empty and write no notification row.
   * Kills: a notice written before the checks.
   */
  it('CANCEL-REQ-NOTIF-07-C refused requests produce no notification', async () => {
    const completed = await seedEvent('Completed');
    const cancelled = await seedEvent('Cancelled');
    const live = await seedEvent();

    await postRequest(org, completed).expect(409);
    await postRequest(org, cancelled).expect(409);
    await postRequest(org, live, { reason: 'x'.repeat(501) }).expect(422);
    await postRequest(otherOrg, live).expect(403);
    await postRequest(org, randomUUID()).expect(404);

    expect(await requestNotices(coo)).toEqual([]);
    for (const eventId of [completed, cancelled, live]) expect((await stored(eventId)).filter((row) => row.type === SUBMITTED)).toEqual([]);
  });

  /**
   * CANCEL-REQ-NOTIF-07-D (SPM-171 AC7): if the notice cannot be saved, the request is rolled back with it: the failure
   * is reported, no request row exists and the Organiser can submit again.
   * Kills: a notice written outside the request's transaction.
   */
  it('CANCEL-REQ-NOTIF-07-D a notice that cannot be saved rolls the request back', async () => {
    const eventId = await seedEvent();
    await pool.query(`CREATE OR REPLACE FUNCTION spm171_block_notice() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'spm171 blocked'; END; $$ LANGUAGE plpgsql`);
    // Scoped to this test's own Coordinator (a fresh UUID), so suites running in parallel are not affected.
    await pool.query(`CREATE TRIGGER spm171_block BEFORE INSERT ON notifications FOR EACH ROW WHEN (NEW.type = 'cancellation_request_submitted' AND NEW.recipient_id = '${coo.uid}') EXECUTE FUNCTION spm171_block_notice()`);
    try {
      await postRequest(org, eventId).expect(500);
      expect((await pool.query('SELECT 1 FROM event_cancellation_requests WHERE event_id = $1', [eventId])).rowCount).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER spm171_block ON notifications');
      await pool.query('DROP FUNCTION spm171_block_notice()');
    }

    await postRequest(org, eventId).expect(201);
    expect(await requestNotices(coo)).toHaveLength(1);
  });
});
