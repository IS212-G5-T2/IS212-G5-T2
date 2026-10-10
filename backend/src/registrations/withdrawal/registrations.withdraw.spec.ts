/*
 * Story: SPM-120 Withdraw Registration (attendee), "no side effect" proof at unit level.
 * ACs: AC3 (confirm), AC4 (not after the event date), AC5 (status "Withdrawn").
 * Test cases: WITHDRAW-EVENT-REG-03-STATE-1, 04-STATE-1, 05-STATE-1, 05-STATE-2, 07-STATE-1, 07-STATE-2.
 * Note: test IDs follow the six-AC matrix (docs/specs/SPM-120-test-results.md, "Test ID map").
 *
 * Why this file exists: RegistrationsService.withdraw runs every rule inside one database transaction,
 * and DatabaseService.transaction rolls back when anything throws. So in the integration suite a
 * refused withdrawal ALWAYS leaves the row unchanged, even if the service wrote before it checked
 * (mutant M34: the UPDATE moved ahead of the event-start check survived all 33 integration tests).
 * Here the database is a fake whose transaction hands the service a client that RECORDS every
 * statement, so "no UPDATE was issued" is observable. The outcome (the exception) is asserted first;
 * the recorded statements are the evidence for the side effect, because no database state can be.
 */
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import type { DatabaseService } from '../../database/database.service.js';
import { RegistrationsService } from '../registrations.service.js';

const T0 = new Date('2026-10-04T12:00:00+08:00'); // 2026-10-04T04:00:00Z, the suite clock
const HOUR = 3_600_000;
const OWNER: AuthenticatedUser = {
  uid: '11111111-1111-4111-8111-111111111111',
  roles: ['ATTENDEE'],
};
const REG_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_NAME = 'Tech Talk: Cloud 101';

type Row = Record<string, unknown>;
interface Statement {
  sql: string;
  params: unknown[];
}
const isUpdate = (s: Statement) => /^\s*UPDATE/i.test(s.sql);
const isSelect = (s: Statement) => /^\s*SELECT/i.test(s.sql);

/** The registration the lookup returns: owned, on an event that starts at `start`. */
const found = (status: string, start: Date): Row => ({
  id: REG_ID,
  status,
  event_name: EVENT_NAME,
  start_date_time: start,
});

/** What the UPDATE ... RETURNING * hands back after a successful withdrawal. */
const withdrawnRow = (): Row => ({
  id: REG_ID,
  event_id: '33333333-3333-4333-8333-333333333333',
  attendee_id: OWNER.uid,
  full_name: 'Alice Tan',
  email: 'alice@example.com',
  contact_number: null,
  special_requirements: null,
  status: 'Withdrawn',
  created_at: new Date(T0.getTime() - 24 * HOUR),
  withdrawn_at: T0,
});

/**
 * A database whose transaction runs the callback against a client that records every statement.
 * SELECTs return `lookup`; UPDATEs return `updated`; any other statement fails the test.
 */
function recordingDatabase(lookup: Row[], updated: Row[] = []) {
  const statements: Statement[] = [];
  let transactions = 0;
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rows: lookup };
      if (/^\s*UPDATE/i.test(sql)) return { rows: updated };
      throw new Error(`unexpected statement: ${sql}`);
    },
  };
  const database = {
    transaction: async (work: (c: typeof client) => Promise<unknown>) => {
      transactions += 1;
      return work(client);
    },
  } as unknown as DatabaseService;
  return { database, statements, transactions: () => transactions };
}

const serviceFor = (database: DatabaseService) =>
  new RegistrationsService(database, { now: () => T0 });

/** Runs a withdrawal that must be refused and returns the exception for exact assertions. */
async function refusal(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the withdrawal to be refused, but it succeeded');
}

