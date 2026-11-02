import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateEquipmentRequest } from './equipment-request-input.js';

const eventId = '00000000-0000-4000-8000-000000000125';
const itemId = '00000000-0000-4000-8000-000000000126';

describe('SAFETY-OUTCOME-06 equipment revision input identifiers', () => {
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

  /** SAFETY-OUTCOME-06: a malformed item identifier is rejected before the request can mutate reservation rows. */
  it('SAFETY-OUTCOME-06 refuses an invalid stable item identifier', () => {
    expect(() => validateEquipmentRequest({
      eventId,
      items: [{ id: 'not-a-uuid', equipmentName: 'Projector', equipmentType: 'Visual', quantity: 1 }],
    })).toThrow(BadRequestException);
  });

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
