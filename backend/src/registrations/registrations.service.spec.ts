/*
 * Stories: SPM-61 Register for an Event (ACs 1-5), SPM-62 View Registration Details (ACs 1-4,
 * the attendee's own registration), SPM-63 View Registration Information (AC5, access to a
 * report for events the caller does not manage).
 * Test cases: EVENT-REG-01-B, EVENT-REG-02-A, EVENT-REG-03-A, EVENT-REG-05-A, SUP-EVENT-REG-CAP-A and -B (supporting, no Jira AC),
 * EVENT-REG-05-SEC-1, VIEW-REG-DET-01-A (access), VIEW-REG-DET-02-A (status), VIEW-REG-DET-03-A (details),
 * VIEW-REG-DET-04-A (after the event), VIEW-REG-INFO-05-A.
 *
 * Why this file exists: RegistrationsService.register, findMine and getReport had no unit
 * coverage (about 40% of the file ran in unit tests; the rest only in the PostgreSQL e2e suite,
 * which does not count toward unit coverage). The database here is a scripted fake. It records
 * every statement, so a refused registration can be shown to issue no INSERT. Expected values are
 * literals taken from the ACs and the locked MSG wording in helpers/messages.ts.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import { RegistrationsService } from './registrations.service.js';

// Suite clock: 2026-10-04 12:00 SGT (= 04:00Z). Every window and cut-off below is relative to it.
const T0 = new Date('2026-10-04T04:00:00Z');
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const REG_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_NAME = 'Tech Talk: Cloud 101';
const ATTENDEE: AuthenticatedUser = { uid: '11111111-1111-4111-8111-111111111111', roles: ['ATTENDEE'] };
const VALID_BODY = {
  fullName: 'Alice Tan',
  email: 'alice@example.com',
  contactNumber: '+6591234567',
  specialRequirements: 'Wheelchair access',
};

type Row = Record<string, unknown>;
interface Statement {
  sql: string;
  params: unknown[];
}

/** An open event: window 2026-10-01 00:00Z to 2026-10-10 00:00Z, capacity 3 (a non-default limit). */
const openEvent = (overrides: Row = {}): Row => ({
  id: EVENT_ID,
  event_name: EVENT_NAME,
  status: 'Confirmed',
  registration_enabled: true,
  registration_opens_at: new Date('2026-10-01T00:00:00Z'),
  registration_closes_at: new Date('2026-10-10T00:00:00Z'),
  registration_limit: 3,
  start_date_time: new Date('2026-10-12T02:00:00Z'),
  end_date_time: new Date('2026-10-12T04:00:00Z'),
  organiser_id: '55555555-5555-4555-8555-555555555555',
  coordinator_id: '66666666-6666-4666-8666-666666666666',
  ...overrides,
});

/** The row INSERT ... RETURNING * hands back for a new registration. */
const insertedRow = (): Row => ({
  id: REG_ID,
  event_id: EVENT_ID,
  attendee_id: ATTENDEE.uid,
  full_name: 'Alice Tan',
  email: 'alice@example.com',
  contact_number: '+6591234567',
  special_requirements: 'Wheelchair access',
  status: 'Registered',
  created_at: T0,
  withdrawn_at: null,
});

interface Script {
  /** Rows for SELECT ... FROM events (the locked event row, or the report lookup). */
  event?: Row[];
  /** Rows for SELECT status FROM event_registrations (the caller's existing row). */
  existing?: Row[];
  /** Result of the Registered-row count. */
  taken?: number;
  /** Rows returned by the INSERT ... RETURNING. An empty list models the ON CONFLICT WHERE miss. */
  inserted?: Row[];
  /** Rows for the attendee's own registration lookup (findMine). */
  mine?: Row[];
  /** Rows for the report's Registered-row query. */
  registered?: Row[];
  /** Rows for the withdrawal lookup (owned registration joined to its event). */
  found?: Row[];
  /** Rows for the withdrawal's guarded UPDATE ... RETURNING. */
  updated?: Row[];
}

/**
 * A database fake: every query is recorded, and each SQL shape gets the scripted answer.
 * Any unexpected statement fails the test, so a stray write cannot pass unnoticed.
 */
