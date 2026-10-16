/*
 * Story: SPM-138 Join Waitlist When Event Is at Capacity (backend half).
 * ACs (Jira): AC1 to AC12. Supporting cases: 13 (bulk ordering), 14 (SPM-63 report rule unchanged), 15 (strict body).
 * Test cases implemented here: JOIN-WAITLIST-01-A to 15-A from docs/specs/SPM-138-test-cases.md. Cases that need the
 * frontend are asserted in the colocated .test.tsx files. 09-A's frontend part, 11-E, 12-A, 12-B and 12-C are Blocked:
 * they appear as it.skip and name the blocker.
 *
 * Sleep policy: the only sleep in the backend waitlist suite is the bounded lock-waiter poll in waitForLockWaiters
 * (200 attempts, 50 ms apart, throws on timeout; see the comment there and docs/specs/SPM-138-test-cases.md).
 *
 * Real Nest pipeline and real PostgreSQL (database/postgresql/init 001 to 016 plus backend/migrations/011). Time comes
 * only from the injected CLOCK, which each test sets. Every test builds its own event fixtures and attendees (clones).
 * The shared seed (002_seed_data.sql) is never edited. Oracles are literals from the spec and the AC text.
 *
 * Fixture labels (EVT-70x, ATT-0x, COO-01, ORG-01) are used in comments only. Users have fixed ids and emails per label
 * (fixtureId, namespace 1 for attendees by label, so ATT-04 sorts before ATT-05), so every run builds the same users.
 * Events have fixed ids (fixedEventId, namespace 4, sequential within a test) and their submission key is the event id, so
 * every run builds the same events. No oracle depends on an event id's value. Suite clock:
 * T0 = 2026-10-14T12:00:00+08:00 (= 2026-10-14T04:00:00Z). The EVT-701 family opens at T0 - 1 day, closes at
 * T0 + 5 days 23:59 SGT and starts at T0 + 10 days 18:00 SGT, unless a case says otherwise.
 *
 * ASSUMPTION index (each assumption is tagged in the test that depends on it):
 *  - A-ST: API status values are lowercase ('waitlisted', 'removed'); stored values are Title-case (D3).
 *  - A-CODE-DUP: a duplicate waitlist join answers 409 with code 'already_on_waitlist' (the spec fixes the text only).
 *  - A-CODE-WL: a join on a not-full event answers 422 with code 'WAITLIST_NOT_AVAILABLE' (D14).
 *  - A-NOT-WITHDRAWABLE: withdrawing a Removed or Cancelled entry answers 409 'registration_not_withdrawable' (12-B asks for 409; the copy is ours).
 *  - A-05C: the by-id request in 05-C goes through POST /registrations/:id/withdraw, the only by-id route; no GET-by-id route exists.
 *  - A-07A-CALLS: in 07-A ATT-04 joins first, then ATT-06 (stated time 10:00:00), then ATT-05; the stated times set the order.
 *  - A-MAIL: the backend has no mail transport (D13: no email), so 09-B checks the notification rows only.
 *  - A-TIME: the promotion instant is stored in registered_at and is not asserted here (F23).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFParse } from 'pdf-parse';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DatabaseService } from '../src/database/database.service.js';
import { runRegistrationCloseJob } from '../src/registrations/waitlist/close-job.js';
import { releaseWaitlistForCancelledEvent } from '../src/registrations/waitlist/cancel-releaser.js';
import { beforeRegistrationWindowChange } from '../src/registrations/waitlist/reopen.js';

const database = process.env.DATABASE_URL;
const PASSWORD = 'password123';
const NAME = 'Gala Waitlist Night';
const T0 = new Date('2026-10-14T12:00:00+08:00');
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// The EVT-701 family window (see the header).
const OPENS_T0_MINUS_1D = new Date(T0.getTime() - DAY);
const CLOSES_T0_PLUS_5D = '2026-10-19T23:59:00+08:00';
const START_T0_PLUS_10D = '2026-10-24T18:00:00+08:00';

// Messages copied from the SPM-138 message table (D14) and the SPM-61/120 messages.
const MSG_WL_01 = (position: number) => `You have joined the waitlist for ${NAME}. Your position is ${position}.`;
const MSG_WL_03 = 'This event still has available spots. Please register directly.';
const MSG_WL_04 = 'You are already on the waitlist for this event.';
const MSG_WL_05 = `A spot opened up. You are now registered for ${NAME}.`;
const MSG_01 = 'Registration has closed for this event.';
const MSG_02_OPENS_17_OCT = 'Registration for this event opens on 17 Oct 2026, 09:00 SGT.';
const MSG_04 = 'This event is fully booked.';
const MSG_05 = 'You are already registered for this event.';
const MSG_07 = 'Registration not found.';
const MSG_11 = `Your withdrawal from ${NAME} has been processed.`;
const MSG_12 = 'This registration has already been withdrawn.';
const MSG_OCCURRED = 'Event has already occurred';
const MSG_ATTENDEE_ONLY = 'Attendee access required.';
// SPM-136 rule (a person cannot be both a waiting-list attendee and the event's organiser or coordinator). ASSUMED wording.
const MSG_OWN_EVENT = 'An organiser or the assigned coordinator cannot join the waiting list for their own event.';

interface Who {
  uid: string;
  email: string;
  cookie: string;
}

/** Contact details used by direct registrations (SPM-61 body). */
const details = (label: string) => ({
  fullName: `Queue ${label}`,
  email: `queue-${label.toLowerCase()}@example.com`,
  contactNumber: '91234567',
});

