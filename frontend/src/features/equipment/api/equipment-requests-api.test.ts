import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/utils/api';
import { reserveEquipmentRequest, markRequestCannotProvide, getAssignedEvents, getEquipmentRequestQueue, getMyEquipmentRequests, submitEquipmentRequest, updateEquipmentRequest } from './equipment-requests-api';

vi.mock('@/utils/api', () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

beforeEach(() => apiMock.mockReset());

describe('SPM-57 equipment request API', () => {
  // Traceability: Jira 57 AC2 (matrix 28868989)
  /** EQUIP-REQUEST-02-A: the coordinator loads assigned events as request form context. */
  it('loads the assigned event list', () => {
    getAssignedEvents();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/eligible-events');
  });

  // Traceability: Jira 57 AC6 (matrix 28868989)
  /** EQUIP-REQUEST-06-A: the coordinator reads their own equipment request list. */
  it('loads the current coordinator request list', () => {
    getMyEquipmentRequests();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests');
  });

  // Traceability: Jira 57 AC7 (matrix 28868989)
  /** EQUIP-REQUEST-07-A: Technical Support reads the equipment review queue. */
  it('loads the review queue', () => {
    getEquipmentRequestQueue();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/review-queue');
  });

  // Traceability: Jira 57 AC3 (matrix 28868989)
  /** EQUIP-REQUEST-03-A: one submission sends the selected event and all requested items to the API. */
  it('posts the multi-item request payload', () => {
    const input = { eventId: 'event-57', items: [{ equipmentName: 'Microphone', equipmentType: 'Audio' as const, quantity: 1 }] };
    submitEquipmentRequest(input);
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests', { method: 'POST', body: JSON.stringify(input) });
  });

  // Traceability: Jira 57 AC10 (matrix 28868989)
  /** EQUIP-REQUEST-10-A: an edit uses PUT on the existing request id with its event and current item values. */
  it('sends an in-place update to the request-specific endpoint', () => {
    const input = { eventId: 'event-57', items: [{ equipmentName: 'Updated microphone', equipmentType: 'Audio' as const, quantity: 2 }] };
    updateEquipmentRequest('request-57', input);
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/request-57', { method: 'PUT', body: JSON.stringify(input) });
  });

  /** Cannot provide PATCHes the request-specific endpoint with the reason. */
  it('sends the Cannot provide reason to the request-specific endpoint', () => {
    markRequestCannotProvide('request-58', 'Only 8 available');
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/request-58/cannot-provide', { method: 'PATCH', body: JSON.stringify({ reason: 'Only 8 available' }) });
  });

  /** Reserve PATCHes the request-specific reserve endpoint. */
  it('sends the reserve action to the request-specific endpoint', () => {
    reserveEquipmentRequest('request-59');
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/request-59/reserve', { method: 'PATCH' });
  });
});