// WITHDRAW-EVENT-REG-04-STATE-1
describe('WITHDRAW-EVENT-REG-04-STATE-1 (AC4): a started event is refused before anything is written', () => {
  // Oracle (SPEC 04-B/04-C: 422 "Event has already occurred"; A7: the start instant is exclusive, so at the
  // start it is already refused): the exception is the 422, and no UPDATE statement was ever issued.
  // Kills: M34 the UPDATE issued before the event-start check (the transaction rollback hides it from the database).
  it.each([
    ['5 days after the start', new Date(T0.getTime() - 5 * 24 * HOUR)],
    ['exactly at the start instant', T0],
  ])('%s -> 422 and no UPDATE issued', async (_label, start) => {
    // Arrange
    const { database, statements } = recordingDatabase(
      [found('Registered', start)],
      [withdrawnRow()],
    );

    // Act
    const error = await refusal(
      serviceFor(database).withdraw(OWNER, REG_ID, undefined),
    );

    // Assert: the outcome first, then the side effect
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'event_already_occurred',
      message: 'Event has already occurred',
    });
    expect(statements.filter(isUpdate)).toEqual([]);
    expect(statements.filter(isSelect)).toHaveLength(1);
  });
});

// WITHDRAW-EVENT-REG-05-STATE-1
describe('WITHDRAW-EVENT-REG-05-STATE-1 (AC5): an already-withdrawn registration is refused before anything is written', () => {
  // Oracle (SPEC 05-D: 422 "This registration has already been withdrawn."): the 422 and no UPDATE.
  // Kills: the UPDATE issued before the state check (hidden by the rollback in the integration suite).
  it('a Withdrawn row on a future event -> 422 and no UPDATE issued', async () => {
    // Arrange
    const { database, statements } = recordingDatabase(
      [found('Withdrawn', new Date(T0.getTime() + 10 * 24 * HOUR))],
      [withdrawnRow()],
    );

    // Act
    const error = await refusal(
      serviceFor(database).withdraw(OWNER, REG_ID, undefined),
    );

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'registration_already_withdrawn',
      message: 'This registration has already been withdrawn.',
    });
    expect(statements.filter(isUpdate)).toEqual([]);
  });

  // Oracle (D14, one compare-and-set): the request passed its read but lost the race, so its UPDATE matched no row.
  // The loser gets the same 422, and exactly one UPDATE was attempted (the guarded one), never a second write.
  // Kills: a retry or fallback write after the compare-and-set fails.
  it('a request that loses the compare-and-set -> 422 after exactly one guarded UPDATE', async () => {
    // Arrange: the lookup still sees Registered, but the UPDATE returns no row.
    const { database, statements } = recordingDatabase(
      [found('Registered', new Date(T0.getTime() + 10 * 24 * HOUR))],
      [],
    );

    // Act
    const error = await refusal(
      serviceFor(database).withdraw(OWNER, REG_ID, undefined),
    );

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'registration_already_withdrawn',
    });
    expect(statements.filter(isUpdate)).toHaveLength(1);
  });
});

// WITHDRAW-EVENT-REG-05-STATE-2
describe('WITHDRAW-EVENT-REG-05-STATE-2 (AC5): a bad body is refused before the database is touched', () => {
  // Oracle (D15, "no body or {} only"): a 400 and the database is never entered, so not even a lookup runs.
  // Kills: the body validated inside the transaction after the lookup or the write (rollback hides the write).
  it.each([
    ['an object with keys', { status: 'registered' }],
    ['an array', []],
  ])('%s -> 400 and no transaction opened', async (_label, body) => {
    // Arrange
    const { database, statements, transactions } = recordingDatabase(
      [found('Registered', new Date(T0.getTime() + 10 * 24 * HOUR))],
      [withdrawnRow()],
    );

    // Act
    const error = await refusal(
      serviceFor(database).withdraw(OWNER, REG_ID, body),
    );

    // Assert
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'validation_error' });
    expect(transactions()).toBe(0);
    expect(statements).toEqual([]);
  });
});

// WITHDRAW-EVENT-REG-07-STATE-1
describe("WITHDRAW-EVENT-REG-07-STATE-1 (cross-cutting): another attendee's or a missing registration is refused before any write", () => {
  // Oracle (D16: 404 "Registration not found."): the lookup is scoped to the caller (the SQL filters on attendee_id
  // and receives the caller's uid as its second parameter), finds nothing, and no UPDATE is issued.
  // Kills: M2 the ownership filter dropped from the lookup; a write issued before the ownership check.
  it('a lookup that finds no row for this caller -> 404, scoped to the caller, no UPDATE issued', async () => {
    // Arrange: the (scoped) lookup returns nothing.
    const { database, statements } = recordingDatabase([], [withdrawnRow()]);

    // Act
    const error = await refusal(
      serviceFor(database).withdraw(OWNER, REG_ID, undefined),
    );

    // Assert
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({
      message: 'Registration not found.',
    });
    const [lookup] = statements.filter(isSelect);
    expect(lookup.sql).toMatch(/attendee_id = \$2/);
    expect(lookup.params).toEqual([REG_ID, OWNER.uid]);
    expect(statements.filter(isUpdate)).toEqual([]);
  });
});

