import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { StatusService } from './status.service.js';

const EVENT = '11111111-1111-4111-8111-111111111381';

/**
 * Builds the status service with a database that records every query. A caller with no verified identity
 * must be refused before the service reads or writes anything.
 */
function serviceWithRecordedDatabase() {
  const database = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (work: (client: unknown) => unknown) => work({ query: vi.fn() })),
  };
  const service = new StatusService(
    database as never,
    { read: vi.fn() } as never,
    { view: vi.fn(), read: vi.fn() } as never,
    { read: vi.fn() } as never,
    { now: () => new Date('2026-10-12T04:00:00Z') } as never,
    { cancel: vi.fn() } as never,
  );
  return { service, database };
}

describe('status service: callers without a verified identity', () => {
  /** A call with no identity at all is refused with 401 and touches no data. */
  it('refuses a status-history read when there is no identity, without querying the database', async () => {
    const { service, database } = serviceWithRecordedDatabase();

    await expect(service.statusHistory(undefined, EVENT)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  /** An identity without a user id is treated the same as no identity: refused with 401 and no data access. */
  it('refuses a confirmed-arrangements read when the identity has no user id', async () => {
    const { service, database } = serviceWithRecordedDatabase();
    const anonymous = { uid: '', roles: ['ORGANISER'], email: '', name: '' } as AuthenticatedUser;

    await expect(service.confirmedArrangements(anonymous, EVENT)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
  });
});
