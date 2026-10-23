import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateEquipmentAvailabilityQuery } from './equipment-availability-query.js';

describe('SPM-113 equipment availability period validation', () => {
  /** EQUIP-AVAIL-01-A: a one-minute ISO event window is accepted. */
  it('EQUIP-AVAIL-01-A accepts a one-minute period and optional type', () => {
    expect(validateEquipmentAvailabilityQuery({ startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z', equipmentType: 'Lighting' })).toMatchObject({ equipmentType: 'Lighting' });
  });
  it('accepts a period without a type filter', () => {
    expect(validateEquipmentAvailabilityQuery({ startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z' })).not.toHaveProperty('equipmentType');
  });
  /** EQUIP-AVAIL-01-C: reversed dates return a user-facing validation failure. */
  it('EQUIP-AVAIL-01-C rejects an end at or before the start', () => {
    expect(() => validateEquipmentAvailabilityQuery({ startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:00:00.000Z' })).toThrow(BadRequestException);
  });
  it('rejects malformed dates and unsupported types', () => {
    expect(() => validateEquipmentAvailabilityQuery({ startDateTime: 'nope', endDateTime: '2030-01-01T10:01:00.000Z' })).toThrow(BadRequestException);
    expect(() => validateEquipmentAvailabilityQuery({ startDateTime: 123, endDateTime: '2030-01-01T10:01:00.000Z' })).toThrow(BadRequestException);
    expect(() => validateEquipmentAvailabilityQuery({ startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z', equipmentType: 'Invalid' })).toThrow(BadRequestException);
  });
});
