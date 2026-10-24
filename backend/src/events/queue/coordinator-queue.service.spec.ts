// Story: SPM-48 Monitor Workspace Queue & Status (Coordinator)
// ACs: AC1 (my events only), AC4 (no cache), AC5 to AC9 (indicators merged per event)
// Test cases: MONITOR-QUEUE-01-A, 01-C, 01-D, 04-A, 05-B (unit level); MONITOR-QUEUE-01-SUP-FILTER
// The real database and routes are exercised in test/coordinator-queue.e2e-spec.ts.
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoordinatorQueueController } from './coordinator-queue.controller.js';
import { CoordinatorQueueService } from './coordinator-queue.service.js';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { EventsService } from '../events.service.js';

const NOW = new Date('2026-11-10T03:00:00.000Z');
const COORDINATOR: AuthenticatedUser = { uid: 'coo-1', roles: ['COORDINATOR'] } as unknown as AuthenticatedUser;

function setup(records: Array<Record<string, unknown>>, safety: unknown[] = [], bookings: unknown[] = []) {
  const list = vi.fn().mockResolvedValue(records);
  const query = vi
    .fn()
    .mockImplementation((sql: string) =>
      Promise.resolve({ rows: sql.includes('event_safety_checks') ? safety : bookings }),
    );
  const service = new CoordinatorQueueService(
    { list } as unknown as EventsService,
    { query } as unknown as DatabaseService,
    { now: () => NOW },
  );
  return { service, list, query };
}

