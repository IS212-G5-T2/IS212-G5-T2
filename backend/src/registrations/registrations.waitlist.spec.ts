/*
 * Story: SPM-138 Join Waiting List When Event Is at Capacity, unit level for the join rules.
 * ACs: AC1 (join when full), AC4 (confirmation with position), AC7 (order by join time, from the clock).
 * Test cases (unit): JOIN-WAITLIST-01-B-UNIT, 01-C-UNIT, 01-D-UNIT, 01-E-UNIT, 01-F-UNIT, 04-C-LOCK, 15-A-UNIT.
 *
 * The database is a fake that RECORDS every statement, so "no entry was written" and "the event lock came first" are
 * observable. The outcome (the exception or the response) is asserted first; the recorded statements are the evidence.
 *
 * ASSUMPTION index:
 *  - A-CODE-DUP: a duplicate waitlist join answers 409 with code 'already_on_waitlist' (the spec fixes the text only).
 *  - A-CODE-WL: a join on a not-full event answers 422 with code 'WAITLIST_NOT_AVAILABLE' (D14).
 *  - A-CODE-REG: the already-registered and closed-window refusals reuse the SPM-61 codes ('already_registered',
 *    'registration_closed', 'registration_not_open') rather than new ones.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import { RegistrationsService } from './registrations.service.js';

const T0 = new Date('2026-10-14T04:00:00Z'); // 12:00 SGT
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATTENDEE: AuthenticatedUser = { uid: '22222222-2222-4222-8222-222222222222', roles: ['ATTENDEE'], email: 'a@example.com', name: 'A' } as AuthenticatedUser;
const REG_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;
interface Statement {
  sql: string;
  params: unknown[];
}

/** A full, open EVT-701-style event. Override fields per test. */
const openEvent = (overrides: Row = {}): Row => ({
  id: EVENT_ID,
  event_name: 'Gala Waitlist Night',
  status: 'Confirmed',
  registration_enabled: true,
  registration_limit: 3,
  registration_opens_at: new Date('2026-10-13T04:00:00Z'),
  registration_closes_at: new Date('2026-10-19T15:59:00Z'),
  ...overrides,
});

/** Answers the SQL shapes the join issues; anything else fails the test. Every statement is recorded. */
function joinDatabase(script: { event?: Row[]; existing?: Row[]; taken?: number; inserted?: Row[]; position?: number }) {
  const statements: Statement[] = [];
  let transactions = 0;
  const answer = (sql: string, params: unknown[]) => {
    statements.push({ sql, params });
    if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: script.event ?? [] };
    if (/^\s*UPDATE event_registrations r\b/.test(sql)) return { rows: [] };
    if (/SELECT status FROM event_registrations/.test(sql)) return { rows: script.existing ?? [] };
    if (/COUNT\(\*\)/.test(sql) && /status = 'Registered'/.test(sql)) return { rows: [{ count: script.taken ?? 0 }] };
    if (/^\s*INSERT INTO event_registrations/.test(sql)) return { rows: script.inserted ?? [{ id: REG_ID }] };
    if (/AS position/.test(sql)) return { rows: [{ position: script.position ?? 1 }] };
    throw new Error(`unexpected statement: ${sql}`);
  };
  const client = { query: async (sql: string, params: unknown[] = []) => answer(sql, params) };
  const database = {
    query: async (sql: string, params: unknown[] = []) => answer(sql, params),
    transaction: async (work: (c: typeof client) => Promise<unknown>) => {
      transactions += 1;
      return work(client);
    },
  } as unknown as DatabaseService;
  // Every join settles the list first (D9); that write only moves Waitlisted rows of a closed list, so it is not an entry write.
  const writes = () => statements.filter((s) => /^\s*(INSERT|UPDATE)/.test(s.sql) && !/SET status = 'Removed'/.test(s.sql));
  return { database, statements, transactions: () => transactions, writes };
}

const serviceFor = (database: DatabaseService, now = T0) => new RegistrationsService(database, { now: () => now });

/** Runs a call that must fail and returns the exception. */
async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
}

