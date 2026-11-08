import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateEquipmentRequest } from './equipment-request-input.js';

const eventId = '00000000-0000-4000-8000-000000000125';
const itemId = '00000000-0000-4000-8000-000000000126';

describe('SAFETY-OUTCOME-06 equipment revision input identifiers', () => {
  // Traceability: Jira 131 AC6 (matrix 36798544)
  /** SAFETY-OUTCOME-06: valid existing item IDs survive DTO validation so the repository can update retained rows by identity. */
  it('SAFETY-OUTCOME-06 preserves a valid stable item identifier', () => {
    expect(validateEquipmentRequest({
      eventId,
      items: [{ id: itemId, equipmentName: 'Replacement projector', equipmentType: 'Visual', quantity: 2 }],
    })).toEqual({
      eventId,
      items: [{ id: itemId, equipmentName: 'Replacement projector', equipmentType: 'Visual', quantity: 2 }],
    });
  });

  // Traceability: Jira 131 AC6 (matrix 36798544)
  /** SAFETY-OUTCOME-06: a malformed item identifier is rejected before the request can mutate reservation rows. */
  it('SAFETY-OUTCOME-06 refuses an invalid stable item identifier', () => {
    expect(() => validateEquipmentRequest({
      eventId,
      items: [{ id: 'not-a-uuid', equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 }],
    })).toThrow(BadRequestException);
  });

  // Traceability: Jira 131 AC6 (matrix 36798544)
  /** SAFETY-OUTCOME-06: new non-revision requests may omit item IDs, while updates preserve only IDs actually supplied. */
  it('SAFETY-OUTCOME-06 leaves identifiers absent on new request items', () => {
    expect(validateEquipmentRequest({
      eventId,
      items: [{ equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 }],
    })).toEqual({
      eventId,
      items: [{ equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 }],
    });
  });
});

describe('SPM-57 equipment request input validation', () => {
  const goodItem = { equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 };
  const errorsOf = (value: unknown): Record<string, string> => {
    try {
      validateEquipmentRequest(value);
    } catch (error) {
      return ((error as BadRequestException).getResponse() as { errors: Record<string, string> }).errors;
    }
    throw new Error('expected validation to fail');
  };

  it.each([
    ['null body', null, 'body'],
    ['array body', [], 'body'],
    ['unsupported body field', { eventId, items: [goodItem], extra: 1 }, 'body'],
    ['non-UUID event id', { eventId: 'nope', items: [goodItem] }, 'eventId'],
    ['missing event id', { items: [goodItem] }, 'eventId'],
    ['non-array items', { eventId, items: 'x' }, 'items'],
    ['empty items', { eventId, items: [] }, 'items'],
    ['null item', { eventId, items: [null] }, 'items.0'],
    ['array item', { eventId, items: [[]] }, 'items.0'],
    ['unsupported item field', { eventId, items: [{ ...goodItem, note: 'x' }] }, 'items.0'],
    ['blank equipment name', { eventId, items: [{ ...goodItem, equipmentName: '   ' }] }, 'items.0.equipmentName'],
    ['non-string equipment name', { eventId, items: [{ ...goodItem, equipmentName: 5 }] }, 'items.0.equipmentName'],
    ['unknown equipment type', { eventId, items: [{ ...goodItem, equipmentType: 'Weapons' }] }, 'items.0.equipmentType'],
    ['missing equipment type', { eventId, items: [{ equipmentName: 'Projector', quantity: 1 }] }, 'items.0.equipmentType'],
    ['missing quantity', { eventId, items: [{ equipmentName: 'Projector', equipmentType: 'Visual' }] }, 'items.0.quantity'],
    ['null quantity', { eventId, items: [{ ...goodItem, quantity: null }] }, 'items.0.quantity'],
    ['empty-string quantity', { eventId, items: [{ ...goodItem, quantity: '' }] }, 'items.0.quantity'],
    ['string quantity', { eventId, items: [{ ...goodItem, quantity: '2' }] }, 'items.0.quantity'],
    ['fractional quantity', { eventId, items: [{ ...goodItem, quantity: 1.5 }] }, 'items.0.quantity'],
    ['zero quantity', { eventId, items: [{ ...goodItem, quantity: 0 }] }, 'items.0.quantity'],
    ['quantity above the integer ceiling', { eventId, items: [{ ...goodItem, quantity: 2_147_483_648 }] }, 'items.0.quantity'],
    ['invalid item id on the second item', { eventId, items: [goodItem, { ...goodItem, id: 5 }] }, 'items.1.id'],
  ])('rejects %s and names the offending field', (_name, value, field) => {
    expect(Object.keys(errorsOf(value))).toEqual([field]);
  });

  it('trims the equipment name and accepts the integer ceiling as a quantity', () => {
    expect(validateEquipmentRequest({ eventId, items: [{ ...goodItem, equipmentName: '  Projector  ', quantity: 2_147_483_647 }] }).items)
      .toEqual([{ equipmentName: 'Projector', equipmentType: 'Visual', quantity: 2_147_483_647 }]);
  });
});
