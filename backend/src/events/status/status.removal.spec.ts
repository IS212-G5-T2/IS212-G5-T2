/*
 * SPM-136 RR-136-07: removing an unavailable equipment or venue request re-checks the event status on the LOCKED row,
 * not only before the transaction. A cancellation that lands between the two steps must refuse the removal with 409
 * EVENT_CANCELLED and issue no DELETE. The status, reader and client are fakes; the outcome and the recorded
 * statements are the evidence (the locked row is the only thing that changed).
 *
 * TR-136-12: the same locked-row re-checks in confirmNoEquipment and requestSafetyCheck (and the Planning check of the
 * two removals) are covered here. A locked Cancelled row is refused 409 EVENT_CANCELLED; a locked Confirmed row (the
 * pre-check passed Planning, then the status changed before the lock) is refused 422 with the Planning-only message.
 * Every refusal issues no UPDATE, INSERT or DELETE.
 */
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { StatusService } from './status.service.js';
import { STATUS_CODES } from './status.messages.js';

const EVENT = '11111111-1111-4111-8111-111111111301';
const coordinator: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'], email: 'c@example.test', name: 'Coordinator 1' };
const MSG_CN_04 = 'This event has been cancelled and its arrangements cannot be changed.';
const PLANNING_ONLY = 'Only events in Planning can be updated.';

function serviceWith(lockedStatus: string | undefined) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      // The locked read of the events row returns the status the database holds at that moment.
      if (/FROM events WHERE id = \$1 FOR UPDATE/.test(sql) || /SELECT id, status FROM events/.test(sql))
        return {
          rows:
            lockedStatus === undefined
              ? []
              : [
                  {
                    id: EVENT,
                    status: lockedStatus,
                    event_name: 'Annual Gala Dinner',
                    organiser_id: 'org-01',
                    coordinator_id: 'coo-01',
                    equipment_needs: '',
                    equipment_confirmed_at: null,
                  },
                ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    }),
  };
  const database = {
    // Pre-transaction read: the event is Planning and assigned to COO-01 (the status a request sees first).
    query: vi.fn(async () => ({
      rows: [{ id: EVENT, status: 'Planning', event_name: 'Annual Gala Dinner', organiser_id: 'org-01', coordinator_id: 'coo-01' }],
    })),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  const reader = {
    read: vi.fn(async () => ({
      equipment: [{ id: 'eq-1', name: 'Projector', quantity: 1, status: 'Unavailable', createdAt: undefined }],
      venueBookings: [{ id: 'vb-1', venueName: 'Main Hall', status: 'rejected', holdExpiresAt: null, venueUnavailable: false }],
      equipmentConfirmedAt: null,
    })),
  };
  const service = new StatusService(
    database as never,
    reader as never,
    { view: vi.fn(), read: vi.fn() } as never,
    { read: vi.fn(async () => undefined) } as never,
    { now: () => new Date('2026-10-12T04:00:00Z') } as never,
    { cancel: vi.fn() } as never,
  );
  return { service, statements };
}

/** The statements that change data: any UPDATE, INSERT or DELETE issued on the transaction client. */
const writesOf = (statements: Array<{ sql: string }>) => statements.filter((s) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s.sql));

describe('SPM-136 RR-136-07: the locked event row is re-checked before a removal', () => {
  it('RR-136-07: an equipment removal that finds the event Cancelled under the lock is refused 409 EVENT_CANCELLED, with no DELETE', async () => {
    // Arrange: the event was Planning when the request started and is Cancelled when the lock is taken
    const { service, statements } = serviceWith('Cancelled');

    // Act
    const error = await service.removeEquipmentRequest(coordinator, EVENT, 'eq-1').catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EVENT_CANCELLED' });
    expect(statements.some((s) => /DELETE FROM equipment_reservations/.test(s.sql))).toBe(false);
  });

  it('RR-136-07: a venue removal that finds the event Cancelled under the lock is refused 409 EVENT_CANCELLED, with no DELETE', async () => {
    const { service, statements } = serviceWith('Cancelled');

    const error = await service.removeVenueRequest(coordinator, EVENT, 'vb-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EVENT_CANCELLED' });
    expect(statements.some((s) => /DELETE FROM venue_bookings/.test(s.sql))).toBe(false);
  });
});