function scripted(script: Script) {
  const statements: Statement[] = [];
  let transactions = 0;
  const answer = (sql: string, params: unknown[]) => {
    statements.push({ sql, params });
    if (/SELECT r\.id, r\.status, e\.event_name/.test(sql)) return { rows: script.found ?? [] };
    if (/^\s*UPDATE event_registrations/.test(sql)) return { rows: script.updated ?? [] };
    if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: script.event ?? [] };
    if (/FROM events WHERE id = \$1$/m.test(sql.trim())) return { rows: script.event ?? [] };
    if (/SELECT status FROM event_registrations/.test(sql)) return { rows: script.existing ?? [] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: script.taken ?? 0 }] };
    if (/^\s*INSERT INTO event_registrations/.test(sql)) return { rows: script.inserted ?? [] };
    if (/FROM event_registrations r/.test(sql)) return { rows: script.mine ?? [] };
    if (/event_registrations\s+WHERE event_id = \$1 AND status = 'Registered'/.test(sql))
      return { rows: script.registered ?? [] };
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
  return { database, statements, transactions: () => transactions };
}

const serviceFor = (database: DatabaseService, now = T0) =>
  new RegistrationsService(database, { now: () => now });

/** Runs a call that must fail and returns the exception for exact assertions. */
async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be refused, but it succeeded');
}

const isInsert = (s: Statement) => /^\s*INSERT INTO event_registrations/.test(s.sql);

// ---------------------------------------------------------------------------
// SPM-61 register
// ---------------------------------------------------------------------------

describe('EVENT-REG-03-A (AC3, AC4): a valid submission is stored and confirmed', () => {
  it('inserts one Registered row with the submitted details and returns the confirmation message', async () => {
    // Arrange: open window, no existing row, 1 of 3 places taken
    const fake = scripted({ event: [openEvent()], existing: [], taken: 1, inserted: [insertedRow()] });
    const service = serviceFor(fake.database);

    // Act
    const result = (await service.register(ATTENDEE, EVENT_ID, VALID_BODY)) as {
      registration: Record<string, unknown>;
      message: string;
    };

    // Assert: outcome, then the stored row
    expect(result.message).toBe('Registration successful. You are registered for Tech Talk: Cloud 101.');
    expect(result.registration).toMatchObject({
      id: REG_ID,
      eventId: EVENT_ID,
      eventName: EVENT_NAME,
      attendeeId: ATTENDEE.uid,
      fullName: 'Alice Tan',
      email: 'alice@example.com',
      contactNumber: '+6591234567',
      specialRequirements: 'Wheelchair access',
      status: 'registered',
      registeredAt: '2026-10-04T04:00:00.000Z',
    });
    const inserts = fake.statements.filter(isInsert);
    expect(inserts).toHaveLength(1);
    // Kills: swapped email/name, attendee taken from the body instead of the session
    expect(inserts[0].params).toEqual([EVENT_ID, ATTENDEE.uid, 'Alice Tan', 'alice@example.com', '+6591234567', 'Wheelchair access']);
  });

  it('EVENT-REG-03-A: an omitted optional field is stored as NULL, not as an empty string', async () => {
    const fake = scripted({ event: [openEvent()], existing: [], taken: 0, inserted: [insertedRow()] });
    await serviceFor(fake.database).register(ATTENDEE, EVENT_ID, { fullName: 'Alice Tan', email: 'alice@example.com' });
    const [insert] = fake.statements.filter(isInsert);
    // Kills: contactNumber/specialRequirements defaulted to '' instead of NULL
    expect(insert.params.slice(4)).toEqual([null, null]);
  });
});

describe('EVENT-REG-01-B (AC1): registration is refused before the window opens', () => {
  it('a window opening at 2026-10-20 10:00 SGT -> 422 registration_not_open with the opening time, no INSERT', async () => {
    // Opens 2026-10-20T02:00Z = 10:00 SGT; the suite clock is 2026-10-04.
    const fake = scripted({
      event: [openEvent({ registration_opens_at: new Date('2026-10-20T02:00:00Z') })],
      existing: [],
      taken: 0,
      inserted: [insertedRow()],
    });

    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as UnprocessableEntityException;

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toEqual({
      statusCode: 422,
      code: 'registration_not_open',
      message: 'Registration for this event opens on 20 Oct 2026, 10:00 SGT.',
      registrationOpensAt: '2026-10-20T02:00:00.000Z',
    });
    // Kills: the window check moved after the INSERT (side effect on refusal)
    expect(fake.statements.some(isInsert)).toBe(false);
  });
});

