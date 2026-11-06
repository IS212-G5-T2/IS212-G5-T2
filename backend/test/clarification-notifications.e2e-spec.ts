/*
 * SPM-177 Clarification notifications are saved but never shown, over HTTP against real PostgreSQL. A Coordinator
 * requests a clarification and the Organiser reads the notice in the bell feed; the Organiser replies and resolves and
 * the Coordinator reads those; each notice marks read and stays read; reassignment marks the previous Coordinator's
 * unread clarification notices read. Every user signs in through the real login route.
 *
 * Story: SPM-177. Test cases: CLARIFY-NOTIF-06-A, 06-B, 06-C.
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
if (!database && process.env.CI) throw new Error('SPM-177 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');
if (database && !process.env.DATABASE_URL) process.env.DATABASE_URL = database;

type Session = { uid: string; cookie: string };
type FeedItem = { id: string; type: string; message: string; relatedEventId: string | null; audienceRole: string; read: boolean };

describe.skipIf(!database)('SPM-177 clarification notifications over HTTP (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let pool: pg.Pool;
  let eventIds: string[];
  let userIds: string[];
  let org: Session;
  let coo: Session;
  let newCoo: Session;
  let lead: Session;

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
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication({ logger: ['warn', 'log'] });
    await app.init();
    // Bound to 127.0.0.1 so supertest cannot reach another local listener.
    await app.listen(0, '127.0.0.1');
    org = await createSession('ORGANISER');
    coo = await createSession('COORDINATOR');
    newCoo = await createSession('COORDINATOR');
    lead = await createSession('COORDINATOR_LEAD');
  });
  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) {
      await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::text[])', [userIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    }
  });

  // ---- fixtures ----------------------------------------------------------------------------------------------------

  const http = () => {
    if (!app) throw new Error('The test application is not running.');
    return request(app.getHttpServer());
  };
  const as = <T extends request.Test>(req: T, session: Session): T => req.set('Cookie', session.cookie) as T;
  const feed = async (session: Session) => (await as(http().get('/api/notifications'), session).expect(200)).body as FeedItem[];
  const clarificationFeed = async (session: Session, type: string) => (await feed(session)).filter((n) => n.type === type);
  const markRead = (session: Session, id: string) => as(http().post(`/api/notifications/${id}/read`), session);
  const requestClarification = async (eventId: string) =>
    (await as(http().post(`/api/events/${eventId}/clarifications`), coo).send({ message: 'Please confirm the stage plan.' }).expect(201)).body.id as string;
  const reply = (eventId: string, clarificationId: string, session: Session) =>
    as(http().post(`/api/events/${eventId}/clarifications/${clarificationId}/reply`), session).send({ message: 'Confirmed, see the plan.' });
  const resolve = (eventId: string, clarificationId: string, session: Session) =>
    as(http().post(`/api/events/${eventId}/clarifications/${clarificationId}/resolve`), session);

  async function createSession(role: string): Promise<Session> {
    const email = `e2e-clarify-notif-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, `SPM-177 ${role}`],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const attempt = await http().post('/api/auth/login').send({ email, password: 'password123' });
    if (attempt.status !== 201) throw new Error(`login returned ${attempt.status}`);
    const cookie = (attempt.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** A Planning event owned by `org`, assigned to `coo`. */
  async function seedEvent() {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, status, coordinator_id, coordinator_name, submission_key)
       VALUES ($1,$2,'Organiser','organiser@example.test','Clarify Gala','Purpose','Description',
         now() + interval '30 days', now() + interval '30 days 2 hours', 80, 'Planning', $3, 'Coordinator', $4)`,
      [id, org.uid, coo.uid, randomUUID()],
    );
    eventIds.push(id);
    return id;
  }

  // ---- DoD1 and DoD3 -----------------------------------------------------------------------------------------------

  /**
   * CLARIFY-NOTIF-06-A (SPM-177 DoD1, DoD3): the Coordinator's request reaches the Organiser's feed as an Organiser
   * notice for the event, and the Coordinator does not see their own request.
   * Kills: the type missing from the Organiser list, a notice shown to the sender.
   */
  it('CLARIFY-NOTIF-06-A the Organiser sees a requested clarification and can mark it read', async () => {
    const eventId = await seedEvent();
    await requestClarification(eventId);

    const [notice] = await clarificationFeed(org, 'clarification');
    expect(notice).toMatchObject({ relatedEventId: eventId, audienceRole: 'organiser', read: false, message: 'SPM-177 COORDINATOR requested clarification on "Clarify Gala".' });
    expect(await clarificationFeed(coo, 'clarification')).toHaveLength(0);

    await markRead(org, notice.id).expect(201);
    expect((await clarificationFeed(org, 'clarification'))[0].read).toBe(true);
  });

  /**
   * CLARIFY-NOTIF-06-B (SPM-177 DoD1, DoD3): the Organiser's reply and resolve reach the Coordinator as Coordinator
   * notices, and the Coordinator's reply reaches the Organiser; read state persists.
   * Kills: the reply or resolved type missing from either list, a wrong audience, a read that does not persist.
   */
  it('CLARIFY-NOTIF-06-B reply and resolved notices reach the other party and mark read', async () => {
    const eventId = await seedEvent();
    const clarificationId = await requestClarification(eventId);

    await reply(eventId, clarificationId, org).expect(201);
    await resolve(eventId, clarificationId, org).expect(201);

    const replied = await clarificationFeed(coo, 'clarification_reply');
    const resolved = await clarificationFeed(coo, 'clarification_resolved');
    expect(replied).toMatchObject([{ relatedEventId: eventId, audienceRole: 'coordinator', read: false }]);
    expect(resolved).toMatchObject([{ relatedEventId: eventId, audienceRole: 'coordinator', read: false }]);
    expect(await clarificationFeed(org, 'clarification_reply')).toHaveLength(0);

    await markRead(coo, replied[0].id).expect(201);
    await markRead(coo, resolved[0].id).expect(201);
    expect((await clarificationFeed(coo, 'clarification_reply'))[0].read).toBe(true);
    expect((await clarificationFeed(coo, 'clarification_resolved'))[0].read).toBe(true);
    await markRead(org, replied[0].id).expect(404);
  });

  /**
   * CLARIFY-NOTIF-06-C (SPM-177 DoD4): reassignment marks the previous Coordinator's unread clarification notices for
   * the event read and leaves the Organiser's.
   * Kills: the clarification types missing from the reassignment read-marking, a mark that reaches the wrong recipient.
   */
  it('CLARIFY-NOTIF-06-C reassignment marks the previous coordinator\'s unread clarification notices read', async () => {
    const eventId = await seedEvent();
    const clarificationId = await requestClarification(eventId);
    await reply(eventId, clarificationId, org).expect(201);
    await resolve(eventId, clarificationId, org).expect(201);

    await as(http().post(`/api/lead/events/${eventId}/reassign`), lead)
      .send({ coordinatorId: newCoo.uid, currentCoordinatorId: coo.uid })
      .expect(201);

    const stored = await pool.query<{ recipient_id: string; type: string; read: boolean }>(
      `SELECT recipient_id, type, read FROM notifications WHERE related_event_id = $1 AND type LIKE 'clarification%'`,
      [eventId],
    );
    const forOld = stored.rows.filter((row) => row.recipient_id === coo.uid);
    expect(forOld.map((row) => row.type).sort()).toEqual(['clarification_reply', 'clarification_resolved']);
    expect(forOld.every((row) => row.read)).toBe(true);
    expect(stored.rows.find((row) => row.recipient_id === org.uid)).toMatchObject({ type: 'clarification', read: false });
  });
});
