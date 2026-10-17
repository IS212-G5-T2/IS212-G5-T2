import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';
import { EQUIPMENT_TYPES } from '../../creation/dto/equipment-input.js';

export interface EquipmentRequestItemInput {
  equipmentName: string;
  equipmentType: (typeof EQUIPMENT_TYPES)[number];
  quantity: number;
}

export interface EquipmentRequestInput {
  eventId: string;
  items: EquipmentRequestItemInput[];
}

const MAX_QUANTITY = 2_147_483_647;
const FIELDS = ['eventId', 'items'];
const ITEM_FIELDS = ['equipmentName', 'equipmentType', 'quantity'];

function invalid(field: string, message: string): never {
  throw new BadRequestException({ message: 'Invalid equipment request.', errors: { [field]: message } });
}

/** Validates a multi-item request without trusting UI-side type or quantity checks. */
export function validateEquipmentRequest(value: unknown): EquipmentRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('body', 'Request details are required.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((field) => !FIELDS.includes(field))) invalid('body', 'The request contains unsupported fields.');
  if (typeof body.eventId !== 'string' || !UUID_PATTERN.test(body.eventId)) invalid('eventId', 'Choose a valid event.');
  if (!Array.isArray(body.items) || body.items.length === 0) invalid('items', 'Add at least one equipment item.');
  const items = body.items.map((candidate, index): EquipmentRequestItemInput => {
    const prefix = `items.${index}`;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) invalid(prefix, 'Equipment item details are required.');
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).some((field) => !ITEM_FIELDS.includes(field))) invalid(prefix, 'The equipment item contains unsupported fields.');
    if (typeof item.equipmentName !== 'string' || item.equipmentName.trim().length === 0) invalid(`${prefix}.equipmentName`, 'Equipment name is required.');
    if (typeof item.equipmentType !== 'string' || !EQUIPMENT_TYPES.includes(item.equipmentType as EquipmentRequestItemInput['equipmentType'])) invalid(`${prefix}.equipmentType`, 'Choose a valid equipment type.');
    if (item.quantity === undefined || item.quantity === null || item.quantity === '') invalid(`${prefix}.quantity`, 'Quantity is required.');
    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) invalid(`${prefix}.quantity`, `Quantity must be a whole number between 1 and ${MAX_QUANTITY}.`);
    return {
      equipmentName: item.equipmentName.trim(),
      equipmentType: item.equipmentType as EquipmentRequestItemInput['equipmentType'],
      quantity: item.quantity,
    };
  });
  return { eventId: body.eventId, items };
}
