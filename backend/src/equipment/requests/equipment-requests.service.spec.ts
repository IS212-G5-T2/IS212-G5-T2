import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { EquipmentRequestsRepository } from './equipment-requests.repository.js';
import { EquipmentRequestsService } from './equipment-requests.service.js';

const eventId = '00000000-0000-4000-8000-000000000125';
const body = { eventId, items: [{ equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }] };
const coordinator: AuthenticatedUser = { uid: '00000000-0000-4000-8000-000000000126', roles: ['COORDINATOR'] };
const submit = vi.fn();
const listMine = vi.fn();
const listQueue = vi.fn();
const listReservations = vi.fn();
const listEligibleEvents = vi.fn();
const update = vi.fn();
const reserve = vi.fn();
const markCannotProvide = vi.fn();
const service = new EquipmentRequestsService({ submit, update, reserve, markCannotProvide, listMine, listQueue, listReservations, listEligibleEvents } as unknown as EquipmentRequestsRepository);

beforeEach(() => vi.resetAllMocks());

describe('SPM-57 equipment request service', () => {
  /** EQUIP-RESERVE-03-A (DECIDED SC-SPM58-05, chaw678 2026-11-06: reserve takes no quantity and is all-or-nothing per request): Technical Support can make a pending request consume stock. */
  it('reserves a pending equipment request for availability calculations', async () => {
    reserve.mockResolvedValue({ kind: 'reserved', id: '00000000-0000-4000-8000-000000000099' });
    await expect(service.reserve({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099'))
      .resolves.toMatchObject({ kind: 'reserved', requestReference: 'ER-00000000' });
    expect(reserve).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000099');
  });

  /** EQUIP-RESERVE-03-SEC-1: a coordinator cannot reserve; a non-pending request is refused. */
  it('refuses coordinators and non-pending request transitions', async () => {
    await expect(service.reserve(coordinator, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(ForbiddenException);
    reserve.mockResolvedValue({ kind: 'not-pending' });
    await expect(service.reserve({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(ConflictException);
  });

  /** Technical Support receives a conflict when approving equipment after event confirmation. */
  it('refuses to approve requests after their event is Confirmed', async () => {
    reserve.mockResolvedValue({ kind: 'event-confirmed' });
    await expect(service.reserve({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099'))
      .rejects.toThrow('Equipment requests cannot be changed after the event is confirmed.');
  });

  /** EQUIP-AVAIL-04-BND-1: Technical Support cannot reserve maintenance or already-reserved units. */
  it('refuses a reservation when its requested units are not active and free', async () => {
    reserve.mockResolvedValue({ kind: 'insufficient-active-stock', equipmentName: 'Stage lighting' });
    await expect(service.reserve({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099'))
      .rejects.toThrow('Not enough active equipment is available to reserve Stage lighting.');
  });

  /** EQUIP-RESERVE-09-A: Technical Support marks a request Cannot Provide with a required reason. */
  it('marks a pending request Cannot Provide with a trimmed reason', async () => {
    markCannotProvide.mockResolvedValue({ kind: 'cannot-provided', id: '00000000-0000-4000-8000-000000000099' });
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', { reason: '  Only 8 available; 10 requested.  ' }))
      .resolves.toMatchObject({ kind: 'cannot-provided', requestReference: 'ER-00000000' });
    expect(markCannotProvide).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000099', 'Only 8 available; 10 requested.');
  });

  /** EQUIP-RESERVE-09-SUP-CAP (DECIDED SC-SPM58-06, chaw678 2026-11-06: the 500-character cap is kept as supporting case 09-SUP-CAP): 500 is accepted, 501 is refused. */
  it('bounds the Cannot Provide reason to 500 characters', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    const support = { uid: 'support', roles: ['TECH_SUPPORT'] };
    markCannotProvide.mockClear();
    await expect(service.markCannotProvide(support, id, { reason: 'x'.repeat(501) })).rejects.toBeInstanceOf(BadRequestException);
    expect(markCannotProvide).not.toHaveBeenCalled();
    markCannotProvide.mockResolvedValue({ kind: 'cannot-provided', id });
    await expect(service.markCannotProvide(support, id, { reason: 'x'.repeat(500) })).resolves.toMatchObject({ requestReference: 'ER-00000000' });
  });

  /** EQUIP-RESERVE-09-BND-1: one visible character is a valid reason and is stored trimmed; whitespace around it is not part of the reason. */
  it('accepts a one-character reason and stores it trimmed', async () => {
    const id = '00000000-0000-4000-8000-000000000099';
    markCannotProvide.mockResolvedValue({ kind: 'cannot-provided', id });
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, id, { reason: '  x  ' }))
      .resolves.toMatchObject({ kind: 'cannot-provided' });
    expect(markCannotProvide).toHaveBeenCalledWith(id, 'x');
  });

  /** EQUIP-RESERVE-09-B: an empty or missing reason is refused before any persistence. */
  it('requires a non-empty reason to mark Cannot Provide', async () => {
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', { reason: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', {}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(markCannotProvide).not.toHaveBeenCalled();
  });

  /** EQUIP-RESERVE-08-B (wrong-role half only; DECIDED SC-SPM58-02, chaw678 2026-11-06: no API takes a status value, so the invalid-status half of the case is dropped): only Technical Support can mark Cannot Provide, and the event-confirmed/not-pending guards surface as conflicts. */
  it('restricts Cannot Provide to Technical Support and maps repository guards', async () => {
    await expect(service.markCannotProvide(coordinator, '00000000-0000-4000-8000-000000000099', { reason: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.markCannotProvide(undefined, '00000000-0000-4000-8000-000000000099', { reason: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
    markCannotProvide.mockResolvedValue({ kind: 'not-pending' });
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
    markCannotProvide.mockResolvedValue({ kind: 'event-confirmed' });
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
    markCannotProvide.mockResolvedValue({ kind: 'request-not-found' });
    await expect(service.markCannotProvide({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099', { reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  /** EQUIP-REQUEST-01-A: a coordinator can read only their eligible event picker options. */
  it('returns the coordinator-scoped eligible event picker list', async () => {
    listEligibleEvents.mockResolvedValue([{ id: eventId, name: 'Workshop' }]);
    await expect(service.listEligibleEvents(coordinator)).resolves.toEqual([{ id: eventId, name: 'Workshop' }]);
    expect(listEligibleEvents).toHaveBeenCalledWith(coordinator.uid);
    await expect(service.listEligibleEvents({ uid: 'tech', roles: ['TECH_SUPPORT'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** EQUIP-REQUEST-05-A: a valid submission returns a stable request reference for its persisted request. */
  it('returns a request reference after repository creation', async () => {
    submit.mockResolvedValue({ kind: 'created', id: '00000000-0000-4000-8000-000000000099' });
    await expect(service.submit(coordinator, body)).resolves.toMatchObject({ requestReference: 'ER-00000000' });
    expect(submit).toHaveBeenCalledWith(coordinator.uid, body);
  });

  /** EQUIP-REQUEST-10-A: a successful update returns the reference derived from the existing request id. */
  it('returns the original reference after updating the request', async () => {
    update.mockResolvedValue({ kind: 'updated', id: '00000000-0000-4000-8000-000000000099' });
    await expect(service.update(coordinator, '00000000-0000-4000-8000-000000000099', body))
      .resolves.toEqual({ kind: 'updated', id: '00000000-0000-4000-8000-000000000099', requestReference: 'ER-00000000' });
    expect(update).toHaveBeenCalledWith(coordinator.uid, '00000000-0000-4000-8000-000000000099', body);
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: request updates require coordinator authorization. */
  it('requires an authenticated coordinator before repository update access', async () => {
    await expect(service.update(undefined, 'request-1', body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.update({ uid: 'staff', roles: ['TECH_SUPPORT'] }, 'request-1', body)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-10-SUP-ACCESS: a request not owned by the coordinator is hidden as not found. */
  it('hides a request that does not belong to the caller', async () => {
    update.mockResolvedValue({ kind: 'request-not-found' });
    await expect(service.update(coordinator, 'request-1', body)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** EQUIP-REQUEST-10-BND-1: an event confirmed after request submission blocks any further edits. */
  it('refuses updates after the event becomes Confirmed', async () => {
    update.mockResolvedValue({ kind: 'event-confirmed' });
    await expect(service.update(coordinator, 'request-1', body)).rejects.toBeInstanceOf(ConflictException);
  });

  /** EQUIP-REQUEST-10-SUP-LIFECYCLE: closed, non-confirmed events are excluded from request updates. */
  it('refuses updates when the event is no longer open', async () => {
    update.mockResolvedValue({ kind: 'event-not-open' });
    await expect(service.update(coordinator, 'request-1', body)).rejects.toBeInstanceOf(ConflictException);
  });

  /** EQUIP-REQUEST-01-N: an event not assigned to the current coordinator cannot be requested. */
  it('hides events that are not assigned to the caller', async () => {
    submit.mockResolvedValue({ kind: 'event-not-assigned' });
    await expect(service.submit(coordinator, body)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** EQUIP-REQUEST-08-N: cancelled or rejected events are refused without creating a request. */
  it('rejects events closed to equipment requests', async () => {
    submit.mockResolvedValue({ kind: 'event-not-open', status: 'Cancelled' });
    await expect(service.submit(coordinator, body)).rejects.toBeInstanceOf(ConflictException);
  });

  /** EQUIP-REQUEST-10-N: an already-requested event cannot be submitted again. */
  it('requires updates to use the existing equipment request', async () => {
    submit.mockResolvedValue({ kind: 'already-submitted' });
    await expect(service.submit(coordinator, body)).rejects.toMatchObject({
      status: 409,
      message: 'An equipment request already exists for this event. Update the existing request instead.',
    });
  });

  /** EQUIP-REQUEST-01-A: only authenticated coordinators can create a request. */
  it('requires a coordinator session before repository access', async () => {
    await expect(service.submit(undefined, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.submit({ roles: ['COORDINATOR'] } as AuthenticatedUser, body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.submit({ uid: 'staff', roles: ['TECH_SUPPORT'] }, body)).rejects.toBeInstanceOf(ForbiddenException);
    expect(submit).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-06-A: a coordinator reads their own request list only. */
  it('returns the current coordinator request list', async () => {
    listMine.mockResolvedValue([{ status: 'Pending Review' }]);
    await expect(service.listMine(coordinator)).resolves.toEqual([{ status: 'Pending Review' }]);
    expect(listMine).toHaveBeenCalledWith(coordinator.uid);
  });

  /** EQUIP-REQUEST-07-A: Technical Support can read the Pending Review queue. */
  it('allows Technical Support queue reads and refuses other roles', async () => {
    listQueue.mockResolvedValue([]);
    await expect(service.listQueue({ uid: 'tech', roles: ['TECH_SUPPORT'] })).resolves.toEqual([]);
    await expect(service.listQueue({ uid: 'coordinator', roles: ['COORDINATOR'] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listQueue(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /** EQUIP-RESERVE-07-A: Technical Support can read persisted reservations and their owning events. */
  it('returns reservation rows only to Technical Support', async () => {
    listReservations.mockResolvedValue([{ equipmentName: 'Stage lighting', eventName: 'Open Day' }]);
    await expect(service.listReservations({ uid: 'tech', roles: ['TECH_SUPPORT'] })).resolves.toEqual([
      { equipmentName: 'Stage lighting', eventName: 'Open Day' },
    ]);
    await expect(service.listReservations(coordinator)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listReservations(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(listReservations).toHaveBeenCalledTimes(1);
  });

  /** SAFETY-OUTCOME-06: the coordinator receives a conflict when an equipment revision changes an arrangement not selected by the Safety Officer. */
  it('SAFETY-OUTCOME-06 refuses an update that changes unselected equipment', async () => {
    update.mockResolvedValue({ kind: 'invalid-safety-review-update', id: '00000000-0000-4000-8000-000000000099' });

    await expect(service.update(coordinator, '00000000-0000-4000-8000-000000000099', {
      eventId,
      items: [{ id: '00000000-0000-4000-8000-000000000126', equipmentName: 'Microphone', equipmentType: 'Audio', quantity: 1 }],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('SPM-113 reserve authentication and lookup', () => {
  /** EQUIP-RESERVE-03-SEC-1: an unauthenticated reserve is refused (401) without reading or writing. */
  it('refuses an unauthenticated reserve without touching the repository', async () => {
    reserve.mockClear();
    await expect(service.reserve(undefined, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('answers 404 when the request to reserve does not exist', async () => {
    reserve.mockResolvedValue({ kind: 'request-not-found' });
    await expect(service.reserve({ uid: 'support', roles: ['TECH_SUPPORT'] }, '00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundException);
  });
});