describe('SPM-138 join (unit): refusals happen before anything is written', () => {
  /**
   * Oracle (01-F, 403): a coordinator or organiser gets 403 before the database is touched.
   * Kills M8: the role guard is removed from the join.
   */
  it('JOIN-WAITLIST-01-F-ERR-UNIT: a user without the Attendee role is refused with 403 and no statement runs', async () => {
    const fake = joinDatabase({ event: [openEvent()] });
    const staff = { uid: ATTENDEE.uid, roles: ['COORDINATOR'] } as AuthenticatedUser;

    const error = await refusal(serviceFor(fake.database).joinWaitlist(staff, EVENT_ID, {}));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ statusCode: 403, message: 'Attendee access required.' });
    expect(fake.statements).toHaveLength(0);
  });

  /**
   * Oracle (15-A, 400): a body with keys is refused before the database is touched; the keys are named.
   * Kills M29: unknown keys are accepted.
   */
  it('JOIN-WAITLIST-15-A-ERR-UNIT: a body with unknown keys is refused with 400 validation_error and no statement runs', async () => {
    const fake = joinDatabase({ event: [openEvent()] });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, { status: 'Confirmed', eventId: EVENT_ID }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      code: 'validation_error',
      errors: { status: 'This field is not accepted.', eventId: 'This field is not accepted.' },
    });
    expect(fake.statements).toHaveLength(0);
  });

  /**
   * Oracle (01-E, B, unit): an attendee already waiting gets 409 MSG-WL-04; no entry is written.
   * Kills M7: a duplicate join is accepted.
   */
  it('JOIN-WAITLIST-01-E-ERR-UNIT: a waiting attendee gets 409 MSG-WL-04 and no entry is written (A-CODE-DUP)', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [{ status: 'Waitlisted' }], taken: 3 });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      code: 'already_on_waitlist',
      message: 'You are already on the waiting list for this event.',
    });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle (01-E, A, unit): a Confirmed attendee gets 409 MSG-05; no entry is written.
   */
  it('JOIN-WAITLIST-01-E-ERR-UNIT-REG: a confirmed attendee gets 409 MSG-05 and no entry is written', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [{ status: 'Registered' }], taken: 3 });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect((error as ConflictException).getResponse()).toMatchObject({ statusCode: 409, code: 'already_registered', message: 'You are already registered for this event.' });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle (01-C A, unit): with a free place the join is refused with WAITLIST_NOT_AVAILABLE and MSG-WL-03; no entry.
   * Kills M1: the fullness check is removed, so a join is accepted while spots remain.
   */
  it('JOIN-WAITLIST-01-C-ERR-UNIT: a join while a place is free is refused with 422 WAITLIST_NOT_AVAILABLE (A-CODE-WL)', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [], taken: 2 });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      statusCode: 422,
      code: 'WAITLIST_NOT_AVAILABLE',
      message: 'This event still has available spots. Please register directly.',
    });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle (01-D A, unit): a closed event is refused with MSG-01 before fullness is considered; no entry.
   * Kills M5 and M6 (the window is checked after, or not at all, for a full event).
   */
  it('JOIN-WAITLIST-01-D-ERR-UNIT: a closed event refuses the join with 422 registration_closed (A-CODE-REG)', async () => {
    const fake = joinDatabase({ event: [openEvent({ registration_closes_at: new Date('2026-10-13T15:59:00Z') })], existing: [], taken: 3 });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ statusCode: 422, code: 'registration_closed', message: 'Registration has closed for this event.' });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle (01-D B, unit): an event that opens later refuses the join with MSG-02 and the opening instant.
   */
  it('JOIN-WAITLIST-01-D-ERR-UNIT-OPEN: an event not yet open refuses the join with 422 registration_not_open (A-CODE-REG)', async () => {
    const fake = joinDatabase({ event: [openEvent({ registration_opens_at: new Date('2026-10-17T01:00:00Z') })], existing: [], taken: 3 });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      statusCode: 422,
      code: 'registration_not_open',
      message: 'Registration for this event opens on 17 Oct 2026, 09:00 SGT.',
    });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle (04-C, lock order, D7): the first statement of the join is the event row lock. A join that counts positions
   * before the lock can read a stale list. Kills M13: the event lock is removed from the join.
   */
  it('JOIN-WAITLIST-04-C-INT-LOCK: the join takes the event row lock before it reads or writes any entry', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [], taken: 3 });

    await serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {});

    expect(fake.statements[0].sql).toMatch(/FROM events WHERE id = \$1 FOR UPDATE/);
    const firstEntryRead = fake.statements.findIndex((s) => /event_registrations/.test(s.sql));
    expect(firstEntryRead).toBeGreaterThan(0);
  });

  /**
   * Oracle (01-A, unit): a free full-list join writes one Waitlisted row, with the clock's join time and the sequence,
   * and answers 201-shaped data with the position read back and the MSG-WL-01 text.
   * This unit check pins the Waitlisted write (M4 is killed by the e2e JOIN-WAITLIST-01-A). Kills M11 when the join time is not taken from the clock.
   */
  it('JOIN-WAITLIST-01-A-UNIT: a join on a full event writes a Waitlisted row stamped by the clock and returns the position', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [], taken: 3, position: 1 });

    const result = await serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {});

    expect(result).toEqual({
      registrationId: REG_ID,
      status: 'waitlisted',
      position: 1,
      message: 'You have joined the waiting list for Gala Waitlist Night. Your position is 1.',
    });
    const insert = fake.writes().find((s) => /^\s*INSERT INTO event_registrations/.test(s.sql));
    expect(insert?.sql).toMatch(/'Waitlisted'/);
    expect(insert?.sql).toMatch(/nextval\('event_registrations_waitlist_seq'\)/);
    expect(insert?.params).toEqual([EVENT_ID, ATTENDEE.uid, T0]);
  });

  /**
   * Oracle: an unknown event id (or a non-published one) is a 404 before any window rule or write.
   */
  it('JOIN-WAITLIST-01-F-ERR-UNIT-404: a join on an unknown event is a 404 and writes nothing', async () => {
    const fake = joinDatabase({ event: [] });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ statusCode: 404, message: 'Event not found.' });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * Oracle: the transaction is opened once for a join (the lock, the checks and the insert share it).
   */
  it('JOIN-WAITLIST-04-C-INT-TX: the join runs as one transaction', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [], taken: 3 });

    await serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {});

    expect(fake.transactions()).toBe(1);
  });
});

