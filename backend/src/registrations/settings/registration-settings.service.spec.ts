import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { RegistrationSettingsService } from './registration-settings.service.js';

describe('SPM-139 settings service guard', () => {
  it('CONFIG-REG-01-D: refuses a request with no signed-in user before any database read', async () => {
    const service = new RegistrationSettingsService({} as never);
    await expect(service.get(undefined, '00000000-0000-4000-8000-000000000139')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

const EVENT_ID = '00000000-0000-4000-8000-000000000139';
const COORDINATOR: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'] };
const NOW = new Date('2026-10-04T04:00:00.000Z');
const OPENS = new Date('2026-10-05T00:00:00.000Z');
const CLOSES = new Date('2026-10-10T00:00:00.000Z');

interface Script {
  row?: Record<string, unknown> | null;
  counts?: number[];
  waiting?: Array<{ id: string; attendee_id: string }>;
}

function harness(script: Script = {}) {
  const row = script.row === null ? undefined : {
    id: EVENT_ID, coordinator_id: 'coo-01', status: 'Planning', start_date_time: new Date('2026-10-12T02:00:00.000Z'),
    registration_enabled: true, registration_opens_at: OPENS, registration_closes_at: CLOSES, registration_limit: 3,
    registration_settings_version: 4, ...script.row,
  };
  const counts = [...(script.counts ?? [2])];
  const waiting = [...(script.waiting ?? [])];
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const answer = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (/FROM events WHERE id = \$1/.test(sql) && /SELECT id, coordinator_id/.test(sql)) return { rows: row ? [row] : [] };
    if (/COUNT\(\*\)::integer AS count/.test(sql)) return { rows: [{ count: counts.length > 1 ? counts.shift() : counts[0] }] };
    if (/registration_limit AS capacity/.test(sql)) return { rows: [{ capacity: (statements.find((s) => /^\s*UPDATE events/.test(s.sql))?.params[4] as number) ?? 3, name: 'Gala' }] };
    if (/SET status = 'Removed'/.test(sql)) return { rows: [] };
    if (/status = 'Waitlisted'\s+ORDER BY joined_at/.test(sql)) return { rows: waiting.length ? [waiting.shift()] : [] };
    return { rows: [], rowCount: 1 };
  });
  const client = { query: answer };
  const database = { query: answer, transaction: vi.fn(async (work: (c: typeof client) => unknown) => work(client)) };
  const service = new RegistrationSettingsService(database as never, { now: () => NOW });
  const writes = () => statements.filter((s) => /^\s*(UPDATE|INSERT|DELETE)/.test(s.sql) && !/SET status = 'Removed'/.test(s.sql));
  return { service, statements, writes, database };
}

const refusal = (promise: Promise<unknown>) => promise.then(
  () => { throw new Error('expected the call to be refused'); },
  (error: unknown) => error as { getResponse(): Record<string, unknown> },
);

describe('SPM-139 reading the registration settings (CONFIG-REG case group 01)', () => {
  /** CONFIG-REG-01-A: the assigned coordinator reads the saved period, capacity, Confirmed count and version. */
  it('returns the saved settings with ISO dates, the Confirmed count and the version', async () => {
    const { service } = harness({ counts: [2] });

    await expect(service.get(COORDINATOR, EVENT_ID)).resolves.toEqual({
      eventId: EVENT_ID, registrationEnabled: true, registrationOpensAt: OPENS.toISOString(),
      registrationClosesAt: CLOSES.toISOString(), capacity: 3, confirmedCount: 2, version: 4,
    });
  });

  it('returns null dates when the period has never been set', async () => {
    const { service } = harness({ row: { registration_enabled: false, registration_opens_at: null, registration_closes_at: null } });

    await expect(service.get(COORDINATOR, EVENT_ID)).resolves.toMatchObject({ registrationEnabled: false, registrationOpensAt: null, registrationClosesAt: null });
  });

  /** CONFIG-REG-01-D: access checks run before any data is read. */
  it('refuses a non-coordinator with 403 before reading', async () => {
    const { service, statements } = harness();
    await expect(service.get({ uid: 'org-1', roles: ['ORGANISER'] }, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(statements).toEqual([]);
  });

  it('answers 404 for a malformed id without querying', async () => {
    const { service, statements } = harness();
    await expect(service.get(COORDINATOR, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(statements).toEqual([]);
  });

  it('answers 404 for an unknown event', async () => {
    const { service } = harness({ row: null });
    await expect(service.get(COORDINATOR, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 403 for a coordinator who is not assigned, and reads no count', async () => {
    const { service, statements } = harness({ row: { coordinator_id: 'coo-99' } });
    await expect(service.get(COORDINATOR, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(statements.some((s) => /COUNT/.test(s.sql))).toBe(false);
  });
});

describe('SPM-139 saving the registration settings (CONFIG-REG case group 02)', () => {
  const save = (service: RegistrationSettingsService, body: unknown) => service.update(COORDINATOR, EVENT_ID, body);

  it('saves new settings in one locked transaction, bumps the version and returns the saved message', async () => {
    const { service, statements, writes } = harness({ counts: [2] });

    const result = await save(service, { version: 4, capacity: 3, registrationClosesAt: '2026-10-09T00:00:00Z' });

    expect(result).toEqual({
      eventId: EVENT_ID, registrationEnabled: true, registrationOpensAt: OPENS.toISOString(),
      registrationClosesAt: '2026-10-09T00:00:00.000Z', capacity: 3, confirmedCount: 2, version: 5,
      message: 'Registration settings saved.',
    });
    expect(statements[0].sql).toContain('FOR UPDATE');
    expect(writes()).toHaveLength(1);
    expect(writes()[0].params).toEqual([EVENT_ID, true, OPENS, new Date('2026-10-09T00:00:00Z'), 3, NOW]);
  });

  it('refuses a save for an event that is not Approved, Planning or Confirmed with 409 EVENT_NOT_CONFIGURABLE', async () => {
    const { service, writes } = harness({ row: { status: 'Completed' } });

    const error = await refusal(save(service, { version: 4 }));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'EVENT_NOT_CONFIGURABLE', message: 'Registration details can only be set while the event is Approved, Planning or Confirmed.' });
    expect(writes()).toEqual([]);
  });

  it('refuses a malformed body with 400 naming the field', async () => {
    const { service, writes } = harness();

    const error = await refusal(save(service, { version: 4, registrationOpensAt: 'tomorrow' }));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'INVALID_DATETIME', errors: { registrationOpensAt: expect.stringContaining('offset') } });
    expect(writes()).toEqual([]);
  });

  it('refuses a stale version with 409 SETTINGS_CONFLICT', async () => {
    const { service, writes } = harness();

    const error = await refusal(save(service, { version: 3 }));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'SETTINGS_CONFLICT', message: 'These settings were changed elsewhere. Reload and try again.' });
    expect(writes()).toEqual([]);
  });

  it('refuses a capacity below the Confirmed count with 422 and the count in the message', async () => {
    const { service, writes } = harness({ counts: [2] });

    const error = await refusal(save(service, { version: 4, capacity: 1 }));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'CAPACITY_BELOW_CONFIRMED',
      message: 'Capacity cannot be lower than the number of Confirmed registrations (2).',
      errors: { capacity: 'Capacity cannot be lower than the number of Confirmed registrations (2).' },
    });
    expect(writes()).toEqual([]);
  });

  /** BR10: a capacity increase lets the earliest waiting entries take the new places in the same transaction. */
  it('promotes waiting entries into the new places when capacity rises, and reports the new Confirmed count', async () => {
    const { service, writes } = harness({ counts: [2, 2], waiting: [{ id: 'w1', attendee_id: 'a1' }] });

    const result = await save(service, { version: 4, capacity: 4 });

    expect(result).toMatchObject({ capacity: 4, confirmedCount: 3, version: 5 });
    expect(writes().map((w) => w.sql.trim().split(/\s+/).slice(0, 3).join(' '))).toEqual([
      'UPDATE events SET',
      'UPDATE event_registrations SET',
      'INSERT INTO notifications',
    ]);
  });

  it('does not touch the waiting list when capacity is unchanged', async () => {
    const { service, statements } = harness({ counts: [2] });
    await save(service, { version: 4 });
    expect(statements.some((s) => /ORDER BY joined_at/.test(s.sql))).toBe(false);
  });
});