describe('EVENT-REG-01-BND-1 (AC1): the opening instant itself is open', () => {
  it('a clock exactly at the opening instant -> the registration proceeds (open is inclusive)', async () => {
    const fake = scripted({
      event: [openEvent({ registration_opens_at: T0 })],
      existing: [],
      taken: 0,
      inserted: [insertedRow()],
    });
    await expect(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY)).resolves.toMatchObject({
      registration: { status: 'registered' },
    });
    // Kills: open treated as exclusive (`<=` instead of `<` in the not-yet-open check)
    expect(fake.statements.filter(isInsert)).toHaveLength(1);
  });

  it('EVENT-REG-01-BND-1: one millisecond before the opening instant -> 422 registration_not_open', async () => {
    const fake = scripted({
      event: [openEvent({ registration_opens_at: new Date(T0.getTime() + 1) })],
      existing: [],
      taken: 0,
      inserted: [insertedRow()],
    });
    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as UnprocessableEntityException;
    expect(error.getResponse()).toMatchObject({ code: 'registration_not_open' });
    expect(fake.statements.some(isInsert)).toBe(false);
  });
});

describe('EVENT-REG-02-A (AC2): registration is refused once the period has closed', () => {
  it('a clock exactly at the closing instant -> 422 registration_closed, no INSERT (close is exclusive)', async () => {
    const fake = scripted({
      event: [openEvent({ registration_closes_at: T0 })],
      existing: [],
      taken: 0,
      inserted: [insertedRow()],
    });

    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as UnprocessableEntityException;

    expect(error.getResponse()).toEqual({
      statusCode: 422,
      code: 'registration_closed',
      message: 'Registration has closed for this event.',
    });
    // Kills: close treated as inclusive (`>` instead of `>=`)
    expect(fake.statements.some(isInsert)).toBe(false);
  });

  it('EVENT-REG-02-A: one millisecond before the closing instant is still open', async () => {
    const fake = scripted({
      event: [openEvent({ registration_closes_at: new Date(T0.getTime() + 1) })],
      existing: [],
      taken: 0,
      inserted: [insertedRow()],
    });
    await expect(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY)).resolves.toMatchObject({
      registration: { status: 'registered', eventId: EVENT_ID },
    });
    expect(fake.statements.filter(isInsert)).toHaveLength(1);
  });
});

describe('EVENT-REG-05-A (AC5): a second active registration for the same event is refused', () => {
  it('an existing Registered row -> 409 already_registered, no INSERT and no capacity check', async () => {
    const fake = scripted({ event: [openEvent()], existing: [{ status: 'Registered' }], taken: 0, inserted: [insertedRow()] });

    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as ConflictException;

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'already_registered',
      message: 'You are already registered for this event.',
    });
    expect(fake.statements.some(isInsert)).toBe(false);
  });

  it('EVENT-REG-05-A: the ON CONFLICT WHERE miss (row changed under us) surfaces as a duplicate, not a success', async () => {
    // The pre-check saw no row, but the upsert affected nothing: the service must not report success.
    const fake = scripted({ event: [openEvent()], existing: [], taken: 0, inserted: [] });
    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as ConflictException;
    expect(error.getResponse()).toMatchObject({ code: 'already_registered' });
  });
});

