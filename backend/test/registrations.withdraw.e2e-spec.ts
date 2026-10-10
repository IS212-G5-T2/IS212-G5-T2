/*
 * Story: SPM-120 Withdraw Registration (attendee), backend half.
 * ACs: AC3 (confirm/cancel), AC4 (not after event date), AC5 (status "Withdrawn"), AC6 (message).
 * Story goal (CAP-01): the freed spot is available.
 * Test cases: WITHDRAW-EVENT-REG-03-A, 04-B, 04-C, 04-D, 05-B, 05-C, 05-D, 05-E, 05-F,
 *             07-A, 07-B, 07-INT-1 to 07-INT-5, 08-A, CAP-01.
 * Note: test IDs follow the six-AC matrix (docs/specs/SPM-120-test-results.md, "Test ID map", lists the former Confluence IDs); AC numbers are Jira.
 *
 * Real Nest pipeline and real PostgreSQL; time comes from the injected CLOCK and
 * is never read from the wall clock. Oracles are literals taken from the AC text
 * and the Confluence test-case pages, never imported from production code.
 *
 * Conventions (documented once here):
 *  - Suite clock T0 = 2026-10-04T12:00:00+08:00 = 2026-10-04T04:00:00Z.
 *  - The Confluence ids (REG-9001, EVT-101, ATT-01 ...) are labels; the repo uses
 *    UUIDs, so each test names its fixtures with those labels in comments.
 *  - SPEC status "Withdrawn" maps to the repo values: API 'withdrawn' (lower-case),
 *    stored 'Withdrawn'. SPEC status "Confirmed" maps to the repo's "Registered".
 *  - "Row unchanged" assertions on refusals prove no COMMITTED change only: withdraw() runs in one transaction that rolls
 *    back on any throw, so a write issued before a check would also leave the row unchanged. That no UPDATE is issued is
 *    proven in registrations.withdraw.spec.ts, which records the SQL (mutant M34 survives this suite alone).
 *  - The "fresh GET /registrations/REG-9001" in the cases maps to the existing
 *    read route GET /api/events/:eventId/registrations/me.
 * Needs DATABASE_URL with database/postgresql/init 001 to 007 applied.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const database = process.env.DATABASE_URL;
const T0 = new Date('2026-10-04T12:00:00+08:00');
const MINUTE = 60_000;
// EVT-101 "Tech Talk: Cloud 101" starts T0 + 10 days at 14:00 SGT.
const EVT_101_START = '2026-10-14T14:00:00+08:00';
// EVT-104 "Startup Pitch Day" started T0 - 5 days at 10:00 SGT.
const EVT_104_START = '2026-09-29T10:00:00+08:00';
// EVT-T5 starts exactly 2026-11-01 09:00:00 SGT (04-C boundary).
const EVT_T5_START = '2026-11-01T09:00:00+08:00';
const details = {
  full_name: 'Alice Tan',
  email: 'alice@example.com',
  contact_number: '91234567',
  special_requirements: 'Vegetarian meal',
};
const BODY_VARIANTS: [string, object | undefined][] = [
  ['no body', undefined],
  ['empty object body', {}],
];
const CONCURRENT = 5;
const NO_BODY_ALLOWED = 'This request does not accept a body.';
const BAD_BODIES: [string, object, Record<string, string>][] = [
  ['an empty array', [], { form: NO_BODY_ALLOWED }],
  ['a non-empty array', ['x'], { form: NO_BODY_ALLOWED }],
  ['an unknown key only', { note: 'hi' }, { note: 'This field is not accepted.' }],
];

describe.skipIf(!database)('SPM-120 withdraw registration (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = T0;
  const eventIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: database });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    now = T0;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    // Listening once up front lets the parallel requests share one server.
    await app.listen(0);
  });
  afterEach(async () => {
    await app?.close();
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds.splice(0)]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds.splice(0)]);
  });

  /** Creates a user with one role and returns a session cookie. */
  async function createUser(role: string, name = 'Alice Tan') {
    const email = `spm120-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const uid = created.rows[0].id;
    userIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' }).expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('connectsphere_session='))!;
    return { uid, cookie: cookie.split(';', 1)[0] };
  }

  /** Seeds a published event (Confirmed unless a status is given) that starts at the given instant. */
  async function seedEvent(options: { name: string; start: string; limit?: number; status?: string }) {
    const id = randomUUID();
    eventIds.push(id);
    const start = new Date(options.start);
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, registration_enabled, registration_limit,
         status, submission_key)
       VALUES ($1,'organiser-x','Organiser','o@example.com',$2,'Purpose',$3,$4,50,true,$5,$7,$6)`,
      [id, options.name, start, new Date(start.getTime() + 2 * 3_600_000), options.limit ?? 50, randomUUID(), options.status ?? 'Confirmed'],
    );
    return id;
  }

  /** Seeds a registration row directly (the register flow is covered by SPM-61). */
  async function seedRegistration(eventId: string, attendeeId: string, status: 'Registered' | 'Withdrawn' = 'Registered') {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, contact_number, special_requirements)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [eventId, attendeeId, status, details.full_name, details.email, details.contact_number, details.special_requirements],
    );
    return result.rows[0].id;
  }

  /** POST /api/registrations/:id/withdraw with an optional body and cookie. */
  function withdraw(registrationId: string, cookie?: string, body?: object) {
    let req = request(app.getHttpServer()).post(`/api/registrations/${registrationId}/withdraw`);
    if (cookie) req = req.set('Cookie', cookie);
    return body === undefined ? req : req.send(body);
  }

  /** The stored row, with withdrawn_at also read as a UTC string (time-zone proof). */
  async function dbRow(registrationId: string) {
    const result = await pool.query(
      `SELECT status, withdrawn_at, full_name, email, contact_number, special_requirements,
              to_char(withdrawn_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS withdrawn_at_utc
         FROM event_registrations WHERE id = $1`,
      [registrationId],
    );
    return result.rows[0];
  }
  const registeredCount = (eventId: string) =>
    pool
      .query<{ count: number }>(`SELECT COUNT(*)::integer AS count FROM event_registrations WHERE event_id = $1 AND status = 'Registered'`, [eventId])
      .then((r) => r.rows[0].count);
  const mine = (eventId: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api/events/${eventId}/registrations/me`).set('Cookie', cookie).expect(200);

  /** EVT-101 with REG-9001 (ATT-01) plus two other attendees, all registered. */
  async function seedEvt101() {
    const eventId = await seedEvent({ name: 'Tech Talk: Cloud 101', start: EVT_101_START });
    const att01 = await createUser('ATTENDEE', 'Alice Tan');
    const regId = await seedRegistration(eventId, att01.uid);
    const others = [await createUser('ATTENDEE', 'Ben Lim'), await createUser('ATTENDEE', 'Cara Ng')];
    const otherRegIds = [await seedRegistration(eventId, others[0].uid), await seedRegistration(eventId, others[1].uid)];
    return { eventId, att01, regId, otherRegIds };
  }

  // WITHDRAW-EVENT-REG-03-A
  describe('WITHDRAW-EVENT-REG-03-A (AC3: confirm/cancel): a confirmed withdrawal is processed server-side', () => {
    // Oracle (SPEC 03-A, F1 corrected): 200, status Withdrawn, withdrawnAt = injected clock,
    // MSG-11 text, DB row set, registered count 3 -> 2.
    // Kills: 200 without state change; count not released; M10 SQL NOW() instead of the clock.
    it.each(BODY_VARIANTS)('returns 200, persists the withdrawal and releases the spot (%s)', async (_label, body) => {
      // Arrange: EVT-101 with 3 registered including REG-9001, clock at T0.
      const { eventId, att01, regId } = await seedEvt101();
      expect(await registeredCount(eventId)).toBe(3);

      // Act
      const res = await withdraw(regId, att01.cookie, body);

      // Assert: response body
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: regId,
        status: 'withdrawn', // SPEC "Withdrawn" -> repo API value
        withdrawnAt: '2026-10-04T04:00:00.000Z',
        message: 'Your withdrawal from Tech Talk: Cloud 101 has been processed.',
      });
      // Assert: stored row and capacity
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Withdrawn');
      expect(stored.withdrawn_at_utc).toBe('2026-10-04 04:00:00');
      expect(await registeredCount(eventId)).toBe(2);
      // Assert: a fresh read returns the withdrawn registration
      const fresh = await mine(eventId, att01.cookie);
      expect(fresh.body.registration).toMatchObject({ id: regId, status: 'withdrawn', withdrawnAt: '2026-10-04T04:00:00.000Z' });
    });
  });

  // WITHDRAW-EVENT-REG-04-B
  describe('WITHDRAW-EVENT-REG-04-B (AC4): the server refuses a withdrawal after the event started', () => {
    // Oracle (SPEC 04-B + D6/D7): 422 with the AC5 message and code; nothing changes.
    // Kills: server-side time check missing (UI-only). NOT killed here: a write issued before the check, because the
    // transaction rolls it back (M34); registrations.withdraw.spec.ts records the statements and proves no UPDATE is issued.
    it.each(BODY_VARIANTS)('REG-9002 on past EVT-104 -> 422 and no state change (%s)', async (_label, body) => {
      // Arrange: ATT-01 registered for EVT-104, which started 5 days ago.
      const eventId = await seedEvent({ name: 'Startup Pitch Day', start: EVT_104_START });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid);

      // Act
      const res = await withdraw(regId, att01.cookie, body);

      // Assert
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'event_already_occurred', message: 'Event has already occurred' });
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Registered');
      expect(stored.withdrawn_at).toBeNull();
      expect(await registeredCount(eventId)).toBe(1);
    });
  });

  // WITHDRAW-EVENT-REG-04-C
  describe('WITHDRAW-EVENT-REG-04-C (AC4): the cut-off is the exact event start instant (exclusive, [A7])', () => {
    // Oracle (SPEC 04-C): 08:59:59 -> 200; 09:00:00 -> 422; Added C 09:00:01 -> 422. Fresh fixture each time.
    // Kills: M1 `>=` -> `>` (B fails); `>=` -> `===` (C fails); `<` / `<=` swapped (A fails).
    it.each([
      ['A: 1 second before the start', '2026-11-01T08:59:59+08:00', 200, 'Withdrawn', 0],
      ['B: exactly at the start', '2026-11-01T09:00:00+08:00', 422, 'Registered', 1],
      ['C (added): 1 second after the start', '2026-11-01T09:00:01+08:00', 422, 'Registered', 1],
    ])('%s', async (_label, clock, expectedStatus, expectedStored, expectedRegistered) => {
      // Arrange: REG-T5 for EVT-T5, clock set to the instant under test.
      const eventId = await seedEvent({ name: 'Boundary Event', start: EVT_T5_START });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid);
      now = new Date(clock);

      // Act
      const res = await withdraw(regId, att01.cookie);

      // Assert: status code, and the stored state follows the outcome.
      expect(res.status).toBe(expectedStatus);
      const stored = await dbRow(regId);
      expect(stored.status).toBe(expectedStored);
      expect(await registeredCount(eventId)).toBe(expectedRegistered);
    });
  });

  // WITHDRAW-EVENT-REG-04-D
  describe('WITHDRAW-EVENT-REG-04-D (AC4, ASSUMED A8): only the start instant decides, never the event status label', () => {
    // ASSUMPTION A8: the Jira AC blocks a withdrawal only once the event date has passed, and RegistrationsService
    // documents that "the status label is never used because it can lag the clock". So an attendee may withdraw from
    // a Cancelled event that has not started (it only frees a spot), and a Completed label on a future start changes
    // nothing. The Product Owner has not confirmed this; Confirmed is the SPEC baseline (03-A).
    // Statuses an attendee can hold a registration under: ATTENDEE_VISIBLE_STATUSES = Confirmed, Completed, Cancelled.
    // Kills: a status filter added to the lookup (for example `AND e.status <> 'Cancelled'`), which would 404 here.
    it.each(['Confirmed', 'Cancelled', 'Completed'])('a %s event that starts in the future -> 200 and Withdrawn', async (status) => {
      // Arrange
      const eventId = await seedEvent({ name: `${status} Event`, start: EVT_101_START, status });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid);

      // Act
      const res = await withdraw(regId, att01.cookie);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('withdrawn');
      expect((await dbRow(regId)).status).toBe('Withdrawn');
      expect(await registeredCount(eventId)).toBe(0);
    });
  });

  // WITHDRAW-EVENT-REG-05-B
  describe('WITHDRAW-EVENT-REG-05-B (AC4: error message): the API message is exactly "Event has already occurred"', () => {
    // Oracle (SPEC AC5 + D6): same literal however far past; error shape per SPM-61; no internals leaked.
    // Kills: different wording; message varying by how far past; stack/SQL leaked.
    it.each([
      ['5 days past', EVT_104_START, T0],
      ['1 second past', EVT_T5_START, new Date('2026-11-01T09:00:01+08:00')],
    ])('%s -> 422 with the AC5 literal and only the SPM-61 error fields', async (_label, start, clock) => {
      // Arrange
      const eventId = await seedEvent({ name: 'Past Event', start });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid);
      now = clock;

      // Act
      const res = await withdraw(regId, att01.cookie);

      // Assert: whole body is the SPM-61 error shape, nothing else.
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ statusCode: 422, code: 'event_already_occurred', message: 'Event has already occurred' });
      expect(JSON.stringify(res.body)).not.toMatch(/stack|SELECT|UPDATE|event_registrations/i);
    });
  });

  // WITHDRAW-EVENT-REG-05-C
  describe('WITHDRAW-EVENT-REG-05-C (AC5: status "Withdrawn"): the withdrawn status is persisted', () => {
    // Oracle (SPEC 05-C): fresh read shows withdrawn + instant; row kept with details; others untouched.
    // Kills: wrong value written; hard delete (M4); UPDATE without WHERE id; withdrawn_at from the client.
    it('keeps the row and details, sets status and withdrawn_at, and leaves other registrations alone', async () => {
      // Arrange
      const { eventId, att01, regId, otherRegIds } = await seedEvt101();

      // Act
      await withdraw(regId, att01.cookie).expect(200);

      // Assert: a separate, fresh read as the owner
      const fresh = await mine(eventId, att01.cookie);
      expect(fresh.body.registration).toMatchObject({
        id: regId,
        status: 'withdrawn',
        withdrawnAt: '2026-10-04T04:00:00.000Z',
        fullName: 'Alice Tan',
        email: 'alice@example.com',
        contactNumber: '91234567',
        specialRequirements: 'Vegetarian meal',
      });
      // Assert: the row still exists with its details; withdrawn_at came from the injected clock
      const stored = await dbRow(regId);
      expect(stored).toMatchObject({ status: 'Withdrawn', full_name: 'Alice Tan', email: 'alice@example.com', contact_number: '91234567', special_requirements: 'Vegetarian meal', withdrawn_at_utc: '2026-10-04 04:00:00' });
      // Assert: the two other EVT-101 registrations are untouched
      for (const otherId of otherRegIds) {
        const other = await dbRow(otherId);
        expect(other.status).toBe('Registered');
        expect(other.withdrawn_at).toBeNull();
      }
    });

    // WITHDRAW-EVENT-REG-05-C
    // ASSUMPTION A10: a registration made before migration 004 added the detail columns has NULL name, email and
    // contact (the frontend type says "absent on older records"). The API contract keeps attendeeName, fullName and
    // email as strings, so the response shows empty strings, and the optional fields are left out rather than null.
    // Unconfirmed by the Product Owner. Kills: the `?? ''` fallbacks removed (null names reach the frontend).
    it('05-C (legacy row, ASSUMED A10): a registration with no stored details withdraws with empty strings, not null', async () => {
      // Arrange: the row has only the columns that existed before migration 004.
      const eventId = await seedEvent({ name: 'Legacy Event', start: EVT_101_START });
      const att01 = await createUser('ATTENDEE');
      const created = await pool.query<{ id: string }>(
        `INSERT INTO event_registrations (event_id, attendee_id, status) VALUES ($1, $2, 'Registered') RETURNING id`,
        [eventId, att01.uid],
      );

      // Act
      const res = await withdraw(created.rows[0].id, att01.cookie);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'withdrawn', attendeeName: '', fullName: '', email: '' });
      expect(res.body).not.toHaveProperty('contactNumber');
      expect(res.body).not.toHaveProperty('specialRequirements');
    });

    // Oracle (Added C, SPM-61 D15): server-controlled fields in the body are rejected with 400, no change.
    // Kills: body fields trusted by the server.
    it('Added C: a body that sets status or withdrawnAt -> 400 and no change', async () => {
      // Arrange
      const { eventId, att01, regId } = await seedEvt101();

      // Act
      const res = await withdraw(regId, att01.cookie, { status: 'registered', withdrawnAt: '2020-01-01T00:00:00Z' });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation_error' });
      expect(res.body.errors).toHaveProperty('status');
      expect(res.body.errors).toHaveProperty('withdrawnAt');
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Registered');
      expect(stored.withdrawn_at).toBeNull();
      expect(await registeredCount(eventId)).toBe(3);
    });

    // Oracle (DERIVED from the service's body rule and SPM-61 D15, "no body or {} only"): any other body shape is a
    // 400; an object gets a per-key "not accepted" error, a non-object a form-level error. Nothing changes.
    // Kills: an array body treated like {} and accepted; an unknown key ignored; wrong error shape.
    it.each(BAD_BODIES)('Added C (body shapes): %s -> 400 and no change', async (_label, body, errors) => {
      // Arrange
      const { eventId, att01, regId } = await seedEvt101();

      // Act
      const res = await withdraw(regId, att01.cookie, body);

      // Assert: the exact error shape, and nothing changed
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ statusCode: 400, code: 'validation_error', message: 'Please correct the highlighted fields.', errors });
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Registered');
      expect(stored.withdrawn_at).toBeNull();
      expect(await registeredCount(eventId)).toBe(3);
    });
  });

  // WITHDRAW-EVENT-REG-05-D
  describe('WITHDRAW-EVENT-REG-05-D (AC5: concurrency): a registration can only be withdrawn once', () => {
    // Oracle (SPEC 05-D + 08-A(A), same case, run once): 3 parallel -> one 200, two 422 with MSG-12; count -1.
    // Kills: M3 no state guard in the UPDATE; check-then-update race; capacity released twice.
    it('A (also 08-A A): 3 parallel requests -> one 200 and two 422 "already been withdrawn"', async () => {
      // Arrange
      const { eventId, att01, regId } = await seedEvt101();

      // Act
      const responses = await Promise.all([1, 2, 3].map(() => withdraw(regId, att01.cookie)));

      // Assert
      expect(responses.map((r) => r.status).sort()).toEqual([200, 422, 422]);
      for (const refused of responses.filter((r) => r.status === 422)) {
        expect(refused.body.message).toBe('This registration has already been withdrawn.');
      }
      expect((await dbRow(regId)).status).toBe('Withdrawn');
      expect(await registeredCount(eventId)).toBe(2);
    });

    // Oracle (Added B, from "set once, not changed again"): a later second request keeps the first timestamp.
    // Kills: second call overwrites withdrawn_at; second call returns 200.
    it('B (added): a second request a minute later -> 422 and withdrawn_at is unchanged', async () => {
      // Arrange: withdraw at T0.
      const { eventId, att01, regId } = await seedEvt101();
      await withdraw(regId, att01.cookie).expect(200);

      // Act: advance the injected clock one minute and try again.
      now = new Date(T0.getTime() + MINUTE);
      const second = await withdraw(regId, att01.cookie);

      // Assert
      expect(second.status).toBe(422);
      expect(second.body.message).toBe('This registration has already been withdrawn.');
      expect((await dbRow(regId)).withdrawn_at_utc).toBe('2026-10-04 04:00:00');
      expect(await registeredCount(eventId)).toBe(2);
    });
  });

  // WITHDRAW-EVENT-REG-05-D
  describe('WITHDRAW-EVENT-REG-05-D (C, added): the compare-and-set decides, not the earlier read', () => {
    // Oracle (DERIVED, D14 / "one compare-and-set"): the request passes its read while the row still looks
    // Registered, but a competing withdrawal commits before its UPDATE runs. The loser must get 422 MSG-12,
    // must not overwrite withdrawn_at, and the spot must be released once.
    // Made deterministic with a second connection that holds the row lock, so no timing luck is involved.
    // Kills: M3 the status condition removed from the UPDATE (the parallel cases above cannot see it).
    it('a request that loses the race after its read -> 422 and the winner\'s withdrawn_at is kept', async () => {
      // Arrange: a competing transaction withdraws the row but has not committed yet.
      const { eventId, att01, regId } = await seedEvt101();
      const earlier = new Date('2026-10-04T03:00:00.000Z');
      const competing = await pool.connect();
      let committed = false;
      try {
        await competing.query('BEGIN');
        await competing.query(`UPDATE event_registrations SET status = 'Withdrawn', withdrawn_at = $2 WHERE id = $1`, [regId, earlier]);

        // Act: our request reads 'Registered' (the competing change is uncommitted), then blocks on its UPDATE.
        const inflight = withdraw(regId, att01.cookie).then((res) => res);
        await vi.waitFor(async () => {
          const blocked = await pool.query<{ count: number }>(
            `SELECT COUNT(*)::integer AS count FROM pg_stat_activity
              WHERE wait_event_type = 'Lock' AND query ILIKE 'UPDATE event_registrations%'`,
          );
          expect(blocked.rows[0].count).toBe(1);
        });
        await competing.query('COMMIT');
        committed = true;
        const res = await inflight;

        // Assert
        expect(res.status).toBe(422);
        expect(res.body.message).toBe('This registration has already been withdrawn.');
        expect((await dbRow(regId)).withdrawn_at_utc).toBe('2026-10-04 03:00:00');
        expect(await registeredCount(eventId)).toBe(2);
      } finally {
        if (!committed) await competing.query('ROLLBACK');
        competing.release();
      }
    });
  });

  // WITHDRAW-EVENT-REG-05-E
  describe('WITHDRAW-EVENT-REG-05-E (AC5: UTC storage): withdrawn_at is stored as UTC and does not depend on the process time zone', () => {
    // Oracle (SPEC 05-E, T0 per F2/F14): API instant 04:00Z; DB read as UTC text 2026-10-04 04:00:00.
    // Run this block under TZ=UTC, TZ=Asia/Singapore and TZ=America/Los_Angeles (05-E Subtest C): identical results.
    // Kills: M11 local-time text written to the column; timestamp recalculated on read.
    it('A: the API instant and the stored UTC value both equal the injected clock', async () => {
      // Arrange
      const { eventId, att01, regId } = await seedEvt101();

      // Act
      const res = await withdraw(regId, att01.cookie).expect(200);

      // Assert
      expect(res.body.withdrawnAt).toBe('2026-10-04T04:00:00.000Z');
      expect((await dbRow(regId)).withdrawn_at_utc).toBe('2026-10-04 04:00:00');
      expect((await mine(eventId, att01.cookie)).body.registration.withdrawnAt).toBe('2026-10-04T04:00:00.000Z');
    });

    it('B: advancing the clock 5 minutes does not change the stored or returned timestamp', async () => {
      // Arrange
      const { eventId, att01, regId } = await seedEvt101();
      await withdraw(regId, att01.cookie).expect(200);

      // Act: the clock moves on (no real waiting) and the registration is read again.
      now = new Date(T0.getTime() + 5 * MINUTE);
      const fresh = await mine(eventId, att01.cookie);

      // Assert
      expect(fresh.body.registration.withdrawnAt).toBe('2026-10-04T04:00:00.000Z');
      expect((await dbRow(regId)).withdrawn_at_utc).toBe('2026-10-04 04:00:00');
    });
  });

  // WITHDRAW-EVENT-REG-05-F
  describe('WITHDRAW-EVENT-REG-05-F (derived): re-registering after a withdrawal', () => {
    // Oracle (DERIVED, SPM-61 A5 / D16): the same row is reactivated and withdrawn_at is cleared.
    // Kills: a re-registered attendee still showing the old withdrawal time.
    it('reactivates the withdrawn row and clears withdrawn_at', async () => {
      // Arrange: ATT-01 withdraws from EVT-101, then registers again.
      const { eventId, att01, regId } = await seedEvt101();
      await withdraw(regId, att01.cookie).expect(200);

      // Act
      const again = await request(app.getHttpServer())
        .post(`/api/events/${eventId}/registrations`)
        .set('Cookie', att01.cookie)
        .send({ fullName: 'Alice Tan', email: 'alice@example.com' })
        .expect(201);

      // Assert
      expect(again.body.registration).toMatchObject({ id: regId, status: 'registered' });
      expect(again.body.registration.withdrawnAt).toBeUndefined();
      expect((await dbRow(regId)).withdrawn_at).toBeNull();
    });
  });

  // WITHDRAW-EVENT-REG-CAP-01
  describe('WITHDRAW-EVENT-REG-CAP-01 (story goal): the spot is freed', () => {
    // Oracle (CAP-01): EVT-105 capacity 2; 2 confirmed -> 0 spots; ATT-02 withdraws -> 1 spot, stable.
    // Kills: spot not released; stale value; counter not decremented; wrong registration withdrawn.
    it('available spots go 0 -> 1 after ATT-02 withdraws, REG-9011 untouched', async () => {
      // Arrange: EVT-105 "Data Science Meetup" capacity 2, REG-9010 (ATT-02) and REG-9011 (ATT-04).
      const eventId = await seedEvent({ name: 'Data Science Meetup', start: EVT_101_START, limit: 2 });
      const att02 = await createUser('ATTENDEE', 'Ben Lim');
      const att04 = await createUser('ATTENDEE', 'Dan Koh');
      const reg9010 = await seedRegistration(eventId, att02.uid);
      const reg9011 = await seedRegistration(eventId, att04.uid);
      const spots = async () =>
        (await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', att02.cookie).expect(200)).body.availableRegistrationSpots;
      expect(await spots()).toBe(0);

      // Act
      await withdraw(reg9010, att02.cookie).expect(200);

      // Assert: freed immediately, and again on a fresh request
      expect(await spots()).toBe(1);
      expect(await spots()).toBe(1);
      expect((await dbRow(reg9010)).status).toBe('Withdrawn');
      expect((await dbRow(reg9011)).status).toBe('Registered');
    });
  });

  // WITHDRAW-EVENT-REG-07-A, WITHDRAW-EVENT-REG-07-B
  describe('WITHDRAW-EVENT-REG-07-A / 07-B (cross-cutting): ownership and authentication', () => {
    // WITHDRAW-EVENT-REG-07-A
    // Oracle (SPEC 07-A A + D16): another attendee gets 404 "Registration not found." and nothing changes.
    // Kills: M2 ownership scoping removed; M6 403 instead of 404.
    it('07-A A: ATT-03 withdrawing ATT-01\'s registration -> 404 and the row stays Registered', async () => {
      // Arrange
      const { eventId, regId } = await seedEvt101();
      const att03 = await createUser('ATTENDEE', 'Eve Tan');

      // Act
      const res = await withdraw(regId, att03.cookie);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Registration not found.');
      expect((await dbRow(regId)).status).toBe('Registered');
      expect(await registeredCount(eventId)).toBe(3);
    });

    // WITHDRAW-EVENT-REG-07-A
    // Oracle (SPEC 07-A C): the owner baseline succeeds.
    // Kills: ownership rule that rejects everyone.
    it('07-A C (control): the owner ATT-01 -> 200', async () => {
      const { att01, regId } = await seedEvt101();
      await withdraw(regId, att01.cookie).expect(200);
    });

    // WITHDRAW-EVENT-REG-07-A
    // Oracle (Added D): a missing registration answers identically to a non-owned one (no ownership leak).
    // Kills: different body for missing vs non-owned; malformed id -> 500.
    it.each([
      ['an unknown registration id', randomUUID()],
      ['a malformed id (REG-NOTEXIST)', 'REG-NOTEXIST'],
    ])('07-A D: %s -> 404 with the same body as a non-owner', async (_label, id) => {
      // Arrange: capture the non-owner response as the reference body.
      const { regId } = await seedEvt101();
      const att03 = await createUser('ATTENDEE', 'Eve Tan');
      const reference = await withdraw(regId, att03.cookie).expect(404);

      // Act
      const res = await withdraw(id, att03.cookie);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual(reference.body);
    });

    // WITHDRAW-EVENT-REG-07-A
    // Oracle (DERIVED, D16): every non-attendee role takes the same 404 path, never a 403.
    // Kills: a role-specific 403 that reveals the route exists (for any one of the four other roles).
    it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'TECH_SUPPORT'])(
      '07-A (derived): a %s attempting to withdraw -> 404, never 403',
      async (role) => {
        // Arrange
        const { regId } = await seedEvt101();
        const other = await createUser(role, 'Olivia Lee');

        // Act
        const res = await withdraw(regId, other.cookie);

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Registration not found.');
        expect((await dbRow(regId)).status).toBe('Registered');
      },
    );

    // WITHDRAW-EVENT-REG-07-B
    // Oracle (SPEC 07-A B = 07-B, run once): no session -> 401 with the existing middleware message.
    // Kills: authentication checked after the lookup; unauthenticated withdrawal processed.
    it('07-B (= 07-A B): no session -> 401 "Missing session" and the row stays Registered', async () => {
      const { regId } = await seedEvt101();
      const res = await withdraw(regId);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Missing session');
      expect((await dbRow(regId)).status).toBe('Registered');
    });
  });

  // WITHDRAW-EVENT-REG-07-INT
  describe('WITHDRAW-EVENT-REG-07-INT (rule order): authentication -> body -> ownership -> state -> event start', () => {
    // Oracle (DERIVED from the order documented on RegistrationsService.withdraw: authentication -> body ->
    // ownership 404 -> state 422 -> event start 422 -> update). Each test breaks two adjacent rules at once, so
    // a wrong order gives a different, observable answer. Nothing may change in any of them.
    const ALREADY_WITHDRAWN = 'This registration has already been withdrawn.';

    // WITHDRAW-EVENT-REG-07-INT-1
    // Kills: the body checked before the session (an anonymous caller learns the body rules: 400, not 401).
    it('07-INT-1 (authentication before body): no session and a bad body -> 401, not 400', async () => {
      // Arrange
      const { regId } = await seedEvt101();

      // Act
      const res = await withdraw(regId, undefined, { status: 'registered' });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Missing session');
      expect((await dbRow(regId)).status).toBe('Registered');
    });

    // WITHDRAW-EVENT-REG-07-INT-2
    // Kills: the body validated only after the ownership lookup (a non-owner would get 404, not 400).
    it('07-INT-2 (body before ownership): a non-owner with a bad body -> 400, not 404', async () => {
      // Arrange
      const { regId } = await seedEvt101();
      const att03 = await createUser('ATTENDEE', 'Eve Tan');

      // Act
      const res = await withdraw(regId, att03.cookie, { status: 'registered' });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation_error', errors: { status: 'This field is not accepted.' } });
      expect((await dbRow(regId)).status).toBe('Registered');
    });

    // Kills: ownership checked after the state or the event start (a non-owner would learn that
    // someone else's registration is withdrawn, or that its event has started, instead of a plain 404).
    it.each([
      ['07-INT-3 (ownership before state): the registration is already withdrawn', EVT_101_START, 'Withdrawn'],
      ['07-INT-4 (ownership before event start): the event has already started', EVT_104_START, 'Registered'],
    ] as const)('%s -> a non-owner gets 404 and no hint', async (_label, start, status) => {
      // Arrange: ATT-01 owns the registration; ATT-03 is a different attendee.
      const eventId = await seedEvent({ name: 'Rule Order Event', start });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid, status);
      const att03 = await createUser('ATTENDEE', 'Eve Tan');

      // Act
      const res = await withdraw(regId, att03.cookie);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Registration not found.');
      const stored = await dbRow(regId);
      expect(stored.status).toBe(status);
      expect(stored.withdrawn_at).toBeNull();
    });

    // WITHDRAW-EVENT-REG-07-INT-5
    // Kills: the event-start check moved before the state check (the owner of a withdrawn registration
    // on a past event would get "Event has already occurred" instead of "already been withdrawn").
    it('07-INT-5 (state before event start): the owner of a withdrawn registration on a past event -> already withdrawn', async () => {
      // Arrange: ATT-01 already withdrew from EVT-104, which started 5 days ago.
      const eventId = await seedEvent({ name: 'Startup Pitch Day', start: EVT_104_START });
      const att01 = await createUser('ATTENDEE');
      const regId = await seedRegistration(eventId, att01.uid, 'Withdrawn');

      // Act
      const res = await withdraw(regId, att01.cookie);

      // Assert
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'registration_already_withdrawn', message: ALREADY_WITHDRAWN });
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Withdrawn');
      expect(stored.withdrawn_at).toBeNull();
    });
  });

  // WITHDRAW-EVENT-REG-08-A
  describe('WITHDRAW-EVENT-REG-08-A (cross-cutting): concurrent withdrawals are safe', () => {
    // Oracle (SPEC 08-A B asks for 100 parallel; reduced to 5 on purpose): exactly one 200 and four 422 (MSG-12), no 5xx,
    // released once. The guide rejects 100-iteration loops, and the mutant that needs real contention (M3, no state guard)
    // survived the 100-request run in the earlier suite and is killed by the row-lock test (05-D C), so 5 loses nothing.
    // 08-A A (3 parallel) is 05-D A and is run once there. Response-time limits are not asserted (not repeatable).
    // Kills: a response that is neither 200 nor 422 under contention (a 5xx); capacity released twice.
    it('B: 5 parallel requests -> one 200, four 422, zero 5xx, state set once', async () => {
      // Arrange: REG-9050 (ATT-02) on EVT-109 with two other registrations.
      const eventId = await seedEvent({ name: 'Concurrency Test Event', start: EVT_101_START });
      const att02 = await createUser('ATTENDEE', 'Ben Lim');
      const other = await createUser('ATTENDEE', 'Dan Koh');
      const regId = await seedRegistration(eventId, att02.uid);
      await seedRegistration(eventId, other.uid);

      // Act
      const responses = await Promise.all(Array.from({ length: CONCURRENT }, () => withdraw(regId, att02.cookie)));

      // Assert
      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 422)).toHaveLength(CONCURRENT - 1);
      expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
      for (const refused of responses.filter((r) => r.status === 422)) {
        expect(refused.body.message).toBe('This registration has already been withdrawn.');
      }
      const stored = await dbRow(regId);
      expect(stored.status).toBe('Withdrawn');
      expect(stored.withdrawn_at_utc).toBe('2026-10-04 04:00:00');
      expect(await registeredCount(eventId)).toBe(1);
    });

  });
});

/*
 * SPM-120 assumption index. Decision IDs (A*, D*, F*) are defined in docs/specs/SPM-120-test-results.md,
 * "Decision and assumption IDs". assumption -> tests that rely on it:
 *  A7   event start is an exclusive cut-off, ASSUMED pending the Product Owner -> 04-B, 04-C, 05-B, 07-INT-4, 07-INT-5
 *  A5   re-registering reactivates the same row and clears withdrawn_at (SPM-61) -> 05-F
 *  A8   only the start instant decides; the event status label never blocks a withdrawal (ASSUMED, pending the Product
 *       Owner, notably for a Cancelled event) -> 04-D
 *  A10  a registration with no stored details answers empty strings for name and email, and omits contact and special
 *       requirements (ASSUMED, pending the Product Owner) -> 05-C (legacy row)
 *  D14  one compare-and-set UPDATE decides concurrent withdrawals -> 05-D (A, B, C), 08-A (B)
 *  D15  the route accepts no body or {}; any other body is a 400 -> 05-C (Added C, body shapes), 07-INT-1, 07-INT-2
 *  D16  another attendee's, unknown, malformed and non-attendee requests all get the same 404, never 403 -> 07-A, 07-INT-3, 07-INT-4
 *  ORDER rule order is authentication -> body -> ownership -> state -> event start -> update (documented on RegistrationsService.withdraw), DERIVED -> 07-INT-1 to 07-INT-5
 *  MAP  SPEC "Confirmed" is the repo's "Registered"; API values are lower-case -> every test
 */
