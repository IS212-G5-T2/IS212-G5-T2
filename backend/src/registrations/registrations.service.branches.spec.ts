/*
 * Stories: SPM-61 register, SPM-138 waitlist, SPM-120 withdraw, SPM-63 report, SPM-139 disabled registration.
 * Unit coverage for the service branches the other registration specs do not reach: a disabled window, joining the
 * waitlist of an own event, a settled list on read, withdrawing a waiting or removed entry, and the filtered report.
 * The database is a scripted fake that records every statement, so refusals are shown to write nothing.
 */
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import { RegistrationsService } from './registrations.service.js';

const NOW = new Date('2026-10-04T04:00:00Z');
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const REG_ID = '22222222-2222-4222-8222-222222222222';
const ORGANISER_ID = '55555555-5555-4555-8555-555555555555';
const COORDINATOR_ID = '66666666-6666-4666-8666-666666666666';
const ATTENDEE: AuthenticatedUser = { uid: '11111111-1111-4111-8111-111111111111', roles: ['ATTENDEE'] };
const BODY = { fullName: 'Alice Tan', email: 'alice@example.com', contactNumber: '+6591234567' };

type Row = Record<string, unknown>;
interface Statement { sql: string; params: unknown[] }

const event = (overrides: Row = {}): Row => ({
  id: EVENT_ID, event_name: 'Tech Talk', status: 'Confirmed', registration_enabled: true,
  registration_opens_at: new Date('2026-10-01T00:00:00Z'), registration_closes_at: new Date('2026-10-10T00:00:00Z'),
  registration_limit: 3, start_date_time: new Date('2026-10-12T02:00:00Z'), end_date_time: new Date('2026-10-12T04:00:00Z'),
  organiser_id: ORGANISER_ID, coordinator_id: COORDINATOR_ID, ...overrides,
});

interface Script {
  event?: Row[];
  existing?: Row[];
  inserted?: Row[];
  mine?: Row[][];
  due?: Row[];
  settled?: Row[];
  found?: Row[];
  statuses?: Array<string | undefined>;
  waitlistLeft?: Row[];
  reportRows?: Row[];
  counts?: { confirmed: number; waitlisted: number };
}

function scripted(script: Script) {
  const statements: Statement[] = [];
  const mine = [...(script.mine ?? [])];
  const statuses = [...(script.statuses ?? [])];
  const answer = (sql: string, params: unknown[]) => {
    statements.push({ sql, params });
    if (/SELECT r\.id, e\.event_name/.test(sql)) return { rows: script.found ?? [] };
    if (/SELECT r\.\*, e\.event_name/.test(sql)) return { rows: mine.shift() ?? [] };
    if (/SELECT 1 FROM event_registrations r JOIN events e/.test(sql)) return { rows: script.due ?? [] };
    if (/SET status = 'Removed'/.test(sql)) return { rows: script.settled ?? [] };
    if (/SET status = 'Withdrawn'/.test(sql)) return { rows: script.waitlistLeft ?? [] };
    if (/FROM event_registrations r\s+WHERE r\.event_id = \$1 AND r\.status = ANY/.test(sql)) return { rows: script.reportRows ?? [] };
    if (/COUNT\(\*\) FILTER/.test(sql)) return { rows: [script.counts ?? { confirmed: 0, waitlisted: 0 }] };
    if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: script.event ?? [] };
    if (/FROM events WHERE id = \$1$/m.test(sql.trim())) return { rows: script.event ?? [] };
    if (/SELECT status FROM event_registrations WHERE id/.test(sql)) return { rows: [{ status: statuses.shift() }] };
    if (/SELECT status FROM event_registrations/.test(sql)) return { rows: script.existing ?? [] };
    if (/^\s*INSERT INTO event_registrations/.test(sql)) return { rows: script.inserted ?? [] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: 0 }] };
    throw new Error(`unexpected statement: ${sql}`);
  };
  const client = { query: async (sql: string, params: unknown[] = []) => answer(sql, params) };
  const database = {
    query: async (sql: string, params: unknown[] = []) => answer(sql, params),
    transaction: async (work: (c: typeof client) => Promise<unknown>) => work(client),
  } as unknown as DatabaseService;
  return { database, statements };
}

const serviceFor = (database: DatabaseService) => new RegistrationsService(database, { now: () => NOW });
const refusal = (promise: Promise<unknown>) => promise.then(
  () => { throw new Error('expected the call to be refused'); },
  (error: unknown) => error as { getResponse(): Record<string, unknown> },
);
const writes = (statements: Statement[]) => statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE)/.test(s.sql));

