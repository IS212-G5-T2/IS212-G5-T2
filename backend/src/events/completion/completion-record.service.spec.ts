/*
 * SPM-153 AC5 (COMPLETE-EVENT-05-F): the completion record service refuses a caller it cannot identify, and a save
 * whose locked event row names another coordinator (a reassignment between the pre-check and the lock).
 */
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { CompletionRecordService } from './completion-record.service.js';

const EVENT = '11111111-1111-4111-8111-111111111153';
const COORDINATOR: AuthenticatedUser = { uid: 'coord-a', roles: ['COORDINATOR'] };
const VALID_BODY = { attendanceCount: 10 };

describe('COMPLETE-EVENT-05-F: completion record authorisation', () => {
  it('COMPLETE-EVENT-05-F: a read without an identity is refused with 401', async () => {
    const service = new CompletionRecordService({ query: vi.fn() } as never);

    await expect(service.read(undefined, EVENT)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('COMPLETE-EVENT-05-F: a save whose locked row names another coordinator is refused with 403 and writes nothing', async () => {
    const query = vi.fn(async () => ({ rows: [{ coordinator_id: 'coord-a' }], rowCount: 1 }));
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE')) return { rows: [{ id: EVENT, status: 'Completed', coordinator_id: 'coord-b' }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const database = { query, transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)) };
    const service = new CompletionRecordService(database as never);

    await expect(service.save(COORDINATOR, EVENT, VALID_BODY)).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO completion_records'))).toBe(false);
  });

  it('COMPLETE-EVENT-05-F: a save whose event row has disappeared is refused with 404', async () => {
    const query = vi.fn(async () => ({ rows: [{ coordinator_id: 'coord-a' }], rowCount: 1 }));
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    const database = { query, transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)) };
    const service = new CompletionRecordService(database as never);

    await expect(service.save(COORDINATOR, EVENT, VALID_BODY)).rejects.toBeInstanceOf(NotFoundException);
  });
});
