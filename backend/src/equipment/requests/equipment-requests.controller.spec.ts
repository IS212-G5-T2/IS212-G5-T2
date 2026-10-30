import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentRequestsController } from './equipment-requests.controller.js';

const identity = { uid: 'coordinator-1', roles: ['COORDINATOR'] as const };
const request = { [CURRENT_USER_REQUEST_KEY]: identity } as AuthenticatedRequest;
const submit = vi.fn();
const listMine = vi.fn();
const listQueue = vi.fn();
const listReservations = vi.fn();
const listEligibleEvents = vi.fn();
const update = vi.fn();
const markCannotProvide = vi.fn();
const controller = new EquipmentRequestsController({ submit, update, markCannotProvide, listMine, listQueue, listReservations, listEligibleEvents } as never);

beforeEach(() => vi.resetAllMocks());

describe('SPM-57 equipment request controller', () => {
  /** EQUIP-REQUEST-01-A: the event picker endpoint passes only the authenticated coordinator identity. */
  it('forwards the eligible event picker read', () => {
    controller.listEligibleEvents(request);
    expect(listEligibleEvents).toHaveBeenCalledWith(identity);
  });

  /** EQUIP-REQUEST-03-A: HTTP submission forwards only the session identity and submitted request body. */
  it('forwards a request submission to the service', () => {
    const body = { eventId: 'event-1', items: [] };
    expect(controller.submit(request, body)).toBeUndefined();
    expect(submit).toHaveBeenCalledWith(identity, body);
  });

  /** EQUIP-REQUEST-10-A: the update endpoint forwards the session identity, selected request id, and edited body. */
  it('forwards an in-place request update to the service', () => {
    const body = { eventId: 'event-1', items: [{ equipmentName: 'Updated microphone', equipmentType: 'Audio', quantity: 2 }] };
    controller.update(request, 'request-1', body);
    expect(update).toHaveBeenCalledWith(identity, 'request-1', body);
  });

  /** EQUIP-REQUEST-06-A: My Equipment Requests reads use the authenticated session identity. */
  it('forwards the coordinator list read', () => {
    controller.listMine(request);
    expect(listMine).toHaveBeenCalledWith(identity);
  });

  /** EQUIP-REQUEST-07-A: review queue reads delegate with the authenticated caller for role enforcement. */
  it('forwards the Technical Support queue read', () => {
    controller.listQueue(request);
    expect(listQueue).toHaveBeenCalledWith(identity);
  });

  /** EQUIP-RESERVE-07-A: reservation reads forward the verified caller for Technical Support authorization. */
  it('forwards the reservation read', () => {
    controller.listReservations(request);
    expect(listReservations).toHaveBeenCalledWith(identity);
  });

  /** the cannot-provide endpoint forwards the caller, request id, and reason body. */
  it('forwards a cannot-provide decision to the service', () => {
    const body = { reason: 'Only 8 available; 10 requested.' };
    controller.cannotProvide(request, 'request-1', body);
    expect(markCannotProvide).toHaveBeenCalledWith(identity, 'request-1', body);
  });
});
