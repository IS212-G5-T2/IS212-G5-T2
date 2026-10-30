import { api } from '@/utils/api';
import type { EquipmentRecord, EventRecord } from '@/types';

export interface EquipmentRequestItemInput {
  equipmentName: string;
  equipmentType: EquipmentRecord['type'];
  quantity: number;
}
export interface EquipmentRequestInput { eventId: string; items: EquipmentRequestItemInput[] }
export interface EquipmentRequestRecord {
  id: string; reference: string; eventId: string; eventName: string;
  eventStart: string; eventEnd: string; expectedAttendance: number;
  eventStatus: 'Approved' | 'Planning' | 'Confirmed' | 'Cancelled' | 'Rejected';
  status: 'Pending Review' | 'Reserved' | 'Unavailable' | 'Cannot Provide' | 'Cancelled';
  requestedBy: string; coordinatorName: string | null; createdAt: string;
  decisionReason?: string | null;
  items: (EquipmentRequestItemInput & { id: string; availableQuantity?: number; sufficient?: boolean })[];
}
export interface EquipmentRequestSubmission {
  kind: 'created'; id: string; requestReference: string;
  event: Pick<EventRecord, 'id' | 'name' | 'status' | 'startDateTime' | 'endDateTime' | 'expectedAttendance'>;
}
export interface EquipmentRequestUpdate {
  kind: 'updated'; id: string; requestReference: string;
}
export type EquipmentRequestEvent = Pick<EventRecord,
  'id' | 'name' | 'status' | 'startDateTime' | 'endDateTime' | 'expectedAttendance'>;

export const getMyEquipmentRequests = () => api<EquipmentRequestRecord[]>('/equipment/requests');
export const getEquipmentRequestQueue = () => api<EquipmentRequestRecord[]>('/equipment/requests/review-queue');
export const reserveEquipmentRequest = (requestId: string) => api<{ kind: 'reserved'; id: string; requestReference: string }>(`/equipment/requests/${requestId}/reserve`, { method: 'PATCH' });
export const markRequestCannotProvide = (requestId: string, reason: string) => api<{ kind: 'cannot-provided'; id: string; requestReference: string }>(`/equipment/requests/${requestId}/cannot-provide`, {
  method: 'PATCH', body: JSON.stringify({ reason }),
});
export const submitEquipmentRequest = (input: EquipmentRequestInput) => api<EquipmentRequestSubmission>('/equipment/requests', {
  method: 'POST', body: JSON.stringify(input),
});
export const updateEquipmentRequest = (requestId: string, input: EquipmentRequestInput) => api<EquipmentRequestUpdate>(`/equipment/requests/${requestId}`, {
  method: 'PUT', body: JSON.stringify(input),
});
export const getAssignedEvents = () => api<EquipmentRequestEvent[]>('/equipment/requests/eligible-events');
