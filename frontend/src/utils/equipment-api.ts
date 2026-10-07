import { api } from './api';
import type { EquipmentAuditEntry, EquipmentRecord } from '@/types';

export interface EquipmentInput {
  name: string;
  type: EquipmentRecord['type'];
  quantity: number;
  maintenanceStatus: EquipmentRecord['maintenanceStatus'];
  location: string;
}

export interface EquipmentListOptions {
  includeUnavailable?: boolean;
}

export interface AvailabilityUpdateInput {
  isAvailable: boolean;
  reason?: string;
}

export function createEquipment(input: EquipmentInput) {
  return api<{ equipment: EquipmentRecord; message: string }>('/equipment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getEquipment(options?: EquipmentListOptions) {
  const query = options?.includeUnavailable ? '?includeUnavailable=true' : '';
  return api<EquipmentRecord[]>(`/equipment${query}`);
}

export function getEquipmentLocations() {
  return api<string[]>('/equipment/locations');
}

/** SPM-119 AC1/AC2/AC6: marks an equipment record unavailable, or reactivates it. */
export function updateEquipmentAvailability(id: string, input: AvailabilityUpdateInput) {
  return api<{ equipment: EquipmentRecord }>(`/equipment/${id}/availability`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** SPM-119 AC5: the shared equipment availability audit trail. */
export function getEquipmentAuditTrail() {
  return api<EquipmentAuditEntry[]>('/equipment/audit-trail');
}
