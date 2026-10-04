import { api } from './api';
import type { EquipmentRecord } from '@/types';

export interface EquipmentInput {
  name: string;
  type: EquipmentRecord['type'];
  quantity: number;
  maintenanceStatus: EquipmentRecord['maintenanceStatus'];
  location: string;
}

export function createEquipment(input: EquipmentInput) {
  return api<{ equipment: EquipmentRecord; message: string }>('/equipment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getEquipment() {
  return api<EquipmentRecord[]>('/equipment');
}

export function getEquipmentLocations() {
  return api<string[]>('/equipment/locations');
}
