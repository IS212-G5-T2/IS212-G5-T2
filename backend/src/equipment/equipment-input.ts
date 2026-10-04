import { BadRequestException } from '@nestjs/common';

export const EQUIPMENT_TYPES = ['Audio', 'Visual', 'Furniture', 'Lighting', 'Other'] as const;
export const EQUIPMENT_MAINTENANCE_STATUSES = [
  'Active',
  'Under Maintenance',
  'Retired',
] as const;

export interface EquipmentInput {
  name: string;
  type: (typeof EQUIPMENT_TYPES)[number];
  quantity: number;
  maintenanceStatus: (typeof EQUIPMENT_MAINTENANCE_STATUSES)[number];
}

function fail(field: string, message: string): never {
  throw new BadRequestException({ message: 'Invalid equipment record.', errors: { [field]: message } });
}

export function validateEquipmentInput(input: unknown): EquipmentInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('body', 'Equipment details are required.');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    fail('name', 'Equipment name is required.');
  }
  if (typeof value.type !== 'string' || value.type.length === 0) fail('type', 'Equipment type is required.');
  if (!EQUIPMENT_TYPES.includes(value.type as EquipmentInput['type'])) {
    fail('type', 'Equipment type must be from the predefined list.');
  }
  if (value.quantity === undefined || value.quantity === null || value.quantity === '') {
    fail('quantity', 'Quantity is required.');
  }
  if (typeof value.quantity !== 'number' || !Number.isInteger(value.quantity) || value.quantity < 1) {
    fail('quantity', 'Quantity must be a positive whole number.');
  }
  if (typeof value.maintenanceStatus !== 'string' || value.maintenanceStatus.length === 0) {
    fail('maintenanceStatus', 'Maintenance status is required.');
  }
  if (!EQUIPMENT_MAINTENANCE_STATUSES.includes(value.maintenanceStatus as EquipmentInput['maintenanceStatus'])) {
    fail('maintenanceStatus', 'Maintenance status must be from the predefined list.');
  }
  return { ...value, name: value.name.trim() } as unknown as EquipmentInput;
}
