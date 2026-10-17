import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/utils/api';
import { getAssignedEvents, getEquipmentRequestQueue, getMyEquipmentRequests, submitEquipmentRequest, updateEquipmentRequest } from './equipment-requests-api';

vi.mock('@/utils/api', () => ({ api: vi.fn() }));
const apiMock = vi.mocked(api);

beforeEach(() => apiMock.mockReset());

describe('SPM-57 equipment request API', () => {
  /** EQUIP-REQUEST-02-A: the coordinator loads assigned events as request form context. */
  it('loads the assigned event list', () => {
    getAssignedEvents();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/eligible-events');
  });

  /** EQUIP-REQUEST-06-A: the coordinator reads their own equipment request list. */
  it('loads the current coordinator request list', () => {
    getMyEquipmentRequests();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests');
  });

  /** EQUIP-REQUEST-07-A: Technical Support reads the equipment review queue. */
  it('loads the review queue', () => {
    getEquipmentRequestQueue();
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/review-queue');
  });

  /** EQUIP-REQUEST-03-A: one submission sends the selected event and all requested items to the API. */
  it('posts the multi-item request payload', () => {
    const input = { eventId: 'event-57', items: [{ equipmentName: 'Microphone', equipmentType: 'Audio' as const, quantity: 1 }] };
    submitEquipmentRequest(input);
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests', { method: 'POST', body: JSON.stringify(input) });
  });

  /** EQUIP-REQUEST-10-A: an edit uses PUT on the existing request id with its event and current item values. */
  it('sends an in-place update to the request-specific endpoint', () => {
    const input = { eventId: 'event-57', items: [{ equipmentName: 'Updated microphone', equipmentType: 'Audio' as const, quantity: 2 }] };
    updateEquipmentRequest('request-57', input);
    expect(apiMock).toHaveBeenCalledWith('/equipment/requests/request-57', { method: 'PUT', body: JSON.stringify(input) });
  });
});
