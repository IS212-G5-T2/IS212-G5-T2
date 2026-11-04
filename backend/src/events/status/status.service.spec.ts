/*
 * StatusService unit coverage: the Confirm handler, the status history and arrangements reads, "confirm no equipment",
 * the safety check request, feedback resolution, request removal and the organiser's Confirmed view.
 * The database, reader and safety sources are small stand-ins; the readiness and checklist rules are the real ones.
 * Assertions use literal catalogue text; only the final block imports STATUS_MESSAGES to cover its formatters.
 */
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
import { StatusService } from './status.service.js';
import { STATUS_MESSAGES } from './status.messages.js';

const EVENT = '11111111-1111-4111-8111-111111111501';
const NOW = new Date('2026-10-12T04:00:00.000Z');
const COORDINATOR: AuthenticatedUser = { uid: 'coo-01', roles: ['COORDINATOR'] };
const ORGANISER: AuthenticatedUser = { uid: 'org-01', roles: ['ORGANISER'] };

const approvedBooking = {
  id: 'vb-1', venueId: 'venue-1', venueName: 'Main Hall', status: 'approved' as const, holdExpiresAt: null,
  requestKind: 'booking' as const, venueUnavailable: false,
  start: '2026-11-05T02:00:00.000Z', end: '2026-11-05T04:00:00.000Z',
};
const reservedEquipment = { id: 'eq-1', name: 'Projector', quantity: 1, status: 'Reserved' };
const readySnapshot = { venueBookings: [approvedBooking], equipment: [reservedEquipment], equipmentNoneConfirmed: false };

interface Options {
  preStatus?: string;
  preCoordinator?: string;
  preMissing?: boolean;
  lockedRows?: Array<Record<string, unknown>>;
  snapshot?: unknown;
  safetyFact?: { state: string } | undefined;
  checkStatus?: string;
  unresolvedCount?: string;
  confirmUpdateRows?: Array<Record<string, unknown>>;
  feedbackUpdateRows?: Array<Record<string, unknown>>;
  historyRows?: Array<Record<string, unknown>>;
  metaRows?: Array<Record<string, unknown>>;
  equipmentNeeds?: string;
  equipmentConfirmedAt?: Date | null;
  safetyView?: unknown;
}

function harness(options: Options = {}) {
  const lockedRow = {
    id: EVENT, status: options.preStatus ?? 'Planning', event_name: 'Gala', organiser_id: 'org-01', coordinator_id: 'coo-01',
    equipment_needs: options.equipmentNeeds ?? 'Projector', equipment_confirmed_at: options.equipmentConfirmedAt ?? null,
    registration_enabled: false, registration_opens_at: null, registration_closes_at: null,
  };
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('FROM events WHERE id = $1 FOR UPDATE') || sql.includes('SELECT id, status FROM events WHERE id'))
        return { rows: options.lockedRows ?? [lockedRow], rowCount: 1 };
      if (sql.includes('SELECT status FROM event_safety_checks'))
        return { rows: options.checkStatus ? [{ status: options.checkStatus }] : [], rowCount: 1 };
      if (sql.includes('SELECT count(*)')) return { rows: [{ count: options.unresolvedCount ?? '0' }], rowCount: 1 };
      if (sql.includes("UPDATE events SET status = 'Confirmed'"))
        return { rows: options.confirmUpdateRows ?? [{ event_name: 'Gala', organiser_id: 'org-01' }], rowCount: 1 };
      if (sql.includes('UPDATE safety_check_feedback_items'))
        return { rows: options.feedbackUpdateRows ?? [{ id: 'fb-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  const database = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM event_status_history')) return { rows: options.historyRows ?? [] };
      if (sql.includes('SELECT equipment_needs')) return { rows: options.metaRows ?? [lockedRow] };
      if (options.preMissing) return { rows: [] };
      return { rows: [{ ...lockedRow, coordinator_id: options.preCoordinator ?? 'coo-01' }] };
    }),
    transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)),
  };
  const reader = { read: vi.fn(async () => options.snapshot ?? readySnapshot) };
  const safetyChecks = { view: vi.fn(async () => options.safetyView ?? { status: 'not_requested' }) };
  const safety = { read: vi.fn(async () => ('safetyFact' in options ? options.safetyFact : { state: 'Approved' })) };
  const cancellation = { cancel: vi.fn(async () => 'cancelled') };
  const service = new StatusService(
    database as never, reader as never, safetyChecks as never, safety as never, { now: () => NOW } as never, cancellation as never,
  );
  const writes = () => statements.filter((s) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(s.sql));
  return { service, client, database, reader, safetyChecks, safety, cancellation, statements, writes };
}