describe('SPM-139 a disabled registration is refused with REGISTRATION_DISABLED', () => {
  it('register: an event whose registration is switched off -> 422 REGISTRATION_DISABLED, no INSERT', async () => {
    const fake = scripted({ event: [event({ registration_enabled: false })] });

    const error = await refusal(serviceFor(fake.database).register(ATTENDEE, EVENT_ID, BODY));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({ statusCode: 422, code: 'REGISTRATION_DISABLED', message: 'Registration is not available for this event.' });
    expect(writes(fake.statements).some((s) => /INSERT INTO event_registrations/.test(s.sql))).toBe(false);
  });

  it('joinWaitlist: an event whose registration is switched off -> 422 REGISTRATION_DISABLED, no INSERT', async () => {
    const fake = scripted({ event: [event({ registration_enabled: false })] });

    const error = await refusal(serviceFor(fake.database).joinWaitlist(ATTENDEE, EVENT_ID, {}));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({ code: 'REGISTRATION_DISABLED' });
    expect(fake.statements.some((s) => /INSERT INTO event_registrations/.test(s.sql))).toBe(false);
  });
});

describe('SPM-61 register: an event without stored window dates', () => {
  /** An enabled Confirmed event with no opening or closing instant has no window to be outside of, so it is open. */
  it('treats missing opening and closing times as open and stores the registration', async () => {
    const saved: Row = { id: REG_ID, event_id: EVENT_ID, attendee_id: ATTENDEE.uid, full_name: 'Alice Tan', email: 'alice@example.com', contact_number: '+6591234567', status: 'Registered', created_at: NOW, withdrawn_at: null };
    const fake = scripted({ event: [event({ registration_opens_at: undefined, registration_closes_at: undefined })], inserted: [saved] });

    const result = await serviceFor(fake.database).register(ATTENDEE, EVENT_ID, BODY);

    expect(result.registration).toMatchObject({ id: REG_ID, status: 'registered', eventName: 'Tech Talk' });
    expect(fake.statements.filter((s) => /^\s*INSERT INTO event_registrations/.test(s.sql))).toHaveLength(1);
  });
});

describe('SPM-136 an organiser or the assigned coordinator cannot join the waitlist of their own event', () => {
  it.each([
    ['the organiser', ORGANISER_ID],
    ['the assigned coordinator', COORDINATOR_ID],
  ])('%s -> 403 WAITLIST_NOT_PERMITTED and no write', async (_name, uid) => {
    const fake = scripted({ event: [event()] });

    const error = await refusal(serviceFor(fake.database).joinWaitlist({ uid, roles: ['ATTENDEE'] }, EVENT_ID, {}));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ code: 'WAITLIST_NOT_PERMITTED', message: 'An organiser or the assigned coordinator cannot join the waiting list for their own event.' });
    expect(writes(fake.statements)).toEqual([]);
  });
});

describe('SPM-138 findMine reads a settled waiting list', () => {
  const waitlisted: Row = { id: REG_ID, event_id: EVENT_ID, attendee_id: ATTENDEE.uid, status: 'Waitlisted', event_name: 'Tech Talk', created_at: NOW, joined_at: new Date('2026-10-03T00:00:00Z'), waitlist_position: '2', withdrawn_at: null };

  it('shows a waiting entry with its numeric position and the time it joined', async () => {
    const fake = scripted({ mine: [[waitlisted]], due: [] });

    const { registration } = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);

    expect(registration).toMatchObject({ status: 'waitlisted', waitlistPosition: 2, joinedAt: '2026-10-03T00:00:00.000Z' });
  });

  it('re-reads after a closed list was settled, so the entry shows as removed', async () => {
    const removed: Row = { ...waitlisted, status: 'Removed', waitlist_position: null };
    const fake = scripted({ mine: [[waitlisted], [removed]], due: [{ '?column?': 1 }], settled: [{ id: REG_ID }] });

    const { registration } = await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);

    expect(registration).toMatchObject({ status: 'removed', waitlistPosition: null });
    expect(fake.statements.filter((s) => /SELECT r\.\*, e\.event_name/.test(s.sql))).toHaveLength(2);
  });

  it('keeps the first read when the due check finds nothing to settle', async () => {
    const fake = scripted({ mine: [[waitlisted]], due: [] });
    await serviceFor(fake.database).findMine(ATTENDEE, EVENT_ID);
    expect(fake.statements.filter((s) => /SELECT r\.\*, e\.event_name/.test(s.sql))).toHaveLength(1);
  });
});