// WITHDRAW-EVENT-REG-07-STATE-2
describe('WITHDRAW-EVENT-REG-07-STATE-2 (cross-cutting): a malformed id or no session never reaches the database', () => {
  // Oracle (D16 + the service's own rule: "a malformed id cannot belong to anyone"; authentication first):
  // 404 for a malformed id, 401 with no identity, and no transaction is opened in either case.
  // Kills: the id or identity checked only after the database was entered (a write could precede the refusal).
  it.each([
    ['a malformed id (REG-NOTEXIST)', OWNER, 'REG-NOTEXIST', NotFoundException],
    ['no authenticated identity', undefined, REG_ID, UnauthorizedException],
  ] as const)(
    '%s -> refused with no transaction',
    async (_label, identity, id, expected) => {
      // Arrange
      const { database, statements, transactions } = recordingDatabase(
        [found('Registered', new Date(T0.getTime() + 10 * 24 * HOUR))],
        [withdrawnRow()],
      );

      // Act
      const error = await refusal(
        serviceFor(database).withdraw(identity, id, undefined),
      );

      // Assert
      expect(error).toBeInstanceOf(expected);
      expect(transactions()).toBe(0);
      expect(statements).toEqual([]);
    },
  );
});

// WITHDRAW-EVENT-REG-03-STATE-1
describe('WITHDRAW-EVENT-REG-03-STATE-1 (AC3/AC5): a successful withdrawal writes exactly once, guarded, from the injected clock', () => {
  // Oracle (SPEC 03-A: withdrawnAt is the injected clock, status Withdrawn; D14: a single compare-and-set UPDATE;
  // M10: never SQL now()): one SELECT, one UPDATE whose parameters are [id, caller, clock], guarded on 'Registered'.
  // Kills: M3 the status guard removed from the UPDATE; M10 withdrawn_at taken from SQL now(); a second write.
  it('issues one UPDATE with [id, caller uid, clock instant], guarded on Registered, and answers 200 data', async () => {
    // Arrange
    const { database, statements } = recordingDatabase(
      [found('Registered', new Date(T0.getTime() + 10 * 24 * HOUR))],
      [withdrawnRow()],
    );

    // Act
    const result = await serviceFor(database).withdraw(
      OWNER,
      REG_ID,
      undefined,
    );

    // Assert: the outcome
    expect(result).toMatchObject({
      id: REG_ID,
      status: 'withdrawn',
      withdrawnAt: '2026-10-04T04:00:00.000Z',
      message: 'Your withdrawal from Tech Talk: Cloud 101 has been processed.',
    });
    // Assert: the write
    const writes = statements.filter(isUpdate);
    expect(writes).toHaveLength(1);
    expect(writes[0].params).toEqual([REG_ID, OWNER.uid, T0]);
    expect(writes[0].sql).toMatch(/status = 'Registered'/);
    expect(writes[0].sql).not.toMatch(/now\(\)/i);
  });
});

/*
 * SPM-120 assumption index. Decision IDs (A*, D*, F*) are defined in docs/specs/SPM-120-test-results.md,
 * "Decision and assumption IDs". assumption -> tests that rely on it:
 *  A7   event start is an exclusive cut-off, ASSUMED pending the Product Owner -> 04-STATE-1 (the "exactly at the start" row)
 *  D14  one compare-and-set UPDATE decides concurrent withdrawals -> 05-STATE-1 (lost race), 03-STATE-1
 *  D15  the route accepts no body or {}; any other body is a 400 -> 05-STATE-2
 *  D16  another attendee's, unknown and malformed ids all get the same 404, never 403 -> 07-STATE-1, 07-STATE-2
 *  REC  a recording client is the only way to observe a write that a rolled-back transaction hides, DERIVED from
 *       DatabaseService.transaction (BEGIN / COMMIT, ROLLBACK on throw) -> every test in this file
 */