const reject = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => error as { getResponse(): Record<string, unknown> });

describe('StatusService.changeStatus routing', () => {
  /** SPM-136: a Cancelled target is handed to the cancellation core with the caller, event id and body unchanged. */
  it('delegates a Cancelled target to the cancellation service', async () => {
    const { service, cancellation } = harness();
    const body = { targetStatus: 'Cancelled', confirm: true };

    await expect(service.changeStatus(COORDINATOR, EVENT, body)).resolves.toBe('cancelled');
    expect(cancellation.cancel).toHaveBeenCalledWith(COORDINATOR, EVENT, body);
  });

  /** SPM-136: a cancelled event refuses every target except Confirmed with 422 INVALID_STATUS_TRANSITION. */
  it('refuses a non-Confirmed target on a Cancelled event with 422 INVALID_STATUS_TRANSITION', async () => {
    const { service, writes } = harness({ preStatus: 'Cancelled' });

    const error = await reject(service.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Planning' }));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toEqual({ code: 'INVALID_STATUS_TRANSITION', message: 'This status change is not allowed for this event.' });
    expect(writes()).toEqual([]);
  });

  /** SPM-148 PLAN-STATUS-08-A: the endpoint refuses a target it does not support, including a missing one. */
  it.each([[{ targetStatus: 'Planning' }], [{}], [null], [{ targetStatus: 5 }]])('refuses unsupported target body %j with 400', async (body) => {
    const { service } = harness();

    const error = await reject(service.changeStatus(COORDINATOR, EVENT, body));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getResponse()).toEqual({ code: 'UNSUPPORTED_TARGET_STATUS', message: 'This status change is not supported.' });
  });

  /** SPM-136 MSG-CF-05: Confirmed on a Cancelled event reaches the Confirmed handler, which refuses it. */
  it('refuses to confirm a Cancelled event with the rejected-or-cancelled message', async () => {
    const { service, writes } = harness({ preStatus: 'Cancelled' });

    const error = await reject(service.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Confirmed' }));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toEqual({ code: 'EVENT_NOT_CONFIRMABLE', message: 'A rejected or cancelled event cannot be confirmed.' });
    expect(writes()).toEqual([]);
  });
});

describe('SPM-135 the Confirmed handler', () => {
  const confirm = (service: StatusService) => service.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Confirmed' });

  /** CF-01: a ready event is confirmed with one history row and one organiser notification. */
  it('confirms a ready Planning event, writing history and the organiser notice', async () => {
    const { service, writes } = harness();

    await expect(confirm(service)).resolves.toEqual({ eventId: EVENT, status: 'Confirmed', message: 'Gala has been confirmed.' });
    const sqls = writes().map((w) => w.sql);
    expect(sqls.some((s) => s.includes("'Planning', 'Confirmed'"))).toBe(true);
    const notice = writes().find((w) => w.sql.includes("'EventConfirmed'"));
    expect(notice?.params.slice(1)).toEqual(['org-01', 'Gala has been confirmed.', EVENT, NOW]);
    const history = writes().find((w) => w.sql.includes('INSERT INTO event_status_history'));
    expect(history?.params.slice(1)).toEqual([EVENT, 'coo-01', NOW]);
  });

  /** CF-02: an event that is not ready is refused with 422 CONFIRM_BLOCKED listing every outstanding item. */
  it('refuses a not-ready event with CONFIRM_BLOCKED and the outstanding list, writing nothing', async () => {
    const { service, writes } = harness({ snapshot: { venueBookings: [], equipment: [reservedEquipment], equipmentNoneConfirmed: false }, safetyFact: undefined });

    const error = await reject(confirm(service));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = error?.getResponse() as { code: string; message: string; outstanding: Array<{ type: string }> };
    expect(body.code).toBe('CONFIRM_BLOCKED');
    expect(body.message.startsWith('This event cannot be confirmed yet. Outstanding: ')).toBe(true);
    expect(body.outstanding.map((item) => item.type)).toEqual(expect.arrayContaining(['venue', 'safety']));
    expect(writes()).toEqual([]);
  });

  /** D9: the compare-and-set that touches no row means another request confirmed first: 409 already confirmed. */
  it('answers 409 EVENT_ALREADY_CONFIRMED when the compare-and-set updates no row', async () => {
    const { service, writes } = harness({ confirmUpdateRows: [] });

    const error = await reject(confirm(service));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'EVENT_ALREADY_CONFIRMED', message: 'This event is already confirmed.' });
    expect(writes().some((w) => w.sql.includes('INSERT INTO'))).toBe(false);
  });

  /** D4: a missing locked row is 404; a reassignment after the pre-check is 403. */
  it('answers 404 when the locked event row has gone', async () => {
    const { service } = harness({ lockedRows: [] });
    await expect(confirm(service)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 403 when the event was reassigned between the pre-check and the lock', async () => {
    const { service, writes } = harness({ lockedRows: [{ id: EVENT, status: 'Planning', event_name: 'Gala', organiser_id: 'org-01', coordinator_id: 'coo-99' }] });

    const error = await reject(confirm(service));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error?.getResponse()).toEqual({ code: 'FORBIDDEN', message: 'You do not have permission to confirm this event.' });
    expect(writes()).toEqual([]);
  });

  /** D5: status guards on the locked row. */
  it.each([
    ['Confirmed', ConflictException, 'EVENT_ALREADY_CONFIRMED', 'This event is already confirmed.'],
    ['Rejected', UnprocessableEntityException, 'EVENT_NOT_CONFIRMABLE', 'A rejected or cancelled event cannot be confirmed.'],
    ['Approved', UnprocessableEntityException, 'EVENT_NOT_CONFIRMABLE', 'Only events in Planning can be confirmed.'],
  ])('refuses a locked %s event', async (status, errorType, code, message) => {
    const { service } = harness({ lockedRows: [{ id: EVENT, status, event_name: 'Gala', organiser_id: 'org-01', coordinator_id: 'coo-01' }] });

    const error = await reject(confirm(service));
    expect(error).toBeInstanceOf(errorType);
    expect(error?.getResponse()).toEqual({ code, message });
  });
});

