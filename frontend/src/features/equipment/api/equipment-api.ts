import { api } from "@/utils/api";
import type { EquipmentAuditEntry, EquipmentRecord } from '@/types';

export interface EquipmentInput {
  name: string;
  type: EquipmentRecord['type'];
  activeQuantity: number;
  underMaintenanceQuantity: number;
  retiredQuantity: number;
  location: string;
}

export interface EquipmentListOptions {
  includeUnavailable?: boolean;
}

export interface AvailabilityUpdateInput {
  isAvailable: boolean;
  reason?: string;
}

/** SPM-113: one equipment record evaluated for a requested event window. */
export interface EquipmentAvailabilityResult {
  id: string;
  name: string;
  type: EquipmentRecord["type"];
  location: string;
  activeQuantity: number;
  underMaintenanceQuantity: number;
  retiredQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  reason: string | null;
  reservedUntil: string | null;
}

export interface EquipmentAvailabilityOptions {
  startDateTime: string;
  endDateTime: string;
  equipmentType?: EquipmentRecord["type"];
}

export function createEquipment(input: EquipmentInput) {
  return api<{ equipment: EquipmentRecord; message: string }>('/equipment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** SPM-118 AC2/AC5/AC6: save the editable inventory fields for one equipment record. */
export function updateEquipment(id: string, input: EquipmentInput) {
  return api<{ equipment: EquipmentRecord; message: string }>(`/equipment/${id}`, {
    method: 'PUT',
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

/** SPM-113 AC1–AC7: checks live Active stock against Reserved requests for a time window. */
export function getEquipmentAvailability(options: EquipmentAvailabilityOptions) {
  const query = new URLSearchParams({
    startDateTime: options.startDateTime,
    endDateTime: options.endDateTime,
  });
  if (options.equipmentType) query.set("equipmentType", options.equipmentType);
  return api<EquipmentAvailabilityResult[]>(`/equipment/availability?${query.toString()}`);
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
