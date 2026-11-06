import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { StatusService } from './status.service.js';

const EVENT = '11111111-1111-4111-8111-111111111392';
const COORDINATOR: AuthenticatedUser = { uid: 'coord-a', roles: ['COORDINATOR'] };

/**
 * The event is assigned to the caller when the pre-check reads it, then reassigned to another coordinator before the
 * transaction locks the row. The locked re-check (D4) must refuse the confirmation and write nothing.
 */
describe('status service: a reassignment between the pre-check and the lock', () => {
  /** A coordinator reassigned after the pre-check is refused with 403 on the locked row, and nothing is written. */
  it('CONFIRM-EVENT-SUP-43 refuses a confirmation when the locked row names another coordinator', async () => {
    const row = { id: EVENT, status: 'Planning', event_name: 'Race Event', organiser_id: 'org-1', coordinator_id: 'coord-a' };
    const database = {
      query: vi.fn(async () => ({ rows: [row], rowCount: 1 })),
      transaction: vi.fn(async (work: (client: unknown) => unknown) => {
        const client = {
          query: vi.fn(async (sql: string) => {
            if (sql.includes('FOR UPDATE')) return { rows: [{ ...row, coordinator_id: 'coord-b' }], rowCount: 1 };
            return { rows: [], rowCount: 0 };
          }),
        };
        const result = await work(client);
        return { result, client };
      }),
    };
    const service = new StatusService(
      database as never,
      { read: vi.fn() } as never,
      { view: vi.fn(), read: vi.fn() } as never,
      { read: vi.fn() } as never,
      { now: () => new Date('2026-10-12T04:00:00Z') } as never,
      { cancel: vi.fn() } as never,
    );

    await expect(service.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Confirmed' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).toHaveBeenCalled();
  });
});