describe('SPM-138 join and withdrawal edge rules (unit)', () => {
  /**
   * JOIN-WAITLIST-01-E-UNIT-REGISTER: a waiting attendee who asks for a direct registration is refused with the same
   * duplicate sentence (409 MSG-WL-04); nothing is inserted, so the waiting entry is not turned into a registration.
   */
  it('JOIN-WAITLIST-01-E-ERR-UNIT-REGISTER: a waiting attendee cannot register directly and no row is written', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [{ status: 'Waitlisted' }], taken: 2 });

    const error = await refusal(
      serviceFor(fake.database).register(ATTENDEE, EVENT_ID, { fullName: 'Alice Tan', email: 'alice@example.com' }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      code: 'already_on_waitlist',
      message: 'You are already on the waiting list for this event.',
    });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * JOIN-WAITLIST-01-A-UNIT-OPEN-ENDED: an event with no opening or closing instant is open for the waiting list
   * (an unbounded window, D5); the join is accepted at the first place of the list.
   */
  it('JOIN-WAITLIST-01-A-BND-UNIT-OPEN-ENDED: an event with no window bounds accepts a join', async () => {
    const fake = joinDatabase({
      event: [openEvent({ registration_opens_at: null, registration_closes_at: null })],
      existing: [],
      taken: 3,
      position: 1,
    });

    const result = await serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {});

    expect(result).toMatchObject({ status: 'waitlisted', position: 1 });
  });

  /**
   * JOIN-WAITLIST-04-C-GUARD: under the lock a duplicate cannot reach the insert, but if the insert ever matches no row,
   * the join answers the duplicate sentence (409), never a success with no entry behind it.
   */
  it('JOIN-WAITLIST-04-C-ERR-GUARD: a lost race on the insert answers 409 and never reports a success', async () => {
    const fake = joinDatabase({ event: [openEvent()], existing: [], taken: 3, inserted: [] });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ statusCode: 409, code: 'already_on_waitlist' });
  });

  /**
   * JOIN-WAITLIST-10-E-CAS: a waiting withdrawal whose compare-and-set matches no row (another request won) answers 422
   * MSG-12 and writes no notice, no place and no second change.
   */
  it('JOIN-WAITLIST-10-E-ERR-CAS: a waiting withdrawal that loses the compare-and-set answers 422 and writes nothing else', async () => {
    const statements: Statement[] = [];
    const answer = (sql: string, params: unknown[]) => {
      statements.push({ sql, params });
      if (/SELECT r\.id, e\.event_name/.test(sql))
        return { rows: [{ id: REG_ID, status: 'Waitlisted', event_name: 'Gala Waitlist Night', start_date_time: new Date('2026-10-24T10:00:00Z'), event_id: EVENT_ID }] };
      if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [] };
      if (/^\s*UPDATE event_registrations/.test(sql)) return { rows: [] };
      if (/SELECT status FROM event_registrations WHERE id/.test(sql)) return { rows: [{ status: 'Waitlisted' }] };
      throw new Error(`unexpected statement: ${sql}`);
    };
    const client = { query: async (sql: string, params: unknown[] = []) => answer(sql, params) };
    const database = { transaction: async (work: (c: typeof client) => Promise<unknown>) => work(client) } as unknown as DatabaseService;

    const error = await refusal(serviceFor(database).withdraw(ATTENDEE, REG_ID, undefined));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ statusCode: 422, code: 'registration_already_withdrawn', message: 'This registration has already been withdrawn.' });
    // Exactly six statements: the ownership lookup, the event lock, the locked status re-read, the settle write for a
    // Waitlisted read, the re-read before the decision, and the one guarded UPDATE that matched no row.
    expect(statements.map((q) => q.sql.trim().split(/\s+/).slice(0, 2).join(' '))).toEqual([
      'SELECT r.id,',
      'SELECT id',
      'SELECT status',
      'UPDATE event_registrations',
      'SELECT status',
      'UPDATE event_registrations',
    ]);
  });
});