describe('StatusService identity and event lookup', () => {
  it('answers 401 without a session', async () => {
    const { service } = harness();
    await expect(service.statusHistory(undefined, EVENT)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.arrangementsStatus(undefined, EVENT)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 404 for an id that is not a UUID without querying the database', async () => {
    const { service, database } = harness();
    await expect(service.arrangementsStatus(COORDINATOR, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('answers 403 for a coordinator who is not assigned to the event', async () => {
    const { service } = harness({ preCoordinator: 'coo-99' });
    await expect(service.arrangementsStatus(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PLAN-STATUS-04 status history', () => {
  const rows = [
    { from_status: 'Approved', to_status: 'Planning', created_at: new Date('2026-10-01T00:00:00.000Z'), actor_id: 'coo-01', actor_name: 'Coo One' },
    { from_status: 'Planning', to_status: 'Confirmed', created_at: new Date('2026-10-02T00:00:00.000Z'), actor_id: 'sys-1', actor_name: null },
  ];
  const expected = [
    { fromStatus: 'Approved', toStatus: 'Planning', changedAt: '2026-10-01T00:00:00.000Z', changedBy: { id: 'coo-01', name: 'Coo One' } },
    { fromStatus: 'Planning', toStatus: 'Confirmed', changedAt: '2026-10-02T00:00:00.000Z', changedBy: { id: 'sys-1', name: 'sys-1' } },
  ];

  it('PLAN-STATUS-04-A returns the history to the assigned coordinator, falling back to the actor id for a missing name', async () => {
    const { service, database } = harness({ historyRows: rows });
    await expect(service.statusHistory(COORDINATOR, EVENT)).resolves.toEqual(expected);
    expect(database.query).toHaveBeenLastCalledWith(expect.stringContaining('ORDER BY h.created_at, h.id'), [EVENT]);
  });

  it('PLAN-STATUS-04-A returns the history to the owning organiser', async () => {
    const { service } = harness({ historyRows: rows });
    await expect(service.statusHistory(ORGANISER, EVENT)).resolves.toEqual(expected);
  });

  it('PLAN-STATUS-04-A-SEC refuses another user with 403 and reads no history', async () => {
    const { service, database } = harness({ historyRows: rows });
    await expect(service.statusHistory({ uid: 'other', roles: ['ORGANISER', 'COORDINATOR'] }, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for an unknown event', async () => {
    const { service } = harness({ preMissing: true });
    await expect(service.statusHistory(COORDINATOR, EVENT)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SPM-135 arrangements status', () => {
  it('reports ready with no outstanding items when every arrangement is confirmed', async () => {
    const { service, reader } = harness();
    const result = await service.arrangementsStatus(COORDINATOR, EVENT);

    expect(result).toMatchObject({ eventId: EVENT, ready: true, outstanding: [] });
    expect(result.checklist.venue.status).toBe('confirmed');
    expect(reader.read).toHaveBeenCalledWith(expect.anything(), EVENT, { lock: false });
  });

  it('reports the outstanding safety item when no safety record exists', async () => {
    const { service } = harness({ safetyFact: undefined });
    const result = await service.arrangementsStatus(COORDINATOR, EVENT);

    expect(result.ready).toBe(false);
    expect(result.outstanding).toEqual([expect.objectContaining({ type: 'safety', state: 'No record' })]);
  });

  it('builds the checklist from the persisted event meta, defaulting when the event row has none', async () => {
    const { service } = harness({ metaRows: [] });
    const result = await service.arrangementsStatus(COORDINATOR, EVENT);

    expect(result.checklist.equipment.required).toBe(false);
    expect(result.checklist.registration).toEqual({ enabled: false, status: 'confirmed' });
  });
});

describe('SPM-135 confirm no equipment', () => {
  const noEquipment = { venueBookings: [approvedBooking], equipment: [], equipmentNoneConfirmed: false };

  it('records the first confirmation time for an event that lists no equipment', async () => {
    const { service, writes } = harness({ equipmentNeeds: 'None', snapshot: noEquipment });

    await expect(service.confirmNoEquipment(COORDINATOR, EVENT)).resolves.toEqual({ eventId: EVENT, equipmentConfirmedAt: NOW.toISOString() });
    expect(writes()).toEqual([{ sql: 'UPDATE events SET equipment_confirmed_at = $2 WHERE id = $1', params: [EVENT, NOW] }]);
  });

  it('is idempotent: an earlier confirmation time wins and nothing is written', async () => {
    const earlier = new Date('2026-10-01T00:00:00.000Z');
    const { service, writes } = harness({ equipmentNeeds: '', equipmentConfirmedAt: earlier, snapshot: noEquipment });

    await expect(service.confirmNoEquipment(COORDINATOR, EVENT)).resolves.toEqual({ eventId: EVENT, equipmentConfirmedAt: earlier.toISOString() });
    expect(writes()).toEqual([]);
  });

  it('refuses with 422 EQUIPMENT_REQUIRED when the event lists equipment', async () => {
    const { service, writes } = harness({ equipmentNeeds: 'Projector' });

    const error = await reject(service.confirmNoEquipment(COORDINATOR, EVENT));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toEqual({ code: 'EQUIPMENT_REQUIRED', message: 'This event needs equipment, so it cannot be marked as having none.' });
    expect(writes()).toEqual([]);
  });

  it('refuses with 422 EQUIPMENT_REQUIRED when a live equipment request already exists', async () => {
    const { service } = harness({ equipmentNeeds: 'None' });
    const error = await service.confirmNoEquipment(COORDINATOR, EVENT).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'EQUIPMENT_REQUIRED' });
  });

  it('answers 403 when the locked row is gone or reassigned', async () => {
    await expect(harness({ lockedRows: [] }).service.confirmNoEquipment(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
    const reassigned = harness({ lockedRows: [{ id: EVENT, status: 'Planning', coordinator_id: 'coo-99', equipment_needs: '' }] });
    await expect(reassigned.service.confirmNoEquipment(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(reassigned.writes()).toEqual([]);
  });
});

describe('SPM-135 safety check request', () => {
  it('creates a pending safety check, clearing earlier feedback and resets, for an event with no earlier check', async () => {
    const { service, writes } = harness();

    await expect(service.requestSafetyCheck(COORDINATOR, EVENT)).resolves.toEqual({ eventId: EVENT, status: 'pending', requestedDate: NOW.toISOString() });
    expect(writes().map((w) => w.sql.split('\n')[0].trim().split(' ').slice(0, 3).join(' '))).toEqual([
      'DELETE FROM safety_check_feedback_items',
      'DELETE FROM event_safety_resets',
      'INSERT INTO event_safety_checks',
    ]);
    expect(writes()[2].params).toEqual([EVENT, NOW, 'coo-01']);
  });

  it('refuses with 409 while a check is already pending', async () => {
    const { service, writes } = harness({ checkStatus: 'pending' });

    const error = await reject(service.requestSafetyCheck(COORDINATOR, EVENT));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_CHECK_NOT_REQUESTABLE', message: 'A safety check is already pending.' });
    expect(writes()).toEqual([]);
  });

  it('refuses with 409 once the check is approved', async () => {
    const { service } = harness({ checkStatus: 'approved' });

    const error = await reject(service.requestSafetyCheck(COORDINATOR, EVENT));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_CHECK_NOT_REQUESTABLE', message: 'This event has already passed its safety check.' });
  });

  it.each(['changes_needed', 'rejected'])('refuses a re-request after %s while feedback is unresolved, naming the count', async (checkStatus) => {
    const { service, writes } = harness({ checkStatus, unresolvedCount: '2' });

    const error = await reject(service.requestSafetyCheck(COORDINATOR, EVENT));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_FEEDBACK_UNRESOLVED', message: '2 safety feedback item(s) still need resolving before re-requesting.' });
    expect(writes()).toEqual([]);
  });

  it('allows a re-request after changes were needed once all feedback is resolved', async () => {
    const { service } = harness({ checkStatus: 'changes_needed', unresolvedCount: '0' });
    await expect(service.requestSafetyCheck(COORDINATOR, EVENT)).resolves.toMatchObject({ status: 'pending' });
  });

  it('answers 403 and writes nothing when the locked row is gone or the event was reassigned', async () => {
    await expect(harness({ lockedRows: [] }).service.requestSafetyCheck(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
    const reassigned = harness({ lockedRows: [{ id: EVENT, status: 'Planning', coordinator_id: 'coo-99', equipment_needs: '' }] });
    await expect(reassigned.service.requestSafetyCheck(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(reassigned.writes()).toEqual([]);
  });

  it('refuses with 422 SAFETY_PREREQUISITES_NOT_MET naming the blocking arrangements', async () => {
    const { service } = harness({ snapshot: { venueBookings: [], equipment: [], equipmentNoneConfirmed: false } });

    const error = await reject(service.requestSafetyCheck(COORDINATOR, EVENT));
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_PREREQUISITES_NOT_MET', message: 'Pending venue and equipment confirmation to proceed.' });
  });
});

describe('SPM-135 safety feedback resolution', () => {
  it('marks a feedback item handled at the current time', async () => {
    const { service, writes } = harness({ checkStatus: 'changes_needed' });

    await expect(service.resolveFeedback(COORDINATOR, EVENT, 'fb-1')).resolves.toEqual({ eventId: EVENT, feedbackId: 'fb-1', resolvedAt: NOW.toISOString() });
    expect(writes()[0].params).toEqual(['fb-1', EVENT, NOW]);
  });

  it('clears the handled mark by writing a null time and returns no resolvedAt', async () => {
    const { service, writes } = harness({ checkStatus: 'rejected' });

    await expect(service.unresolveFeedback(COORDINATOR, EVENT, 'fb-1')).resolves.toEqual({ eventId: EVENT, feedbackId: 'fb-1' });
    expect(writes()[0].params).toEqual(['fb-1', EVENT, null]);
  });

  it.each([undefined, 'pending', 'approved'])('refuses to change feedback while the check status is %s', async (checkStatus) => {
    const { service, writes } = harness({ checkStatus });

    const error = await reject(service.resolveFeedback(COORDINATOR, EVENT, 'fb-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_CHECK_NOT_REQUESTABLE', message: 'A safety check is already pending.' });
    expect(writes()).toEqual([]);
  });

  it('answers 404 SAFETY_FEEDBACK_NOT_FOUND when the item does not belong to the event', async () => {
    const { service } = harness({ checkStatus: 'changes_needed', feedbackUpdateRows: [] });

    const error = await reject(service.resolveFeedback(COORDINATOR, EVENT, 'fb-x'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error?.getResponse()).toEqual({ code: 'SAFETY_FEEDBACK_NOT_FOUND', message: 'This feedback item was not found for the safety check.' });
  });
});

describe('SPM-135 removing an unavailable request', () => {
  it('removes an Unavailable equipment request by id', async () => {
    const snapshot = { venueBookings: [], equipment: [{ id: 'eq-1', name: 'Projector', quantity: 1, status: 'Unavailable' }], equipmentNoneConfirmed: false };
    const { service, writes } = harness({ snapshot });

    await expect(service.removeEquipmentRequest(COORDINATOR, EVENT, 'eq-1')).resolves.toEqual({ eventId: EVENT, equipmentReservationId: 'eq-1', removed: true });
    expect(writes()).toEqual([{ sql: 'DELETE FROM equipment_reservations WHERE id = $1 AND event_id = $2', params: ['eq-1', EVENT] }]);
  });

  it('refuses to remove an equipment request that is still reserved', async () => {
    const { service, writes } = harness();

    const error = await reject(service.removeEquipmentRequest(COORDINATOR, EVENT, 'eq-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'EQUIPMENT_REQUEST_NOT_REMOVABLE', message: 'Only an equipment request that is unavailable can be removed.' });
    expect(writes()).toEqual([]);
  });

  it('answers 404 for an equipment request that is not on the event', async () => {
    const { service } = harness();

    const error = await reject(service.removeEquipmentRequest(COORDINATOR, EVENT, 'eq-missing'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error?.getResponse()).toEqual({ code: 'EQUIPMENT_REQUEST_NOT_FOUND', message: 'This equipment request was not found for the event.' });
  });

  it.each([
    ['rejected', false],
    ['approved', true],
  ])('removes a %s venue request when unavailable', async (status, venueUnavailable) => {
    const snapshot = { venueBookings: [{ ...approvedBooking, status, venueUnavailable }], equipment: [], equipmentNoneConfirmed: false };
    const { service, writes } = harness({ snapshot });

    await expect(service.removeVenueRequest(COORDINATOR, EVENT, 'vb-1')).resolves.toEqual({ eventId: EVENT, venueRequestId: 'vb-1', removed: true });
    expect(writes()).toEqual([{ sql: 'DELETE FROM venue_bookings WHERE id = $1 AND event_id = $2', params: ['vb-1', EVENT] }]);
  });

  it('refuses to remove a venue request that is approved and available', async () => {
    const { service, writes } = harness();

    const error = await reject(service.removeVenueRequest(COORDINATOR, EVENT, 'vb-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toEqual({ code: 'VENUE_REQUEST_NOT_REMOVABLE', message: 'Only a venue request that is unavailable can be removed.' });
    expect(writes()).toEqual([]);
  });

  it('answers 404 for a venue request that is not on the event', async () => {
    const { service } = harness();

    const error = await reject(service.removeVenueRequest(COORDINATOR, EVENT, 'vb-missing'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error?.getResponse()).toEqual({ code: 'VENUE_REQUEST_NOT_FOUND', message: 'This venue request was not found for the event.' });
  });

  it('answers 404 when the locked event row has gone', async () => {
    await expect(harness({ lockedRows: [] }).service.removeVenueRequest(COORDINATOR, EVENT, 'vb-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness({ lockedRows: [] }).service.removeEquipmentRequest(COORDINATOR, EVENT, 'eq-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SPM-135 organiser view of a Confirmed event', () => {
  const snapshot = {
    venueBookings: [approvedBooking, { ...approvedBooking, id: 'vb-2', venueName: 'Annex', status: 'pending' as const }],
    equipment: [{ id: 'eq-2', name: 'Speaker', quantity: 2, status: 'Reserved' }, { id: 'eq-1', name: 'Microphone', quantity: 1, status: 'Reserved' }],
    equipmentNoneConfirmed: false,
  };

  it('returns only the allow-listed fields, with equipment sorted by name and Approved venue wording', async () => {
    const { service } = harness({ preStatus: 'Confirmed', snapshot });

    await expect(service.confirmedArrangements(ORGANISER, EVENT)).resolves.toEqual({
      eventId: EVENT,
      status: 'Confirmed',
      venueBookings: [
        { venueName: 'Main Hall', start: approvedBooking.start, end: approvedBooking.end, status: 'Approved' },
        { venueName: 'Annex', start: approvedBooking.start, end: approvedBooking.end, status: 'pending' },
      ],
      equipment: [
        { name: 'Microphone', quantity: 1, status: 'Reserved' },
        { name: 'Speaker', quantity: 2, status: 'Reserved' },
      ],
      safety: { state: 'Approved' },
    });
  });

  it('shows "Not recorded" when the event has no safety record', async () => {
    const { service } = harness({ preStatus: 'Confirmed', snapshot, safetyFact: undefined });
    await expect(service.confirmedArrangements(ORGANISER, EVENT)).resolves.toMatchObject({ safety: { state: 'Not recorded' } });
  });

  it('refuses a caller without the ORGANISER role with 403', async () => {
    await expect(harness({ preStatus: 'Confirmed' }).service.confirmedArrangements(COORDINATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 for another organiser, a missing event, or an event that is not Confirmed', async () => {
    await expect(harness({ preStatus: 'Confirmed' }).service.confirmedArrangements({ uid: 'org-02', roles: ['ORGANISER'] }, EVENT)).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness({ preMissing: true }).service.confirmedArrangements(ORGANISER, EVENT)).rejects.toBeInstanceOf(NotFoundException);
    const planning = harness({ preStatus: 'Planning' });
    await expect(planning.service.confirmedArrangements(ORGANISER, EVENT)).rejects.toBeInstanceOf(NotFoundException);
    expect(planning.reader.read).not.toHaveBeenCalled();
  });
});

describe('SPM-153 completion edge cases not covered by the transition spec', () => {
  it('answers 409 EVENT_NOT_COMPLETABLE when the locked event is not Confirmed', async () => {
    const { service, writes } = harness({ preStatus: 'Planning' });

    const error = await reject(service.changeStatus(COORDINATOR, EVENT, { targetStatus: 'Completed' }));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getResponse()).toMatchObject({ code: 'EVENT_NOT_COMPLETABLE' });
    expect(writes()).toEqual([]);
  });
});

describe('message catalogue wording used by the handler', () => {
  it('formats the confirmed, outstanding and feedback-count messages', () => {
    expect(STATUS_MESSAGES.confirmed('Gala')).toBe('Gala has been confirmed.');
    expect(STATUS_MESSAGES.outstanding('a; b')).toBe('This event cannot be confirmed yet. Outstanding: a; b');
    expect(STATUS_MESSAGES.feedbackUnresolved(1)).toBe('1 safety feedback item(s) still need resolving before re-requesting.');
  });
});
