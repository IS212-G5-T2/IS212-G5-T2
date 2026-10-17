import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateEquipmentRequest } from './equipment-request-input.js';

const eventId = '00000000-0000-4000-8000-000000000125';
const valid = { eventId, items: [{ equipmentName: 'Projector', equipmentType: 'Audio', quantity: 1 }] };

describe('SPM-57 equipment request validation', () => {
  /** EQUIP-REQUEST-03-A: one or more equipment items require a name, supported type, and positive whole quantity; names are trimmed like SPM-111. */
  it('accepts one and multiple valid named items and trims equipment names', () => {
    expect(validateEquipmentRequest(valid).items).toEqual([{ equipmentName: 'Projector', equipmentType: 'Audio', quantity: 1 }]);
    expect(validateEquipmentRequest({ eventId, items: [valid.items[0], { equipmentName: '  HDMI cable  ', equipmentType: 'Visual', quantity: 3 }] }).items[1]).toEqual({ equipmentName: 'HDMI cable', equipmentType: 'Visual', quantity: 3 });
  });

  /** EQUIP-REQUEST-03-BND-1: the largest PostgreSQL signed integer quantity is accepted without imposing a lower business cap. */
  it('accepts the maximum PostgreSQL integer quantity', () => {
    expect(validateEquipmentRequest({ eventId, items: [{ ...valid.items[0], quantity: 2_147_483_647 }] }).items[0].quantity).toBe(2_147_483_647);
  });

  /** EQUIP-REQUEST-03-BND-1: values below one, non-whole values, and values above the PostgreSQL integer boundary are rejected. */
  it.each([0, -1, 1.5, '1', 2_147_483_648])('rejects quantity %s', (quantity) => {
    expect(() => validateEquipmentRequest({ eventId, items: [{ ...valid.items[0], quantity }] })).toThrow(BadRequestException);
  });

  /** EQUIP-REQUEST-03-N: absent, empty, or whitespace-only equipment names are refused. */
  it.each([undefined, '', '   '])('rejects missing or blank equipment name %j', (equipmentName) => {
    expect(() => validateEquipmentRequest({ eventId, items: [{ equipmentName, equipmentType: 'Audio', quantity: 1 }] })).toThrow(BadRequestException);
  });

  /** EQUIP-REQUEST-04-A: missing equipment type or quantity is rejected before persistence. */
  it.each([
    [{ equipmentName: 'Projector', quantity: 1 }, 'items.0.equipmentType'],
    [{ equipmentName: 'Projector', equipmentType: 'Audio' }, 'items.0.quantity'],
    [{ equipmentType: 'Audio', quantity: 1 }, 'items.0.equipmentName'],
  ])('rejects a missing required item field', (item, field) => {
    try { validateEquipmentRequest({ eventId, items: [item] }); }
    catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ errors: { [field]: expect.any(String) } });
      return;
    }
    throw new Error(`Expected validation to reject missing ${field}.`);
  });

  /** EQUIP-REQUEST-04-N: unsupported equipment types are rejected. */
  it('rejects an invalid equipment type', () => {
    expect(() => validateEquipmentRequest({ eventId, items: [{ ...valid.items[0], equipmentType: 'Unknown' }] })).toThrow(BadRequestException);
  });

  /** EQUIP-REQUEST-04-N: malformed envelopes and empty item lists cannot create a request. */
  it.each([null, [], {}, { ...valid, eventId: 'bad' }, { ...valid, extra: true }, { eventId, items: [] }])('rejects malformed request payloads', (body) => {
    expect(() => validateEquipmentRequest(body)).toThrow(BadRequestException);
  });

  /** EQUIP-REQUEST-04-N: each item must be a non-null object rather than an array or scalar. */
  it.each([null, [], 'item'])('rejects a non-object equipment item', (item) => {
    expect(() => validateEquipmentRequest({ eventId, items: [item] })).toThrow(BadRequestException);
  });

  /** EQUIP-REQUEST-04-N: an item cannot smuggle unsupported request fields, including removed technical requirements. */
  it('rejects unsupported item properties', () => {
    expect(() => validateEquipmentRequest({ eventId, items: [{ ...valid.items[0], status: 'Reserved' }] })).toThrow(BadRequestException);
    expect(() => validateEquipmentRequest({ eventId, items: [{ ...valid.items[0], technicalRequirements: 'XLR' }] })).toThrow(BadRequestException);
  });
});