describe('SPM-120 and SPM-138 withdraw', () => {
  const found: Row = { id: REG_ID, event_name: 'Tech Talk', start_date_time: new Date('2026-10-12T02:00:00Z'), event_status: 'Confirmed', event_id: EVENT_ID };

  it('a Removed entry cannot be withdrawn -> 409 registration_not_withdrawable, no UPDATE of the entry', async () => {
    const fake = scripted({ found: [found], statuses: ['Removed'] });

    const error = await refusal(serviceFor(fake.database).withdraw(ATTENDEE, REG_ID, undefined));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ statusCode: 409, code: 'registration_not_withdrawable', message: 'This registration can no longer be withdrawn.' });
    expect(writes(fake.statements)).toEqual([]);
  });

  it('a waiting entry leaves the list: Withdrawn at the clock time, with the success message and nobody promoted', async () => {
    const left: Row = { id: REG_ID, event_id: EVENT_ID, attendee_id: ATTENDEE.uid, status: 'Withdrawn', created_at: NOW, withdrawn_at: NOW };
    const fake = scripted({ found: [found], statuses: ['Waitlisted', 'Waitlisted'], waitlistLeft: [left] });

    const result = await serviceFor(fake.database).withdraw(ATTENDEE, REG_ID, undefined);

    expect(result).toMatchObject({ id: REG_ID, status: 'withdrawn', withdrawnAt: NOW.toISOString(), message: 'Your withdrawal from Tech Talk has been processed.' });
    const withdraw = fake.statements.find((s) => /SET status = 'Withdrawn'/.test(s.sql));
    expect(withdraw?.params).toEqual([REG_ID, ATTENDEE.uid, NOW]);
    expect(fake.statements.some((s) => /INSERT INTO notifications|SET status = 'Registered'/.test(s.sql))).toBe(false);
  });

  it('a waiting entry that another request already withdrew -> 422 registration_already_withdrawn', async () => {
    const fake = scripted({ found: [found], statuses: ['Waitlisted', 'Waitlisted'], waitlistLeft: [] });

    const error = await refusal(serviceFor(fake.database).withdraw(ATTENDEE, REG_ID, undefined));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({ code: 'registration_already_withdrawn', message: 'This registration has already been withdrawn.' });
  });
});

describe('SPM-63 report with a status filter and waiting rows', () => {
  const coordinator: AuthenticatedUser = { uid: COORDINATOR_ID, roles: ['COORDINATOR'] };
  const waitingRow: Row = {
    id: 'w1', full_name: 'Wendy', email: 'w@example.com', contact_number: '+65000', created_at: NOW, status: 'Waitlisted',
    joined_at: new Date('2026-10-03T00:00:00Z'), waitlist_position: '1', special_requirements: null,
  };

  it('narrows the query to the requested statuses, de-duplicated, and lists a waiting row with position and join time', async () => {
    const fake = scripted({ event: [event()], reportRows: [waitingRow], counts: { confirmed: 1, waitlisted: 1 } });

    const report = await serviceFor(fake.database).getReport(coordinator, EVENT_ID, 'waitlisted, withdrawn,waitlisted');

    const listing = fake.statements.find((s) => /r\.status = ANY/.test(s.sql));
    expect(listing?.params).toEqual([EVENT_ID, ['Waitlisted', 'Withdrawn']]);
    expect(report.waitlistCount).toBe(1);
    expect(report.registrations).toEqual([
      { registrationId: 'w1', fullName: 'Wendy', email: 'w@example.com', contactNumber: '+65000', registeredAt: NOW.toISOString(), status: 'waitlisted', waitlistPosition: 1, joinedAt: '2026-10-03T00:00:00.000Z' },
    ]);
  });

  it('lists every stored status when no filter is given', async () => {
    const fake = scripted({ event: [event()], reportRows: [] });
    await serviceFor(fake.database).getReport(coordinator, EVENT_ID);
    const listing = fake.statements.find((s) => /r\.status = ANY/.test(s.sql));
    expect(listing?.params[1]).toEqual(['Registered', 'Waitlisted', 'Withdrawn', 'Removed', 'Cancelled']);
  });
});
