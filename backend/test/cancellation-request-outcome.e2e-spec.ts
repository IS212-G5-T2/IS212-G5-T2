/*
 * SPM-162 Event Cancellation Request Outcome (Organiser), over HTTP against real PostgreSQL. The Coordinator accepts or
 * declines an Organiser's cancellation request (SPM-155) and the Organiser receives one notice in the bell feed. Every
 * user signs in through the real login route; the clock is the injected CLOCK frozen at T0; only the fault case
 * replaces the EVENT_RELEASERS list. Events, requests, registrations and notifications are rows in PostgreSQL.
 *
 * Story: SPM-162. Test cases: CANCEL-OUTCOME-01-A, 01-B, 01-SEC-1, 02-D, 02-E, 03-A, 03-B, 03-F, 05-A, 05-B, 05-SEC-1,
 * 06-A, 06-B, 06-C, 06-D, 06-CONC-1.
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
import type { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DEFAULT_RELEASERS, EVENT_RELEASERS, type EventReleaser } from '../src/events/cancel/release.registry.js';

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI) throw new Error('SPM-162 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');
if (database && !process.env.DATABASE_URL) process.env.DATABASE_URL = database;

const T0 = '2026-11-02T08:30:00.000Z';
const SLOT_START = '2026-12-05T02:00:00.000Z';
const SLOT_END = '2026-12-05T04:00:00.000Z';
const ACCEPTED = 'cancellation_request_accepted';
const DECLINED = 'cancellation_request_declined';
const MSG_ACCEPTED = 'Your cancellation request for "Autumn Gala" was accepted. The event is cancelled.';
const MSG_DECLINED = 'Your cancellation request for "Autumn Gala" was declined. The event keeps its current status.';
const EVENT_NAME = 'Autumn Gala';

type Session = { uid: string; cookie: string };
type FeedItem = { id: string; type: string; message: string; relatedEventId: string | null; audienceRole: string; read: boolean; createdAt: string };
type Stored = { recipient_id: string; type: string; message: string; read: boolean; created_at: Date };

describe.skipIf(!database)('SPM-162 cancellation request outcome notifications over HTTP (e2e)', () => {
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

  async function buildApp(releasers?: readonly EventReleaser[]) {
    await closeApp();
    let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue({ now: () => new Date(T0) });
    if (releasers) builder = builder.overrideProvider(EVENT_RELEASERS).useValue(releasers);
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
  const postRequest = (session: Session, eventId: string) =>
    as(http().post(`/api/events/${eventId}/cancellation-requests`), session).send({ reason: 'No longer needed' });
  const decide = (session: Session, requestId: string, body: unknown) =>
    as(http().post(`/api/cancellation-requests/${requestId}/decision`), session).send(body as object);
  const directCancel = (session: Session, eventId: string) =>
    as(http().post(`/api/events/${eventId}/status-change`), session).send({ targetStatus: 'Cancelled', confirmed: true });
  const feed = async (session: Session) => (await as(http().get('/api/notifications'), session).expect(200)).body as FeedItem[];
  const markRead = (session: Session, id: string) => as(http().post(`/api/notifications/${id}/read`), session);
  const outcomeNotices = async (session: Session) => (await feed(session)).filter((n) => n.type === ACCEPTED || n.type === DECLINED);

  async function createSession(role: string): Promise<Session> {
    const email = `e2e-cancel-outcome-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, `SPM-162 ${role}`],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
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
  async function seedEvent(status = 'Confirmed') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',$4,$5,80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',$6,$7,'Coordinator',$8)`,
      [id, org.uid, EVENT_NAME, SLOT_START, SLOT_END, status, coo.uid, randomUUID()],
    );
    eventIds.push(id);
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email) VALUES ($1, $2, 'Registered', 'Attendee', 'attendee@example.test')`,
      [id, att.uid],
    );
    return id;
  }

  /** The event with a request already filed by the Organiser through the real route. */
  async function seedPending(status = 'Confirmed') {
    const eventId = await seedEvent(status);
    const requestId = (await postRequest(org, eventId).expect(201)).body.request.id as string;
    return { eventId, requestId };
  }

  const stored = async (eventId: string) =>
    (await pool.query<Stored>('SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_event_id = $1 ORDER BY recipient_id, type', [eventId])).rows;
  const storedFor = async (eventId: string, uid: string) => (await stored(eventId)).filter((row) => row.recipient_id === uid);
  const requestStatus = async (requestId: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM event_cancellation_requests WHERE id = $1', [requestId])).rows[0].status;

  // ---- AC1 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-OUTCOME-01-A (SPM-162 AC1): the Coordinator accepts; the Organiser's feed holds exactly one outcome notice,
   * typed accepted, for that event, and one row is stored for the Organiser.
   * Kills: no notice, a duplicate, the wrong type, the notice addressed to someone else.
   */
  it('CANCEL-OUTCOME-01-A accepting a request gives the Organiser one accepted notification', async () => {
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(200);

    expect(await outcomeNotices(org)).toMatchObject([{ type: ACCEPTED, relatedEventId: eventId, audienceRole: 'organiser' }]);
    expect((await storedFor(eventId, org.uid)).filter((row) => row.type === ACCEPTED)).toHaveLength(1);
  });

  /**
   * CANCEL-OUTCOME-01-B (SPM-162 AC1): the Coordinator declines; the Organiser's feed holds exactly one declined notice
   * and the event keeps its status.
   * Kills: a decline that writes nothing or the accepted type.
   */
  it('CANCEL-OUTCOME-01-B declining a request gives the Organiser one declined notification', async () => {
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'decline' }).expect(200);

    expect(await outcomeNotices(org)).toMatchObject([{ type: DECLINED, relatedEventId: eventId }]);
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status).toBe('Confirmed');
  });

  /**
   * CANCEL-OUTCOME-01-SEC-1 (SPM-162 AC1, security): another Organiser, the assigned Coordinator, another Coordinator,
   * the Lead and an attendee never see the outcome notice in their feeds.
   * Kills: broadcasting the notice, or showing it to the Coordinator.
   */
  it('CANCEL-OUTCOME-01-SEC-1 nobody but the requesting Organiser receives the outcome notice', async () => {
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(200);

    for (const other of [otherOrg, coo, otherCoo, lead, att]) expect((await feed(other)).filter((n) => n.type === ACCEPTED)).toEqual([]);
    expect((await stored(eventId)).filter((row) => row.type === ACCEPTED).map((row) => row.recipient_id)).toEqual([org.uid]);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-OUTCOME-02-D (SPM-162 AC2): the accepted notice reads exactly as the Jira wording and carries the decision time.
   * Kills: changed wording, a timestamp other than the decision time.
   */
  it('CANCEL-OUTCOME-02-D the accepted notification has the exact message and the decision time', async () => {
    const { requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(200);

    const [notice] = await outcomeNotices(org);
    expect(notice.message).toBe(MSG_ACCEPTED);
    expect(notice.createdAt).toBe(T0);
  });

  /**
   * CANCEL-OUTCOME-02-E (SPM-162 AC2): the declined notice reads exactly as the Jira wording and carries the decision time.
   * Kills: changed wording, a reason appended, a timestamp other than the decision time.
   */
  it('CANCEL-OUTCOME-02-E the declined notification has the exact message and the decision time', async () => {
    const { requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'decline' }).expect(200);

    const [notice] = await outcomeNotices(org);
    expect(notice.message).toBe(MSG_DECLINED);
    expect(notice.createdAt).toBe(T0);
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-OUTCOME-03-A (SPM-162 AC3): on accept the Organiser has the outcome notice and no EventCancelled; the
   * attendee and the Coordinator still get EventCancelled.
   * Kills: the Organiser also receiving EventCancelled, the attendee or Coordinator losing theirs.
   */
  it('CANCEL-OUTCOME-03-A accept gives the Organiser only the outcome notice while the attendee and Coordinator still get EventCancelled', async () => {
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(200);

    expect((await storedFor(eventId, org.uid)).map((row) => row.type)).toEqual([ACCEPTED]);
    expect((await storedFor(eventId, att.uid)).map((row) => row.type)).toEqual(['EventCancelled']);
    expect((await storedFor(eventId, coo.uid)).map((row) => row.type)).toEqual(['EventCancelled']);
    expect((await feed(org)).filter((n) => n.type === 'EventCancelled')).toEqual([]);
  });

  /**
   * CANCEL-OUTCOME-03-B (SPM-162 AC3): a Coordinator cancelling directly (SPM-136, no request) is unchanged: the
   * Organiser gets EventCancelled and no outcome notice.
   * Kills: the skip applied to the direct path.
   */
  it('CANCEL-OUTCOME-03-B a direct Coordinator cancellation still gives the Organiser EventCancelled and no outcome notice', async () => {
    const eventId = await seedEvent();

    await directCancel(coo, eventId).expect(200);

    expect((await storedFor(eventId, org.uid)).map((row) => row.type)).toEqual(['EventCancelled']);
    expect(await outcomeNotices(org)).toEqual([]);
  });

  /**
   * CANCEL-OUTCOME-03-F (SPM-162 AC3): after an accept the Coordinator's feed shows EventCancelled (labelled as a
   * Coordinator notice) and no outcome notice.
   * Kills: the Coordinator's EventCancelled dropped or the outcome notice leaking to the Coordinator.
   */
  it('CANCEL-OUTCOME-03-F after an accept the Coordinator feed holds EventCancelled and no outcome notice', async () => {
    const { requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(200);

    const items = await feed(coo);
    expect(items.filter((n) => n.type === 'EventCancelled')).toMatchObject([{ audienceRole: 'coordinator' }]);
    expect(items.some((n) => n.type === ACCEPTED || n.type === DECLINED)).toBe(false);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-OUTCOME-05-A (SPM-162 AC5): a new outcome notice is unread, in the feed and in the table.
   * Kills: a notice created as read.
   */
  it('CANCEL-OUTCOME-05-A a new outcome notification is unread', async () => {
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'decline' }).expect(200);

    expect((await outcomeNotices(org)).map((n) => n.read)).toEqual([false]);
    expect((await storedFor(eventId, org.uid)).map((row) => row.read)).toEqual([false]);
  });

  /**
   * CANCEL-OUTCOME-05-B (SPM-162 AC5): the Organiser marks the notice read; it stays read after signing out and back in
   * (a new session through the real login route).
   * Kills: mark-read refusing the new type, read state held in the session.
   */
  it('CANCEL-OUTCOME-05-B once read the notification stays read after signing in again', async () => {
    const { eventId, requestId } = await seedPending();
    await decide(coo, requestId, { decision: 'accept' }).expect(200);
    const [notice] = await outcomeNotices(org);

    await markRead(org, notice.id).expect(201);
    const email = (await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [org.uid])).rows[0].email;
    const again: Session = { uid: org.uid, cookie: await loginCookie(email) };

    expect((await outcomeNotices(again)).map((n) => n.read)).toEqual([true]);
    expect((await storedFor(eventId, org.uid)).map((row) => row.read)).toEqual([true]);
  });

  /**
   * CANCEL-OUTCOME-05-SEC-1 (SPM-162 AC5, security): another Organiser cannot mark the notice read; it is refused 404
   * and the notice stays unread.
   * Kills: a mark-read that is not scoped to the recipient.
   */
  it('CANCEL-OUTCOME-05-SEC-1 another Organiser cannot mark the notification read', async () => {
    const { eventId, requestId } = await seedPending();
    await decide(coo, requestId, { decision: 'decline' }).expect(200);
    const [notice] = await outcomeNotices(org);

    await markRead(otherOrg, notice.id).expect(404);

    expect((await storedFor(eventId, org.uid)).map((row) => row.read)).toEqual([false]);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /**
   * CANCEL-OUTCOME-06-A (SPM-162 AC6): a second decision on an already-decided request is refused 409 and adds no
   * notice: after an accept then another accept, and after a decline then an accept, the Organiser still has one.
   * Kills: a notice written before the compare-and-set, or on a repeated decision.
   */
  it.each([
    ['accept then accept', 'accept', 'accept', ACCEPTED],
    ['decline then accept', 'decline', 'accept', DECLINED],
    ['accept then decline', 'accept', 'decline', ACCEPTED],
  ])('CANCEL-OUTCOME-06-A %s: the second decision is refused 409 and no second notice exists', async (_label, first, second, type) => {
    const { eventId, requestId } = await seedPending();
    await decide(coo, requestId, { decision: first }).expect(200);

    const repeat = await decide(coo, requestId, { decision: second }).expect(409);

    expect(repeat.body.code).toBe('CANCELLATION_REQUEST_DECIDED');
    expect((await storedFor(eventId, org.uid)).filter((row) => row.type === ACCEPTED || row.type === DECLINED).map((row) => row.type)).toEqual([type]);
  });

  /**
   * CANCEL-OUTCOME-06-B (SPM-162 AC6): a refused decision (another Coordinator, the Organiser, the Lead, an unknown
   * request) is 403 and writes no notice; the request stays pending.
   * Kills: a notice written before the authorisation check.
   */
  it('CANCEL-OUTCOME-06-B a refused decision writes no notice and leaves the request pending', async () => {
    const { eventId, requestId } = await seedPending();

    for (const refused of [otherCoo, org, lead]) await decide(refused, requestId, { decision: 'accept' }).expect(403);
    await decide(coo, randomUUID(), { decision: 'accept' }).expect(403);

    expect((await stored(eventId)).filter((row) => row.type === ACCEPTED || row.type === DECLINED)).toEqual([]);
    expect(await requestStatus(requestId)).toBe('pending');
  });

  /**
   * CANCEL-OUTCOME-06-C (SPM-162 AC6): an invalid body is 400, and a decision on an event that can no longer be
   * cancelled is 409 EVENT_NOT_CANCELLABLE; neither writes a notice.
   * Kills: a notice written before validation or before the eligibility check.
   */
  it('CANCEL-OUTCOME-06-C an invalid decision (400) and a Completed event (409) write no notice', async () => {
    const { eventId, requestId } = await seedPending();
    await decide(coo, requestId, { decision: 'maybe' }).expect(400);
    await pool.query(`UPDATE events SET status = 'Completed' WHERE id = $1`, [eventId]);

    const refused = await decide(coo, requestId, { decision: 'decline' }).expect(409);

    expect(refused.body.code).toBe('EVENT_NOT_CANCELLABLE');
    expect((await stored(eventId)).filter((row) => row.type === ACCEPTED || row.type === DECLINED)).toEqual([]);
    expect(await requestStatus(requestId)).toBe('pending');
  });

  /**
   * CANCEL-OUTCOME-06-D (SPM-162 AC6): when a release fails during an accept, everything rolls back: 500, the request
   * is still pending, the event is not cancelled and no notice of any kind exists; the retry then succeeds with one.
   * Kills: a notice written outside the decision's transaction.
   */
  it('CANCEL-OUTCOME-06-D a failure during the accept leaves no notice, and the retry gives exactly one', async () => {
    const fault: EventReleaser = { name: 'fault', release: async () => { throw new Error('boom: release failed'); } };
    await buildApp([...DEFAULT_RELEASERS, fault]);
    const { eventId, requestId } = await seedPending();

    await decide(coo, requestId, { decision: 'accept' }).expect(500);

    expect(await stored(eventId)).toEqual([]);
    expect(await requestStatus(requestId)).toBe('pending');
    expect((await pool.query('SELECT status FROM events WHERE id = $1', [eventId])).rows[0].status).toBe('Confirmed');

    await buildApp();
    const retry = await decide(coo, requestId, { decision: 'accept' }).expect(200);
    expect(retry.body.request.status).toBe('accepted');
    expect((await storedFor(eventId, org.uid)).map((row) => row.type)).toEqual([ACCEPTED]);
  });

  /**
   * CANCEL-OUTCOME-06-CONC-1 (SPM-162 AC6, concurrency): four decisions fired together give exactly one 200 and three
   * 409, and the Organiser has exactly one outcome notice whose type matches the winning decision.
   * Kills: a notice written for a decision that lost the race.
   */
  it('CANCEL-OUTCOME-06-CONC-1 simultaneous decisions leave exactly one notice that matches the winner', async () => {
    const { eventId, requestId } = await seedPending();

    const responses = await Promise.all(['accept', 'decline', 'accept', 'decline'].map((decision) => decide(coo, requestId, { decision })));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    const final = await requestStatus(requestId);
    const outcomes = (await storedFor(eventId, org.uid)).filter((row) => row.type === ACCEPTED || row.type === DECLINED);
    expect(outcomes.map((row) => row.type)).toEqual([final === 'accepted' ? ACCEPTED : DECLINED]);
  });
});