describe.skipIf(!database)('SPM-138 join waitlist (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = T0;
  const eventIds: string[] = [];
  const userIds: string[] = [];
  const lockHolders: { release: () => Promise<void> }[] = [];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    now = T0;
    eventSeq = 0;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    // Listening once up front lets the parallel requests share one server.
    await app.listen(0);
  });
  afterEach(async () => {
    // Release any lock a test opened first: a held event lock would block the cleanup deletes below.
    for (const holder of lockHolders.splice(0)) await holder.release();
    await app?.close();
    await pool.query('DROP TRIGGER IF EXISTS spm138_fault ON notifications');
    await pool.query('DROP FUNCTION IF EXISTS spm138_fault_fn()');
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  /**
   * Creates a user with the given roles and logs in; returns the id, email and session cookie. The id and email are
   * fixed per fixture label (see fixtureId), so every run builds the same users, and the ids sort by label.
   */
  async function createUser(roles: string[], name: string, id: string, email: string): Promise<Who> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, crypt($4, gen_salt('bf', 4))) RETURNING id`,
      [id, email, name, PASSWORD],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])', [uid, roles]);
    return { uid, email, cookie: await login(email) };
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('connectsphere_session='))!;
    return cookie.split(';', 1)[0];
  }

  /**
   * Fixed UUID for a fixture: namespace 1 are attendees (label NN is the spec's ATT-NN), 2 the other named users,
   * 3 the bulk attendees of 13-A. The same fixture always gets the same id, so no run depends on random ids.
   */
  const fixtureId = (namespace: 1 | 2 | 3, n: number) => `${namespace}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  /** An attendee with the display name "Attendee NN" and a fixed id and email (ATT-NN). */
  const attendee = (label: string) =>
    createUser(['ATTENDEE'], `Attendee ${label}`, fixtureId(1, Number(label)), `spm138-att-${label}@example.com`);

  /** A named non-attendee user with a fixed id and email; n is its slot in namespace 2. */
  const namedUser = (roles: string[], name: string, n: number) =>
    createUser(roles, name, fixtureId(2, n), `spm138-user-${n}@example.com`);

  /**
   * Fixed event ids (namespace 4, sequential from 1 within each test, reset in beforeEach). The submission key is the event
   * id itself, which is unique per event, so no run depends on random ids. No oracle reads an event id's value.
   */
  let eventSeq = 0;
  const fixedEventId = () => `40000000-0000-4000-8000-${String((eventSeq += 1)).padStart(12, '0')}`;

  /** Seeds an event. Defaults are the EVT-701 window: capacity 3, open at T0 - 1 day, closes T0 + 5 days 23:59. */
  async function seedEvent(options: {
    name?: string;
    start?: string;
    opens?: Date | string | null;
    closes?: string | null;
    limit?: number;
    enabled?: boolean;
    status?: string;
    coordinatorId?: string;
    organiserId?: string;
  } = {}) {
    const id = fixedEventId();
    eventIds.push(id);
    const start = new Date(options.start ?? START_T0_PLUS_10D);
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
         registration_opens_at, registration_closes_at, status, submission_key, coordinator_id)
       VALUES ($1,$2,'Organiser','o@example.com',$3,'Purpose',$4,$5,50,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        options.organiserId ?? 'organiser-x',
        options.name ?? NAME,
        start,
        new Date(start.getTime() + 2 * HOUR),
        options.enabled ?? true,
        options.limit ?? 3,
        options.opens === undefined ? OPENS_T0_MINUS_1D : options.opens,
        options.closes === undefined ? CLOSES_T0_PLUS_5D : options.closes,
        options.status ?? 'Confirmed',
        id,
        options.coordinatorId ?? null,
      ],
    );
    return id;
  }

  /** A row for an attendee with the given stored status (Registered by default). */
  async function seedRow(eventId: string, attendeeId: string, status: string, label = 'R') {
    const d = details(label);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [eventId, attendeeId, status, d.fullName, d.email, d.contactNumber],
    );
    return result.rows[0].id;
  }

  /** A Confirmed row (status Registered), the seeded capacity. */
  const seedRegistered = (eventId: string, attendeeId: string, label = 'R') => seedRow(eventId, attendeeId, 'Registered', label);

  /** The EVT-706 / EVT-701 fixture: capacity 3, ATT-01 to ATT-03 Confirmed, so the event is full. */
  async function seedFullGala(registered: Who[] = [], options: Parameters<typeof seedEvent>[0] = {}) {
    const eventId = await seedEvent(options);
    for (const [index, who] of registered.entries()) await seedRegistered(eventId, who.uid, `0${index + 1}`);
    return eventId;
  }

  /** POST /api/events/:eventId/waitlist with an optional cookie and body. Omitting the body sends none. */
  function join(eventId: string, who: Who | undefined, body?: object) {
    let req = request(app.getHttpServer()).post(`/api/events/${eventId}/waitlist`);
    if (who) req = req.set('Cookie', who.cookie);
    return body === undefined ? req : req.send(body);
  }

  /** Joins and expects 201. */
  async function joinAs(eventId: string, who: Who) {
    return join(eventId, who, {}).expect(201);
  }

  /** The direct register route (SPM-61). */
  function register(eventId: string, who: Who, label: string) {
    return request(app.getHttpServer())
      .post(`/api/events/${eventId}/registrations`)
      .set('Cookie', who.cookie)
      .send(details(label));
  }

  /** POST /api/registrations/:id/withdraw (SPM-120) with an optional cookie. */
  function withdrawById(registrationId: string, who?: Who) {
    let req = request(app.getHttpServer()).post(`/api/registrations/${registrationId}/withdraw`);
    if (who) req = req.set('Cookie', who.cookie);
    return req;
  }

  /** GET /api/events/:eventId/registrations/me for the caller. */
  function mine(eventId: string, who?: Who) {
    let req = request(app.getHttpServer()).get(`/api/events/${eventId}/registrations/me`);
    if (who) req = req.set('Cookie', who.cookie);
    return req;
  }

  /** GET /api/events/:eventId as the caller (or anonymously). */
  function event(eventId: string, who?: Who) {
    let req = request(app.getHttpServer()).get(`/api/events/${eventId}`);
    if (who) req = req.set('Cookie', who.cookie);
    return req;
  }

  /**
   * Holds the event row lock from its own connection (BEGIN; SELECT ... FOR UPDATE) so that requests which need the
   * lock block on it. release() rolls the holder back. Only the requests' own ordering decides the outcome after release.
   */
  async function holdEventLock(eventId: string) {
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    let released = false;
    const finish = async (verb: 'COMMIT' | 'ROLLBACK') => {
      if (released) return;
      released = true;
      await holder.query(verb);
      holder.release();
    };
    return {
      /** Runs a statement on the holder's own transaction (it already owns the event row lock). */
      query: (text: string, params: unknown[]) => holder.query(text, params),
      commit: () => finish('COMMIT'),
      release: () => finish('ROLLBACK'),
    };
  }

  /**
   * Polls pg_stat_activity until `count` requests are blocked on a lock taken by a FOR UPDATE statement on the
   * events row.
   *
   * DOCUMENTED BOUNDED EXCEPTION to the no-sleep rule: this poll is the only sleep in the backend waitlist suite (this file
   * and the unit specs under src/registrations). It is a bounded 200 x 50 ms poll on pg_stat_activity (about 10 s); it
   * throws if the waiter never appears, so it fails loudly instead of racing. The lock is released only after the waiter
   * is observed. No other sleep may be added to the backend waitlist suite.
   */
  async function waitForLockWaiters(count: number) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::integer AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`,
      );
      if (result.rows[0].n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`expected ${count} requests blocked on the event row lock`);
  }

  /**
   * Fires the requests while the event row lock is held, waits until `waiters` of them are blocked on it, then
   * releases the lock. The requests therefore really overlap: they reach the lock together, not one after another.
   */
  async function overlapped(eventId: string, waiters: number, fire: () => PromiseLike<request.Response>[]) {
    const holder = await holdEventLock(eventId);
    try {
      const pending = Promise.all(fire());
      await waitForLockWaiters(waiters);
      await holder.release();
      return await pending;
    } finally {
      await holder.release();
    }
  }

  /** The releaser runs under the event row lock, as its caller must (the lock is taken in the same transaction). */
  function releaseUnderLock(eventId: string, at: Date = T0) {
    return app.get(DatabaseService).transaction(async (client) => {
      await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      return releaseWaitlistForCancelledEvent(client, eventId, at);
    });
  }

  /** The stored row for an attendee on an event. */
  async function rowOf(eventId: string, attendeeId: string) {
    const result = await pool.query(
      `SELECT id, status, joined_at, waitlist_seq, withdrawn_at, removed_at, registered_at
         FROM event_registrations WHERE event_id = $1 AND attendee_id = $2`,
      [eventId, attendeeId],
    );
    return result.rows[0];
  }
  const statusOf = async (eventId: string, attendeeId: string) => (await rowOf(eventId, attendeeId))?.status;
  const countWhere = (eventId: string, status: string) =>
    pool
      .query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = $2', [eventId, status])
      .then((r) => r.rows[0].count);
  const notificationsFor = (userId: string) =>
    pool
      .query<{ type: string; message: string; related_event_id: string; related_user_id: string; read: boolean }>(
        'SELECT type, message, related_event_id, related_user_id, read FROM notifications WHERE recipient_id = $1 ORDER BY created_at, id',
        [userId],
      )
      .then((r) => r.rows);
  const notificationsForEvent = (eventId: string) =>
    pool
      .query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM notifications WHERE related_event_id = $1', [eventId])
      .then((r) => r.rows[0].count);
  const positionOf = async (eventId: string, who: Who) => (await mine(eventId, who).expect(200)).body.registration.waitlistPosition;

  // JOIN-WAITLIST-01: AC1 (join when the event is full)
  describe('AC1: an attendee can join the waitlist when the event is full (JOIN-WAITLIST-01)', () => {
    /**
     * Oracle (01-A): 201, status waitlisted, position 1; one row with joined_at = T0; Confirmed count stays 3.
     * Kills M4: the join stores the wrong status (for example Registered).
     */
    it('JOIN-WAITLIST-01-A: joining an empty list returns 201 at position 1 and stores a waitlisted row', async () => {
      // Arrange: EVT-701 full with ATT-01 to ATT-03 Confirmed; ATT-04 is not on the list.
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att04 = await attendee('04');

      // Act
      const res = await join(eventId, att04, {});

      // Assert: the response
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'waitlisted', position: 1, message: MSG_WL_01(1) });
      expect(res.body.registrationId).toEqual(expect.any(String));
      // Assert: the stored row and the Confirmed count
      const row = await rowOf(eventId, att04.uid);
      expect(row.status).toBe('Waitlisted');
      expect(row.joined_at.toISOString()).toBe(T0.toISOString());
      expect(await countWhere(eventId, 'Registered')).toBe(3);
    });

    /**
     * Oracle (01-B): 422 registration_full; no row; Confirmed 3; no implicit waitlist entry.
     * Kills M3: the capacity check is removed from direct registration, so the attendee is confirmed past capacity.
     */
    it('JOIN-WAITLIST-01-B-ERR: a direct registration on a full event is refused and creates no waitlist entry', async () => {
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att04 = await attendee('04');

      const res = await register(eventId, att04, '04');

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'registration_full', message: MSG_04 });
      expect(await rowOf(eventId, att04.uid)).toBeUndefined();
      expect(await countWhere(eventId, 'Registered')).toBe(3);
      expect(await countWhere(eventId, 'Waitlisted')).toBe(0);
    });

    /**
     * Oracle (01-C A): EVT-702 capacity 10 with 9 Confirmed has a free place; the join is refused with MSG-WL-03; no row.
     * Oracle (01-C B): after ATT-05 registers the event is 10 of 10; ATT-04 may join and gets 201.
     * Kills M1: the join ignores fullness and is allowed while spots remain.
     */
    it('JOIN-WAITLIST-01-C-BND: a join is refused while spots remain, and allowed once the event is full', async () => {
      // Arrange A: EVT-702, capacity 10, nine Confirmed.
      const eventId = await seedEvent({ limit: 10 });
      for (const label of ['01', '02', '03', '06', '07', '08', '09', '10', '11']) await seedRegistered(eventId, (await attendee(label)).uid);
      const att04 = await attendee('04');
      const att05 = await attendee('05');

      // Act A
      const refused = await join(eventId, att04, {});

      // Assert A
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'WAITLIST_NOT_AVAILABLE', message: MSG_WL_03 });
      expect(await rowOf(eventId, att04.uid)).toBeUndefined();

      // Arrange B: ATT-05 takes the tenth place, so the event is 10 of 10.
      expect((await register(eventId, att05, '05')).status).toBe(201);

      // Act B
      const allowed = await join(eventId, att04, {});

      // Assert B
      expect(allowed.status).toBe(201);
      expect(allowed.body).toMatchObject({ status: 'waitlisted', position: 1 });
    });

    /**
     * Oracle (01-D A): EVT-704 full and closed at T0 - 1 day 23:59; join refused with MSG-01; no row.
     * Oracle (01-D B): EVT-705 full and opening at T0 + 3 days 09:00; join refused with MSG-02; no row.
     * Kills M5 (the waitlist join skips the window check when the event is full) and M6 (the open instant is not enforced).
     */
    it.each([
      ['A closed', { closes: '2026-10-13T23:59:00+08:00' }, 422, 'registration_closed', MSG_01],
      ['B not yet open', { opens: '2026-10-17T09:00:00+08:00' }, 422, 'registration_not_open', MSG_02_OPENS_17_OCT],
    ])('JOIN-WAITLIST-01-D: the window is checked before fullness (%s)', async (_label, window, status, code, message) => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], window);
      const att04 = await attendee('04');

      const res = await join(eventId, att04, {});

      expect(res.status).toBe(status);
      expect(res.body).toMatchObject({ code, message });
      expect(await rowOf(eventId, att04.uid)).toBeUndefined();
    });

    /**
     * Oracle (01-E A): ATT-01 is Confirmed on EVT-706; a join is refused with MSG-05 (409).
     * Oracle (01-E B): ATT-04 joins again; 409 MSG-WL-04; the entry stays at position 1.
     * Oracle (01-E C): five parallel joins by ATT-05 give exactly one 201 (position 2) and four 409 MSG-WL-04; one row.
     * Kills M7: a duplicate join is accepted and creates a second entry.
     */
    it('JOIN-WAITLIST-01-E-ERR: duplicate joins are refused for a confirmed attendee, a waitlisted attendee, and in parallel', async () => {
      // Arrange: EVT-706 full; ATT-04 waitlisted at position 1.
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att04 = await attendee('04');
      const att05 = await attendee('05');
      await joinAs(eventId, att04);

      // Act and assert A: a Confirmed attendee cannot join.
      const asConfirmed = await join(eventId, confirmed[0], {});
      expect(asConfirmed.status).toBe(409);
      expect(asConfirmed.body).toMatchObject({ code: 'already_registered', message: MSG_05 });

      // Act and assert B: a waitlisted attendee cannot join twice; the position stays 1.
      const again = await join(eventId, att04, {});
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ code: 'already_on_waitlist', message: MSG_WL_04 }); // A-CODE-DUP
      expect(await positionOf(eventId, att04)).toBe(1);

      // Act and assert C: five parallel joins by the same attendee.
      const parallel = await Promise.all(Array.from({ length: 5 }, () => join(eventId, att05, {})));
      expect(parallel.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
      const winner = parallel.find((r) => r.status === 201)!;
      expect(winner.body).toMatchObject({ status: 'waitlisted', position: 2 });
      for (const loser of parallel.filter((r) => r.status === 409)) expect(loser.body.message).toBe(MSG_WL_04);
      const rows = await pool.query('SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND attendee_id = $2', [eventId, att05.uid]);
      expect(rows.rows[0].count).toBe(1);
    });

    /**
     * Oracle (01-F, 401): no token, and an expired session, answer 401; no row.
     * Kills M8: the auth check is dropped from the join route (an anonymous join would be accepted).
     */
    it.each([
      ['no token', false],
      ['an expired session', true],
    ])('JOIN-WAITLIST-01-F: an unauthenticated join is refused with 401 (%s)', async (_label, expired) => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const who = await attendee('04');
      if (expired) {
        await pool.query(
          `UPDATE auth_sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE user_id = $1`,
          [who.uid],
        );
      }

      const res = await join(eventId, expired ? who : undefined, {});

      expect(res.status).toBe(401);
      expect(await rowOf(eventId, who.uid)).toBeUndefined();
    });

    /**
     * Oracle (01-F, 403): COO-01 and ORG-01 hold no Attendee role; both get 403 with the existing permission message; no row.
     * Kills M8: the role guard is removed from the join route.
     */
    it.each([
      ['COO-01 a coordinator', ['COORDINATOR']],
      ['ORG-01 an organiser', ['ORGANISER']],
    ])('JOIN-WAITLIST-01-F: a user without the Attendee role is refused with 403 (%s)', async (_label, roles) => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const staff = await namedUser(roles, 'Staff Member', 1);

      const res = await join(eventId, staff, {});

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(MSG_ATTENDEE_ONLY);
      expect(await rowOf(eventId, staff.uid)).toBeUndefined();
    });

    /**
     * Oracle (01-F, dual role): a user holding both Attendee and another role may join.
     */
    // Kills: K-01F (a user holding another role besides Attendee is refused the join)
    it('JOIN-WAITLIST-01-F: a user who holds both the Attendee and another role may join', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const dual = await namedUser(['ATTENDEE', 'ORGANISER'], 'Dual Role', 2);

      const res = await join(eventId, dual, {});

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'waitlisted', position: 1 });
    });
  });

  // JOIN-WAITLIST-02: AC2 (the event page shows full and the waitlist)
  describe('AC2: the event shows that it is full and that the waitlist is open (JOIN-WAITLIST-02)', () => {
    /**
     * Oracle (02-A): EVT-701 full and open. isFull, waitlistAvailable and registrationOpen are true; no spots left.
     * Kills a waitlistAvailable that ignores the window or fullness.
     */
    it('JOIN-WAITLIST-02-A: a full, open event reports isFull, waitlistAvailable and registrationOpen as true', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const viewer = await attendee('04');

      const res = await event(eventId, viewer).expect(200);

      expect(res.body).toMatchObject({ isFull: true, waitlistAvailable: true, registrationOpen: true, availableSpots: 0, registrationLimit: 3 });
    });

    /**
     * Oracle (02-B): EVT-702 (9 of 10) is not full; EVT-704 is full but closed; EVT-705 is full but not yet open.
     * Each has waitlistAvailable false.
     */
    // Kills: K-02B (waitlistAvailable ignores the registration window)
    it('JOIN-WAITLIST-02-B-INT: waitlistAvailable is false when the event has a free place, is closed, or is not yet open', async () => {
      const notFull = await seedEvent({ limit: 10 });
      for (const label of ['01', '02', '03', '06', '07', '08', '09', '10', '11']) await seedRegistered(notFull, (await attendee(label)).uid);
      const closed = await seedFullGala([await attendee('12'), await attendee('13'), await attendee('14')], { closes: '2026-10-13T23:59:00+08:00' });
      const notOpen = await seedFullGala([await attendee('15'), await attendee('16'), await attendee('17')], { opens: '2026-10-17T09:00:00+08:00' });
      const viewer = await attendee('04');

      const a = (await event(notFull, viewer).expect(200)).body;
      const b = (await event(closed, viewer).expect(200)).body;
      const c = (await event(notOpen, viewer).expect(200)).body;

      expect(a).toMatchObject({ isFull: false, waitlistAvailable: false, registrationOpen: true, availableSpots: 1 });
      expect(b).toMatchObject({ isFull: true, waitlistAvailable: false, registrationOpen: false });
      expect(c).toMatchObject({ isFull: true, waitlistAvailable: false, registrationOpen: false });
    });
  });

  // JOIN-WAITLIST-03: AC3 (the status reads Waitlisted)
  describe('AC3: the status reads Waitlisted and survives a fresh session (JOIN-WAITLIST-03)', () => {
    /**
     * Oracle (03-A): the attendee's own read answers status 'waitlisted' (A-ST) with position 1.
     * Kills a missing status (the waitlisted row is not reported).
     */
    it('JOIN-WAITLIST-03-A-STATE: the attendee read reports status waitlisted after joining', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const att04 = await attendee('04');
      await joinAs(eventId, att04);

      const res = await mine(eventId, att04).expect(200);

      expect(res.body.registration).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    });

    /**
     * Oracle (03-C, UI): a waitlisted entry's read carries the join time (the card's "Joined waitlist on"), set by the injected
     * clock at the join. A registered row carries no join time. Kills W-JOIN (the read stops sending joinedAt).
     */
    it('JOIN-WAITLIST-03-C-STATE: the attendee read carries the join time for a waitlisted entry and none for a registered one', async () => {
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att04 = await attendee('04');
      await joinAs(eventId, att04);

      const waiting = await mine(eventId, att04).expect(200);
      expect(waiting.body.registration.joinedAt).toBe(T0.toISOString());
      const registered = await mine(eventId, confirmed[0]).expect(200);
      expect(registered.body.registration.joinedAt).toBeUndefined();
    });

    /**
     * Oracle (03-D, sad path): the attendee read settles a due list only for an event the attendee may see. A due waitlisted row
     * on a Planning event (not attendee-visible) is not settled and reads as no registration; a non-attendee's read is refused
     * (403) and settles nothing. Both rows stay Waitlisted. Kills K-03D (the settle is moved above the visibility filter).
     */
    // Kills: K-03D (the attendee read settles a due list before the visibility filter)
    it('JOIN-WAITLIST-03-D-ERR: a read settles only a visible event (a non-visible due row and a non-attendee read leave the row Waitlisted)', async () => {
      const hidden = await seedEvent({ status: 'Planning', closes: '2026-10-13T23:59:00+08:00' });
      const reachable = await seedEvent({ closes: '2026-10-13T23:59:00+08:00' });
      const waiter = await attendee('04');
      await seedRow(hidden, waiter.uid, 'Waitlisted');
      await seedRow(reachable, waiter.uid, 'Waitlisted');
      const organiser = await namedUser(['ORGANISER'], 'Organiser Probe', 9);

      const read = await mine(hidden, waiter).expect(200);
      expect(read.body.registration).toBeNull();
      expect(await statusOf(hidden, waiter.uid)).toBe('Waitlisted');

      await mine(reachable, organiser).expect(403);
      expect(await statusOf(reachable, waiter.uid)).toBe('Waitlisted');
    });

    /**
     * Oracle (03-B): Confirmed count 3, availableSpots 0; ATT-04 is still waitlisted after logging in again; ATT-05 still sees full.
     * Kills M2: a waitlisted row is reported as registered (Confirmed).
     */
    it('JOIN-WAITLIST-03-B-STATE: the waitlisted status is unchanged after logging in again, and the event stays full', async () => {
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att04 = await attendee('04');
      const att05 = await attendee('05');
      await joinAs(eventId, att04);

      const freshCookie = await login(att04.email);
      const reread = await mine(eventId, { ...att04, cookie: freshCookie }).expect(200);
      const viewer = await event(eventId, att05).expect(200);

      expect(reread.body.registration.status).toBe('waitlisted');
      expect(viewer.body).toMatchObject({ isFull: true, waitlistAvailable: true, availableSpots: 0 });
      expect(await countWhere(eventId, 'Registered')).toBe(3);
    });
  });

  // JOIN-WAITLIST-04: AC4 (the confirmation message states the position)
  describe('AC4: the confirmation message states the position (JOIN-WAITLIST-04)', () => {
    /**
     * Oracle (04-B): ATT-04, ATT-05 and ATT-06 join an empty list in order; the messages say 1, 2, 3; each equals the later read.
     * Kills non-increasing positions.
     */
    it('JOIN-WAITLIST-04-B: positions increase in join order and each response equals the later detail read', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];

      const r4 = await joinAs(eventId, a4);
      const r5 = await joinAs(eventId, a5);
      const r6 = await joinAs(eventId, a6);

      expect([r4.body.position, r5.body.position, r6.body.position]).toEqual([1, 2, 3]);
      expect([r4.body.message, r5.body.message, r6.body.message]).toEqual([MSG_WL_01(1), MSG_WL_01(2), MSG_WL_01(3)]);
      expect(await positionOf(eventId, a4)).toBe(r4.body.position);
      expect(await positionOf(eventId, a5)).toBe(r5.body.position);
      expect(await positionOf(eventId, a6)).toBe(r6.body.position);
    });

    /**
     * Oracle (04-C): five parallel joins by ATT-04 to ATT-08 all succeed; positions are exactly 1 to 5, each once; each
     * message matches its own response; database order by (joined_at, waitlist_seq) agrees with the positions.
     * Kills M13: the position is counted outside the event lock, so parallel joins read the same count.
     */
    it('JOIN-WAITLIST-04-C-INT: five parallel joins get positions 1 to 5, each once, in database order', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const joiners = [await attendee('04'), await attendee('05'), await attendee('06'), await attendee('07'), await attendee('08')];

      const responses = await Promise.all(joiners.map((who) => join(eventId, who, {})));

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      expect(responses.map((r) => r.body.position).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
      responses.forEach((r) => expect(r.body.message).toBe(MSG_WL_01(r.body.position)));
      const byPosition = joiners
        .map((who, index) => ({ uid: who.uid, position: responses[index].body.position as number }))
        .sort((x, y) => x.position - y.position)
        .map((entry) => entry.uid);
      const ordered = await pool.query<{ attendee_id: string }>(
        `SELECT attendee_id FROM event_registrations WHERE event_id = $1 AND status = 'Waitlisted'
          ORDER BY joined_at, waitlist_seq`,
        [eventId],
      );
      expect(ordered.rows.map((row) => row.attendee_id)).toEqual(byPosition);
    });
  });

  // JOIN-WAITLIST-05: AC5 (the position in the registration details)
  describe('AC5: the registration details show the waitlist position (JOIN-WAITLIST-05)', () => {
    /**
     * Oracle (05-A): ATT-04 (1), ATT-05 (2), ATT-06 (3) read their own position; the API value matches.
     */
    // Kills: K-05A (positions run newest first)
    it('JOIN-WAITLIST-05-A: each waitlisted attendee reads their own position', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);

      expect(await positionOf(eventId, a4)).toBe(1);
      expect(await positionOf(eventId, a5)).toBe(2);
      expect(await positionOf(eventId, a6)).toBe(3);
    });

    /**
     * Oracle (05-B): ATT-01 is Confirmed and ATT-07 is Withdrawn: waitlistPosition is null (the key is present, no position row);
     * ATT-04 is waitlisted and shows position 1.
     * Kills M31: a position is returned for an entry that is not Waitlisted.
     */
    it('JOIN-WAITLIST-05-B-STATE: waitlistPosition is null unless the entry is waitlisted, and the key is always present', async () => {
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(confirmed);
      const att07 = await attendee('07');
      await seedRow(eventId, att07.uid, 'Withdrawn', '07');
      const att04 = await attendee('04');
      await joinAs(eventId, att04);

      const asConfirmed = await mine(eventId, confirmed[0]).expect(200);
      const asWithdrawn = await mine(eventId, att07).expect(200);

      expect(asConfirmed.body.registration.status).toBe('registered');
      expect(asConfirmed.body.registration).toHaveProperty('waitlistPosition', null);
      expect(asWithdrawn.body.registration.status).toBe('withdrawn');
      expect(asWithdrawn.body.registration).toHaveProperty('waitlistPosition', null);
      expect(await positionOf(eventId, att04)).toBe(1);
    });

    /**
     * Oracle (05-C): ATT-04 asks for ATT-05's registration by id: 404 MSG-07, with no name and no position in the body.
     * The router inventory lists no GET route that returns other attendees' entries (A-05C).
     * Kills M30: the ownership filter is dropped from the by-id lookup.
     */
    it('JOIN-WAITLIST-05-C: another attendee\'s registration is not found and no route lists other entries', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const att04 = await attendee('04');
      const att05 = await attendee('05');
      const att05Row = (await joinAs(eventId, att05)).body.registrationId;

      const res = await withdrawById(att05Row, att04).expect(404);

      expect(res.body.message).toBe(MSG_07);
      expect(JSON.stringify(res.body)).not.toMatch(/Attendee 05|waitlistPosition|position/);
      // No token answers 401 on the attendee read.
      await mine(eventId).expect(401);
      // Router inventory: the only GET routes under registrations are the attendee's own read and the SPM-63 report.
      // Express lists a route once per layer, so the paths are de-duplicated before comparing.
      const listed = [
        ...new Set(
          routeInventory(app)
            .filter((route) => route.method === 'GET' && route.path.includes('/registrations'))
            .map((route) => route.path),
        ),
      ].sort();
      expect(listed).toEqual([
        '/api/events/:eventId/registrations/me',
        '/api/events/:eventId/registrations/report',
        '/api/events/:eventId/registrations/report/export',
      ]);
    });
  });

  // JOIN-WAITLIST-06: AC6 (positions update when others withdraw)
  describe('AC6: positions update when entries or confirmed attendees withdraw (JOIN-WAITLIST-06)', () => {
    /**
     * Oracle (06-A): ATT-04 (1) withdraws from the waitlist; ATT-05 is now 1 and ATT-06 is 2; ATT-04 is withdrawn.
     * Kills M12: withdrawn entries still count ahead of the others.
     */
    it('JOIN-WAITLIST-06-A-STATE: an attendee who withdraws from the list moves everyone behind them forward', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);
      const row4 = (await rowOf(eventId, a4.uid)).id;

      expect((await withdrawById(row4, a4)).status).toBe(200);

      expect(await positionOf(eventId, a5)).toBe(1);
      expect(await positionOf(eventId, a6)).toBe(2);
      expect((await mine(eventId, a4).expect(200)).body.registration.status).toBe('withdrawn');
    });

    /**
     * Oracle (06-B): ATT-01 (Confirmed) withdraws; ATT-04 is promoted; ATT-05 is 1 and ATT-06 is 2.
     */
    // Kills: K-06B (promotion takes the latest entry first)
    it('JOIN-WAITLIST-06-B-STATE: a confirmed attendee withdrawing promotes the first entry and moves the rest forward', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);

      expect((await mine(eventId, a4).expect(200)).body.registration.status).toBe('registered');
      expect(await positionOf(eventId, a5)).toBe(1);
      expect(await positionOf(eventId, a6)).toBe(2);
    });

    /**
     * Oracle (06-C): ATT-05 (middle) withdraws; ATT-04 stays 1; ATT-06 becomes 2; ATT-05 is withdrawn.
     */
    // Kills: K-06C (withdrawn entries count as ahead of the others)
    it('JOIN-WAITLIST-06-C-STATE: the middle entry withdrawing leaves the first place unchanged', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);

      expect((await withdrawById((await rowOf(eventId, a5.uid)).id, a5)).status).toBe(200);

      expect(await positionOf(eventId, a4)).toBe(1);
      expect(await positionOf(eventId, a6)).toBe(2);
      expect((await mine(eventId, a5).expect(200)).body.registration.status).toBe('withdrawn');
    });

    /**
     * Oracle (06-D): ATT-05 withdraws, ATT-07 joins, ATT-04 withdraws. ATT-06 is 1 and ATT-07 is 2; no gaps or duplicates;
     * the API ranking agrees with the database ranking.
     */
    // Kills: K-06D (withdrawn entries count as ahead of the others)
    it('JOIN-WAITLIST-06-D-INT: withdrawals and a new join leave positions gap-free, with no duplicates', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6, a7] = [await attendee('04'), await attendee('05'), await attendee('06'), await attendee('07')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);
      await withdrawById((await rowOf(eventId, a5.uid)).id, a5).expect(200);
      await joinAs(eventId, a7);
      await withdrawById((await rowOf(eventId, a4.uid)).id, a4).expect(200);

      expect(await positionOf(eventId, a6)).toBe(1);
      expect(await positionOf(eventId, a7)).toBe(2);
      const db = await pool.query<{ attendee_id: string }>(
        "SELECT attendee_id FROM event_registrations WHERE event_id = $1 AND status = 'Waitlisted' ORDER BY joined_at, waitlist_seq",
        [eventId],
      );
      expect(db.rows.map((row) => row.attendee_id)).toEqual([a6.uid, a7.uid]);
    });
  });

  // JOIN-WAITLIST-07: AC7 (order by join time)
  describe('AC7: the waitlist is ordered by join time (JOIN-WAITLIST-07)', () => {
    /**
     * Oracle (07-A): joins stated at 10:00:00 (ATT-06), 10:00:05 (ATT-04), 10:00:10 (ATT-05) on the injected clock (A-07A-CALLS).
     * Positions: ATT-06 1, ATT-04 2, ATT-05 3. ATT-01 withdraws: ATT-06 is promoted; ATT-04 is 1 and ATT-05 is 2.
     * Kills M9: the order is reversed (newest first). Kills M14: the order follows arrival (waitlist_seq), not joined_at.
     */
    it('JOIN-WAITLIST-07-A: positions follow the joined_at time, and promotion takes the earliest join', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      const at = (hhmmss: string) => new Date(`2026-10-14T${hhmmss}+08:00`);
      // Arrival order differs from join time: ATT-04 is the first request in, but it stamps 10:00:05.
      now = at('10:00:05');
      await joinAs(eventId, a4);
      now = at('10:00:00');
      await joinAs(eventId, a6);
      now = at('10:00:10');
      await joinAs(eventId, a5);

      now = T0;
      expect(await positionOf(eventId, a6)).toBe(1);
      expect(await positionOf(eventId, a4)).toBe(2);
      expect(await positionOf(eventId, a5)).toBe(3);

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);

      expect((await mine(eventId, a6).expect(200)).body.registration.status).toBe('registered');
      expect(await positionOf(eventId, a4)).toBe(1);
      expect(await positionOf(eventId, a5)).toBe(2);
    });

    /**
     * Oracle (07-B): two entries with identical joined_at; the lower waitlist_seq (ATT-04) is first; positions 1 and 2, stable
     * over repeated reads. ATT-01 withdraws: ATT-04 is promoted. The row ids are chosen so that id order is the opposite.
     * Kills M10: the tie-break uses the row id instead of waitlist_seq.
     */
    it('JOIN-WAITLIST-07-B-INT: equal join times break the tie by waitlist_seq, stably', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('04'), await attendee('05')];
      const stamped = new Date(T0.getTime() - HOUR);
      // ATT-05 has the smaller row id; ATT-04 has the lower waitlist_seq, so ATT-04 must be first.
      await pool.query(
        `INSERT INTO event_registrations (id, event_id, attendee_id, status, joined_at, waitlist_seq)
         VALUES ('00000000-0000-4000-8000-000000000005', $1, $2, 'Waitlisted', $3, 1002),
                ('ffffffff-ffff-4fff-8fff-ffffffffff04', $1, $4, 'Waitlisted', $3, 1001)`,
        [eventId, a5.uid, stamped, a4.uid],
      );

      for (let i = 0; i < 3; i += 1) {
        expect(await positionOf(eventId, a4)).toBe(1);
        expect(await positionOf(eventId, a5)).toBe(2);
      }

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);

      expect((await mine(eventId, a4).expect(200)).body.registration.status).toBe('registered');
      expect(await positionOf(eventId, a5)).toBe(1);
    });

    /**
     * Oracle (07-C): ATT-04 (1) withdraws and joins again at T0 + 1 minute (new joined_at and waitlist_seq): ATT-05 is 1,
     * ATT-06 is 2 and ATT-04 is 3. ATT-01 withdraws: ATT-05 is promoted.
     * Kills M11: a rejoin keeps the old place.
     */
    it('JOIN-WAITLIST-07-C-STATE: a rejoin goes to the back of the list with a new join time and sequence', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);

      expect((await withdrawById((await rowOf(eventId, a4.uid)).id, a4)).status).toBe(200);
      now = new Date(T0.getTime() + MINUTE);
      await joinAs(eventId, a4);

      expect(await positionOf(eventId, a5)).toBe(1);
      expect(await positionOf(eventId, a6)).toBe(2);
      expect(await positionOf(eventId, a4)).toBe(3);

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);
      expect((await mine(eventId, a5).expect(200)).body.registration.status).toBe('registered');
    });
  });

  // JOIN-WAITLIST-08: AC8 (automatic promotion when a spot opens)
  describe('AC8: a confirmed withdrawal promotes the first entry automatically (JOIN-WAITLIST-08)', () => {
    /**
     * Oracle (08-A): ATT-01 withdraws; ATT-04 is Confirmed in the same transaction and has no position; ATT-05 is 1;
     * the event is 3 of 3; ATT-07 (no entry) still sees full with waitlistAvailable.
     * Kills M15: the promotion step never runs. Kills M17: every entry is promoted, ignoring capacity.
     */
    it('JOIN-WAITLIST-08-A-STATE: the first entry is promoted in the same transaction, with no accept step', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6, a7] = [await attendee('04'), await attendee('05'), await attendee('06'), await attendee('07')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);

      const withdrawn = await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]);
      expect(withdrawn.status).toBe(200);

      const promoted = (await mine(eventId, a4).expect(200)).body.registration;
      expect(promoted.status).toBe('registered');
      expect(promoted.waitlistPosition).toBeNull();
      expect((await mine(eventId, att[0]).expect(200)).body.registration.status).toBe('withdrawn');
      expect(await positionOf(eventId, a5)).toBe(1);
      expect(await countWhere(eventId, 'Registered')).toBe(3);
      const view = (await event(eventId, a7).expect(200)).body;
      expect(view).toMatchObject({ isFull: true, waitlistAvailable: true, availableSpots: 0 });
    });

    /**
     * Oracle (08-B, sequential): ATT-01 then ATT-02 withdraw; ATT-04 and ATT-05 are Confirmed in join order; ATT-06 is 1.
     * Oracle (08-B, parallel): on a fresh clone the same two withdrawals in parallel give the same final state; exactly 3
     * Confirmed rows; no entry promoted twice.
     * Kills M16: the latest entry is promoted first. Kills M17: capacity is ignored and too many are promoted.
     */
    it('JOIN-WAITLIST-08-B-INT: sequential and parallel withdrawals promote in join order, never above capacity', async () => {
      const first = [await attendee('01'), await attendee('02'), await attendee('03')];
      const seqEvent = await seedFullGala(first);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(seqEvent, who);
      expect((await withdrawById((await rowOf(seqEvent, first[0].uid)).id, first[0])).status).toBe(200);
      expect((await mine(seqEvent, a4).expect(200)).body.registration.status).toBe('registered');
      expect((await withdrawById((await rowOf(seqEvent, first[1].uid)).id, first[1])).status).toBe(200);
      expect((await mine(seqEvent, a5).expect(200)).body.registration.status).toBe('registered');
      expect(await positionOf(seqEvent, a6)).toBe(1);

      const second = [await attendee('11'), await attendee('12'), await attendee('13')];
      const parEvent = await seedFullGala(second);
      const [b4, b5, b6] = [await attendee('14'), await attendee('15'), await attendee('16')];
      for (const who of [b4, b5, b6]) await joinAs(parEvent, who);
      const id0 = (await rowOf(parEvent, second[0].uid)).id;
      const id1 = (await rowOf(parEvent, second[1].uid)).id;
      const responses = await overlapped(parEvent, 2, () => [withdrawById(id0, second[0]), withdrawById(id1, second[1])]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect((await mine(parEvent, b4).expect(200)).body.registration.status).toBe('registered');
      expect((await mine(parEvent, b5).expect(200)).body.registration.status).toBe('registered');
      expect(await positionOf(parEvent, b6)).toBe(1);
      expect(await countWhere(parEvent, 'Registered')).toBe(3);
      expect((await notificationsFor(b4.uid)).filter((n) => n.type === 'WaitlistPromoted')).toHaveLength(1);
      expect((await notificationsFor(b5.uid)).filter((n) => n.type === 'WaitlistPromoted')).toHaveLength(1);
    });

    /**
     * JOIN-WAITLIST-08-B-REPEAT: three parallel withdrawals of one confirmed registration, with the event
     * lock held so they overlap. Exactly one answers 200; the others answer 422 MSG-12; ATT-04 is promoted once and ATT-05
     * stays waiting. Kills P-R: a Registered withdrawal that trusts its read and drops the compare-and-set guard.
     */
    it('JOIN-WAITLIST-08-B-INT-REPEAT: parallel repeats of one confirmed withdrawal release one place and promote once', async () => {
      const att = [await attendee('21'), await attendee('22'), await attendee('23')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('24'), await attendee('25')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      const rowId = (await rowOf(eventId, att[0].uid)).id;

      const responses = await overlapped(eventId, 3, () => Array.from({ length: 3 }, () => withdrawById(rowId, att[0])));

      expect(responses.map((r) => r.status).sort()).toEqual([200, 422, 422]);
      for (const loser of responses.filter((r) => r.status === 422)) expect(loser.body.message).toBe(MSG_12);
      expect(await statusOf(eventId, a4.uid)).toBe('Registered');
      expect(await statusOf(eventId, a5.uid)).toBe('Waitlisted');
      expect(await countWhere(eventId, 'Registered')).toBe(3);
      expect((await notificationsFor(a4.uid)).filter((n) => n.type === 'WaitlistPromoted')).toHaveLength(1);
    });

    /**
     * Oracle (08-C): EVT-701 full with an empty list; ATT-01 withdraws. availableSpots 1; isFull false; ATT-07 (no entry)
     * sees Register rather than Join; no promotion and no notification.
     * Kills M18: a notification is written even when no entry is promoted.
     */
    it('JOIN-WAITLIST-08-C-BND: with an empty list a withdrawal frees a place and promotes and notifies nobody', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const att07 = await attendee('07');

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);

      expect(await countWhere(eventId, 'Registered')).toBe(2);
      expect(await notificationsForEvent(eventId)).toBe(0);
      const view = (await event(eventId, att07).expect(200)).body;
      expect(view).toMatchObject({ isFull: false, availableSpots: 1, waitlistAvailable: false });
    });

    /**
     * Oracle (08-D): ATT-01's withdrawal and ATT-07's direct registration run in parallel. ATT-04 gets the place; ATT-07
     * gets 422 registration_full. A second run where ATT-07 posts just after the withdrawal response gives the same answer.
     * Confirmed never goes above 3.
     * Kills M3 (no capacity check on direct registration) and M15 (no promotion).
     */
    it('JOIN-WAITLIST-08-D-INT: a direct registration racing a withdrawal cannot take the promoted place', async () => {
      // Run 1: parallel.
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const att04 = await attendee('04');
      const att07 = await attendee('07');
      await joinAs(eventId, att04);
      const att01Row = (await rowOf(eventId, att[0].uid)).id;
      const [withdrawn, registered] = await overlapped(eventId, 2, () => [
        withdrawById(att01Row, att[0]),
        register(eventId, att07, '07'),
      ]);
      expect(withdrawn.status).toBe(200);
      expect(registered.status).toBe(422);
      expect(registered.body.code).toBe('registration_full');
      expect(await statusOf(eventId, att04.uid)).toBe('Registered');
      expect(await countWhere(eventId, 'Registered')).toBe(3);

      // Run 2: sequential, the direct registration starts right after the withdrawal response.
      const again = [await attendee('11'), await attendee('12'), await attendee('13')];
      const eventId2 = await seedFullGala(again);
      const b04 = await attendee('14');
      const b07 = await attendee('17');
      await joinAs(eventId2, b04);
      expect((await withdrawById((await rowOf(eventId2, again[0].uid)).id, again[0])).status).toBe(200);
      const late = await register(eventId2, b07, '17');
      expect(late.status).toBe(422);
      expect(late.body.code).toBe('registration_full');
      expect(await statusOf(eventId2, b04.uid)).toBe('Registered');
      expect(await countWhere(eventId2, 'Registered')).toBe(3);
    });

    /**
     * Oracle (08-E): a fault is injected into the promotion's notification write, inside the transaction. The first
     * withdrawal answers 500 with a generic message and no stack trace; ATT-01 is still Confirmed, ATT-04 still Waitlisted,
     * no notification. The fault is removed; the retry answers 200 and ATT-04 is promoted.
     * Kills M15 (the promotion step is missing: the retry does not promote ATT-04).
     */
    it('JOIN-WAITLIST-08-E-ERR: a failure during promotion rolls back the withdrawal, and a retry completes it', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const att04 = await attendee('04');
      await joinAs(eventId, att04);
      const registrationId = (await rowOf(eventId, att[0].uid)).id;
      await pool.query(
        `CREATE OR REPLACE FUNCTION spm138_fault_fn() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.related_event_id = '${eventId}'::uuid AND NEW.type = 'WaitlistPromoted' THEN
             RAISE EXCEPTION 'SPM-138 injected fault';
           END IF;
           RETURN NEW;
         END $$`,
      );
      await pool.query('CREATE TRIGGER spm138_fault BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION spm138_fault_fn()');

      const failed = await withdrawById(registrationId, att[0]);

      expect(failed.status).toBe(500);
      expect(JSON.stringify(failed.body)).not.toMatch(/injected|stack|at .*\.ts/);
      expect(await statusOf(eventId, att[0].uid)).toBe('Registered');
      expect(await statusOf(eventId, att04.uid)).toBe('Waitlisted');
      expect(await notificationsFor(att04.uid)).toHaveLength(0);

      await pool.query('DROP TRIGGER spm138_fault ON notifications');
      const retried = await withdrawById(registrationId, att[0]);
      expect(retried.status).toBe(200);
      expect(await statusOf(eventId, att04.uid)).toBe('Registered');
    });
  });

  // JOIN-WAITLIST-09: AC9 (the promotion notification)
  describe('AC9: a promoted attendee gets one in-app notification per promotion (JOIN-WAITLIST-09)', () => {
    /**
     * Oracle (09-A): after ATT-01 withdraws, ATT-04 has exactly one unread notification of type WaitlistPromoted with the MSG-WL-05
     * text, linked to the event and to ATT-04, and present when the 200 returns.
     * Kills M21: the notification text or links are wrong.
     */
    it('JOIN-WAITLIST-09-A-STATE: the promotion writes one unread WaitlistPromoted notification before the response returns', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const att04 = await attendee('04');
      await joinAs(eventId, att04);

      const res = await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]);
      expect(res.status).toBe(200);

      const rows = await notificationsFor(att04.uid);
      expect(rows).toEqual([
        { type: 'WaitlistPromoted', message: MSG_WL_05, related_event_id: eventId, related_user_id: att04.uid, read: false },
      ]);
    });

    /**
     * Oracle (09-A, added): promote, withdraw, rejoin, promote again gives two notifications, one per promotion.
     */
    // Kills: K-09A (a promotion notice is written once per attendee and event)
    it('JOIN-WAITLIST-09-A-INT: a second promotion after a rejoin writes a second notification', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const att04 = await attendee('04');
      const att05 = await attendee('05');
      await joinAs(eventId, att04);
      await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]).expect(200);
      await withdrawById((await rowOf(eventId, att04.uid)).id, att04).expect(200);
      await register(eventId, att05, '05').expect(201);
      await joinAs(eventId, att04);
      await withdrawById((await rowOf(eventId, att[1].uid)).id, att[1]).expect(200);

      const promotions = (await notificationsFor(att04.uid)).filter((n) => n.type === 'WaitlistPromoted');
      expect(promotions).toHaveLength(2);
      expect(promotions.every((n) => n.message === MSG_WL_05)).toBe(true);
    });

    /**
     * Oracle (09-B): ATT-04 and ATT-05 each get exactly one promotion notification; ATT-06, ATT-01 and ATT-02 get none.
     * The backend has no mail transport (A-MAIL), so only the notification rows are checked.
     * Kills M20: a notification is written for entries that were not promoted.
     */
    it('JOIN-WAITLIST-09-B: only the two promoted attendees are notified, once each', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);
      await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]).expect(200);
      await withdrawById((await rowOf(eventId, att[1].uid)).id, att[1]).expect(200);

      const count = async (who: Who) => (await notificationsFor(who.uid)).filter((n) => n.type === 'WaitlistPromoted').length;
      expect([await count(a4), await count(a5), await count(a6), await count(att[0]), await count(att[1]), await count(att[2])]).toEqual([1, 1, 0, 0, 0, 0]);
    });
  });

  // JOIN-WAITLIST-10: AC10 (withdraw from the waitlist)
  describe('AC10: an attendee can withdraw from the waitlist before the event starts (JOIN-WAITLIST-10)', () => {
    /**
     * Oracle (10-A): ATT-05 (position 2) withdraws: 200, status withdrawn, the MSG-11 text, no position, withdrawn_at T0;
     * ATT-06 becomes 2 (ATT-04 stays 1). The FE prompt copy is asserted in WithdrawalConfirmation.test.tsx.
     * Kills a refusal of waitlisted entries (the withdrawal of a waitlisted row is refused).
     */
    it('JOIN-WAITLIST-10-A-STATE: a waitlisted attendee withdraws with 200, loses the place, and the others move forward', async () => {
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')]);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);
      const row5 = (await rowOf(eventId, a5.uid)).id;

      const res = await withdrawById(row5, a5).expect(200);

      expect(res.body).toMatchObject({ status: 'withdrawn', message: MSG_11, waitlistPosition: null, withdrawnAt: T0.toISOString() });
      expect((await rowOf(eventId, a5.uid)).withdrawn_at.toISOString()).toBe(T0.toISOString());
      expect(await positionOf(eventId, a4)).toBe(1);
      expect(await positionOf(eventId, a6)).toBe(2);
      expect(await countWhere(eventId, 'Registered')).toBe(3);
    });

    /**
     * Oracle (10-C A): at 17:59:59 on the start day a waitlisted withdrawal returns 200 Withdrawn.
     * Oracle (10-C B): at 18:00:00 the start instant refuses it: 422 'Event has already occurred' and the entry stays Waitlisted.
     * The registration window closes at 23:59 so the window itself does not remove the entry before the start.
     * Oracle (10-C C): at 18:30 the read still shows Waitlisted (the FE hides the Withdraw control).
     */
    // Kills: K-10C (withdrawal is allowed at the exact event start)
    it('JOIN-WAITLIST-10-C-BND: withdrawal from the list stops at the event start, which is exclusive', async () => {
      const startDay = '2026-11-10T18:00:00+08:00';
      const closes = '2026-11-10T23:59:00+08:00';
      const early = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], { start: startDay, closes });
      const a4 = await attendee('04');
      now = T0;
      await joinAs(early, a4);
      now = new Date('2026-11-10T17:59:59+08:00');
      expect((await withdrawById((await rowOf(early, a4.uid)).id, a4)).status).toBe(200);

      const late = await seedFullGala([await attendee('11'), await attendee('12'), await attendee('13')], { start: startDay, closes });
      const b4 = await attendee('14');
      now = T0;
      await joinAs(late, b4);
      now = new Date('2026-11-10T18:00:00+08:00');
      const atStart = await withdrawById((await rowOf(late, b4.uid)).id, b4);
      expect(atStart.status).toBe(422);
      expect(atStart.body.message).toBe(MSG_OCCURRED);
      expect(await statusOf(late, b4.uid)).toBe('Waitlisted');

      now = new Date('2026-11-10T18:30:00+08:00');
      expect((await mine(late, b4).expect(200)).body.registration.status).toBe('waitlisted');
    });

    /**
     * Oracle (10-D): ATT-05 withdraws from the list: Confirmed stays 3; availableSpots 0; ATT-01 to 03 Confirmed; ATT-04 still
     * waitlisted at 1; no promotion and no notification.
     * Kills M22: a waitlisted withdrawal changes a confirmed row (the earliest Registered row is flipped).
     */
    it('JOIN-WAITLIST-10-D: withdrawing from the list changes no confirmed attendee and promotes nobody', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('04'), await attendee('05')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);

      expect((await withdrawById((await rowOf(eventId, a5.uid)).id, a5)).status).toBe(200);

      expect(await countWhere(eventId, 'Registered')).toBe(3);
      for (const who of att) expect(await statusOf(eventId, who.uid)).toBe('Registered');
      expect((await event(eventId, att[0]).expect(200)).body).toMatchObject({ isFull: true, availableSpots: 0 });
      expect(await positionOf(eventId, a4)).toBe(1);
      expect(await notificationsForEvent(eventId)).toBe(0);
    });

    /**
     * Oracle (10-E A): ATT-06 withdrawing ATT-05's entry: 404 MSG-07, unchanged.
     * Oracle (10-E B): no token: 401.
     * Oracle (10-E C): ATT-05 withdraws, then repeats: 422 MSG-12.
     * Oracle (10-E D): five parallel withdrawals of one entry give exactly one 200 and four 422 MSG-12.
     * Kills an ownership gap (a non-owner can withdraw) and a compare-and-set gap (two withdrawals both succeed).
     */
    it('JOIN-WAITLIST-10-E-ERR: ownership is enforced, and a repeated or parallel withdrawal succeeds once', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of [a4, a5, a6]) await joinAs(eventId, who);
      const row5 = (await rowOf(eventId, a5.uid)).id;

      // A: another attendee cannot withdraw ATT-05's entry.
      const other = await withdrawById(row5, a6);
      expect(other.status).toBe(404);
      expect(other.body.message).toBe(MSG_07);
      expect(await statusOf(eventId, a5.uid)).toBe('Waitlisted');

      // B: no token.
      expect((await withdrawById(row5)).status).toBe(401);

      // C: the owner withdraws, then repeats.
      expect((await withdrawById(row5, a5)).status).toBe(200);
      const repeat = await withdrawById(row5, a5);
      expect(repeat.status).toBe(422);
      expect(repeat.body.message).toBe(MSG_12);

      // D: five parallel withdrawals of a fresh entry.
      const fresh = await seedFullGala([await attendee('11'), await attendee('12'), await attendee('13')]);
      const f4 = await attendee('14');
      await joinAs(fresh, f4);
      const rowF4 = (await rowOf(fresh, f4.uid)).id;
      const parallel = await overlapped(fresh, 5, () => Array.from({ length: 5 }, () => withdrawById(rowF4, f4)));
      expect(parallel.map((r) => r.status).sort()).toEqual([200, 422, 422, 422, 422]);
      for (const loser of parallel.filter((r) => r.status === 422)) expect(loser.body.message).toBe(MSG_12);
    });
  });

  // JOIN-WAITLIST-11: AC11 (entries are removed when registration closes)
  describe('AC11: waitlist entries are removed when registration closes (JOIN-WAITLIST-11)', () => {
    /**
     * Oracle (11-A): EVT-703 (capacity 2, full, closes 12:30). At 12:31 the close job removes both entries: status removed and
     * no position. A join is refused with MSG-01. The event reads closed. No promotion; Confirmed stays 2; no notification.
     * Kills M23: the close job does not remove the entries.
     */
    it('JOIN-WAITLIST-11-A-STATE: the close job removes every waitlist entry and nothing is promoted', async () => {
      const att = [await attendee('01'), await attendee('02')];
      const eventId = await seedFullGala(att, { limit: 2, closes: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);

      now = new Date(T0.getTime() + 31 * MINUTE);
      const removed = await runRegistrationCloseJob(app.get(DatabaseService), now);

      expect(removed).toBe(2);
      expect(await statusOf(eventId, a4.uid)).toBe('Removed');
      expect(await statusOf(eventId, a5.uid)).toBe('Removed');
      const view = (await mine(eventId, a4).expect(200)).body.registration;
      expect(view).toMatchObject({ status: 'removed', waitlistPosition: null });
      const refused = await join(eventId, a6, {});
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'registration_closed', message: MSG_01 });
      expect((await event(eventId, a6).expect(200)).body.registrationOpen).toBe(false);
      expect(await countWhere(eventId, 'Registered')).toBe(2);
      expect(await notificationsForEvent(eventId)).toBe(0);

      // A removed entry is not withdrawable (A-NOT-WITHDRAWABLE).
      const attemptWithdraw = await withdrawById((await rowOf(eventId, a4.uid)).id, a4);
      expect(attemptWithdraw.status).toBe(409);
      expect(attemptWithdraw.body.code).toBe('registration_not_withdrawable');
    });

    /**
     * Oracle (11-B): the closing instant is 2026-11-10T23:59:00 SGT. A: at 23:58:59 the read shows Waitlisted with a position
     * (no job run). B: at 23:59:00 the read shows removed (settled on read, the closing instant is exclusive).
     * Kills M24: the closing comparison is inclusive of the instant (it removes one second late). Kills M23 (no settle on read).
     */
    it('JOIN-WAITLIST-11-B-BND: the closing instant is exclusive, and a read settles the entries at that instant', async () => {
      const closes = '2026-11-10T23:59:00+08:00';
      const att = [await attendee('01'), await attendee('02')];
      const eventId = await seedFullGala(att, { limit: 2, closes, start: '2026-11-12T18:00:00+08:00' });
      const a4 = await attendee('04');
      await joinAs(eventId, a4);

      now = new Date('2026-11-10T23:58:59+08:00');
      expect((await mine(eventId, a4).expect(200)).body.registration).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });

      now = new Date('2026-11-10T23:59:00+08:00');
      expect((await mine(eventId, a4).expect(200)).body.registration).toMatchObject({ status: 'removed', waitlistPosition: null });
    });

    /**
     * Oracle (11-C): a manual close (registration_enabled false). The next read removes both entries; ATT-06's join is refused
     * with MSG-01; the event reads closed.
     * Kills M25: the manual close is ignored when settling entries.
     */
    it('JOIN-WAITLIST-11-C-STATE: a manual close removes the entries on the next read and refuses new joins', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const [a4, a5, a6] = [await attendee('04'), await attendee('05'), await attendee('06')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      expect((await mine(eventId, a4).expect(200)).body.registration.status).toBe('removed');
      expect(await statusOf(eventId, a5.uid)).toBe('Removed');
      const refused = await join(eventId, a6, {});
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'registration_closed', message: MSG_01 });
      expect((await event(eventId, a6).expect(200)).body.registrationOpen).toBe(false);
    });

    /**
     * Oracle (11-D): EVT-703 is closed with its entries removed. ATT-01 withdraws: availableSpots 1; registration stays
     * closed; ATT-04 and ATT-05 are not promoted; no notification. The same withdrawal made after the close instant, while
     * the entries are still Waitlisted in the database (no job or read yet), gives the same result.
     * Kills M19: the promotion runs before the entries are settled, so a closed-window entry is promoted.
     */
    it.each([
      ['entries already removed by the job', true],
      ['entries still waitlisted (no job or read has run)', false],
    ])('JOIN-WAITLIST-11-D: a withdrawal after close never promotes a removed entry (%s)', async (_label, settledFirst) => {
      const att = [await attendee('01'), await attendee('02')];
      const eventId = await seedFullGala(att, { limit: 2, closes: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
      const [a4, a5] = [await attendee('04'), await attendee('05')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      now = new Date(T0.getTime() + 31 * MINUTE);
      if (settledFirst) await runRegistrationCloseJob(app.get(DatabaseService), now);

      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);

      expect(await statusOf(eventId, a4.uid)).toBe('Removed');
      expect(await statusOf(eventId, a5.uid)).toBe('Removed');
      expect(await countWhere(eventId, 'Registered')).toBe(1);
      const view = (await event(eventId, a4).expect(200)).body;
      expect(view).toMatchObject({ availableSpots: 1, registrationOpen: false });
      expect(await notificationsForEvent(eventId)).toBe(0);
    });
  });

  describe('AC11: reopen keeps removed entries removed (JOIN-WAITLIST-11-E, Blocked)', () => {
    /**
     * Blocked (registration-setup story): the real reopen flow belongs to the registration-setup story. The hook that
     * settles before a window change is tested in this file as JOIN-WAITLIST-11-E-HOOK (against rows).
     * Oracle (11-E, when unblocked): removed entries are not restored on reopen; ATT-04 then joins at 1 and ATT-05 at 2.
     * Kills entries restored on reopen.
     */
    it.skip('JOIN-WAITLIST-11-E: Blocked (registration-setup story): a reopen does not restore removed entries', () => {
      // Intentionally empty until the registration-setup story provides the reopen flow.
    });
  });

  // JOIN-WAITLIST-12: AC12 (event cancelled). The cancel flow is SPM-136's (POST /api/events/:id/status-change).
  describe('AC12: an event cancellation releases the waitlist (JOIN-WAITLIST-12)', () => {
    /** The assigned coordinator cancels the event (SPM-136 flow, confirmed). */
    const cancel = (eventId: string, who: Who) =>
      request(app.getHttpServer())
        .post(`/api/events/${eventId}/status-change`)
        .set('Cookie', who.cookie)
        .send({ targetStatus: 'Cancelled', confirmed: true });

    /**
     * JOIN-WAITLIST-12-A: each waitlisted attendee gets one EventCancelled notice naming the event (MSG-WL-06) and the
     * three entries become Cancelled. Kills M25 (an entry is cancelled without its notice) and a double notice.
     */
    it('JOIN-WAITLIST-12-A: cancelling the event notifies each waitlisted attendee once', async () => {
      const coo = await namedUser(['COORDINATOR'], 'Coordinator COO', 3);
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], {
        coordinatorId: coo.uid,
      });
      const waiting = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of waiting) await joinAs(eventId, who);

      const res = await cancel(eventId, coo);

      expect(res.status).toBe(200);
      for (const who of waiting) {
        expect(await statusOf(eventId, who.uid)).toBe('Cancelled');
        const notices = (await notificationsFor(who.uid)).filter((n) => n.type === 'EventCancelled');
        expect(notices).toEqual([
          expect.objectContaining({
            message: `${NAME} has been cancelled. Your waitlist place is cancelled.`,
            related_event_id: eventId,
          }),
        ]);
        // TR-136-21(b): the notice is stamped with the injected cancel instant (T0), not the database clock.
        const stamped = await pool.query<{ created_at: Date }>(
          `SELECT created_at FROM notifications WHERE recipient_id = $1 AND type = 'EventCancelled'`,
          [who.uid],
        );
        expect(stamped.rows[0].created_at).toEqual(T0);
      }
    });

    /**
     * JOIN-WAITLIST-12-B: after the cancel a waitlisted attendee sees Cancelled with no position, a withdrawal is refused
     * (409) and a join is refused (422 MSG-01); the status stays Cancelled. Kills controls offered and a status overwrite.
     */
    it('JOIN-WAITLIST-12-B: a cancelled entry offers no controls and keeps its status', async () => {
      const coo = await namedUser(['COORDINATOR'], 'Coordinator COO', 3);
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], {
        coordinatorId: coo.uid,
      });
      const who = await attendee('05');
      await joinAs(eventId, who);
      const rowId = (await rowOf(eventId, who.uid))!.id;
      expect((await cancel(eventId, coo)).status).toBe(200);

      const me = await mine(eventId, who).expect(200);
      // The attendee read carries the lower-case view status (the stored row is 'Cancelled').
      expect(me.body.registration.status).toBe('cancelled');
      expect(me.body.registration.waitlistPosition ?? null).toBeNull();

      expect((await withdrawById(rowId, who)).status).toBe(409);
      const joinRes = await join(eventId, who, {});
      expect(joinRes.status).toBe(422);
      expect(joinRes.body.message).toBe(MSG_01);
      expect(await statusOf(eventId, who.uid)).toBe('Cancelled');
    });

    /**
     * JOIN-WAITLIST-12-C: only attendees still on the waiting list are affected. A Withdrawn entry on the cancelled event
     * stays Withdrawn with no notice, and a waiting entry on another event is unchanged. Kills M26 (the releaser touches
     * entries it should not).
     */
    it('JOIN-WAITLIST-12-C: a cancelled event leaves withdrawn and other-event entries untouched', async () => {
      const coo = await namedUser(['COORDINATOR'], 'Coordinator COO', 3);
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], {
        coordinatorId: coo.uid,
      });
      const withdrawn = await attendee('07');
      await seedRow(eventId, withdrawn.uid, 'Withdrawn', '07');
      const otherEvent = await seedFullGala([await attendee('11'), await attendee('12'), await attendee('13')]);
      const otherWaiting = await attendee('08');
      await seedRow(otherEvent, otherWaiting.uid, 'Waitlisted', '08');
      const waiting = await attendee('04');
      await joinAs(eventId, waiting);

      expect((await cancel(eventId, coo)).status).toBe(200);

      expect(await statusOf(eventId, withdrawn.uid)).toBe('Withdrawn');
      expect((await notificationsFor(withdrawn.uid)).filter((n) => n.type === 'EventCancelled')).toEqual([]);
      expect(await statusOf(otherEvent, otherWaiting.uid)).toBe('Waitlisted');
      expect((await notificationsFor(otherWaiting.uid)).filter((n) => n.type === 'EventCancelled')).toEqual([]);
      expect(await statusOf(eventId, waiting.uid)).toBe('Cancelled');
    });

    /**
     * JOIN-WAITLIST-12-D-COO-REFUSED: a person cannot be both a waiting-list attendee and the assigned coordinator of the
     * event. The assigned coordinator who also holds ATTENDEE is refused the waiting list (403, no entry written). The
     * cancel still answers 200 and the coordinator keeps exactly one EventCancelled notice (the core text).
     * Kills W8 (the owner check removed: the join is allowed, then the cancel is exercised with a waiting entry).
     */
    it('JOIN-WAITLIST-12-D-COO-REFUSED: the assigned coordinator cannot join the waiting list of their own event', async () => {
      // Arrange: COO is the assigned coordinator and holds ATTENDEE; the event is full with three Registered attendees.
      const coo = await namedUser(['COORDINATOR', 'ATTENDEE'], 'Coordinator Attendee', 10);
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], {
        coordinatorId: coo.uid,
      });

      // Act
      const joinRes = await join(eventId, coo, {});

      // Assert: refused, nothing written
      expect(joinRes.status).toBe(403);
      expect(joinRes.body.code).toBe('WAITLIST_NOT_PERMITTED');
      expect(joinRes.body.message).toBe(MSG_OWN_EVENT);
      expect(await rowOf(eventId, coo.uid)).toBeUndefined();

      // The cancel still answers 200, and the coordinator keeps exactly one notice
      expect((await cancel(eventId, coo)).status).toBe(200);
      const notices = (await notificationsFor(coo.uid)).filter((n) => n.type === 'EventCancelled');
      expect(notices).toEqual([
        expect.objectContaining({ message: `${NAME} has been cancelled.`, related_event_id: eventId }),
      ]);
    });

    /**
     * JOIN-WAITLIST-12-D-ORG-REFUSED: the submitting organiser who also holds ATTENDEE is refused the waiting list of their
     * own event (403, no entry written). The cancel answers 200 and the organiser keeps one EventCancelled notice.
     * Kills W8 (the owner check removed).
     */
    it('JOIN-WAITLIST-12-D-ORG-REFUSED: the organiser cannot join the waiting list of their own event', async () => {
      // Arrange: ORG is the submitter and holds ATTENDEE; the event is full with three Registered attendees.
      const org = await namedUser(['ORGANISER', 'ATTENDEE'], 'Organiser Attendee', 11);
      const eventId = await seedFullGala([await attendee('01'), await attendee('02'), await attendee('03')], {
        organiserId: org.uid,
      });

      // Act
      const joinRes = await join(eventId, org, {});

      // Assert: refused, nothing written
      expect(joinRes.status).toBe(403);
      expect(joinRes.body.code).toBe('WAITLIST_NOT_PERMITTED');
      expect(joinRes.body.message).toBe(MSG_OWN_EVENT);
      expect(await rowOf(eventId, org.uid)).toBeUndefined();

      expect((await cancel(eventId, org)).status).toBe(200);
      const notices = (await notificationsFor(org.uid)).filter((n) => n.type === 'EventCancelled');
      expect(notices).toEqual([
        expect.objectContaining({ message: `${NAME} has been cancelled.`, related_event_id: eventId }),
      ]);
    });
  });

  // JOIN-WAITLIST-13: cross-cutting (bulk ordering)
  describe('Cross-cutting: ordering holds for a long list (JOIN-WAITLIST-13)', () => {
    /**
     * Oracle (13-A): 500 waitlisted entries (ATT-100 to ATT-599) with ascending join times. ATT-04 joins: 201, position 501,
     * message "... Your position is 501.". ATT-01 withdraws: ATT-100 is promoted; ATT-04 is 500; ATT-101 is 1. No timing assertion.
     * Kills M28: the position is capped or computed from a short window.
     */
    it('JOIN-WAITLIST-13-A-BND: a join behind 500 entries is numbered 501, and promotion takes the first of them', async () => {
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedFullGala(att);
      const bulkUsers = await pool.query<{ id: string; display_name: string }>(
        `INSERT INTO users (id, email, display_name, password_hash)
         SELECT ('30000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'bulk-' || g || '@example.com', 'Bulk ' || g,
                crypt($1, gen_salt('bf', 4))
           FROM generate_series(100, 599) AS g RETURNING id, display_name`,
        [PASSWORD],
      );
      userIds.push(...bulkUsers.rows.map((r) => r.id));
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u CROSS JOIN roles r
          WHERE u.id = ANY($1::uuid[]) AND r.name = 'ATTENDEE'`,
        [bulkUsers.rows.map((r) => r.id)],
      );
      // ATT-100 to ATT-599, in label order ("Bulk 100" < ... < "Bulk 599", all three digits). Entry n joins n-th: ATT-100 is
      // the earliest, joined 600 - n seconds before T0, so join times ascend with the label.
      const bulkIds = [...bulkUsers.rows].sort((x, y) => x.display_name.localeCompare(y.display_name)).map((r) => r.id);
      await pool.query(
        `INSERT INTO event_registrations (event_id, attendee_id, status, joined_at, waitlist_seq)
         SELECT $1, ids.id, 'Waitlisted', $2::timestamptz - make_interval(secs => 600 - ids.n::int), nextval('event_registrations_waitlist_seq')
           FROM unnest($3::uuid[]) WITH ORDINALITY AS ids(id, n)`,
        [eventId, T0, bulkIds],
      );
      const earliest = bulkIds[0];
      const a4 = await attendee('04');

      const joined = await joinAs(eventId, a4);

      expect(joined.body).toMatchObject({ status: 'waitlisted', position: 501, message: MSG_WL_01(501) });
      expect((await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0])).status).toBe(200);
      expect(await statusOf(eventId, earliest)).toBe('Registered');
      expect(await positionOf(eventId, a4)).toBe(500);
      // ATT-101 (the second bulk entry) is now first in line.
      const second = await pool.query<{ email: string; id: string }>(`SELECT id, email FROM users WHERE display_name = 'Bulk 101'`);
      const secondWho: Who = { uid: second.rows[0].id, email: second.rows[0].email, cookie: await login(second.rows[0].email) };
      expect(await positionOf(eventId, secondWho)).toBe(1);
    });
  });

  // JOIN-WAITLIST-14: the SPM-63 report lists every status (SPM-138 owner decision); totals stay Confirmed-only
  describe('Cross-cutting: the SPM-63 report lists every status; totals count Confirmed only (JOIN-WAITLIST-14)', () => {
    /**
     * Oracle (14-A, owner decision): EVT-706 clone (ATT-04 to ATT-06 waiting). COO-01 and ORG-01 see the three Confirmed rows
     * and the three waitlisted rows, with positions 1 to 3, and Confirmed total 3 with waitlist count 3. CSV and PDF carry
     * the same rows and the Waitlisted label. After ATT-01 withdraws and ATT-04 is promoted: ATT-04 reads as registered, ATT-05
     * and ATT-06 stay waitlisted, and ATT-01 is listed as withdrawn (the rest of the list, after the waitlist).
     */
    // Kills: W14-TOTAL (the report totals count Waitlisted rows as confirmed)
    it('JOIN-WAITLIST-14-A: the report, CSV and PDF list every status; totals count Confirmed only', async () => {
      const coordinator = await namedUser(['COORDINATOR'], 'Coordinator COO', 3);
      const organiser = await namedUser(['ORGANISER'], 'Organiser ORG', 4);
      const att = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId = await seedEvent({ coordinatorId: coordinator.uid, organiserId: organiser.uid });
      for (const [index, who] of att.entries()) await seedRegistered(eventId, who.uid, `0${index + 1}`);
      const waiting = [await attendee('04'), await attendee('05'), await attendee('06')];
      for (const who of waiting) await joinAs(eventId, who);
      // The registration dates run in the opposite order to the join order (ATT-04 joined first, has the latest date), so
      // only joined_at and waitlist_seq can give the waitlist its order. The dates sit after the seeded Confirmed rows, so
      // after a promotion ATT-04 is the last Confirmed row.
      await pool.query(
        `UPDATE event_registrations SET created_at = $2 WHERE event_id = $1 AND attendee_id = $3`,
        [eventId, '2026-10-20T00:00:00.000Z', waiting[0].uid],
      );
      await pool.query(
        `UPDATE event_registrations SET created_at = $2 WHERE event_id = $1 AND attendee_id = $3`,
        [eventId, '2026-10-19T00:00:00.000Z', waiting[1].uid],
      );
      await pool.query(
        `UPDATE event_registrations SET created_at = $2 WHERE event_id = $1 AND attendee_id = $3`,
        [eventId, '2026-10-18T00:00:00.000Z', waiting[2].uid],
      );

      for (const who of [coordinator, organiser]) {
        const report = await request(app.getHttpServer()).get(`/api/events/${eventId}/registrations/report`).set('Cookie', who.cookie).expect(200);
        expect([report.body.totalConfirmed, report.body.waitlistCount, report.body.availableSpots]).toEqual([3, 3, 0]); // capacity 3
        expect(report.body.registrations.map((r: { fullName: string }) => r.fullName)).toEqual([
          'Queue 01', 'Queue 02', 'Queue 03', 'Attendee 04', 'Attendee 05', 'Attendee 06',
        ]);
        expect(report.body.registrations.slice(3).map((r: { waitlistPosition: number }) => r.waitlistPosition)).toEqual([1, 2, 3]);
        expect(report.body.registrations.slice(3).map((r: { fullName: string }) => r.fullName)).toEqual(['Attendee 04', 'Attendee 05', 'Attendee 06']);
        const csv = (await download(app, `/api/events/${eventId}/registrations/report/export?format=csv`, who)).toString('utf8');
        const pdf = await pdfText(await download(app, `/api/events/${eventId}/registrations/report/export?format=pdf`, who));
        expect(csv).toContain('Attendee 04');
        expect(csv).toContain(',Waitlisted\r\n');
        expect(pdf).toContain('Waitlisted');
      }

      // ATT-01 withdraws: ATT-04 (the first entry) is promoted; ATT-01 is listed as withdrawn after the waitlist.
      await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]).expect(200);
      const after = await request(app.getHttpServer()).get(`/api/events/${eventId}/registrations/report`).set('Cookie', coordinator.cookie).expect(200);
      expect([after.body.totalConfirmed, after.body.waitlistCount]).toEqual([3, 2]);
      expect(after.body.registrations.map((r: { fullName: string; status: string }) => [r.fullName, r.status])).toEqual([
        ['Queue 02', 'registered'], ['Queue 03', 'registered'], ['Attendee 04', 'registered'],
        ['Attendee 05', 'waitlisted'], ['Attendee 06', 'waitlisted'], ['Queue 01', 'withdrawn'],
      ]);
      // A promoted entry is Confirmed: it carries neither a waitlist position nor a join time.
      const promoted = after.body.registrations.find((r: { fullName: string }) => r.fullName === 'Attendee 04');
      expect(promoted).not.toHaveProperty('waitlistPosition');
      expect(promoted).not.toHaveProperty('joinedAt');
    });
  });

  // Reads write only for a caller who may see the event, and an unauthorised read takes no lock.
  describe('A read writes only for an attendee who may see the event (11-H-ORG, 11-H-LOCK)', () => {
    /**
     * JOIN-WAITLIST-11-H-ORG: an organiser's read of a closed event does not settle its waitlist. The row
     * stays Waitlisted until an attendee reads or a job runs. Kills B1-ORG: the settle runs for every caller.
     */
    it('JOIN-WAITLIST-11-H-ERR-ORG: an organiser GET on a closed event leaves a waiting row unchanged', async () => {
      const organiser = await namedUser(['ORGANISER'], 'Owner Organiser', 5);
      const eventId = await seedFullGala([await attendee('111'), await attendee('112'), await attendee('113')], {
        organiserId: organiser.uid,
      });
      const waiting = await attendee('114');
      await joinAs(eventId, waiting);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', organiser.cookie).expect(200);

      expect(await statusOf(eventId, waiting.uid)).toBe('Waitlisted');
    });

    /**
     * JOIN-WAITLIST-11-H-LOCK: a coordinator who is not assigned to the event is refused (404) without the
     * event being locked and without a write, even when the list is due. The lock is held by the test; a read that tried to
     * take it would wait and never answer. Kills B1-UNAUTH: the settle runs before the visibility check.
     */
    it('JOIN-WAITLIST-11-H-ERR-LOCK: an unauthorised GET on a due list takes no lock and writes nothing', async () => {
      const eventId = await seedFullGala([await attendee('115'), await attendee('116'), await attendee('117')]);
      const waiting = await attendee('118');
      await joinAs(eventId, waiting);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);
      const stranger = await namedUser(['COORDINATOR'], 'Unassigned Coordinator', 6);

      const holder = await holdEventLock(eventId);
      lockHolders.push(holder);
      const res = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', stranger.cookie);
      await holder.release();

      expect(res.status).toBe(404);
      expect(await statusOf(eventId, waiting.uid)).toBe('Waitlisted');
    });

    /**
     * JOIN-WAITLIST-11-H-NONE (TCR9-1): a viewable attendee's read of a due list settles it: 200, and the row ends Removed.
     * Kills B1-NONE: the event read no longer settles for an attendee.
     */
    it('JOIN-WAITLIST-11-H-STATE-NONE: a viewable attendee GET of a due list is 200 and the waiting row ends Removed', async () => {
      const eventId = await seedFullGala([await attendee('119'), await attendee('120'), await attendee('121')]);
      const waiting = await attendee('122');
      await joinAs(eventId, waiting);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', waiting.cookie).expect(200);

      expect(await statusOf(eventId, waiting.uid)).toBe('Removed');
    });

    /**
     * JOIN-WAITLIST-11-H-COORD (TCR9-1): the assigned coordinator's read of a closed list is 200 and writes nothing: the row
     * stays Waitlisted. Kills B1-COORD: the settle also runs for the assigned coordinator.
     */
    it('JOIN-WAITLIST-11-H-STATE-COORD: an assigned coordinator GET of a closed list leaves the waiting row unchanged', async () => {
      const coordinator = await namedUser(['COORDINATOR'], 'Assigned Coordinator', 7);
      const eventId = await seedFullGala([await attendee('123'), await attendee('124'), await attendee('125')], {
        coordinatorId: coordinator.uid,
      });
      const waiting = await attendee('126');
      await joinAs(eventId, waiting);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', coordinator.cookie).expect(200);

      expect(await statusOf(eventId, waiting.uid)).toBe('Waitlisted');
    });

    /**
     * JOIN-WAITLIST-11-H-NODUE (TCR9-2): with the event lock held, an attendee's event read and registration read on an open
     * list (a waiting row that is not due) both return without waiting, and the row stays Waitlisted. Kills PRECHECK: the
     * early return in settleIfDue is removed, so a read takes the lock for a list that is not due.
     */
    it('JOIN-WAITLIST-11-H-INT-NODUE: reads of an open list take no lock while another holds it, and write nothing', async () => {
      const eventId = await seedFullGala([await attendee('127'), await attendee('128'), await attendee('129')]);
      const waiting = await attendee('130');
      await joinAs(eventId, waiting);

      const holder = await holdEventLock(eventId);
      lockHolders.push(holder);
      const viaEvent = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', waiting.cookie);
      const viaMine = await request(app.getHttpServer()).get(`/api/events/${eventId}/registrations/me`).set('Cookie', waiting.cookie);
      await holder.release();

      expect(viaEvent.status).toBe(200);
      expect(viaMine.status).toBe(200);
      expect(await statusOf(eventId, waiting.uid)).toBe('Waitlisted');
    });
  });

  // Closed-list release, notice visibility over the endpoint, and the settle after the locked read.
  describe('Closed-list release, notice visibility, and the settle after the locked read (12-C-CLOSED, 12-C-VIS, 10-H)', () => {
    /**
     * JOIN-WAITLIST-12-C-CLOSED: an entry on a list the close has already shut is removed, not cancelled, and
     * the releaser writes no cancellation notice for it. Kills X4: the releaser no longer settles before it cancels.
     */
    it('JOIN-WAITLIST-12-C-STATE-CLOSED: a closed list releases its entries as removed, with no cancellation notice', async () => {
      const eventId = await seedFullGala([await attendee('100'), await attendee('101'), await attendee('102')]);
      const waiting = await attendee('103');
      await joinAs(eventId, waiting);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      expect(await releaseUnderLock(eventId)).toBe(0);

      expect(await statusOf(eventId, waiting.uid)).toBe('Removed');
      expect((await notificationsFor(waiting.uid)).filter((n) => n.type === 'EventCancelled')).toEqual([]);
    });

    /**
     * JOIN-WAITLIST-12-C-VIS: after the releaser runs, the cancelled attendee's notices endpoint returns exactly
     * one EventCancelled notice: audienceRole attendee, the MSG-WL-06 text, linked to the event. The notice can be marked
     * read. Kills X1 (EventCancelled is removed from the attendee audience) and X2 (EventCancelled no longer maps to the
     * attendee audience).
     */
    it('JOIN-WAITLIST-12-C-VIS: the cancelled attendee reads exactly one EventCancelled notice and can mark it read', async () => {
      const eventId = await seedFullGala([await attendee('104'), await attendee('105'), await attendee('106')]);
      const waiting = await attendee('107');
      await joinAs(eventId, waiting);
      expect(await releaseUnderLock(eventId)).toBe(1);

      const res = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', waiting.cookie).expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        audienceRole: 'attendee',
        type: 'EventCancelled',
        message: `${NAME} has been cancelled. Your waitlist place is cancelled.`,
        relatedEventId: eventId,
        read: false,
      });
      const read = await request(app.getHttpServer())
        .post(`/api/notifications/${res.body[0].id}/read`)
        .set('Cookie', waiting.cookie)
        .expect(201);
      expect(read.body).toEqual({ success: true });
    });

    /**
     * JOIN-WAITLIST-10-H: the list is read as Registered before the lock, the entry becomes Waitlisted and the
     * list closes before the lock is taken (the state change is made by a fixture, since no normal flow turns a Registered
     * row into a waiting one). The locked re-read sees Waitlisted, settles the closed list, and re-reads Removed: the
     * withdrawal answers 409 and the row is Removed. Kills F6-SKIP: the settle after the locked re-read is skipped.
     */
    it('JOIN-WAITLIST-10-H-ERR: a waiting entry that the close removes before the lock is refused with 409 and ends Removed', async () => {
      const att = [await attendee('108'), await attendee('109'), await attendee('110')];
      const eventId = await seedFullGala(att);
      const rowId = (await rowOf(eventId, att[0].uid)).id;

      const holder = await holdEventLock(eventId);
      let pending: Promise<request.Response>;
      try {
        pending = withdrawById(rowId, att[0]).then((r) => r);
        await waitForLockWaiters(1);
        // The holder owns the event row lock, so the state change is made inside its transaction, then committed.
        await holder.query(
          `UPDATE event_registrations SET status = 'Waitlisted', joined_at = $2, waitlist_seq = nextval('event_registrations_waitlist_seq') WHERE id = $1`,
          [rowId, T0],
        );
        await holder.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);
        await holder.commit();
      } finally {
        await holder.release();
      }
      const res = await pending;

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('registration_not_withdrawable');
      expect(await statusOf(eventId, att[0].uid)).toBe('Removed');
    });
  });

  // Attendee notices and the status re-read under the lock.
  describe('Attendee notices and the status re-read under the lock (09-C, 10-G)', () => {
    /**
     * JOIN-WAITLIST-09-C: an attendee reads only their own waitlist notices. The promoted attendee sees the
     * WaitlistPromoted notice (MSG-WL-05, linked to the event, as an attendee audience). A waiting attendee sees none. An
     * organiser's access is unchanged and does not see the attendee's notice. Kills N-1: the attendee audience is removed.
     */
    it('JOIN-WAITLIST-09-C: an attendee reads only their own waitlist notices; organiser access is unchanged', async () => {
      const att = [await attendee('90'), await attendee('91'), await attendee('92')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('93'), await attendee('94')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      await withdrawById((await rowOf(eventId, att[0].uid)).id, att[0]).expect(200);

      const promoted = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', a4.cookie).expect(200);
      expect(promoted.body).toHaveLength(1);
      expect(promoted.body[0]).toMatchObject({
        audienceRole: 'attendee',
        type: 'WaitlistPromoted',
        message: MSG_WL_05,
        relatedEventId: eventId,
        read: false,
      });

      const waiting = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', a5.cookie).expect(200);
      expect(waiting.body).toEqual([]);

      const organiser = await namedUser(['ORGANISER'], 'Organiser Viewer', 8);
      const organiserView = await request(app.getHttpServer()).get('/api/notifications').set('Cookie', organiser.cookie).expect(200);
      expect(organiserView.body.some((n: { type: string }) => n.type === 'WaitlistPromoted')).toBe(false);
    });

    /**
     * JOIN-WAITLIST-10-G: a waiting entry that a concurrent withdrawal promotes before this request
     * takes the event lock gets the Registered-path result (200, Withdrawn, and the freed place goes to the next entry),
     * not "already withdrawn". The order is forced: the Registered withdrawal queues on the lock first, the waiting
     * withdrawal reads Waitlisted (before the promotion commits) and queues second. Kills A1-REAL: the branch uses the
     * pre-lock read.
     */
    it('JOIN-WAITLIST-10-G-INT: a waiting entry promoted by a concurrent withdrawal takes the Registered path, not already-withdrawn', async () => {
      const att = [await attendee('95'), await attendee('96'), await attendee('97')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('98'), await attendee('99')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      const registeredRow = (await rowOf(eventId, att[0].uid)).id;
      const waitingRow = (await rowOf(eventId, a4.uid)).id;

      const holder = await holdEventLock(eventId);
      let first: Promise<request.Response>;
      let second: Promise<request.Response>;
      try {
        first = withdrawById(registeredRow, att[0]).then((r) => r);
        await waitForLockWaiters(1);
        second = withdrawById(waitingRow, a4).then((r) => r);
        await waitForLockWaiters(2);
      } finally {
        await holder.release();
      }
      const [r1, r2] = await Promise.all([first, second]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r2.body.status).toBe('withdrawn');
      expect(await statusOf(eventId, a4.uid)).toBe('Withdrawn');
      expect(await statusOf(eventId, a5.uid)).toBe('Registered');
    });
  });

  // The attendee list settles due lists, a waiting withdrawal after close settles first, and the job boundary.
  describe('List settle, waiting withdrawal after close, and the job boundary (JOIN-WAITLIST-11-A-LIST, 11-D-WAIT, 11-G)', () => {
    /**
     * JOIN-WAITLIST-11-A-LIST: after the close instant, with no detail read first, the attendee event list
     * reports the waiting entry as removed, and the row is Removed. Kills L-1: the list read no longer settles.
     */
    it('JOIN-WAITLIST-11-A-STATE-LIST: the attendee list shows a closed waiting entry as removed, with no prior detail read', async () => {
      const att = [await attendee('71'), await attendee('72')];
      const eventId = await seedFullGala(att, { limit: 2, closes: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
      const [a4, a5] = [await attendee('73'), await attendee('74')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);

      now = new Date(T0.getTime() + 31 * MINUTE);
      const res = await request(app.getHttpServer()).get('/api/events').set('Cookie', a4.cookie).expect(200);
      const listed = res.body.find((e: { id: string }) => e.id === eventId);

      expect(listed.myRegistrationStatus).toBe('removed');
      expect(listed.myRegistrationStatus).not.toBe('waitlisted');
      expect(await statusOf(eventId, a4.uid)).toBe('Removed');
    });

    /**
     * JOIN-WAITLIST-11-D-WAIT: a waiting entry withdrawn after the close instant, before any job or read
     * has settled it, settles first and is refused: 409 registration_not_withdrawable, and the row is Removed.
     * Kills W-1: the withdrawal of a waiting entry no longer settles the list first.
     */
    it('JOIN-WAITLIST-11-D-ERR-WAIT: a waiting entry withdrawn after close, with nothing settled yet, is removed and refused with 409', async () => {
      const att = [await attendee('75'), await attendee('76')];
      const eventId = await seedFullGala(att, { limit: 2, closes: new Date(T0.getTime() + 30 * MINUTE).toISOString() });
      const waiting = await attendee('77');
      await joinAs(eventId, waiting);
      const rowId = (await rowOf(eventId, waiting.uid)).id;

      now = new Date(T0.getTime() + 31 * MINUTE);
      const res = await withdrawById(rowId, waiting);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('registration_not_withdrawable');
      expect(await statusOf(eventId, waiting.uid)).toBe('Removed');
    });

    /**
     * JOIN-WAITLIST-11-G: the job's boundary is the closing instant itself. One millisecond before the close
     * the job removes nothing; at the instant it removes both entries. Kills P-B: the job's due test is strict (<) and
     * misses the instant.
     */
    it('JOIN-WAITLIST-11-G-BND: the close job removes entries at the exact closing instant and not one millisecond earlier', async () => {
      const closes = new Date('2026-10-19T23:59:00+08:00');
      const eventId = await seedFullGala([await attendee('78'), await attendee('79'), await attendee('80')], { closes: closes.toISOString() });
      const [a4, a5] = [await attendee('81'), await attendee('82')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      const db = app.get(DatabaseService);

      expect(await runRegistrationCloseJob(db, new Date(closes.getTime() - 1))).toBe(0);
      expect(await statusOf(eventId, a4.uid)).toBe('Waitlisted');

      expect(await runRegistrationCloseJob(db, closes)).toBe(2);
      expect(await statusOf(eventId, a4.uid)).toBe('Removed');
      expect(await statusOf(eventId, a5.uid)).toBe('Removed');
    });
    /**
     * JOIN-WAITLIST-11-C-LIST: a manual close (registration_enabled false on a full event whose closing
     * instant is still in the future). The first read is the attendee list, with no earlier read: it reports the waiting
     * entry as removed and the row is Removed. Kills X-JOB-MANUAL: the close job no longer treats a disabled registration
     * as due, so the list would not settle.
     */
    it('JOIN-WAITLIST-11-C-STATE-LIST: a manual close shows a waiting entry as removed on the first attendee list read', async () => {
      const att = [await attendee('83'), await attendee('84'), await attendee('85')];
      const eventId = await seedFullGala(att);
      const [a4, a5] = [await attendee('86'), await attendee('87')];
      await joinAs(eventId, a4);
      await joinAs(eventId, a5);
      await pool.query('UPDATE events SET registration_enabled = false WHERE id = $1', [eventId]);

      const res = await request(app.getHttpServer()).get('/api/events').set('Cookie', a4.cookie).expect(200);
      const listed = res.body.find((e: { id: string }) => e.id === eventId);

      expect(listed.myRegistrationStatus).toBe('removed');
      expect(await statusOf(eventId, a4.uid)).toBe('Removed');
      expect(await statusOf(eventId, a5.uid)).toBe('Removed');
    });
  });

  // JOIN-WAITLIST-07-D and 02-A-LIST.
  describe('Rejoin of a removed entry and the attendee list fields (07-D, 02-A-LIST)', () => {
    /**
     * JOIN-WAITLIST-07-D: a removed entry joins again while the event is full and open. It takes a new
     * join time and sequence, so it goes behind the entry that was already waiting. Kills P-K: the join no longer
     * reuses a Removed row (the rejoin is refused).
     */
    it('JOIN-WAITLIST-07-D-STATE: a removed entry that joins again goes to the back of the list', async () => {
      const eventId = await seedFullGala([await attendee('61'), await attendee('62'), await attendee('63')]);
      const [a4, a5] = [await attendee('64'), await attendee('65')];
      await seedRow(eventId, a4.uid, 'Removed', '64');
      await joinAs(eventId, a5);

      const rejoined = await joinAs(eventId, a4);

      expect(rejoined.body.position).toBe(2);
      expect(await positionOf(eventId, a5)).toBe(1);
      expect(await positionOf(eventId, a4)).toBe(2);
    });

    /**
     * JOIN-WAITLIST-02-A-LIST: the attendee list reports the same capacity fields as the event read. Kills
     * CAP-3: the Confirmed count used for the list is zeroed (a full event would look open).
     */
    it('JOIN-WAITLIST-02-A-LIST: the attendee list reports isFull, waitlistAvailable, availableSpots and the limit', async () => {
      const eventId = await seedFullGala([await attendee('66'), await attendee('67'), await attendee('68')]);
      const viewer = await attendee('69');

      const res = await request(app.getHttpServer()).get('/api/events').set('Cookie', viewer.cookie).expect(200);
      const listed = res.body.find((e: { id: string }) => e.id === eventId);

      expect(listed).toMatchObject({ isFull: true, waitlistAvailable: true, availableSpots: 0, registrationLimit: 3 });
    });
  });

  // JOIN-WAITLIST-16: window edges, a Cancelled entry, a reopened Removed row, and the helpers against rows.
  describe('Window edges, cancelled and removed rows, and the helper functions (JOIN-WAITLIST-16)', () => {
    /**
     * JOIN-WAITLIST-01-D-FREE: a closed or not-yet-open event with a free place refuses the join with the window
     * sentence (MSG-01 or MSG-02), never MSG-WL-03. Kills P-D: the fullness check is made before the window check.
     */
    it('JOIN-WAITLIST-01-D-INT-FREE: a free place does not turn a closed or not-yet-open refusal into MSG-WL-03', async () => {
      const closedEvent = await seedEvent({ limit: 3, closes: '2026-10-13T23:59:00+08:00' });
      await seedRegistered(closedEvent, (await attendee('31')).uid);
      const att04 = await attendee('32');
      const closed = await join(closedEvent, att04, {});
      expect(closed.status).toBe(422);
      expect(closed.body).toMatchObject({ code: 'registration_closed', message: MSG_01 });

      const notOpenEvent = await seedEvent({ limit: 3, opens: '2026-10-17T09:00:00+08:00' });
      await seedRegistered(notOpenEvent, (await attendee('33')).uid);
      const notOpen = await join(notOpenEvent, att04, {});
      expect(notOpen.status).toBe(422);
      expect(notOpen.body).toMatchObject({ code: 'registration_not_open', message: MSG_02_OPENS_17_OCT });
      expect(await rowOf(closedEvent, att04.uid)).toBeUndefined();
      expect(await rowOf(notOpenEvent, att04.uid)).toBeUndefined();
    });

    /**
     * JOIN-WAITLIST-01-D-BOUNDARY: the closing instant is exclusive for the waitlist too. One millisecond before
     * the close a join on a full event is accepted; at the close instant it is refused with MSG-01. Kills P-E: the closing
     * comparison in the window rule is made inclusive of the wrong instant.
     */
    it('JOIN-WAITLIST-01-D-BND-BOUNDARY: a join one millisecond before the close is accepted and one at the close is refused', async () => {
      const closes = new Date('2026-10-19T23:59:00+08:00');
      const eventId = await seedFullGala([await attendee('34'), await attendee('35'), await attendee('36')], { closes: closes.toISOString() });
      const before = await attendee('37');
      const atClose = await attendee('38');

      now = new Date(closes.getTime() - 1);
      await joinAs(eventId, before);

      now = closes;
      const refused = await join(eventId, atClose, {});
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'registration_closed', message: MSG_01 });
    });

    /**
     * JOIN-WAITLIST-10-F: a Cancelled row answers 409 registration_not_withdrawable with its
     * copy, and stays Cancelled. Kills P-I: Cancelled is dropped from the refusal that answers 409.
     */
    it('JOIN-WAITLIST-10-F-ERR: a Cancelled entry answers 409 registration_not_withdrawable and keeps its status', async () => {
      const eventId = await seedFullGala([await attendee('39'), await attendee('40'), await attendee('41')]);
      const cancelled = await attendee('42');
      const rowId = await seedRow(eventId, cancelled.uid, 'Cancelled', '42');

      const res = await withdrawById(rowId, cancelled);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'registration_not_withdrawable', message: 'This registration can no longer be withdrawn.' });
      expect(await statusOf(eventId, cancelled.uid)).toBe('Cancelled');
    });

    /**
     * JOIN-WAITLIST-11-F: a Removed row registers directly once the window allows it. The reopen is simulated by
     * the fixture (the registration-setup story is Blocked); the row keeps its id and is Registered with the removal
     * cleared. Kills P-J: the direct registration no longer reactivates a Removed row.
     */
    it('JOIN-WAITLIST-11-F-STATE: a removed entry registers directly on an open event and its removal is cleared', async () => {
      const att = [await attendee('43'), await attendee('44')];
      const eventId = await seedFullGala(att, { limit: 3 });
      const removedAttendee = await attendee('45');
      const rowId = await seedRow(eventId, removedAttendee.uid, 'Removed', '45');

      const res = await register(eventId, removedAttendee, '45');

      expect(res.status).toBe(201);
      const row = await rowOf(eventId, removedAttendee.uid);
      expect(row.id).toBe(rowId);
      expect(row.status).toBe('Registered');
      expect(row.removed_at).toBeNull();
      expect(row.joined_at).toBeNull();
    });

    /**
     * JOIN-WAITLIST-12-C-REL: the releaser cancels the Waitlisted entries of
     * the event and leaves Withdrawn and Registered rows as they were. Its wiring is SPM-136's (12-A to 12-C are Blocked).
     * Kills M26 (the releaser also cancels withdrawn entries).
     */
    it('JOIN-WAITLIST-12-C-REL: the releaser cancels waiting entries only, row by row', async () => {
      const att = [await attendee('46'), await attendee('47'), await attendee('48')];
      const eventId = await seedFullGala(att);
      const waiting = await attendee('49');
      const withdrawn = await attendee('50');
      const removed = await attendee('88');
      await joinAs(eventId, waiting);
      await seedRow(eventId, withdrawn.uid, 'Withdrawn', '50');
      await seedRow(eventId, removed.uid, 'Removed', '88');
      const cancelledCount = await releaseUnderLock(eventId);

      expect(cancelledCount).toBe(1);
      expect(await statusOf(eventId, waiting.uid)).toBe('Cancelled');
      expect(await statusOf(eventId, withdrawn.uid)).toBe('Withdrawn');
      expect(await statusOf(eventId, removed.uid)).toBe('Removed');
      expect(await statusOf(eventId, att[0].uid)).toBe('Registered');
      // One EventCancelled notice for the cancelled entry only; none for the Withdrawn or Removed rows.
      const notices = (await notificationsFor(waiting.uid)).filter((n) => n.type === 'EventCancelled');
      expect(notices).toEqual([
        {
          type: 'EventCancelled',
          message: `${NAME} has been cancelled. Your waitlist place is cancelled.`,
          related_event_id: eventId,
          related_user_id: waiting.uid,
          read: false,
        },
      ]);
      expect(await notificationsFor(withdrawn.uid)).toEqual([]);
      expect(await notificationsFor(removed.uid)).toEqual([]);
      // A second release finds nothing left to cancel, so it adds no notice (one notice in total).
      expect(await releaseUnderLock(eventId)).toBe(0);
      expect((await notificationsFor(waiting.uid)).filter((n) => n.type === 'EventCancelled')).toHaveLength(1);
    });

    /**
     * JOIN-WAITLIST-11-E-HOOK: the reopen hook settles before a window change, so
     * the entries that closed are Removed and a later reopen cannot restore them (11-E itself is Blocked).
     * Kills entries restored on reopen: the hook never writes Waitlisted back.
     */
    it('JOIN-WAITLIST-11-E-HOOK: the hook removes closed entries and nothing restores them', async () => {
      const eventId = await seedFullGala([await attendee('51'), await attendee('52'), await attendee('53')], {
        closes: '2026-10-13T23:59:00+08:00',
      });
      const waiting = await attendee('54');
      await seedRow(eventId, waiting.uid, 'Waitlisted', '54');
      const removed = await app.get(DatabaseService).transaction((client) =>
        beforeRegistrationWindowChange(client, eventId, T0),
      );

      expect(removed).toBe(1);
      expect(await statusOf(eventId, waiting.uid)).toBe('Removed');
      expect(await statusOf(eventId, waiting.uid)).not.toBe('Waitlisted');
    });
  });

  // JOIN-WAITLIST-15: AC15 (strict body)
  describe('Cross-cutting: the join body is strict (JOIN-WAITLIST-15)', () => {
    /**
     * Oracle (15-A): a body with status, position, attendeeId, joinedAt and eventId answers 400 (strict, SPM-61 D15) and writes
     * nothing for ATT-01 on EVT-702. An empty object and no body each answer 201 on the full EVT-701.
     * Kills M29: unknown keys are accepted and their values reach the row.
     */
    it('JOIN-WAITLIST-15-A-ERR: unknown keys are refused with 400, and an empty or absent body is accepted', async () => {
      const confirmed = [await attendee('01'), await attendee('02'), await attendee('03')];
      const eventId701 = await seedFullGala(confirmed);
      const eventId702 = await seedEvent({ limit: 10 });
      const att01 = confirmed[0];
      const att04 = await attendee('04');
      const att05 = await attendee('05');

      const refused = await join(eventId702, att01, {
        status: 'Confirmed',
        position: 1,
        attendeeId: att01.uid,
        joinedAt: '2020-01-01T00:00:00Z',
        eventId: eventId702,
      });

      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('validation_error');
      expect(Object.keys(refused.body.errors).sort()).toEqual(['attendeeId', 'eventId', 'joinedAt', 'position', 'status']);
      expect(await rowOf(eventId702, att01.uid)).toBeUndefined();

      const empty = await join(eventId701, att04, {});
      expect(empty.status).toBe(201);
      const absent = await join(eventId701, att05);
      expect(absent.status).toBe(201);
      expect(absent.body.position).toBe(2);
    });
  });
});

/** The express route list for this application, as method and path pairs. */
function routeInventory(app: INestApplication): { method: string; path: string }[] {
  const instance = app.getHttpAdapter().getInstance() as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } };
  const stack = (instance.router?.stack ?? instance._router?.stack ?? []) as {
    route?: { path: string; methods: Record<string, boolean> };
  }[];
  return stack.flatMap((layer) => {
    if (!layer.route) return [];
    return Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route!.path }));
  });
}

/** Downloads a report body as bytes, with the caller's session cookie. */
function download(app: INestApplication, path: string, who: Who): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    request(app.getHttpServer())
      .get(path)
      .set('Cookie', who.cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .end((error, res) => (error ? reject(error) : resolve(res.body as Buffer)));
  });
}

/** Extracts the text of a PDF. */
async function pdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
