/*
 * SPM-181 Event Change Notification (Attendee), over HTTP against real PostgreSQL. A start or end change tells every
 * Registered and Waitlisted attendee once, however it is applied: the Coordinator's direct edit, a flagged change the
 * Coordinator confirms, or an Organiser's change request the Coordinator approves. Every user signs in through the real
 * login route; events, registrations, bookings and notifications are rows in PostgreSQL.
 *
 * Story: SPM-181. Test cases: EVENT-CHANGE-NOTIF-01-B, 02-B, 03-E, 03-F, 03-G, 04-E, 04-F, 05-C, 06-D, 07-B, 07-C.
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

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI) throw new Error('SPM-181 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');
if (database && !process.env.DATABASE_URL) process.env.DATABASE_URL = database;

// 10 Mar 2031, 10:00 am to 2:00 pm SGT.
const SLOT_START = '2031-03-10T02:00:00.000Z';
const SLOT_END = '2031-03-10T06:00:00.000Z';
const NEW_START = '2031-03-10T03:00:00.000Z';
const NEW_END = '2031-03-10T07:00:00.000Z';
const TYPE = 'EventRescheduled';
const NAME = 'Reschedule Gala';
const MESSAGE = `"${NAME}" has been rescheduled. It now runs 10 Mar 2031, 11:00 am to 10 Mar 2031, 3:00 pm (SGT).`;
const MESSAGE_START_ONLY = `"${NAME}" has been rescheduled. It now runs 10 Mar 2031, 11:00 am to 10 Mar 2031, 2:00 pm (SGT).`;

type Session = { uid: string; cookie: string };
type FeedItem = { id: string; type: string; message: string; relatedEventId: string | null; audienceRole: string; read: boolean; createdAt: string };
type Stored = { recipient_id: string; type: string; message: string; read: boolean; created_at: Date };

describe.skipIf(!database)('SPM-181 event rescheduled notifications over HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let pool: pg.Pool;
  let eventIds: string[];
  let userIds: string[];
  let venueIds: string[];
  let org: Session;
  let coo: Session;
  let otherCoo: Session;
  let att: Session;
  let waiting: Session;
  let withdrawn: Session;
  let removed: Session;
  let cancelled: Session;
  let outsider: Session;

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
    venueIds = [];
    await buildApp();
    org = await createSession('ORGANISER');
    coo = await createSession('COORDINATOR');
    otherCoo = await createSession('COORDINATOR');
    att = await createSession('ATTENDEE');
    waiting = await createSession('ATTENDEE');
    withdrawn = await createSession('ATTENDEE');
    removed = await createSession('ATTENDEE');
    cancelled = await createSession('ATTENDEE');
    outsider = await createSession('ATTENDEE');
  });
  afterEach(async () => {
    await closeApp();
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
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
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await app.init();
    // Bound to 127.0.0.1 so supertest cannot reach another local listener.
    await app.listen(0, '127.0.0.1');
  }

  const http = () => {
    if (!app) throw new Error('The test application is not running.');
    return request(app.getHttpServer());
  };
  const as = <T extends request.Test>(req: T, session: Session): T => req.set('Cookie', session.cookie) as T;
  const edit = (session: Session, eventId: string, body: object) => as(http().patch(`/api/events/${eventId}/planning`), session).send(body);
  const resolve = (session: Session, eventId: string, changeId: string, body: object) =>
    as(http().post(`/api/events/${eventId}/planning/changes/${changeId}/resolve`), session).send(body);
  const submitRequest = (session: Session, eventId: string, changes: object) =>
    as(http().post(`/api/events/${eventId}/change-requests`), session).send({ changes });
  const approveRequest = (session: Session, eventId: string, requestId: string) =>
    as(http().post(`/api/events/${eventId}/change-requests/${requestId}/approve`), session).send({});
  const denyRequest = (session: Session, eventId: string, requestId: string) =>
    as(http().post(`/api/events/${eventId}/change-requests/${requestId}/deny`), session).send({ reason: 'The venue cannot move it.' });
  const feed = async (session: Session) => (await as(http().get('/api/notifications'), session).expect(200)).body as FeedItem[];
  const markRead = (session: Session, id: string) => as(http().post(`/api/notifications/${id}/read`), session);
  const rescheduled = async (session: Session) => (await feed(session)).filter((n) => n.type === TYPE);

  async function createSession(role: string): Promise<Session> {
    const email = `e2e-reschedule-notif-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, `SPM-181 ${role}`],
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

  async function register(eventId: string, session: Session, status: string) {
    await pool.query(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, joined_at, waitlist_seq)
       VALUES ($1, $2, $3, 'Attendee', 'attendee@example.test', now(), CASE WHEN $3 = 'Waitlisted' THEN nextval('event_registrations_waitlist_seq') ELSE NULL END)`,
      [eventId, session.uid, status],
    );
  }

  /** An event owned by `org` and assigned to `coo`, with one attendee in each registration status. */
  async function seedEvent(status = 'Planning') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser','organiser@example.test',$3,'Purpose','Description',$4,$5,80,'Banquet',ARRAY['Catering'],ARRAY[]::text[],'',$6,$7,'Coordinator',$8)`,
      [id, org.uid, NAME, SLOT_START, SLOT_END, status, coo.uid, randomUUID()],
    );
    eventIds.push(id);
    await register(id, att, 'Registered');
    await register(id, waiting, 'Waitlisted');
    await register(id, withdrawn, 'Withdrawn');
    await register(id, removed, 'Removed');
    await register(id, cancelled, 'Cancelled');
    return id;
  }

  /** An approved venue booking covering the event's slot, so a start before it is flagged for review. */
  async function book(eventId: string) {
    const venue = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, 'SPM-181 Hall', $2, 200, 'Open weekdays', 0, 0) RETURNING id`,
      [coo.uid, `E2E ${randomUUID()}`],
    );
    venueIds.push(venue.rows[0].id);
    await pool.query(`INSERT INTO venue_bookings (event_id, venue_id, start_at, end_at, status) VALUES ($1,$2,$3,$4,'approved')`, [
      eventId,
      venue.rows[0].id,
      SLOT_START,
      SLOT_END,
    ]);
  }

  const stored = async (eventId: string) =>
    (await pool.query<Stored>('SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_event_id = $1 AND type = $2 ORDER BY recipient_id', [eventId, TYPE])).rows;
  const recipients = async (eventId: string) => (await stored(eventId)).map((row) => row.recipient_id).sort();
  const eventRow = async (eventId: string) => (await pool.query('SELECT start_date_time, end_date_time, updated_at, event_name FROM events WHERE id = $1', [eventId])).rows[0];

  // ---- AC1, AC2 ----------------------------------------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-01-B (AC1): a start and end change tells the Registered and the Waitlisted attendee once each;
   * the Withdrawn, Removed and Cancelled entries and an attendee of no registration get nothing.
   * An unchanged second event with the same attendees gets nothing.
   * Kills: notifying every registration status, notifying nobody on the waitlist, a broadcast to unrelated users, a missing event filter.
   */
  it('EVENT-CHANGE-NOTIF-01-B notifies the Registered and Waitlisted attendees only, once each', async () => {
    const eventId = await seedEvent();
    const otherEvent = await seedEvent();

    await edit(coo, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(200);

    expect(await recipients(eventId)).toEqual([att.uid, waiting.uid].sort());
    expect(await stored(otherEvent)).toEqual([]);
    expect(await rescheduled(att)).toHaveLength(1);
    expect(await rescheduled(waiting)).toHaveLength(1);
    for (const other of [withdrawn, removed, cancelled, outsider]) expect(await rescheduled(other)).toEqual([]);
  });

  /**
   * EVENT-CHANGE-NOTIF-02-B (AC2, AC6): the stored notice has the exact wording with the event's name and the new start
   * and end in Singapore time, is unread, and its timestamp is the moment the change was applied (the event's
   * updated_at).
   * Kills: a different wording, UTC times, a timestamp other than the change time.
   */
  it('EVENT-CHANGE-NOTIF-02-B the notification has the exact message, is unread and carries the change time', async () => {
    const eventId = await seedEvent();

    await edit(coo, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(200);

    const [notice] = await rescheduled(att);
    expect(notice).toMatchObject({ message: MESSAGE, read: false, relatedEventId: eventId, audienceRole: 'attendee' });
    const [row] = (await stored(eventId)).filter((entry) => entry.recipient_id === att.uid);
    expect(row.created_at.getTime()).toBe((await eventRow(eventId)).updated_at.getTime());
  });

  // ---- AC3: the three ways a change is applied ---------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-03-E (AC3): a Coordinator's edit applied immediately notifies, for a start-only change too, with
   * the unchanged end still shown.
   * Kills: not notifying on the direct path, naming only the changed field.
   */
  it('EVENT-CHANGE-NOTIF-03-E a direct edit of the start alone notifies with the full new period', async () => {
    const eventId = await seedEvent();

    await edit(coo, eventId, { startDateTime: NEW_START }).expect(200);

    expect((await rescheduled(att)).map((n) => n.message)).toEqual([MESSAGE_START_ONLY]);
  });

  /**
   * EVENT-CHANGE-NOTIF-03-F (AC3, AC4): a flagged schedule change produces nothing while it waits; confirming it applies
   * it and notifies each attendee once, at the time it is applied; the change closes with the last booking decision.
   * Kills: notifying when the change is flagged, not notifying on confirmation, notifying twice.
   */
  it('EVENT-CHANGE-NOTIF-03-F a flagged change notifies when the Coordinator confirms it, not before', async () => {
    const eventId = await seedEvent();
    await book(eventId);

    const flagged = await edit(coo, eventId, { startDateTime: '2031-03-10T01:00:00.000Z' }).expect(200);
    expect(flagged.body.flagged).toHaveLength(1);
    expect(await stored(eventId)).toEqual([]);

    await resolve(coo, eventId, flagged.body.flagged[0].id, { decision: 'confirm' }).expect(201);

    expect(await recipients(eventId)).toEqual([att.uid, waiting.uid].sort());
    expect((await rescheduled(att))[0].message).toBe(
      `"${NAME}" has been rescheduled. It now runs 10 Mar 2031, 9:00 am to 10 Mar 2031, 2:00 pm (SGT).`,
    );
    const [row] = (await stored(eventId)).filter((entry) => entry.recipient_id === att.uid);
    expect(row.created_at.getTime()).toBe((await eventRow(eventId)).updated_at.getTime());
  });

  /**
   * EVENT-CHANGE-NOTIF-03-G (AC3): an Organiser's change request on a Confirmed event, once the Coordinator approves
   * it, notifies the attendees (the event returns to Planning); no notice is written while the request is pending.
   * Kills: not notifying on the approval path, notifying when the request is filed.
   */
  it('EVENT-CHANGE-NOTIF-03-G approving a change request notifies the attendees once', async () => {
    const eventId = await seedEvent('Confirmed');

    const filed = await submitRequest(org, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(201);
    expect(await stored(eventId)).toEqual([]);

    await approveRequest(coo, eventId, filed.body.id ?? filed.body.request?.id).expect(200);

    expect(await recipients(eventId)).toEqual([att.uid, waiting.uid].sort());
    expect((await rescheduled(att)).map((n) => n.message)).toEqual([MESSAGE]);
    const [row] = (await stored(eventId)).filter((entry) => entry.recipient_id === att.uid);
    expect(row.created_at.getTime()).toBe((await eventRow(eventId)).updated_at.getTime());
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-04-E (AC4): a rejected flagged change, and a denied change request, produce no notification and
   * leave the schedule as it was.
   * Kills: notifying on any decision.
   */
  it('EVENT-CHANGE-NOTIF-04-E a rejected flagged change and a denied request notify nobody', async () => {
    const eventId = await seedEvent();
    await book(eventId);
    const flagged = await edit(coo, eventId, { startDateTime: '2031-03-10T01:00:00.000Z' }).expect(200);
    await resolve(coo, eventId, flagged.body.flagged[0].id, { decision: 'reject' }).expect(201);

    const confirmed = await seedEvent('Confirmed');
    const filed = await submitRequest(org, confirmed, { startDateTime: NEW_START }).expect(201);
    await denyRequest(coo, confirmed, filed.body.id ?? filed.body.request?.id).expect(200);

    expect(await stored(eventId)).toEqual([]);
    expect(await stored(confirmed)).toEqual([]);
    expect((await eventRow(eventId)).start_date_time.toISOString()).toBe(SLOT_START);
  });

  /**
   * EVENT-CHANGE-NOTIF-04-F (AC4): two separate saves are two changes: each notifies each attendee once (SC-SPM181-01).
   * Kills: de-duplicating notices across saves, or writing more than one per save.
   */
  it('EVENT-CHANGE-NOTIF-04-F two saves give each attendee two notifications, one per save', async () => {
    const eventId = await seedEvent();

    await edit(coo, eventId, { startDateTime: NEW_START }).expect(200);
    await edit(coo, eventId, { endDateTime: NEW_END }).expect(200);

    expect((await rescheduled(att)).map((n) => n.message).sort()).toEqual([MESSAGE, MESSAGE_START_ONLY].sort());
    expect(await rescheduled(waiting)).toHaveLength(2);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-05-C (AC5): changes to the name, purpose, description, expected attendance, layout, facilities,
   * accessibility needs and equipment requirements, directly or by an approved change request, notify nobody.
   * Kills: notifying on any applied change, or on a name change.
   */
  it('EVENT-CHANGE-NOTIF-05-C changes to other fields notify nobody, directly or by an approved request', async () => {
    const eventId = await seedEvent();
    await edit(coo, eventId, {
      name: 'Renamed Gala',
      purpose: 'New purpose',
      description: 'New description',
      expectedAttendance: 70,
      layout: 'Theatre',
      facilities: ['Catering', 'Projector'],
      accessibility: ['Hearing loop'],
      equipmentNeeds: 'Four microphones',
    }).expect(200);

    const confirmed = await seedEvent('Confirmed');
    const filed = await submitRequest(org, confirmed, { description: 'Another description', expectedAttendance: 60 }).expect(201);
    await approveRequest(coo, confirmed, filed.body.id ?? filed.body.request?.id).expect(200);

    expect((await eventRow(eventId)).event_name).toBe('Renamed Gala');
    expect(await stored(eventId)).toEqual([]);
    expect(await stored(confirmed)).toEqual([]);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-06-D (AC6): the Attendee reads the notice in the same feed as their other event notices, unread;
   * marking it read sticks after signing in again; the Organiser and the Coordinator never see it, and another
   * Attendee cannot mark it read.
   * Kills: the notice missing from the Attendee feed, the read state not stored, a notice visible to other roles.
   */
  it('EVENT-CHANGE-NOTIF-06-D the Attendee sees it unread, it stays read after signing in again, others never see it', async () => {
    const eventId = await seedEvent();
    await edit(coo, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(200);

    const [notice] = await rescheduled(att);
    expect(notice.read).toBe(false);
    await markRead(outsider, notice.id).expect(404);
    await markRead(att, notice.id).expect(201);

    const email = (await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [att.uid])).rows[0].email;
    const again: Session = { uid: att.uid, cookie: await loginCookie(email) };
    expect((await rescheduled(again)).map((n) => [n.id, n.read])).toEqual([[notice.id, true]]);
    for (const other of [org, coo, otherCoo]) expect(await rescheduled(other)).toEqual([]);
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  /**
   * EVENT-CHANGE-NOTIF-07-B (AC7): a refused change (end before start, an event that is Confirmed, another
   * Coordinator's event, an Organiser) produces no notification and leaves the schedule as it was.
   * Kills: writing the notice before the change is validated.
   */
  it('EVENT-CHANGE-NOTIF-07-B a refused change writes no notification', async () => {
    const eventId = await seedEvent();
    const confirmed = await seedEvent('Confirmed');

    await edit(coo, eventId, { startDateTime: NEW_END, endDateTime: NEW_START }).expect(400);
    await edit(coo, confirmed, { startDateTime: NEW_START }).expect(409);
    await edit(otherCoo, eventId, { startDateTime: NEW_START }).expect(404);
    await edit(org, eventId, { startDateTime: NEW_START }).expect(403);

    expect(await stored(eventId)).toEqual([]);
    expect(await stored(confirmed)).toEqual([]);
    expect((await eventRow(eventId)).start_date_time.toISOString()).toBe(SLOT_START);
  });

  /**
   * EVENT-CHANGE-NOTIF-07-C (AC7): when the notification cannot be saved the whole change is rolled back: the event
   * keeps its old schedule and no notification or history entry exists. A trigger scoped to this event's id forces the
   * failure and is removed afterwards.
   * Kills: saving the schedule outside the notification's transaction.
   */
  it('EVENT-CHANGE-NOTIF-07-C rolls the change back when the notification cannot be saved', async () => {
    const eventId = await seedEvent();
    const suffix = eventId.replaceAll('-', '');
    await pool.query(`CREATE OR REPLACE FUNCTION spm181_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spm181 forced failure'; END $$`);
    await pool.query(
      `CREATE TRIGGER spm181_fail_${suffix} BEFORE INSERT ON notifications FOR EACH ROW WHEN (NEW.related_event_id = '${eventId}' AND NEW.type = '${TYPE}') EXECUTE FUNCTION spm181_fail_${suffix}()`,
    );
    try {
      await edit(coo, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(500);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS spm181_fail_${suffix} ON notifications`);
      await pool.query(`DROP FUNCTION IF EXISTS spm181_fail_${suffix}()`);
    }

    const row = await eventRow(eventId);
    expect(row.start_date_time.toISOString()).toBe(SLOT_START);
    expect(row.end_date_time.toISOString()).toBe(SLOT_END);
    expect(await stored(eventId)).toEqual([]);
  });

  /**
   * Waits, without sleeping or polling, until no statement another connection started on `notifications` is still running.
   * A notice written outside the request's transaction blocks on the event row the transaction holds locked, and commits
   * only after the transaction has rolled back; taking this table lock queues behind that statement, so the assertions
   * that follow see it. With nothing in flight the lock is granted at once.
   */
  async function settleNotifications() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE notifications IN SHARE ROW EXCLUSIVE MODE');
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  /** Installs a trigger that raises for rows of this event only; returns its remover. */
  async function failOn(table: string, when: string, eventId: string, timing: 'INSERT' | 'UPDATE') {
    const name = `spm181_fail_${eventId.replaceAll('-', '')}_${table}`;
    await pool.query(`CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spm181 forced failure'; END $$`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE ${timing} ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${name}()`);
    return async () => {
      await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
      await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
    };
  }

  /**
   * EVENT-CHANGE-NOTIF-07-C (AC7): confirming a flagged change is atomic. A fault scoped to this event's flagged change
   * row, raised after the schedule is saved and the attendees are notified, rolls everything back: the event keeps its
   * old schedule, the change stays pending and no notification row exists. A notice written through another connection
   * would block on the locked event row, then commit after the rollback; the assertions wait for it (settleNotifications).
   * Kills: writing the notice outside the confirmation's transaction, committing the schedule without the resolution.
   */
  it('EVENT-CHANGE-NOTIF-07-C rolls back a confirmed flagged change when a later step fails', async () => {
    const eventId = await seedEvent();
    await book(eventId);
    const flagged = await edit(coo, eventId, { startDateTime: '2031-03-10T01:00:00.000Z' }).expect(200);
    const remove = await failOn('event_flagged_changes', `NEW.event_id = '${eventId}'`, eventId, 'UPDATE');
    try {
      await resolve(coo, eventId, flagged.body.flagged[0].id, { decision: 'confirm' }).expect(500);
    } finally {
      await remove();
    }
    await settleNotifications();

    expect((await eventRow(eventId)).start_date_time.toISOString()).toBe(SLOT_START);
    expect(await stored(eventId)).toEqual([]);
    const pending = await pool.query('SELECT status FROM event_flagged_changes WHERE event_id = $1', [eventId]);
    expect(pending.rows.map((row) => row.status)).toEqual(['Needs Review']);
  });

  /**
   * EVENT-CHANGE-NOTIF-07-C (AC7): approving a change request is atomic. A fault scoped to this event's approval notice
   * to the Organiser, raised after the schedule is saved and the attendees are notified, rolls everything back: the
   * event keeps its schedule and status, and no rescheduled notification row exists.
   * Kills: writing the attendee notice outside the approval's transaction.
   */
  it('EVENT-CHANGE-NOTIF-07-C rolls back an approved change request when a later step fails', async () => {
    const eventId = await seedEvent('Confirmed');
    const filed = await submitRequest(org, eventId, { startDateTime: NEW_START, endDateTime: NEW_END }).expect(201);
    const remove = await failOn('notifications', `NEW.related_event_id = '${eventId}' AND NEW.type = 'change_request_approved'`, eventId, 'INSERT');
    try {
      await approveRequest(coo, eventId, filed.body.id ?? filed.body.request?.id).expect(500);
    } finally {
      await remove();
    }
    await settleNotifications();

    const row = await eventRow(eventId);
    expect(row.start_date_time.toISOString()).toBe(SLOT_START);
    expect(row.end_date_time.toISOString()).toBe(SLOT_END);
    expect(await stored(eventId)).toEqual([]);
  });
});