describe('SUP-EVENT-REG-CAP-A (supporting coverage, no Jira AC): the last place is granted and the next attempt is refused', () => {
  it('capacity 3 with 2 taken (N-1) -> the registration succeeds', async () => {
    const fake = scripted({ event: [openEvent({ registration_limit: 3 })], existing: [], taken: 2, inserted: [insertedRow()] });
    await expect(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY)).resolves.toMatchObject({
      registration: { status: 'registered' },
    });
  });

  it('capacity 3 with 3 taken (N) -> 422 registration_full, no INSERT', async () => {
    const fake = scripted({ event: [openEvent({ registration_limit: 3 })], existing: [], taken: 3, inserted: [insertedRow()] });

    const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as UnprocessableEntityException;

    expect(error.getResponse()).toEqual({
      statusCode: 422,
      code: 'registration_full',
      message: 'This event is fully booked.',
    });
    // Kills: `>` instead of `>=` in the capacity check (allows a fourth place)
    expect(fake.statements.some(isInsert)).toBe(false);
  });

  it('SUP-EVENT-REG-CAP-B: the Registered-row count is taken for this event only, under the row lock', async () => {
    const fake = scripted({ event: [openEvent()], existing: [], taken: 0, inserted: [insertedRow()] });
    await serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY);
    const lock = fake.statements.findIndex((s) => /FOR UPDATE/.test(s.sql));
    const count = fake.statements.find((s) => /COUNT\(\*\)/.test(s.sql));
    // Kills: lock dropped (concurrent registrations could both pass the capacity check)
    expect(lock).toBe(0);
    expect(count?.params).toEqual([EVENT_ID]);
  });
});

describe('EVENT-REG-05-SEC-1 (role and event visibility): who may register', () => {
  it('an Organiser (not an Attendee) -> 403 Attendee access required, nothing read or written', async () => {
    const fake = scripted({ event: [openEvent()], existing: [], taken: 0, inserted: [insertedRow()] });
    const organiser: AuthenticatedUser = { uid: '55555555-5555-4555-8555-555555555555', roles: ['ORGANISER'] };

    const error = await refusal(serviceFor(fake.database).register(organiser, EVENT_ID, VALID_BODY));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({ statusCode: 403, message: 'Attendee access required.', error: 'Forbidden' });
    expect(fake.transactions()).toBe(0);
  });

  it('no session identity -> 401, nothing read or written', async () => {
    const fake = scripted({});
    const error = await refusal(serviceFor(fake.database).register(undefined, EVENT_ID, VALID_BODY));
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(fake.statements).toHaveLength(0);
  });

  it('a malformed event id -> 404 Event not found without querying', async () => {
    const fake = scripted({});
    const error = await refusal(serviceFor(fake.database).register(ATTENDEE, 'not-a-uuid', VALID_BODY));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(fake.statements).toHaveLength(0);
  });

  it('an event that is not published (Draft) -> 404 Event not found, no INSERT', async () => {
    const fake = scripted({ event: [openEvent({ status: 'Draft' })], existing: [], taken: 0, inserted: [insertedRow()] });
    const error = await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY));
    expect((error as NotFoundException).getResponse()).toEqual({ statusCode: 404, message: 'Event not found.', error: 'Not Found' });
    expect(fake.statements.some(isInsert)).toBe(false);
  });

  it('EVENT-REG-02-A: a Completed or Cancelled event is visible but not registrable -> 422 registration_closed, no INSERT', async () => {
    // Both statuses pass the visibility filter, so only the window rule (status must be Confirmed) refuses them.
    for (const status of ['Completed', 'Cancelled']) {
      const fake = scripted({ event: [openEvent({ status })], existing: [], taken: 0, inserted: [insertedRow()] });
      const error = (await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY))) as UnprocessableEntityException;
      expect(error.getResponse()).toMatchObject({ statusCode: 422, code: 'registration_closed' });
      // Kills: the Confirmed-only rule dropped from the window check
      expect(fake.statements.some(isInsert)).toBe(false);
    }
  });

  it('an event that does not exist -> 404 Event not found, no INSERT', async () => {
    const fake = scripted({ event: [], existing: [], taken: 0, inserted: [insertedRow()] });
    const error = await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, VALID_BODY));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(fake.statements.some(isInsert)).toBe(false);
  });
});

describe('EVENT-REG-03-D (AC3): an invalid submission is refused before any database access', () => {
  it('a body with an unknown key (status) -> 400 validation_error and no transaction opened', async () => {
    const fake = scripted({ event: [openEvent()], existing: [], taken: 0, inserted: [insertedRow()] });
    const error = await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, { ...VALID_BODY, status: 'Registered' }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ statusCode: 400, code: 'validation_error' });
    // Kills: validation moved inside the transaction (a lock taken for a request that is never valid)
    expect(fake.transactions()).toBe(0);
  });
});

