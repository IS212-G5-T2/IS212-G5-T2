import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DraftsService } from './drafts.service.js';
import { DraftsController } from './drafts.controller.js';
import type { EventsService } from '../events/events.service.js';
import type { DatabaseService } from '../database/database.service.js';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  transaction: vi.fn(),
  withTransaction: vi.fn(),
  release: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Pool: class {
      query = db.query;
      connect = db.connect;
      end = db.end;
    },
  },
}));
const id = '00000000-0000-4000-8000-000000000037';
const operationId = '00000000-0000-4000-8000-0000000000a1';
const fields = { name: 'Original', expectedAttendance: '25' };
const identity: AuthenticatedUser = {
  uid: 'current-user',
  roles: ['ORGANISER'],
  email: 'organiser@example.test',
  name: 'Current User',
};
const row = () => ({
  id,
  organiser_id: 'current-user',
  fields,
  status: 'Draft',
  version: 1,
  last_operation: null,
  event_id: null,
  updated_at: new Date('2030-01-01Z'),
});
const events = { create: vi.fn(), get: vi.fn() };
const database = {
  query: db.query,
  transaction: db.withTransaction,
};
let service: DraftsService;
const client = { query: db.transaction, release: db.release };
beforeEach(() => {
  vi.resetAllMocks();
  events.create.mockResolvedValue({ event: { id }, message: 'Submitted' });
  db.transaction.mockResolvedValue({ rows: [] });
  db.withTransaction.mockImplementation(async (work) => {
    await db.transaction('BEGIN');
    try {
      const result = await work(client);
      await db.transaction('COMMIT');
      return result;
    } catch (error) {
      await db.transaction('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  });
  service = new DraftsService(
    events as unknown as EventsService,
    database as unknown as DatabaseService,
  );
});
function selected(value: object | null) {
  db.transaction.mockImplementation(async (sql: string) => ({
    rows:
      sql.startsWith('SELECT') && value
        ? [value]
        : sql.startsWith('UPDATE') && value
          ? [{ ...value, version: (value as { version: number }).version + 1 }]
          : [],
  }));
}
const submit = () =>
  service.submit(identity, id, {
    version: 1,
    startDateTime: '2030-01-02T10:00:00Z',
    endDateTime: '2030-01-02T11:00:00Z',
  });

describe('SPM-37 Q1 service contract and failures', () => {
  it('EVE-DRF-SUP-01 lists, retrieves and serializes saved records', async () => {
    db.query.mockResolvedValue({ rows: [row()] });
    expect(await service.list(identity)).toEqual([
      expect.objectContaining({
        id,
        status: 'Draft',
        fields,
        version: 1,
        eventId: null,
        updatedAt: '2030-01-01T00:00:00.000Z',
      }),
    ]);
    expect(await service.get(identity, id)).toMatchObject({ id, fields });
    db.query.mockResolvedValue({ rows: [] });
    expect(await service.list(identity)).toEqual([]);
    await expect(service.get(identity, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('EVE-DRF-SUP-02 rejects malformed IDs before database access', async () => {
    await expect(service.get(identity, 'bad')).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.save(identity, 'bad', {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.submit(identity, 'bad', {})).rejects.toMatchObject({
      status: 404,
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
  // Drafts are organiser-only, matching AGENTS.md's events-boundary policy.
  it('EVE-DRF-SUP-03 rejects all draft operations without an authenticated identity', async () => {
    await expect(service.list(undefined)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.get(undefined, id)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.save(undefined, id, {})).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.submit(undefined, id, {})).rejects.toMatchObject({
      status: 401,
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('EVE-DRF-SUP-04 rejects draft operations from a caller without the organiser role', async () => {
    const coordinator: AuthenticatedUser = {
      uid: 'coord-9',
      roles: ['COORDINATOR'],
    };
    await expect(service.list(coordinator)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.get(coordinator, id)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.query).not.toHaveBeenCalled();
  });
  /** EVE-DRF-04-A: saving new and existing drafts persists them and releases the connection (Q1-025). */
  it('Q1-025 saves new and existing drafts and releases connections', async () => {
    selected({ ...row(), version: 0 });
    const body = { fields, version: 0, operationId };
    expect(await service.save(identity, id, body)).toMatchObject({
      id,
      version: 1,
    });
    expect(db.transaction).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_drafts'),
      expect.any(Array),
    );
    expect(db.transaction).toHaveBeenLastCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledOnce();
    db.transaction.mockClear();
    selected(row());
    await service.save(identity, id, { ...body, version: 1 });
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('INSERT')),
    ).toBe(false);
  });
  /** EVE-DRF-04-B: an identical retry returns the stored draft without an update (Q1-026). */
  it('Q1-026 retries identical save without issuing an update', async () => {
    const { validateDraft } = await import('./dto/draft-input.js');
    const body = { fields, version: 0, operationId };
    selected({
      ...row(),
      fields: validateDraft(body).fields,
      last_operation: operationId,
    });
    expect(await service.save(identity, id, body)).toMatchObject({
      id,
      version: 1,
    });
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
  });
  /**
   * EVENT-DRF-05-A / 05-C / 07-A: each refused save returns its documented 409 message, so a stale,
   * reused-identifier or submitted-draft conflict is distinguishable to the organiser.
   */
  /** EVE-DRF-05-A, EVE-DRF-05-C, EVE-DRF-07-A: refused saves roll back and return the documented 409 message (Q1-027). */
  it.each([
    ['missing', null, 404, 'Request not found.'],
    [
      'submitted',
      { ...row(), status: 'Submitted' },
      409,
      'This request was submitted. Use Event Change Requests for further changes.',
    ],
    [
      'stale',
      { ...row(), version: 2 },
      409,
      'This draft changed in another window. Reopen it before saving again.',
    ],
    [
      'altered retry',
      { ...row(), last_operation: operationId },
      409,
      'A save identifier cannot be reused for different values.',
    ],
  ])('EVE-DRF-SUP-05 rolls back %s save', async (_label, record, status, message) => {
    selected(record);
    await expect(
      service.save(identity, id, { fields, version: 1, operationId }),
    ).rejects.toMatchObject({ status, message });
    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it.each([
    null,
    {},
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: '1' },
    { version: Number.MAX_SAFE_INTEGER + 1 },
  ])('EVE-DRF-SUP-06 rejects submit version %j before connection', async (body) => {
    await expect(service.submit(identity, id, body)).rejects.toMatchObject({
      status: 400,
    });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it.each([
    ['missing', null, 404],
    ['stale', { ...row(), version: 2 }, 409],
  ])('EVE-DRF-SUP-07 rolls back %s submission', async (_label, record, status) => {
    selected(record);
    await expect(submit()).rejects.toMatchObject({ status });
    expect(events.create).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(db.release).toHaveBeenCalledOnce();
  });
  it.each(['', '25'])(
    'EVE-DRF-SUP-08 submits saved snapshot, attendance %j, using the same transaction',
    async (attendance) => {
      selected({
        ...row(),
        fields: { ...fields, expectedAttendance: attendance },
      });
      expect(await submit()).toMatchObject({ event: { id } });
      expect(events.create).toHaveBeenCalledWith(
        identity,
        expect.objectContaining({
          name: 'Original',
          expectedAttendance: attendance === '' ? null : 25,
          submissionKey: id,
        }),
        client,
        id,
      );
      expect(db.transaction).toHaveBeenCalledWith(
        expect.stringContaining("status='Submitted'"),
        [id, id],
      );
      expect(db.transaction).toHaveBeenLastCalledWith('COMMIT');
    },
  );
  it('EVE-DRF-SUP-09 returns original event on repeated submission', async () => {
    selected({ ...row(), status: 'Submitted', event_id: id });
    events.get.mockResolvedValue({ id });
    expect(await submit()).toMatchObject({ event: { id } });
    expect(events.get).toHaveBeenCalledWith(identity, id);
    expect(events.create).not.toHaveBeenCalled();
  });
  it.each(['save', 'submit'] as const)(
    'EVE-DRF-SUP-10 releases connection and rolls back database failure on %s',
    async (action) => {
      db.transaction
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('storage failure'));
      await expect(
        action === 'save'
          ? service.save(identity, id, { fields, version: 1, operationId })
          : submit(),
      ).rejects.toThrow('storage failure');
      expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
      expect(db.release).toHaveBeenCalledOnce();
      expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    },
  );
  it('EVE-DRF-SUP-11 rolls back when event creation fails', async () => {
    selected(row());
    events.create.mockRejectedValue(new Error('event creation failed'));
    await expect(submit()).rejects.toThrow('event creation failed');
    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it('EVE-DRF-SUP-12 controller forwards exact contracts to service', async () => {
    const mock = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(row()),
      save: vi.fn().mockResolvedValue(row()),
      submit: vi.fn().mockResolvedValue({ event: { id } }),
    };
    const controller = new DraftsController(mock as unknown as DraftsService);
    const body = { version: 1 };
    const request = {
      [CURRENT_USER_REQUEST_KEY]: identity,
    } as Parameters<DraftsController['list']>[0];
    expect(await controller.list(request)).toEqual([]);
    expect(await controller.get(id, request)).toEqual(row());
    expect(await controller.save(id, body, request)).toEqual(row());
    expect(await controller.submit(id, body, request)).toEqual({
      event: { id },
    });
    expect(mock.list).toHaveBeenCalledWith(identity);
    expect(mock.get).toHaveBeenCalledWith(identity, id);
    expect(mock.save).toHaveBeenCalledWith(identity, id, body);
    expect(mock.submit).toHaveBeenCalledWith(identity, id, body);
  });
});

// Supporting service-level checks for EVE-DRF-09. The two-user HTTP and PostgreSQL cases are in
// backend/test/drafts.e2e-spec.ts, which is not run in this suite.
describe('SPM-37 owner isolation, service level (supporting)', () => {
  it('EVE-DRF-SUP-13 saves under the verified caller and ignores a client-supplied organiserId', async () => {
    selected({ ...row(), version: 0 });
    await service.save(identity, id, {
      fields,
      version: 0,
      operationId,
      organiserId: 'draft-other',
    });
    const insert = db.transaction.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_drafts'),
    );
    expect(insert?.[1]).toEqual([id, 'current-user', expect.any(String)]);
    expect(JSON.stringify(db.transaction.mock.calls)).not.toContain('draft-other');
  });

  it('EVE-DRF-SUP-14 locks and updates only the verified owner\'s row when saving', async () => {
    selected({ ...row(), version: 1 });
    await service.save(identity, id, { fields, version: 1, operationId });
    const lock = db.transaction.mock.calls.find(([sql]) =>
      String(sql).includes('FOR UPDATE'),
    );
    expect(lock?.[1]).toEqual([id, 'current-user']);
  });

  it('EVE-DRF-SUP-15 scopes direct-URL reads and the list to the verified owner', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.get(identity, id)).rejects.toMatchObject({ status: 404 });
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('organiser_id=$2'),
      [id, 'current-user'],
    );

    db.query.mockResolvedValueOnce({ rows: [] });
    await service.list(identity);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('organiser_id=$1'),
      ['current-user'],
    );
  });
});