describe('SPM-136 TR-136-12: confirm-no-equipment and the safety-check request re-check the locked row', () => {
  /** TR-136-12 (a): a cancellation that lands before the lock makes confirm-no-equipment refuse 409 EVENT_CANCELLED with no write. */
  it('TR-136-12: confirm-no-equipment on a row that is Cancelled under the lock is refused 409 EVENT_CANCELLED with MSG-CN-04, and writes nothing', async () => {
    // Arrange: Planning at the pre-check, Cancelled on the locked row
    const { service, statements } = serviceWith('Cancelled');

    // Act
    const error = await service.confirmNoEquipment(coordinator, EVENT).catch((e: unknown) => e);

    // Assert: the refusal is the cancelled refusal, not a Planning refusal, and no UPDATE/INSERT/DELETE was issued
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EVENT_CANCELLED', message: MSG_CN_04 });
    expect(writesOf(statements)).toEqual([]);
  });

  /** TR-136-12 (a): the same locked-row refusal for the safety-check request, before the checklist is read or any row is written. */
  it('TR-136-12: a safety-check request on a row that is Cancelled under the lock is refused 409 EVENT_CANCELLED with MSG-CN-04, and writes nothing', async () => {
    // Arrange
    const { service, statements } = serviceWith('Cancelled');

    // Act
    const error = await service.requestSafetyCheck(coordinator, EVENT).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EVENT_CANCELLED', message: MSG_CN_04 });
    expect(writesOf(statements)).toEqual([]);
  });

  /** TR-136-12 (b): the row is Confirmed under the lock (pre-check passed Planning): the Planning-only refusal applies, no write. */
  it('TR-136-12: confirm-no-equipment on a row that is Confirmed under the lock is refused 422 with the Planning-only message, and writes nothing', async () => {
    // Arrange: Planning at the pre-check, Confirmed on the locked row
    const { service, statements } = serviceWith('Confirmed');

    // Act
    const error = await service.confirmNoEquipment(coordinator, EVENT).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: STATUS_CODES.notConfirmable,
      message: PLANNING_ONLY,
    });
    expect(writesOf(statements)).toEqual([]);
  });

  /** TR-136-12 (b): the same Planning-only refusal for the safety-check request when the status moved to Confirmed before the lock. */
  it('TR-136-12: a safety-check request on a row that is Confirmed under the lock is refused 422 with the Planning-only message, and writes nothing', async () => {
    // Arrange
    const { service, statements } = serviceWith('Confirmed');

    // Act
    const error = await service.requestSafetyCheck(coordinator, EVENT).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: STATUS_CODES.notConfirmable,
      message: PLANNING_ONLY,
    });
    expect(writesOf(statements)).toEqual([]);
  });
});

describe('SPM-136 TR-136-12: the equipment and venue request removals re-check Planning on the locked row', () => {
  /** TR-136-12 (b): an equipment removal whose row is Confirmed under the lock is refused 422 and deletes nothing. */
  it('TR-136-12: an equipment removal on a row that is Confirmed under the lock is refused 422 with the Planning-only message, with no DELETE', async () => {
    // Arrange
    const { service, statements } = serviceWith('Confirmed');

    // Act
    const error = await service.removeEquipmentRequest(coordinator, EVENT, 'eq-1').catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: STATUS_CODES.notConfirmable,
      message: PLANNING_ONLY,
    });
    expect(writesOf(statements)).toEqual([]);
  });

  /** TR-136-12 (b): the venue removal twin: a Confirmed locked row refuses the removal 422 and deletes nothing. */
  it('TR-136-12: a venue removal on a row that is Confirmed under the lock is refused 422 with the Planning-only message, with no DELETE', async () => {
    // Arrange
    const { service, statements } = serviceWith('Confirmed');

    // Act
    const error = await service.removeVenueRequest(coordinator, EVENT, 'vb-1').catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: STATUS_CODES.notConfirmable,
      message: PLANNING_ONLY,
    });
    expect(writesOf(statements)).toEqual([]);
  });
});
