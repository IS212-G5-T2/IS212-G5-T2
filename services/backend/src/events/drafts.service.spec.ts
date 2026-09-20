import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftsService } from './drafts.service.js';
import { DraftsController } from './drafts.controller.js';
import type { EventsService } from './events.service.js';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  transaction: vi.fn(),
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
const operationId = randomUUID();
const fields = { name: 'Original', expectedAttendance: '25' };
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
const events = { identity: vi.fn(), create: vi.fn(), get: vi.fn() };
let service: DraftsService;
const client = { query: db.transaction, release: db.release };
beforeEach(() => {
  vi.resetAllMocks();
  events.identity.mockReturnValue({ id: 'current-user' });
  events.create.mockResolvedValue({ event: { id }, message: 'Submitted' });
  db.connect.mockResolvedValue(client);
  db.transaction.mockResolvedValue({ rows: [] });
  service = new DraftsService(events as unknown as EventsService);
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
  service.submit(id, {
    version: 1,
    startDateTime: '2030-01-02T10:00:00Z',
    endDateTime: '2030-01-02T11:00:00Z',
  });

describe('SPM-37 Q1 service contract and failures', () => {
  it('Q1-023 lists, retrieves and serializes saved records', async () => {
    db.query.mockResolvedValue({ rows: [row()] });
    expect(await service.list()).toEqual([
      expect.objectContaining({
        id,
        status: 'Draft',
        fields,
        version: 1,
        eventId: null,
        updatedAt: '2030-01-01T00:00:00.000Z',
      }),
    ]);
    expect(await service.get(id)).toMatchObject({ id, fields });
    db.query.mockResolvedValue({ rows: [] });
    expect(await service.list()).toEqual([]);
    await expect(service.get(id)).rejects.toMatchObject({ status: 404 });
    await service.onModuleDestroy();
    expect(db.end).toHaveBeenCalledOnce();
  });
  it('Q1-024 rejects malformed IDs before database access', async () => {
    await expect(service.get('bad')).rejects.toMatchObject({ status: 404 });
    await expect(service.save('bad', {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.submit('bad', {})).rejects.toMatchObject({
      status: 404,
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('Q1-025 saves new and existing drafts and releases connections', async () => {
    selected({ ...row(), version: 0 });
    const body = { fields, version: 0, operationId };
    expect(await service.save(id, body)).toMatchObject({ id, version: 1 });
    expect(db.transaction).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_drafts'),
      expect.any(Array),
    );
    expect(db.transaction).toHaveBeenLastCalledWith('COMMIT');
    expect(db.release).toHaveBeenCalledOnce();
    db.transaction.mockClear();
    selected(row());
    await service.save(id, { ...body, version: 1 });
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('INSERT')),
    ).toBe(false);
  });
  it('Q1-026 retries identical save without issuing an update', async () => {
    const { validateDraft } = await import('./draft-input.js');
    const body = { fields, version: 0, operationId };
    selected({
      ...row(),
      fields: validateDraft(body).fields,
      last_operation: operationId,
    });
    expect(await service.save(id, body)).toMatchObject({ id, version: 1 });
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
  });
  it.each([
    ['missing', null, 404],
    ['submitted', { ...row(), status: 'Submitted' }, 409],
    ['stale', { ...row(), version: 2 }, 409],
    ['altered retry', { ...row(), last_operation: operationId }, 409],
  ])('Q1-027 rolls back %s save', async (_label, record, status) => {
    selected(record);
    await expect(
      service.save(id, { fields, version: 1, operationId }),
    ).rejects.toMatchObject({ status });
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
  ])('Q1-028 rejects submit version %j before connection', async (body) => {
    await expect(service.submit(id, body)).rejects.toMatchObject({
      status: 400,
    });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it.each([
    ['missing', null, 404],
    ['stale', { ...row(), version: 2 }, 409],
  ])('Q1-029 rolls back %s submission', async (_label, record, status) => {
    selected(record);
    await expect(submit()).rejects.toMatchObject({ status });
    expect(events.create).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(db.release).toHaveBeenCalledOnce();
  });
  it.each(['', '25'])(
    'Q1-030 submits saved snapshot, attendance %j, using the same transaction',
    async (attendance) => {
      selected({
        ...row(),
        fields: { ...fields, expectedAttendance: attendance },
      });
      expect(await submit()).toMatchObject({ event: { id } });
      expect(events.create).toHaveBeenCalledWith(
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
  it('Q1-031 returns original event on repeated submission', async () => {
    selected({ ...row(), status: 'Submitted', event_id: id });
    events.get.mockResolvedValue({ id });
    expect(await submit()).toMatchObject({ event: { id } });
    expect(events.get).toHaveBeenCalledWith(id);
    expect(events.create).not.toHaveBeenCalled();
  });
  it.each(['save', 'submit'] as const)(
    'Q1-032 releases connection and rolls back database failure on %s',
    async (action) => {
      db.transaction
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('storage failure'));
      await expect(
        action === 'save'
          ? service.save(id, { fields, version: 1, operationId })
          : submit(),
      ).rejects.toThrow('storage failure');
      expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
      expect(db.release).toHaveBeenCalledOnce();
      expect(db.transaction).not.toHaveBeenCalledWith('COMMIT');
    },
  );
  it('Q1-033 rolls back when event creation fails', async () => {
    selected(row());
    events.create.mockRejectedValue(new Error('event creation failed'));
    await expect(submit()).rejects.toThrow('event creation failed');
    expect(db.transaction).toHaveBeenLastCalledWith('ROLLBACK');
    expect(
      db.transaction.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it('Q1-034 controller forwards exact contracts to service', async () => {
    const mock = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(row()),
      save: vi.fn().mockResolvedValue(row()),
      submit: vi.fn().mockResolvedValue({ event: { id } }),
    };
    const controller = new DraftsController(mock as unknown as DraftsService);
    const body = { version: 1 };
    expect(await controller.list()).toEqual([]);
    expect(await controller.get(id)).toEqual(row());
    expect(await controller.save(id, body)).toEqual(row());
    expect(await controller.submit(id, body)).toEqual({ event: { id } });
    expect(mock.get).toHaveBeenCalledWith(id);
    expect(mock.save).toHaveBeenCalledWith(id, body);
    expect(mock.submit).toHaveBeenCalledWith(id, body);
  });
});