describe('WITHDRAW-EVENT-REG-03-A (AC3, AC5): an empty JSON object body is accepted by the withdraw route', () => {
  it('a body of {} withdraws the caller\'s registration exactly as an absent body does', async () => {
    const withdrawn: Row = { ...insertedRow(), status: 'Withdrawn', withdrawn_at: T0, event_name: EVENT_NAME };
    const fake = scripted({
      found: [{ id: REG_ID, status: 'Registered', event_name: EVENT_NAME, start_date_time: new Date('2026-10-12T02:00:00Z') }],
      updated: [withdrawn],
    });
    const result = (await serviceFor(fake.database).withdraw(ATTENDEE, REG_ID, {})) as Record<string, unknown>;
    expect(result).toMatchObject({ id: REG_ID, status: 'withdrawn', withdrawnAt: '2026-10-04T04:00:00.000Z' });
    expect(result.message).toBe('Your withdrawal from Tech Talk: Cloud 101 has been processed.');
    expect(fake.statements.filter((s) => /^\s*UPDATE/.test(s.sql))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SPM-62 findMine (the attendee's own registration)
// ---------------------------------------------------------------------------

const mineRow = (status: 'Registered' | 'Withdrawn', withdrawnAt: Date | null = null): Row => ({
  ...insertedRow(),
  status,
  withdrawn_at: withdrawnAt,
  event_name: EVENT_NAME,
});

describe('VIEW-REG-DET-02-A (AC2): the attendee sees their own registration status', () => {
  // Kills: the status mapping (registered/withdrawn) broken, or the event name or stored details dropped.
  it('VIEW-REG-DET-02-A: a Registered row -> status "registered" with the event name and the stored details', async () => {
    const fake = scripted({ mine: [mineRow('Registered')] });
    const result = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    expect(result.registration).toMatchObject({
      id: REG_ID,
      eventName: EVENT_NAME,
      status: 'registered',
      fullName: 'Alice Tan',
      email: 'alice@example.com',
      registeredAt: '2026-10-04T04:00:00.000Z',
    });
    expect(result.registration?.withdrawnAt).toBeUndefined();
  });

  it('VIEW-REG-DET-02-A: a Withdrawn row is still returned, with status "withdrawn" and the withdrawal time (SPM-120 AC6)', async () => {
    const withdrawn = new Date('2026-10-04T05:00:00Z');
    const fake = scripted({ mine: [mineRow('Withdrawn', withdrawn)] });
    const result = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    expect(result.registration).toMatchObject({ status: 'withdrawn', withdrawnAt: '2026-10-04T05:00:00.000Z' });
  });

  it('VIEW-REG-DET-01-A: the lookup is scoped to this event and this caller (own registration only)', async () => {
    const fake = scripted({ mine: [] });
    await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    const lookup = fake.statements.find((s) => /FROM event_registrations r/.test(s.sql));
    // Kills: the attendee id taken from anywhere but the session (another attendee's registration could be read)
    expect(lookup?.params?.[0]).toBe(EVENT_ID);
    expect(lookup?.params?.[1]).toBe(ATTENDEE.uid);
  });

  it('VIEW-REG-DET-01-A: no registration for this event -> null, not an error', async () => {
    const fake = scripted({ mine: [] });
    await expect(serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID)).resolves.toEqual({ registration: null });
  });

  it('VIEW-REG-DET-01-A: a non-attendee cannot read a registration -> 403, nothing queried', async () => {
    const fake = scripted({ mine: [mineRow('Registered')] });
    const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };
    const error = await refusal(serviceFor(fake.database).findMine(coordinator, EVENT_ID));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(fake.statements).toHaveLength(0);
  });
});

describe('VIEW-REG-DET-02-B (AC2, state only): a cancelled registration is read back with its status', () => {
  // Kills: the Cancelled value dropped by the status mapping, or a cancelled row hidden from the attendee.
  it('VIEW-REG-DET-02-B: a Cancelled row is returned with status "cancelled"', async () => {
    const fake = scripted({ mine: [mineRow('Cancelled')] });
    const result = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    expect(result.registration).toMatchObject({ status: 'cancelled', eventName: EVENT_NAME });
  });
});

describe('VIEW-REG-DET-03-A (AC3): the attendee sees the details they submitted, including the optional requirements', () => {
  it('VIEW-REG-DET-03-A: special requirements present -> shown; a legacy row with NULL details -> blank name and email, no requirements (ASSUMPTION A-NULL)', async () => {
    // ASSUMPTION A-NULL as in VIEW-REG-INFO-03-A-NULL: blank strings for NULL legacy details.
    const fake = scripted({ mine: [mineRow('Registered')] });
    const withRequirements = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    expect(withRequirements.registration?.specialRequirements).toBe('Wheelchair access');

    const legacy = scripted({ mine: [{ ...mineRow('Registered'), full_name: null, email: null, special_requirements: null, contact_number: null }] });
    const result = await serviceFor(legacy.database).findMine(ATTENDEE, EVENT_ID);
    expect(result.registration).toMatchObject({ fullName: '', attendeeName: '', email: '' });
    expect(result.registration?.specialRequirements).toBeUndefined();
    expect(result.registration?.contactNumber).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SPM-63 getReport: the access rule (AC5) and the counts (AC2)
// ---------------------------------------------------------------------------

const reportEvent = (overrides: Row = {}): Row => openEvent({ ...overrides });
const registeredRow = (id: string, name: string, createdAt: Date): Row => ({
  id,
  full_name: name,
  email: `${name.toLowerCase()}@example.com`,
  contact_number: '+6590000000',
  created_at: createdAt,
  special_requirements: null,
});

describe('VIEW-REG-DET-04-A (AC4): the attendee can view the registration before or after the event', () => {
  // Kills: the visible-status list narrowed to Confirmed (the registration disappears once the event has completed
  // or been cancelled), or the list reordered so the statuses no longer match the lookup.
  it('VIEW-REG-DET-04-A: the lookup keeps Completed and Cancelled events visible', async () => {
    const fake = scripted({ mine: [mineRow('Registered')] });
    const result = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    const lookup = fake.statements.find((s) => /FROM event_registrations r/.test(s.sql));
    expect(lookup?.params?.[2]).toEqual(['Confirmed', 'Completed', 'Cancelled']);
    expect(result.registration).toMatchObject({ status: 'registered' });
  });
});

describe('VIEW-REG-INFO-05-A (AC5): only the assigned coordinator or the owning organiser may open the report', () => {
  it('the assigned coordinator gets the report', async () => {
    const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };
    const fake = scripted({ event: [reportEvent()], registered: [] });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report.event.id).toBe(EVENT_ID);
  });

  it('the owning organiser gets the report', async () => {
    const organiser: AuthenticatedUser = { uid: '55555555-5555-4555-8555-555555555555', roles: ['ORGANISER'] };
    const fake = scripted({ event: [reportEvent()], registered: [] });
    const report = await serviceFor(fake.database).getReport(organiser, EVENT_ID);
    expect(report.event.id).toBe(EVENT_ID);
  });

  it('a coordinator not assigned to the event -> 403 with the report message, no registration rows read', async () => {
    const otherCoordinator: AuthenticatedUser = { uid: '77777777-7777-4777-8777-777777777777', roles: ['COORDINATOR'] };
    const fake = scripted({ event: [reportEvent()], registered: [registeredRow('r1', 'Bob', T0)] });

    const error = await refusal(serviceFor(fake.database).getReport(otherCoordinator, EVENT_ID));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      message: "You do not have access to this event's registrations.",
      error: 'Forbidden',
    });
    // Kills: the access check moved after the attendee query (names and emails read for a refused caller)
    expect(fake.statements.some((s) => /event_registrations\s+WHERE event_id = \$1 AND status = 'Registered'/.test(s.sql))).toBe(false);
  });

  it('an organiser who does not own the event -> 403', async () => {
    const otherOrganiser: AuthenticatedUser = { uid: '88888888-8888-4888-8888-888888888888', roles: ['ORGANISER'] };
    const fake = scripted({ event: [reportEvent()] });
    await expect(serviceFor(fake.database).getReport(otherOrganiser, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an Attendee holding the same uid as the coordinator is refused (role is checked, not only the id)', async () => {
    const attendeeSameId: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['ATTENDEE'] };
    const fake = scripted({ event: [reportEvent()] });
    await expect(serviceFor(fake.database).getReport(attendeeSameId, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VIEW-REG-INFO-05-A: an unknown event -> 404 Event not found, no registration rows read', async () => {
    const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };
    const fake = scripted({ event: [], registered: [registeredRow('r1', 'Bob', T0)] });
    const error = await refusal(serviceFor(fake.database).getReport(coordinator, EVENT_ID));
    expect((error as NotFoundException).getResponse()).toEqual({ statusCode: 404, message: 'Event not found.', error: 'Not Found' });
    expect(fake.statements.some((s) => /status = 'Registered'/.test(s.sql))).toBe(false);
  });

  it('VIEW-REG-INFO-03-A: a row with special requirements carries them into the report', async () => {
    const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };
    const withNeeds: Row = { ...registeredRow('r7', 'Dana', T0), special_requirements: 'Halal meals' };
    const fake = scripted({ event: [reportEvent()], registered: [withNeeds] });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report.registrations[0]).toMatchObject({ registrationId: 'r7', specialRequirements: 'Halal meals' });
  });

  it('VIEW-REG-INFO-03-A-NULL: a legacy row with no detail columns is reported with blank text and no special requirements (ASSUMPTION A-NULL)', async () => {
    // ASSUMPTION A-NULL: the AC does not say what a legacy (SPM-99) row without details displays.
    // Migration 004 keeps the detail columns nullable for those rows; blank strings are chosen so the
    // CSV and PDF never print "null". Confirm with the PO if a different placeholder is wanted.
    const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };
    const legacy: Row = { id: 'r9', full_name: null, email: null, contact_number: null, created_at: T0, special_requirements: null };
    const fake = scripted({ event: [reportEvent()], registered: [legacy] });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report.registrations).toEqual([
      { registrationId: 'r9', fullName: '', email: '', contactNumber: '', registeredAt: '2026-10-04T04:00:00.000Z', status: 'Confirmed' },
    ]);
    expect(report.totalConfirmed).toBe(1);
  });

  it('no session identity -> 401, nothing queried', async () => {
    const fake = scripted({});
    const error = await refusal(serviceFor(fake.database).getReport(undefined, EVENT_ID));
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(fake.statements).toHaveLength(0);
  });
});

describe('VIEW-REG-INFO-02-A (AC2): the report counts only Registered attendees', () => {
  const coordinator: AuthenticatedUser = { uid: '66666666-6666-4666-8666-666666666666', roles: ['COORDINATOR'] };

  it('capacity 3 with 2 Registered rows -> totalConfirmed 2 and availableSpots 1', async () => {
    const fake = scripted({
      event: [reportEvent({ registration_limit: 3 })],
      registered: [registeredRow('r1', 'Bob', T0), registeredRow('r2', 'Carol', new Date('2026-10-04T05:00:00Z'))],
    });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report.totalConfirmed).toBe(2);
    expect(report.availableSpots).toBe(1);
    expect(report.event).toMatchObject({ capacity: 3, name: EVENT_NAME });
    expect(report.registrations.map((r) => r.registrationId)).toEqual(['r1', 'r2']);
    expect(report.registrations[0]).toMatchObject({ fullName: 'Bob', email: 'bob@example.com', status: 'Confirmed', registeredAt: '2026-10-04T04:00:00.000Z' });
  });

  it('a full event -> availableSpots 0, and never negative when rows exceed the limit', async () => {
    const fake = scripted({
      event: [reportEvent({ registration_limit: 1 })],
      registered: [registeredRow('r1', 'Bob', T0), registeredRow('r2', 'Carol', T0)],
    });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report.availableSpots).toBe(0);
    expect(report.totalConfirmed).toBe(2);
  });

  it('an event with no registrations -> totalConfirmed 0, availableSpots equal to capacity', async () => {
    const fake = scripted({ event: [reportEvent({ registration_limit: 5 })], registered: [] });
    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    expect(report).toMatchObject({ totalConfirmed: 0, availableSpots: 5, registrations: [] });
  });
});
