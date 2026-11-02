/*
 * SPM-153 (COMPLETE-EVENT-01-A to 02-C, 03-A): the Confirmed to Completed transition in the status service, unit level.
 * The database is a small stand-in: a pre-check read, the locked event row, the compare-and-set update and the history row.
 */
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { StatusService } from './status.service.js';

const EVENT = '11111111-1111-4111-8111-111111111154';
const NOW = new Date('2026-10-12T04:00:00.000Z');
const ENDED = new Date('2026-10-10T04:00:00.000Z');
const FUTURE = new Date('2026-10-20T04:00:00.000Z');
const COORDINATOR: AuthenticatedUser = { uid: 'coord-a', roles: ['COORDINATOR'] };

function service(opts: { status?: string; coordinator?: string; endDate?: Date; casRows?: number; missingLock?: boolean } = {}) {
  const { status = 'Confirmed', coordinator = 'coord-a', endDate = ENDED, casRows = 1, missingLock = false } = opts;
  const history: unknown[][] = [];
  const answer = (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT id, status, event_name, organiser_id, coordinator_id, end_date_time')) {
      return missingLock ? { rows: [], rowCount: 0 } : { rows: [{ id: EVENT, status, event_name: 'Gala', organiser_id: 'org-1', coordinator_id: coordinator, end_date_time: endDate }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, status, event_name, organiser_id, coordinator_id FROM events')) {
      return { rows: [{ id: EVENT, status, event_name: 'Gala', organiser_id: 'org-1', coordinator_id: coordinator }], rowCount: 1 };
    }
    if (sql.includes("SET status = 'Completed'")) return { rows: casRows ? [{ event_name: 'Gala' }] : [], rowCount: casRows };
    if (sql.includes('INSERT INTO event_status_history')) {
      history.push(params);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const client = { query: vi.fn(async (sql: string, params?: unknown[]) => answer(sql, params)) };
  const database = {
    query: vi.fn(async (sql: string, params?: unknown[]) => answer(sql, params)),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  const svc = new StatusService(database as never, { read: vi.fn() } as never, { view: vi.fn(), read: vi.fn() } as never, { read: vi.fn() } as never, { now: () => NOW } as never, { cancel: vi.fn() } as never);
  return { svc, history };
}

describe('COMPLETE-EVENT-01-A: a Confirmed event whose end has passed is completed once, with one history row', () => {
  it('COMPLETE-EVENT-01-A: returns the Completed status and the MSG-CP-01 text, and writes one Confirmed to Completed row', async () => {
    const { svc, history } = service();

    await expect(svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' })).resolves.toEqual({
      eventId: EVENT,
      status: 'Completed',
      message: 'Gala has been marked as Completed.',
    });
    expect(history).toEqual([[expect.any(String), EVENT, 'coord-a', NOW]]);
  });
});

describe('COMPLETE-EVENT-01-B and 01-D: the date and the assignment are checked', () => {
  it('COMPLETE-EVENT-01-B: an event whose end has not passed is refused with 422 EVENT_NOT_ENDED and no history row', async () => {
    const { svc, history } = service({ endDate: FUTURE });

    const error = await svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'EVENT_NOT_ENDED' });
    expect(history).toEqual([]);
  });

  it('COMPLETE-EVENT-01-D: a coordinator who is not assigned is refused with 403 before anything is read under the lock', async () => {
    const { svc, history } = service({ coordinator: 'coord-z' });

    await expect(svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(history).toEqual([]);
  });

  it('COMPLETE-EVENT-01-D: a row reassigned between the pre-check and the lock is refused with 403', async () => {
    const { svc, history } = service();
    const database = (svc as unknown as { database: { transaction: (work: (c: unknown) => unknown) => unknown } }).database;
    const original = database.transaction;
    database.transaction = (work) =>
      original(async (client: { query: (sql: string) => Promise<unknown> }) => work({
        query: async (sql: string) => (sql.includes('FOR UPDATE') ? { rows: [{ id: EVENT, status: 'Confirmed', coordinator_id: 'coord-z', end_date_time: ENDED }] } : client.query(sql)),
      }));

    await expect(svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(history).toEqual([]);
  });
});

describe('COMPLETE-EVENT-02-C and 02-E: only a Confirmed event completes, and only once', () => {
  it.each(['Planning', 'Approved', 'Completed'])('COMPLETE-EVENT-02-C: a %s event is refused with 409 EVENT_NOT_COMPLETABLE', async (status) => {
    const { svc, history } = service({ status });

    const error = await svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EVENT_NOT_COMPLETABLE' });
    expect(history).toEqual([]);
  });

  it('COMPLETE-EVENT-02-E: when the compare-and-set finds no Confirmed row, the second request is refused with 409', async () => {
    const { svc, history } = service({ casRows: 0 });

    await expect(svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' })).rejects.toBeInstanceOf(ConflictException);
    expect(history).toEqual([]);
  });

  it('COMPLETE-EVENT-02-C: a locked row that has disappeared is refused with 404', async () => {
    const { svc } = service({ missingLock: true });

    await expect(svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('COMPLETE-EVENT-03-A: the history row names the coordinator and the marking time', () => {
  it('COMPLETE-EVENT-03-A: the history row carries the session user and the injected clock', async () => {
    const { svc, history } = service();

    await svc.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' });

    expect(history[0]).toEqual([expect.any(String), EVENT, 'coord-a', NOW]);
  });
});
