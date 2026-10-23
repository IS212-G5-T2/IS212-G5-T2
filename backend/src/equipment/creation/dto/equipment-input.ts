import { BadRequestException } from '@nestjs/common';

export const EQUIPMENT_TYPES = [
  'Audio',
  'Visual',
  'Furniture',
  'Lighting',
  'Other',
] as const;
export const EQUIPMENT_MAINTENANCE_STATUSES = [
  'Active',
  'Under Maintenance',
  'Retired',
] as const;
export const MAX_EQUIPMENT_QUANTITY = 2_147_483_647;

export interface EquipmentInput {
  name: string;
  type: (typeof EQUIPMENT_TYPES)[number];
  activeQuantity: number;
  underMaintenanceQuantity: number;
  retiredQuantity: number;
  quantity: number;
  maintenanceStatus: (typeof EQUIPMENT_MAINTENANCE_STATUSES)[number];
  location: string;
}

const QUANTITY_FIELDS = [
  ['activeQuantity', 'Active quantity'],
  ['underMaintenanceQuantity', 'Under Maintenance quantity'],
  ['retiredQuantity', 'Retired quantity'],
] as const;

function fail(field: string, message: string): never {
  throw new BadRequestException({
    message: 'Invalid equipment record.',
    errors: { [field]: message },
  });
}

function validateStatusQuantity(
  value: Record<string, unknown>,
  field: (typeof QUANTITY_FIELDS)[number][0],
  label: (typeof QUANTITY_FIELDS)[number][1],
): number {
  if (value[field] === undefined || value[field] === null || value[field] === '') {
    fail(field, `${label} is required.`);
  }
  if (
    typeof value[field] !== 'number' ||
    !Number.isInteger(value[field]) ||
    value[field] < 0 ||
    value[field] > MAX_EQUIPMENT_QUANTITY
  ) {
    fail(
      field,
      `${label} must be a whole number between 0 and ${MAX_EQUIPMENT_QUANTITY}.`,
    );
  }
  return value[field];
}

function legacyMaintenanceStatus(input: Pick<EquipmentInput, 'activeQuantity' | 'underMaintenanceQuantity' | 'retiredQuantity'>) {
  if (input.activeQuantity > 0) return 'Active';
  if (input.underMaintenanceQuantity > 0) return 'Under Maintenance';
  return 'Retired';
}

export function getLegacyMaintenanceStatus(
  input: Pick<EquipmentInput, 'activeQuantity' | 'underMaintenanceQuantity' | 'retiredQuantity'>,
): 'Active' | 'Under Maintenance' | 'Retired' {
  return legacyMaintenanceStatus(input);
}

export function validateEquipmentInput(input: unknown): EquipmentInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('body', 'Equipment details are required.');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    fail('name', 'Equipment name is required.');
  }
  if (typeof value.type !== 'string' || value.type.length === 0)
    fail('type', 'Equipment type is required.');
  if (!EQUIPMENT_TYPES.includes(value.type as EquipmentInput['type'])) {
    fail('type', 'Equipment type must be from the predefined list.');
  }
  const hasBreakdown = QUANTITY_FIELDS.some(([field]) =>
    Object.hasOwn(value, field),
  );
  if (
    hasBreakdown &&
    (Object.hasOwn(value, 'quantity') || Object.hasOwn(value, 'maintenanceStatus'))
  ) {
    fail(
      'quantity',
      'Do not combine status quantities with legacy quantity or maintenanceStatus.',
    );
  }
  let activeQuantity: number;
  let underMaintenanceQuantity: number;
  let retiredQuantity: number;
  if (
    !hasBreakdown &&
    (Object.hasOwn(value, 'quantity') || Object.hasOwn(value, 'maintenanceStatus'))
  ) {
    // Existing SPM-111/118 callers remain compatible; every stored row is
    // still normalized into the three canonical status buckets.
    if (value.quantity === undefined || value.quantity === null || value.quantity === '') {
      fail('quantity', 'Quantity is required.');
    }
    if (
      typeof value.quantity !== 'number' ||
      !Number.isInteger(value.quantity) ||
      value.quantity < 1 ||
      value.quantity > MAX_EQUIPMENT_QUANTITY
    ) {
      fail(
        'quantity',
        `Quantity must be a whole number between 1 and ${MAX_EQUIPMENT_QUANTITY}.`,
      );
    }
    if (typeof value.maintenanceStatus !== 'string' || value.maintenanceStatus.length === 0) {
      fail('maintenanceStatus', 'Maintenance status is required.');
    }
    if (
      !EQUIPMENT_MAINTENANCE_STATUSES.includes(
        value.maintenanceStatus as EquipmentInput['maintenanceStatus'],
      )
    ) {
      fail('maintenanceStatus', 'Maintenance status must be from the predefined list.');
    }
    activeQuantity = value.maintenanceStatus === 'Active' ? value.quantity : 0;
    underMaintenanceQuantity =
      value.maintenanceStatus === 'Under Maintenance' ? value.quantity : 0;
    retiredQuantity = value.maintenanceStatus === 'Retired' ? value.quantity : 0;
  } else {
    activeQuantity = validateStatusQuantity(
      value,
      'activeQuantity',
      'Active quantity',
    );
    underMaintenanceQuantity = validateStatusQuantity(
      value,
      'underMaintenanceQuantity',
      'Under Maintenance quantity',
    );
    retiredQuantity = validateStatusQuantity(
      value,
      'retiredQuantity',
      'Retired quantity',
    );
  }
  const quantity = activeQuantity + underMaintenanceQuantity + retiredQuantity;
  if (quantity < 1) {
    fail('activeQuantity', 'The total equipment quantity must be at least 1.');
  }
  if (quantity > MAX_EQUIPMENT_QUANTITY) {
    fail(
      'activeQuantity',
      `The total equipment quantity must not exceed ${MAX_EQUIPMENT_QUANTITY}.`,
    );
  }
  if (
    typeof value.location !== 'string' ||
    value.location.trim().length === 0
  ) {
    fail('location', 'Location is required.');
  }
  return {
    name: value.name.trim(),
    type: value.type as EquipmentInput['type'],
    activeQuantity,
    underMaintenanceQuantity,
    retiredQuantity,
    quantity,
    maintenanceStatus: getLegacyMaintenanceStatus({
      activeQuantity,
      underMaintenanceQuantity,
      retiredQuantity,
    }),
    location: value.location.trim(),
  };
}
