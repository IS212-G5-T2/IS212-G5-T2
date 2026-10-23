import { BadRequestException } from '@nestjs/common';

export interface EquipmentAvailabilityQuery {
  start: Date;
  end: Date;
  equipmentType?: string;
}

const EQUIPMENT_TYPES = new Set(['Audio', 'Visual', 'Furniture', 'Lighting', 'Other']);

/** SPM-113 AC1: validates an event window supplied as ISO instants by the client. */
export function validateEquipmentAvailabilityQuery(value: Record<string, unknown>): EquipmentAvailabilityQuery {
  const startValue = value.startDateTime;
  const endValue = value.endDateTime;
  const start = typeof startValue === 'string' ? new Date(startValue) : new Date('');
  const end = typeof endValue === 'string' ? new Date(endValue) : new Date('');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException({ message: 'Invalid availability period.', errors: { period: 'Enter valid start and end date-times.' } });
  }
  if (end.getTime() - start.getTime() < 60_000) {
    throw new BadRequestException({ message: 'Invalid availability period.', errors: { endDateTime: 'End date-time must be at least one minute after start date-time.' } });
  }
  const type = value.equipmentType;
  if (type !== undefined && (typeof type !== 'string' || !EQUIPMENT_TYPES.has(type))) {
    throw new BadRequestException({ message: 'Invalid availability period.', errors: { equipmentType: 'Choose a valid equipment type.' } });
  }
  return { start, end, ...(type !== undefined && { equipmentType: type }) };
}
