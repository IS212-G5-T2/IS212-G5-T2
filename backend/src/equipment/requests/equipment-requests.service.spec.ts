import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
const listEligibleEvents = vi.fn();
const update = vi.fn();
const service = new EquipmentRequestsService({ submit, update, listMine, listQueue, listEligibleEvents } as unknown as EquipmentRequestsRepository);

beforeEach(() => vi.resetAllMocks());

describe('SPM-57 equipment request service', () => {
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

  /** EQUIP-REQUEST-10-N: an authenticated non-coordinator cannot invoke request updates. */
  it('requires an authenticated coordinator before repository update access', async () => {
    await expect(service.update(undefined, 'request-1', body)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.update({ uid: 'staff', roles: ['TECH_SUPPORT'] }, 'request-1', body)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  /** EQUIP-REQUEST-10-N: a request not owned by the coordinator is hidden as not found. */
  it('hides a request that does not belong to the caller', async () => {
    update.mockResolvedValue({ kind: 'request-not-found' });
    await expect(service.update(coordinator, 'request-1', body)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** EQUIP-REQUEST-10-BND-1: an event confirmed after request submission blocks any further edits. */
  it('refuses updates after the event becomes Confirmed', async () => {
    update.mockResolvedValue({ kind: 'event-confirmed' });
    await expect(service.update(coordinator, 'request-1', body)).rejects.toBeInstanceOf(ConflictException);
  });

  /** EQUIP-REQUEST-10-BND-1: closed, non-confirmed event states are also excluded by request eligibility rules. */
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

  /** EQUIP-REQUEST-11-N: an already-requested event cannot be submitted again. */
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
});
