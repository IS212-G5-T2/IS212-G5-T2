/*
 * SPM-153 AC6 (COMPLETE-EVENT-06-D): the equipment requests of a Completed event cannot be changed, reserved or
 * marked cannot-provide. The repository reports the refusal and the service answers 409 EVENT_COMPLETED (MSG-CP-06).
 */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { DatabaseService } from '../../database/database.service.js';
import { EquipmentRequestsRepository } from './equipment-requests.repository.js';
import { EquipmentRequestsService } from './equipment-requests.service.js';

const EVENT = '00000000-0000-4000-8000-000000000125';
const REQUEST = '00000000-0000-4000-8000-000000000099';
const COORDINATOR: AuthenticatedUser = { uid: '00000000-0000-4000-8000-000000000126', roles: ['COORDINATOR'] };
const SUPPORT: AuthenticatedUser = { uid: 'support-1', roles: ['TECH_SUPPORT'] };
const BODY = { eventId: EVENT, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] };

/** The locked request row, joined to a Completed event. */
function completedRepository() {
  const row = {
    id: REQUEST,
    event_id: EVENT,
    status: 'Pending Review',
    request_status: 'Pending Review',
    event_status: 'Completed',
    start_date_time: new Date('2026-10-10T02:00:00Z'),
    end_date_time: new Date('2026-10-10T04:00:00Z'),
  };
  const client = { query: vi.fn(async () => ({ rows: [row], rowCount: 1 })) };
  const database = { transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)), query: vi.fn() };
  return new EquipmentRequestsRepository(database as unknown as DatabaseService, { now: () => new Date('2026-10-12T04:00:00Z') });
}

describe('COMPLETE-EVENT-06-D: the equipment repository refuses a Completed event', () => {
  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: update reports event-completed and writes no item', async () => {
    await expect(completedRepository().update(COORDINATOR.uid, REQUEST, { ...BODY, items: BODY.items.map((i) => ({ ...i, equipmentType: 'Audio' as const })) })).resolves.toEqual({ kind: 'event-completed' });
  });

  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: reserve reports event-completed', async () => {
    await expect(completedRepository().reserve(REQUEST)).resolves.toEqual({ kind: 'event-completed' });
  });

  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: markCannotProvide reports event-completed', async () => {
    await expect(completedRepository().markCannotProvide(REQUEST, 'Out for repair')).resolves.toEqual({ kind: 'event-completed' });
  });
});

describe('COMPLETE-EVENT-06-D: the equipment service answers 409 EVENT_COMPLETED', () => {
  function serviceWith(kind: 'event-completed') {
    const repository = {
      update: vi.fn(async () => ({ kind })),
      reserve: vi.fn(async () => ({ kind })),
      markCannotProvide: vi.fn(async () => ({ kind })),
    };
    return { service: new EquipmentRequestsService(repository as never), repository };
  }

  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: update is refused with 409 EVENT_COMPLETED', async () => {
    const { service } = serviceWith('event-completed');

    const error = await service.update(COORDINATOR, REQUEST, BODY).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'EVENT_COMPLETED',
      message: 'The date, time, venue and equipment of a Completed event cannot be changed.',
    });
  });

  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: reserve is refused with 409 EVENT_COMPLETED', async () => {
    const { service } = serviceWith('event-completed');

    await expect(service.reserve(SUPPORT, REQUEST)).rejects.toMatchObject({ response: { code: 'EVENT_COMPLETED' } });
  });

  // Traceability: Jira 153 AC6 (matrix 35979372)
  it('COMPLETE-EVENT-06-D: markCannotProvide is refused with 409 EVENT_COMPLETED', async () => {
    const { service } = serviceWith('event-completed');

    await expect(service.markCannotProvide(SUPPORT, REQUEST, { reason: 'Out for repair' })).rejects.toMatchObject({
      response: { code: 'EVENT_COMPLETED' },
    });
  });
});
