/*
 * Story: SPM-148 Event Status Changes from Approved to Planning
 * ACs: AC1 to AC7, cross-cutting 08-A, 09-A, 10-A
 * Test cases: PLAN-STATUS-01-A to 01-E, 02-A to 02-E, 03-A to 03-D, 04-A to 04-D,
 *             05-A, 06-A, 07-A to 07-E, 08-A, 09-A, 10-A (see results doc for adaptations)
 * SPM-148 Event Status Changes from Approved to Planning.
 * Real HTTP, real PostgreSQL, injected clock. Faults are injected with
 * temporary database triggers that raise right after a named write, so the
 * atomicity tests throw after state could have changed (Guide 5G).
 *
 * Test case IDs use the PLAN-STATUS-nn-x scheme from the SPM-148 prompt (the
 * test-case document itself is not in the repository, so every oracle below is
 * traced to the prompt's section 2.6 table and 2.4 rules, and the repo's
 * existing responses where the prompt says "assert as they are").
 *
 * Repo adaptations (see docs/specs/SPM-148-test-results.md):
 *  - the booking endpoint is POST /api/venues/:venueId/booking-requests and
 *    books one venue per request, so multi-venue cases are Not Automated;
 *  - an unassigned Coordinator gets the existing 404 "Assigned event not
 *    found.", a non-Coordinator the existing 403 "Coordinator access required.".
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-148 PostgreSQL tests must run in CI: set DATABASE_URL.');

// Suite clock T0 = 2026-10-15T12:00:00+08:00.
const T0 = '2026-10-15T04:00:00.000Z';
const EVENT_DAY = '2026-11-04';
const MSG_PL_02 = 'This event is not open for venue booking requests.';
const MSG_PL_03 = 'Clarifications are closed because this event is confirmed.';

type Role = 'COORDINATOR' | 'ORGANISER' | 'ATTENDEE' | 'COORDINATOR_LEAD';
interface Account {
  id: string;
  cookie: string;
  name: string;
}

describe.skipIf(!databaseUrl)('SPM-148 Approved to Planning (HTTP + PostgreSQL)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = new Date(T0);
  const userIds: string[] = [];
  const venueIds: string[] = [];
  const eventIds: string[] = [];
  const triggers: { table: string; name: string }[] = [];
  let fixedSeq = 0;
  /** Fixed, readable UUIDs (Guide 3E repeatable): 00000148-0000-4000-8000-0000000000NN. */
  const fixedId = () => `00000148-0000-4000-8000-${String((fixedSeq += 1)).padStart(12, '0')}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    // Leftovers from an aborted run would collide on the fixed ids (fixedId below), so clear this suite's prefix first.
    await pool.query("DELETE FROM venues WHERE id::text LIKE '00000148-%'");
    await pool.query("DELETE FROM events WHERE id::text LIKE '00000148-%'");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    now = new Date(T0);
  });

  afterEach(async () => {
    for (const { table, name } of triggers.splice(0))
      await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
  });

  afterAll(async () => {
    await app?.close();
    await pool.query('DELETE FROM notifications WHERE related_user_id = ANY($1::uuid[])', [userIds]);
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.query('DROP FUNCTION IF EXISTS spm148_fault()');
    await pool.end();
  });

  // ---- fixtures -----------------------------------------------------------

  async function account(role: Role, name = `SPM-148 ${role}`): Promise<Account> {
    const email = `spm148-${randomUUID()}@example.test`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, name],
    );
    const id = created.rows[0].id;
    userIds.push(id);
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
      [id, role],
    );
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected a session cookie');
    return { id, cookie: cookie.split(';', 1)[0], name };
  }

  async function venue(): Promise<string> {
    const owner = await account('COORDINATOR', 'SPM-148 venue owner');
    const id = fixedId();
    await pool.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information,
                           setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-148 Location', 100, 'fixture', 0, 0)`,
      [id, owner.id, `SPM-148 ${id}`],
    );
    venueIds.push(id);
    return id;
  }

  async function event(
    status: string,
    coordinator: Account | null,
    organiser?: Account,
    name = 'Innovation Showcase',
  ): Promise<string> {
    const id = fixedId();
    await pool.query(
      `INSERT INTO events
         (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time,
          end_date_time, expected_attendance, status, rejection_reason, coordinator_id,
          coordinator_name, submission_key)
       VALUES ($1, $2, 'Org', 'org@example.test', $3, 'SPM-148 fixture', $4, $5, 10, $6, $7, $8, $9, $1)`,
      [
        id,
        organiser?.id ?? 'spm148-organiser',
        name,
        `${EVENT_DAY}T10:00:00.000Z`,
        `${EVENT_DAY}T13:00:00.000Z`,
        status,
        status === 'Rejected' ? 'Not enough detail provided.' : null,
        coordinator?.id ?? null,
        coordinator?.name ?? null,
      ],
    );
    eventIds.push(id);
    return id;
  }

  // Time literals: T0 = 2026-10-15T12:00 SGT = 04:00Z. EVENT_DAY 2026-11-04.
  // Slot n is 08:00Z + n h (16:00 SGT + n h), one hour long.
  /** Slot n on EVENT_DAY. */
  function slot(n: number) {
    const hour = String(8 + n).padStart(2, '0');
    const end = String(9 + n).padStart(2, '0');
    return { start: `${EVENT_DAY}T${hour}:00:00.000Z`, end: `${EVENT_DAY}T${end}:00:00.000Z` };
  }

  function book(who: Account | null, venueId: string, body: Record<string, unknown>) {
    const call = request(app.getHttpServer()).post(`/api/venues/${venueId}/booking-requests`);
    return who ? call.set('Cookie', who.cookie).send(body) : call.send(body);
  }

  const status = async (id: string) =>
    (await pool.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [id])).rows[0].status;
  const bookingCount = async (id: string) =>
    Number((await pool.query('SELECT COUNT(*) FROM venue_bookings WHERE event_id = $1', [id])).rows[0].count);
  const planningRows = async (id: string) =>
    (
      await pool.query(
        `SELECT from_status, to_status, actor_id, created_at FROM event_status_history
          WHERE event_id = $1 AND to_status = 'Planning'`,
        [id],
      )
    ).rows;

  /** Raises right after the named write for this event only (Guide 5G: fault after a write). */
  async function failAfter(table: 'venue_bookings' | 'events' | 'event_status_history', eventId: string, op: 'INSERT' | 'UPDATE') {
    await pool.query(`
      CREATE OR REPLACE FUNCTION spm148_fault() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'spm148 injected fault %', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql`);
    const name = `spm148_fault_${table}`;
    const idColumn = table === 'events' ? 'NEW.id' : 'NEW.event_id';
    const extra = table === 'events' ? " AND NEW.status = 'Planning'" : '';
    await pool.query(
      `CREATE TRIGGER ${name} AFTER ${op} ON ${table} FOR EACH ROW
       WHEN (${idColumn} = '${eventId}'::uuid${extra}) EXECUTE FUNCTION spm148_fault()`,
    );
    triggers.push({ table, name });
  }

  // ---- AC1: only Approved moves ------------------------------------------

  describe('SPM-148 AC1: the first venue booking request moves an Approved event to Planning', () => {
    // Kills: booking saved without the transition (M1-style omission), transition not reflected in the response/GET.
    // Oracle: SPEC (prompt 2.6 01-A); MSG-PL-01 wording ASSUMED in FE
    it('PLAN-STATUS-01-A: an assigned Coordinator books an Approved event and it becomes Planning', async () => {
      // Arrange: Approved event, no bookings.
      const coordinator = await account('COORDINATOR', 'Daniel Koh');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      // Act
      const response = await book(coordinator, venueId, { eventId, ...slot(0) });

      // Assert: the request is for the event's fixed scheduled time, one booking row, status Planning, via the API read too.
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(String),
        eventId,
        venueId,
        start: `${EVENT_DAY}T10:00:00.000Z`,
        end: `${EVENT_DAY}T13:00:00.000Z`,
        status: 'pending',
        eventStatus: 'Planning',
        statusChanged: true,
        bookingReference: expect.stringMatching(/^VB-[0-9A-F]{8}$/),
      });
      expect(await bookingCount(eventId)).toBe(1);
      expect(await status(eventId)).toBe('Planning');
      const read = await request(app.getHttpServer()).get(`/api/events/${eventId}`).set('Cookie', coordinator.cookie);
      expect(read.body.status).toBe('planning'); // the events API lowercases statuses (repo convention)
    });

    // Kills: M1 unconditional transition, M2 transition from other statuses, closed statuses accepting bookings.
    it.each([
      ['Submitted', 409, false, 'Submitted'],
      ['Confirmed', 201, false, 'Confirmed'],
      ['Rejected', 409, false, 'Rejected'],
      ['Completed', 409, false, 'Completed'],
      ['Cancelled', 409, false, 'Cancelled'],
    ])(
      'PLAN-STATUS-01-B: a %s event answers %i and ends as %s',
      async (initial, expected, changed, final) => {
        // Arrange: assigned event in the given status.
        const coordinator = await account('COORDINATOR');
        const venueId = await venue();
        const eventId = await event(initial, coordinator);

        // Act
        const response = await book(coordinator, venueId, { eventId, ...slot(0) });

        // Assert: documented outcome per status; never a Planning history row; a booking exists iff 201.
        expect(response.status).toBe(expected);
        if (expected === 201) expect(response.body).toMatchObject({ statusChanged: changed, eventStatus: final });
        else expect(response.body).toMatchObject({ code: 'EVENT_NOT_OPEN_FOR_BOOKING', message: MSG_PL_02 });
        expect(await status(eventId)).toBe(final);
        expect(await planningRows(eventId)).toEqual([]);
        expect(await bookingCount(eventId)).toBe(expected === 201 ? 1 : 0);
      },
    );

    // Boundary (-BND): a request starting exactly when the existing booking ends does not conflict.
    // Kills: `<` vs `<=` in the overlap check; a transition that fires on a rejected request.
    // Oracle: DERIVED (adjacent slot, buffer 0; overlap rule VERIFIED in repository)
    it('PLAN-STATUS-01-BND: a request starting exactly when the existing booking ends is accepted and transitions', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const other = await event('Approved', await account('COORDINATOR'), undefined, 'Earlier Booking');
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, 'approved')`,
        [venueId, other, slot(0).start, slot(0).end],
      );
      const eventId = await event('Approved', coordinator);

      // The API books the event's scheduled time, so set this event to the interval
      // immediately after the seeded booking rather than relying on request times.
      await pool.query(
        'UPDATE events SET start_date_time = $2, end_date_time = $3 WHERE id = $1',
        [eventId, slot(0).end, slot(1).end],
      );

      const adjacent = await book(coordinator, venueId, { eventId, ...slot(0) });

      expect(adjacent.status).toBe(201);
      expect(adjacent.body.start).toBe(slot(0).end);
      expect(adjacent.body.end).toBe(slot(1).end);
      expect(adjacent.body.statusChanged).toBe(true);
      expect(await status(eventId)).toBe('Planning');
    });

    // Kills: M3 status changed before the request is validated.
    // Oracle: SPEC for transition; conflict text VERIFIED (existing repo response)
    it('PLAN-STATUS-01-C: a request that conflicts changes nothing, and a valid request afterwards transitions', async () => {
      // Arrange: another event already holds the slot.
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const other = await event('Approved', await account('COORDINATOR'), undefined, 'Existing Booking');
      const eventId = await event('Approved', coordinator);
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, 'approved')`,
        [venueId, other, `${EVENT_DAY}T10:00:00.000Z`, `${EVENT_DAY}T13:00:00.000Z`],
      );

      // Act: conflicting request.
      const conflict = await book(coordinator, venueId, { eventId, ...slot(0) });

      // Assert: the repo's existing conflict response; nothing written.
      expect(conflict.status).toBe(409);
      expect(conflict.body.message).toContain('Existing Booking');
      expect(await status(eventId)).toBe('Approved');
      expect(await bookingCount(eventId)).toBe(0);
      expect(await planningRows(eventId)).toEqual([]);

      // Act: free the event's scheduled interval, then retry. Submitted slot
      // fields do not override the event's persisted schedule.
      await pool.query("UPDATE venue_bookings SET status = 'cancelled' WHERE event_id = $1", [other]);
      const valid = await book(coordinator, venueId, { eventId, ...slot(3) });

      // Assert: now it transitions with one history row.
      expect(valid.status).toBe(201);
      expect(await status(eventId)).toBe('Planning');
      expect(await planningRows(eventId)).toHaveLength(1);
    });

    // Kills: M22 Lead or Organiser allowed, authorization skipped.
    it.each([
      ['another Coordinator', 'COORDINATOR', 404, 'Assigned event not found.'],
      ['the Lead', 'COORDINATOR_LEAD', 403, 'Coordinator access required.'],
      ['an Organiser', 'ORGANISER', 403, 'Coordinator access required.'],
      ['an Attendee', 'ATTENDEE', 403, 'Coordinator access required.'],
    ] as const)('PLAN-STATUS-01-D: %s cannot trigger the transition', async (_label, role, expected, message) => {
      // Arrange
      const assigned = await account('COORDINATOR');
      const caller = await account(role);
      const venueId = await venue();
      const eventId = await event('Approved', assigned);

      // Act
      const response = await book(caller, venueId, { eventId, ...slot(0) });

      // Assert
      expect(response.status).toBe(expected);
      expect(response.body.message).toBe(message);
      expect(await status(eventId)).toBe('Approved');
      expect(await bookingCount(eventId)).toBe(0);
      expect(await planningRows(eventId)).toEqual([]);
    });

    // Kills: M22 (no session accepted).
    // Oracle: SPEC (prompt 2.6 01-D)
    it('PLAN-STATUS-01-D-401: no session gets 401 and nothing changes', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      const response = await book(null, venueId, { eventId, ...slot(0) });

      expect(response.status).toBe(401);
      expect(await status(eventId)).toBe('Approved');
      expect(await bookingCount(eventId)).toBe(0);
    });
  });

  // ---- AC2: atomicity -----------------------------------------------------

  describe('SPM-148 AC2: booking, status change and history commit together', () => {
    // Kills: M4 not one transaction, M5 history missing.
    // Oracle: SPEC (prompt 2.6 02-A, injected clock)
    it('PLAN-STATUS-02-A: after the first request the booking, the status and the history row are all present, with the injected time', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);

      const rows = await planningRows(eventId);
      expect(await bookingCount(eventId)).toBe(1);
      expect(await status(eventId)).toBe('Planning');
      expect(rows).toHaveLength(1);
      expect(rows[0].created_at.toISOString()).toBe(T0);
      const updated = await pool.query('SELECT updated_at FROM events WHERE id = $1', [eventId]);
      expect(updated.rows[0].updated_at.toISOString()).toBe(T0);
    });

    it.each([
      ['02-B', 'events', 'UPDATE', 'the status update'],
      ['02-C', 'venue_bookings', 'INSERT', 'the booking insert'],
      ['02-D', 'event_status_history', 'INSERT', 'the history insert'],
    ] as const)(
      'PLAN-STATUS-%s: a failure right after %s rolls everything back and a retry succeeds',
      // Kills: M4 (separate transactions), M5 (history outside the transaction).
      async (_id, table, op) => {
        // Arrange: fault raised after the named write ran inside the transaction.
        const coordinator = await account('COORDINATOR');
        const venueId = await venue();
        const eventId = await event('Approved', coordinator);
        await failAfter(table, eventId, op);

        // Act
        const failed = await book(coordinator, venueId, { eventId, ...slot(0) });

        // Assert: generic 500, no leak, nothing persisted.
        expect(failed.status).toBe(500);
        expect(JSON.stringify(failed.body)).not.toMatch(/spm148|injected|stack/i);
        expect(await bookingCount(eventId)).toBe(0);
        expect(await status(eventId)).toBe('Approved');
        expect(await planningRows(eventId)).toEqual([]);

        // Act: retry without the fault.
        await pool.query(`DROP TRIGGER spm148_fault_${table} ON ${table}`);
        const retry = await book(coordinator, venueId, { eventId, ...slot(0) });

        // Assert: all three now exist.
        expect(retry.status).toBe(201);
        expect(await status(eventId)).toBe('Planning');
        expect(await bookingCount(eventId)).toBe(1);
        expect(await planningRows(eventId)).toHaveLength(1);
      },
    );

    // Kills: M6 no compare-and-set (two transitions / two history rows under parallel requests).
    // Oracle: SPEC (prompt 2.6 02-B/C/D; fault placement DERIVED, Guide 5G)
    it('PLAN-STATUS-02-E: two parallel first requests for different venues give two bookings and one transition', async () => {
      const coordinator = await account('COORDINATOR');
      const [venueA, venueB] = [await venue(), await venue()];
      const eventId = await event('Approved', coordinator);

      // Deterministic barrier (no sleeps in the test): this session holds the event row lock, so both
      // requests block. Without the lock or the compare-and-set, each request blocks on its own UPDATE
      // after reading Approved, and both transition once the lock is released. The test waits on
      // observable lock state (blocked sessions), not on time.
      const holder = await pool.connect();
      let results: { status: number; body: { statusChanged?: boolean } }[] = [];
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM events WHERE id = $1::uuid FOR UPDATE', [eventId]);
        const pending = Promise.all([
          book(coordinator, venueA, { eventId, ...slot(0) }),
          book(coordinator, venueB, { eventId, ...slot(0) }),
        ]);
        for (let attempt = 0; ; attempt += 1) {
          const blocked = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock' AND datname = current_database()`,
          );
          if (blocked.rows[0].n >= 2) break;
          if (attempt >= 500) throw new Error('Both requests should be blocked on the event lock');
          await pool.query('SELECT pg_sleep(0.01)');
        }
        await holder.query('COMMIT');
        results = await pending;
      } finally {
        holder.release();
      }

      const [a, b] = results;
      expect([a.status, b.status]).toEqual([201, 201]);
      expect([a.body.statusChanged, b.body.statusChanged].sort()).toEqual([false, true]);
      expect(await bookingCount(eventId)).toBe(2);
      expect(await status(eventId)).toBe('Planning');
      expect(await planningRows(eventId)).toHaveLength(1);
    }, 20_000); // the barrier waits on lock state; allow for coverage-instrumented runs
  });

  // ---- AC3: later requests -----------------------------------------------

  describe('SPM-148 AC3: later booking requests leave a Planning event unchanged', () => {
    // Kills: M7 later request adds history.
    // Oracle: SPEC (prompt 2.6 03-x); 03-D adapted, see results doc
    it('PLAN-STATUS-03-A: a second request on a Planning event is saved without a status change or history row', async () => {
      const coordinator = await account('COORDINATOR');
      const [venueA, venueB] = [await venue(), await venue()];
      const eventId = await event('Approved', coordinator);
      await book(coordinator, venueA, { eventId, ...slot(0) }).expect(201);

      const second = await book(coordinator, venueB, { eventId, ...slot(0) });

      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({ statusChanged: false, eventStatus: 'Planning' });
      expect(await status(eventId)).toBe('Planning');
      expect(await bookingCount(eventId)).toBe(2);
      expect(await planningRows(eventId)).toHaveLength(1);
    });

    // Kills: M7.
    // Oracle: SPEC (prompt 2.6 03-x); 03-D adapted, see results doc
    it('PLAN-STATUS-03-B: requests for five venues give five bookings and exactly one Approved to Planning row', async () => {
      const coordinator = await account('COORDINATOR');
      const venueIds = await Promise.all(Array.from({ length: 5 }, () => venue()));
      const eventId = await event('Approved', coordinator);

      // Literal oracle: only the first request changes the status.
      const statusChanged: boolean[] = [];
      for (let n = 0; n < 5; n += 1) {
        const response = await book(coordinator, venueIds[n], { eventId, ...slot(n) });
        expect(response.status).toBe(201);
        statusChanged.push(response.body.statusChanged);
      }
      expect(statusChanged).toEqual([true, false, false, false, false]);
      expect(await status(eventId)).toBe('Planning');
      expect(await bookingCount(eventId)).toBe(5);
      expect(await planningRows(eventId)).toHaveLength(1);
    });

    // Kills: M8 automatic revert when the first booking is rejected.
    // Oracle: SPEC (prompt 2.6 03-x); 03-D adapted, see results doc
    it('PLAN-STATUS-03-C: rejecting the first booking does not revert Planning, and a new request is saved', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);
      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      await pool.query("UPDATE venue_bookings SET status = 'rejected' WHERE event_id = $1", [eventId]);

      const next = await book(coordinator, venueId, { eventId, ...slot(2) });

      // The response body is part of the message, so a failure names the refusal (see the open flake in the results doc).
      expect(next.status, JSON.stringify(next.body)).toBe(201);
      expect(await status(eventId)).toBe('Planning');
      expect(await planningRows(eventId)).toHaveLength(1);
    });

    // Kills: M6 no compare-and-set.
    // SPM-54 AC7: parallel duplicate submissions to one venue serialize; one
    // active request is created and the remaining attempts are rejected.
    // Oracle: SPEC (prompt 2.6 03-x); 03-D adapted, see results doc
    it('PLAN-STATUS-03-D: five parallel duplicate requests give one booking and exactly one transition', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => book(coordinator, venueId, { eventId, ...slot(0) })),
      );

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409, 409, 409, 409]);
      expect(responses.filter((r) => r.status === 409).every((r) =>
        r.body.code === 'ACTIVE_VENUE_REQUEST_EXISTS',
      )).toBe(true);
      expect(responses.filter((r) => r.body.statusChanged === true)).toHaveLength(1);
      expect(await bookingCount(eventId)).toBe(1);
      expect(await status(eventId)).toBe('Planning');
      expect(await planningRows(eventId)).toHaveLength(1);
    });
  });

  // ---- AC4: history -------------------------------------------------------

  describe('SPM-148 AC4: each transition is recorded in the status history', () => {
    async function seedEarlierHistory(eventId: string) {
      await pool.query(
        `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at) VALUES
           ($1, $2, 'Submitted', 'Approved', 'spm148-reviewer', '2026-10-01T02:00:00.000Z')`,
        [randomUUID(), eventId],
      );
    }

    // Kills: M5 row missing, M10 time from SQL NOW().
    // Oracle: SPEC (prompt 2.6 04-A; name from user fixture, DERIVED)
    it('PLAN-STATUS-04-A: the history read shows the Approved to Planning entry with the actor and the injected time', async () => {
      const coordinator = await account('COORDINATOR', 'Daniel Koh');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);
      await seedEarlierHistory(eventId);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const history = await request(app.getHttpServer())
        .get(`/api/events/${eventId}/status-history`)
        .set('Cookie', coordinator.cookie);

      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(2);
      expect(history.body[1]).toEqual({
        fromStatus: 'Approved',
        toStatus: 'Planning',
        changedAt: T0,
        changedBy: { id: coordinator.id, name: 'Daniel Koh' },
      });
    });

    // Kills: M11 editable history.
    // Oracle: SPEC (prompt 2.6 04-B, 405 per D7)
    it('PLAN-STATUS-04-B: earlier rows are unchanged and PUT and DELETE on the history answer 405', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator, organiser);
      await seedEarlierHistory(eventId);
      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const before = await pool.query('SELECT * FROM event_status_history WHERE event_id = $1 ORDER BY created_at', [eventId]);

      for (const who of [coordinator, organiser]) {
        const put = await request(app.getHttpServer())
          .put(`/api/events/${eventId}/status-history/${before.rows[0].id}`)
          .set('Cookie', who.cookie)
          .send({ toStatus: 'Cancelled' });
        const del = await request(app.getHttpServer())
          .delete(`/api/events/${eventId}/status-history/${before.rows[0].id}`)
          .set('Cookie', who.cookie);
        expect([put.status, del.status]).toEqual([405, 405]);
        expect(put.headers.allow).toBe('GET');
      }

      const after = await pool.query('SELECT * FROM event_status_history WHERE event_id = $1 ORDER BY created_at', [eventId]);
      expect(after.rows).toEqual(before.rows);
      expect(after.rows[0].to_status).toBe('Approved');
      expect(after.rows[1].to_status).toBe('Planning');
    });

    // Oracle: SPEC (prompt 2.6 04-B, 405 per D7), on the history collection itself (no entry id).
    // Kills: the collection-level PUT or DELETE accepted (history rewritten or emptied).
    it('PLAN-STATUS-04-B: PUT and DELETE on the history collection answer 405 for the Coordinator and the Organiser', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const eventId = await event('Planning', coordinator, organiser);
      await pool.query(
        `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
         VALUES ($1, $2, 'Approved', 'Planning', 'spm148-setup', '2026-10-14T02:00:00.000Z')`,
        [randomUUID(), eventId],
      );

      for (const who of [coordinator, organiser]) {
        const put = await request(app.getHttpServer())
          .put(`/api/events/${eventId}/status-history`)
          .set('Cookie', who.cookie)
          .send([]);
        const del = await request(app.getHttpServer())
          .delete(`/api/events/${eventId}/status-history`)
          .set('Cookie', who.cookie);
        expect([put.status, del.status]).toEqual([405, 405]);
        expect(put.headers.allow).toBe('GET');
      }
      const rows = await pool.query('SELECT COUNT(*) FROM event_status_history WHERE event_id = $1', [eventId]);
      expect(Number(rows.rows[0].count)).toBe(1);
    });

    // Kills: M9 actor or time taken from the body.
    // Oracle: SPEC for rejection; error code ASSUMED (D5)
    it('PLAN-STATUS-04-C: a body carrying changedBy and changedAt is rejected, and a clean request records the session user and clock', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      const forged = await book(coordinator, venueId, {
        eventId,
        ...slot(0),
        changedBy: 'someone-else',
        changedAt: '2020-01-01T00:00:00Z',
      });

      expect(forged.status).toBe(400);
      expect(forged.body.code).toBe('UNSUPPORTED_BOOKING_FIELDS');
      expect(await status(eventId)).toBe('Approved');
      expect(await bookingCount(eventId)).toBe(0);
      expect(await planningRows(eventId)).toEqual([]);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const [row] = await planningRows(eventId);
      expect(row.actor_id).toBe(coordinator.id);
      expect(row.created_at.toISOString()).toBe(T0);
    });

    // Kills: M10 UTC date or local-time storage; instant stored as UTC.
    // Oracle: SPEC (prompt 2.6 04-D; time literal arithmetic: 00:30 SGT = 16:30Z previous day)
    it('PLAN-STATUS-04-D: a request just after SGT midnight is stored and returned as the UTC instant of the previous day', async () => {
      now = new Date('2026-11-11T00:30:00+08:00');
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const history = await request(app.getHttpServer())
        .get(`/api/events/${eventId}/status-history`)
        .set('Cookie', coordinator.cookie);

      expect(history.body[0].changedAt).toBe('2026-11-10T16:30:00.000Z');
    });

    // Kills: history readable by anyone.
    // Oracle: ASSUMED (prompt F24: history readable by Coordinator and Organiser only)
    it('PLAN-STATUS-04-A-SEC: only the assigned Coordinator and the owning Organiser may read the history', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const eventId = await event('Planning', coordinator, organiser);
      const get = (who: Account | null) => {
        const call = request(app.getHttpServer()).get(`/api/events/${eventId}/status-history`);
        return who ? call.set('Cookie', who.cookie) : call;
      };

      expect((await get(coordinator)).status).toBe(200);
      expect((await get(organiser)).status).toBe(200);
      expect((await get(await account('COORDINATOR'))).status).toBe(403);
      expect((await get(await account('ORGANISER'))).status).toBe(403);
      expect((await get(null)).status).toBe(401);
      // An unknown event (and a malformed id) is 404, not an empty history.
      const unknown = await request(app.getHttpServer())
        .get('/api/events/00000148-0000-4000-8000-ffffffffffff/status-history')
        .set('Cookie', coordinator.cookie);
      expect(unknown.status).toBe(404);
    });
  });

  // ---- AC5 / AC6 ----------------------------------------------------------

  describe('SPM-148 AC5: Planning events appear in the Coordinator events list', () => {
    // Kills: M13 other Coordinators' events leak; Planning missing from the list.
    // Oracle: SPEC (prompt 2.6 05-A); events list used, no queue endpoint exists
    it('PLAN-STATUS-05-A: the events list shows the event as Planning after the first request, only for its Coordinator', async () => {
      const coordinator = await account('COORDINATOR');
      const outsider = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);
      const foreign = await event('Planning', outsider, undefined, 'Other Coordinator Event');
      const list = async (who: Account) =>
        (await request(app.getHttpServer()).get('/api/events').set('Cookie', who.cookie)).body as { id: string; status: string }[];

      expect((await list(coordinator)).find((e) => e.id === eventId)?.status).toBe('approved');
      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);

      const planning = (await list(coordinator)).filter((e) => e.status === 'planning');
      expect(planning.map((e) => e.id)).toEqual([eventId]);
      expect((await list(coordinator)).some((e) => e.id === foreign)).toBe(false);
    });
  });

  describe('SPM-148 AC5 (empty queue): a Coordinator with no events sees an empty list', () => {
    // Oracle: SPEC (prompt 2.6 05-C, COO-03 with no events -> 200 []).
    // Kills: a list that returns every event (or an error) for a Coordinator who owns nothing.
    it('PLAN-STATUS-05-C: a Coordinator with no assigned events gets 200 and an empty array, not other Coordinators events', async () => {
      const empty = await account('COORDINATOR', 'SPM-148 no events');
      await event('Planning', await account('COORDINATOR', 'SPM-148 someone else'));

      const response = await request(app.getHttpServer()).get('/api/events').set('Cookie', empty.cookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('SPM-148 AC6: Planning counts toward the active workload and availability notice', () => {
    // Kills: M14 Planning excluded, M15 double count / stale after the move.
    // Oracle: SPEC (prompt 2.6 06-A); Lead list is the only count exposed
    it('PLAN-STATUS-06-A: the Lead list counts Planning, and the move from Approved keeps the active count', async () => {
      const lead = await account('COORDINATOR_LEAD');
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const approved = await event('Approved', coordinator);
      await event('Submitted', coordinator);
      await event('Planning', coordinator);
      await event('Confirmed', coordinator);
      await event('Completed', coordinator);
      await event('Cancelled', coordinator);
      const active = async () =>
        (
          await request(app.getHttpServer()).get('/api/lead/coordinators').set('Cookie', lead.cookie)
        ).body.find((c: { id: string }) => c.id === coordinator.id).activeAssignments;

      expect(await active()).toBe(4);
      await book(coordinator, venueId, { eventId: approved, ...slot(0) }).expect(201);

      expect(await active()).toBe(4);
    });

    // Kills: M16 availability notice uses its own status list.
    // Oracle: SPEC (prompt 2.6 06-C) for notice; limit-5 function not present
    it('PLAN-STATUS-06-C: a Coordinator whose only event is in Planning leaves the Lead a notice naming 1 active event', async () => {
      const lead = await account('COORDINATOR_LEAD');
      const coordinator = await account('COORDINATOR', 'Planner Pat');
      await event('Planning', coordinator);

      await request(app.getHttpServer())
        .put('/api/coordinators/me/availability')
        .set('Cookie', coordinator.cookie)
        .send({ available: false })
        .expect(200);

      const notice = await pool.query(
        `SELECT message FROM notifications WHERE type = 'coordinator_unavailable' AND recipient_id = $1 AND related_user_id = $2`,
        [lead.id, coordinator.id],
      );
      expect(notice.rows.map((row) => row.message)).toEqual([
        'Planner Pat is now unavailable and has 1 active event that may need reassignment.',
      ]);
    });
  });

  // ---- AC7: clarifications ------------------------------------------------

  describe('SPM-148 AC7: clarifications stay open in Planning and close at Confirmed', () => {
    const post = (who: Account | null, eventId: string, message = 'Please confirm the expected headcount.') => {
      const call = request(app.getHttpServer()).post(`/api/events/${eventId}/clarifications`);
      return who ? call.set('Cookie', who.cookie).send({ message }) : call.send({ message });
    };
    const reply = (who: Account | null, eventId: string, clarificationId: string, message = 'About 120 people.') => {
      const call = request(app.getHttpServer()).post(`/api/events/${eventId}/clarifications/${clarificationId}/reply`);
      return who ? call.set('Cookie', who.cookie).send({ message }) : call.send({ message });
    };

    // Kills: M17 clarifications blocked while Planning.
    // Oracle: SPEC (prompt 2.6 07-A/B); roles from SPM-39 VERIFIED
    it('PLAN-STATUS-07-A: in Planning the Coordinator posts, the Organiser replies and the Coordinator replies again', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const eventId = await event('Planning', coordinator, organiser);

      const posted = await post(coordinator, eventId);
      expect(posted.status).toBe(201);
      expect((await reply(organiser, eventId, posted.body.id)).status).toBe(201);
      expect((await reply(coordinator, eventId, posted.body.id, 'Thanks.')).status).toBe(201);

      const thread = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', organiser.cookie);
      expect(thread.body.map((c: { message: string }) => c.message)).toEqual([
        'Please confirm the expected headcount.',
        'About 120 people.',
        'Thanks.',
      ]);
    });

    // Kills: the transition disturbing an existing thread.
    // Oracle: SPEC (prompt 2.6 07-C)
    it('PLAN-STATUS-07-C: a thread opened while Approved survives the transition intact and accepts a new reply', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator, organiser);
      const posted = await post(coordinator, eventId);
      await reply(organiser, eventId, posted.body.id).expect(201);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);

      const thread = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', coordinator.cookie);
      expect(thread.body).toHaveLength(2);
      expect((await reply(coordinator, eventId, posted.body.id, 'Noted.')).status).toBe(201);
    });

    // Kills: M18 clarifications allowed after Confirmed.
    // Oracle: SPEC (prompt 2.6 07-D); message MSG-PL-03 ASSUMED wording from catalogue
    it('PLAN-STATUS-07-D: once Confirmed, posting and replying answer 409 and the thread stays readable', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const eventId = await event('Planning', coordinator, organiser);
      const posted = await post(coordinator, eventId);
      await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);

      for (const response of [
        await post(coordinator, eventId),
        await reply(organiser, eventId, posted.body.id),
        await reply(coordinator, eventId, posted.body.id),
      ]) {
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'CLARIFICATIONS_CLOSED', message: MSG_PL_03 });
      }
      const thread = await request(app.getHttpServer()).get(`/api/events/${eventId}/comments`).set('Cookie', organiser.cookie);
      expect(thread.status).toBe(200);
      expect(thread.body).toHaveLength(1);
    });

    // Kills: M19 role check removed.
    // Oracle: SPEC (prompt 2.6 07-E); 403 text VERIFIED
    it('PLAN-STATUS-07-E: other Organisers, Coordinators and Attendees get 403 and no token gets 401', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const eventId = await event('Planning', coordinator, organiser);
      const posted = await post(coordinator, eventId);

      for (const outsider of [await account('ORGANISER'), await account('COORDINATOR'), await account('ATTENDEE')]) {
        const asPost = await post(outsider, eventId);
        expect(asPost.status).toBe(403);
        expect(asPost.body.message).toBe('Only the coordinator assigned to this event can request clarification.');
        const asReply = await reply(outsider, eventId, posted.body.id);
        expect(asReply.status).toBe(403);
        expect(asReply.body.message).toBe("Only this event's organiser or assigned coordinator can do this.");
      }
      expect((await post(null, eventId)).status).toBe(401);
      expect((await reply(null, eventId, posted.body.id)).status).toBe(401);
      const count = await pool.query('SELECT COUNT(*) FROM event_comments WHERE event_id = $1', [eventId]);
      expect(Number(count.rows[0].count)).toBe(1);
    });
  });

  // ---- cross-cutting ------------------------------------------------------

  describe('SPM-148 cross-cutting rules', () => {
    // Kills: M20 status forced from the body, M21 public endpoint accepts Planning.
    // Oracle: SPEC (prompt 2.6 08-A); code UNSUPPORTED_TARGET_STATUS VERIFIED
    it('PLAN-STATUS-08-A: status fields in the body are rejected, and the public status-change endpoint refuses Planning', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);

      const forced = await book(coordinator, venueId, { eventId, ...slot(0), status: 'Confirmed', eventStatus: 'Cancelled' });
      expect(forced.status).toBe(400);
      expect(await status(eventId)).toBe('Approved');
      expect(await bookingCount(eventId)).toBe(0);

      const direct = await request(app.getHttpServer())
        .post(`/api/events/${eventId}/status-change`)
        .set('Cookie', coordinator.cookie)
        .send({ targetStatus: 'Planning' });
      expect(direct.status).toBe(400);
      expect(direct.body.code).toBe('UNSUPPORTED_TARGET_STATUS');
      expect(await status(eventId)).toBe('Approved');

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const row = await pool.query('SELECT event_name, organiser_id, coordinator_id, expected_attendance FROM events WHERE id = $1', [eventId]);
      expect(row.rows[0]).toEqual({
        event_name: 'Innovation Showcase',
        organiser_id: 'spm148-organiser',
        coordinator_id: coordinator.id,
        expected_attendance: 10,
      });
    });

    // Kills: Organiser view stale or history hidden.
    // Oracle: SPEC (prompt 2.6 09-A)
    it('PLAN-STATUS-09-A: the owning Organiser sees Planning in their list and the history entry', async () => {
      const coordinator = await account('COORDINATOR');
      const organiser = await account('ORGANISER');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator, organiser);

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);

      const list = await request(app.getHttpServer()).get('/api/events').set('Cookie', organiser.cookie);
      expect(list.body.find((e: { id: string }) => e.id === eventId).status).toBe('planning');
      const history = await request(app.getHttpServer()).get(`/api/events/${eventId}/status-history`).set('Cookie', organiser.cookie);
      expect(history.body.map((h: { toStatus: string }) => h.toStatus)).toEqual(['Planning']);
    });

    // Oracle: SPEC (prompt 2.6 10-A, second half: after the first request and complete arrangements,
    // Confirm returns 200 and the event is Confirmed). Arrangements are the venue booking approved,
    // no equipment, and an approved safety check (the SPM-135 readiness rules).
    // Kills: a Confirm that ignores Planning, or one that confirms without the Planning event's history row.
    it('PLAN-STATUS-10-A-OK: after the first request and the arrangements, Confirm succeeds and records Planning to Confirmed', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);
      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      await pool.query("UPDATE venue_bookings SET status = 'approved' WHERE event_id = $1", [eventId]);
      await request(app.getHttpServer()).post(`/api/events/${eventId}/confirm-no-equipment`).set('Cookie', coordinator.cookie).expect(200);
      await pool.query(
        `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by, approver_name, decided_at)
         VALUES ($1, 'approved', now(), 'SPM-148 test', 'Safety Officer', now())`,
        [eventId],
      );

      const confirmed = await request(app.getHttpServer())
        .post(`/api/events/${eventId}/status-change`)
        .set('Cookie', coordinator.cookie)
        .send({ targetStatus: 'Confirmed' });

      expect(confirmed.status).toBe(200);
      expect(confirmed.body.status).toBe('Confirmed');
      expect(await status(eventId)).toBe('Confirmed');
      const transitions = await pool.query(
        'SELECT from_status, to_status FROM event_status_history WHERE event_id = $1 ORDER BY created_at',
        [eventId],
      );
      expect(transitions.rows).toEqual([
        { from_status: 'Approved', to_status: 'Planning' },
        { from_status: 'Planning', to_status: 'Confirmed' },
      ]);
    });

    // Kills: M24 Confirm accepts Approved.
    // Oracle: SPEC (prompt 2.6 10-A); refusal text VERIFIED; readiness-blocked, not a full confirm
    it('PLAN-STATUS-10-A: Confirm is refused from Approved, and after the first request it is judged on readiness instead', async () => {
      const coordinator = await account('COORDINATOR');
      const venueId = await venue();
      const eventId = await event('Approved', coordinator);
      const confirm = () =>
        request(app.getHttpServer()).post(`/api/events/${eventId}/status-change`).set('Cookie', coordinator.cookie).send({ targetStatus: 'Confirmed' });

      const refused = await confirm();
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'EVENT_NOT_CONFIRMABLE', message: 'Only events in Planning can be confirmed.' });
      expect(await status(eventId)).toBe('Approved');

      await book(coordinator, venueId, { eventId, ...slot(0) }).expect(201);
      const blocked = await confirm();
      // Planning passes the status guard; the refusal is readiness (CONFIRM_BLOCKED), not EVENT_NOT_CONFIRMABLE.
      expect(blocked.status).toBe(422);
      expect(blocked.body.code).toBe('CONFIRM_BLOCKED');
      expect(blocked.body.message.startsWith('This event cannot be confirmed yet. Outstanding:')).toBe(true);
      expect(await status(eventId)).toBe('Planning');
    });
  });
});

// ASSUMPTION index
// A1: 201 body shape adds eventStatus and statusChanged (prompt D5) -> 01-A, 01-B, 03-A
// A2: unassigned Coordinator answers the repo's 404, non-Coordinators its 403 -> 01-D
// A3: 400 code UNSUPPORTED_BOOKING_FIELDS for unknown body fields -> 04-C, 08-A
// A4: status-history entry shape { fromStatus, toStatus, changedAt, changedBy{id,name} } (prompt D7) -> 04-A..D
// A5: Submitted events answer 409 like other closed statuses (user decision on D3) -> 01-B
// A7: the events API lowercases statuses ('planning'), history keeps the stored casing -> 01-A, 05, 09-A
// A8: identical parallel requests are all saved (pending requests without a hold do not block) -> 03-D
// A6: fault injection by database trigger after the named write -> 02-B, 02-C, 02-D