describe('SPM-48 CoordinatorQueueService', () => {
  /** MONITOR-QUEUE-01-D: no session is 401; a signed-in user without the Coordinator role is 403 before any read. */
  it('MONITOR-QUEUE-01-D refuses a missing session and non-coordinators', async () => {
    const { service, list } = setup([]);
    await expect(service.queue(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.queue({ roles: ['COORDINATOR'] } as unknown as AuthenticatedUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const roles of [['ORGANISER'], ['ATTENDEE'], ['COORDINATOR_LEAD']]) {
      const refusal = service.queue({ uid: 'u', roles } as unknown as AuthenticatedUser);
      await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refusal).rejects.toThrow('Coordinator access required.');
    }
    expect(list).not.toHaveBeenCalled();
  });

  /** MONITOR-QUEUE-01-SUP-FILTER: an unknown status filter is a 400 that names it; nothing is read. */
  it('MONITOR-QUEUE-01-SUP-FILTER answers an unknown status with 400', async () => {
    const { service, list } = setup([]);
    const refusal = service.queue(COORDINATOR, 'Under Review');
    await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
    await expect(refusal).rejects.toThrow('Unknown status filter: Under Review.');
    expect(list).not.toHaveBeenCalled();
  });

  /** MONITOR-QUEUE-01-C: an empty assignment list returns [] without the indicator queries. */
  it('MONITOR-QUEUE-01-C returns an empty queue without further reads', async () => {
    const { service, list, query } = setup([]);
    await expect(service.queue(COORDINATOR)).resolves.toEqual([]);
    expect(list).toHaveBeenCalledWith(COORDINATOR);
    expect(query).not.toHaveBeenCalled();
  });

  /**
   * MONITOR-QUEUE-01-A, 01-SUP-FILTER: the coordinator's list is filtered by status, then each record keeps its fields and gains
   * its queue indicators; the indicator reads are scoped to the listed ids and the coordinator.
   */
  it('MONITOR-QUEUE-01-A adds indicators to each of the coordinator’s events', async () => {
    const records = [
      { id: 'e1', name: 'EVT-404', status: 'planning' },
      { id: 'e2', name: 'EVT-408', status: 'planning' },
      { id: 'e3', name: 'EVT-403', status: 'submitted' },
    ];
    const safety = [
      { id: 'e1', safety_state: 'pending', safety_reset: false },
      { id: 'e2', safety_state: null, safety_reset: false },
    ];
    const bookings = [
      { event_id: 'e2', venue_id: 'venue-hall-b', venue_name: 'Hall B', venue_location: 'Level 1', status: 'approved', hold_expires_at: null, venue_unavailable: true },
      { event_id: 'e2', venue_id: 'venue-hall-c', venue_name: 'Hall C', venue_location: 'Level 1', status: 'pending', hold_expires_at: new Date('2026-11-12T04:00:00.000Z'), venue_unavailable: false },
    ];
    const { service, query } = setup(records, safety, bookings);
    const result = await service.queue(COORDINATOR, 'planning');
    expect(result).toEqual([
      {
        id: 'e1',
        name: 'EVT-404',
        status: 'planning',
        queue: { safety: 'AWAITING_CHECK', holds: [], unavailableVenues: [], actions: [], needsAction: false },
      },
      {
        id: 'e2',
        name: 'EVT-408',
        status: 'planning',
        queue: {
          safety: null,
          holds: [{ venueName: 'Hall C', expiresAt: '2026-11-12T04:00:00.000Z', state: 'ACTIVE' }],
          unavailableVenues: ['Hall B'],
          actions: ['VENUE_UNAVAILABLE'],
          needsAction: true,
        },
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('e.coordinator_id = $2'), [['e1', 'e2'], 'coo-1']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("b.status IN ('pending', 'approved')"), [['e1', 'e2']]);
  });

  /** MONITOR-QUEUE-01-A: with no filter every listed event is kept; one reassigned away between the reads is dropped (AC1). */
  it('MONITOR-QUEUE-01-A drops an event that is no longer assigned when the indicators are read', async () => {
    const records = [
      { id: 'e1', name: 'EVT-409', status: 'approved' },
      { id: 'e2', name: 'Moved', status: 'approved' },
    ];
    const { service } = setup(records, [{ id: 'e1', safety_state: null, safety_reset: false }]);
    const result = await service.queue(COORDINATOR);
    expect(result.map((row) => row.name)).toEqual(['EVT-409']);
  });

  /**
   * MONITOR-QUEUE-05-B: the indicators use the status of the listed record (CQ-48-02), so a card never shows a
   * follow-up its own status rules out. A Completed event with a stored pending check shows no safety state or action.
   */
  it('MONITOR-QUEUE-05-B derives the indicators from the listed record status', async () => {
    const records = [{ id: 'e1', name: 'EVT-410', status: 'completed' }];
    const { service } = setup(records, [{ id: 'e1', safety_state: 'pending', safety_reset: false }]);
    const [row] = await service.queue(COORDINATOR);
    expect(row).toMatchObject({ status: 'completed', queue: { safety: null, actions: [], needsAction: false } });
  });

  /** MONITOR-QUEUE-01-C: built without an injected clock (system clock), an empty assignment list still returns []. */
  it('MONITOR-QUEUE-01-C uses the system clock when none is injected', async () => {
    const service = new CoordinatorQueueService(
      { list: vi.fn().mockResolvedValue([]) } as unknown as EventsService,
      { query: vi.fn() } as unknown as DatabaseService,
    );
    await expect(service.queue(COORDINATOR)).resolves.toEqual([]);
  });
});

describe('SPM-48 CoordinatorQueueController', () => {
  /** MONITOR-QUEUE-04-A: the route passes the session user and the status filter to the service and is never cached. */
  it('MONITOR-QUEUE-04-A passes the session user and filter, with Cache-Control no-store', async () => {
    const queue = vi.fn().mockResolvedValue([]);
    const controller = new CoordinatorQueueController({ queue } as unknown as CoordinatorQueueService);
    const request = { currentUser: COORDINATOR } as unknown as AuthenticatedRequest;
    await controller.queue('planning', request);
    expect(queue).toHaveBeenCalledWith(COORDINATOR, 'planning');
    const headers = Reflect.getMetadata('__headers__', CoordinatorQueueController.prototype.queue) as
      | Array<{ name: string; value: string }>
      | undefined;
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
    expect(Reflect.getMetadata('path', CoordinatorQueueController)).toBe('api/coordinator');
    expect(Reflect.getMetadata('path', CoordinatorQueueController.prototype.queue)).toBe('queue');
  });
});
