import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_MAINTENANCE_STATUSES,
  EQUIPMENT_TYPES,
  MAX_EQUIPMENT_QUANTITY,
  validateEquipmentInput,
} from './equipment-input.js';

const validInput = {
  name: 'Conference projector',
  type: 'Audio',
  quantity: 5,
  maintenanceStatus: 'Active',
  location: 'Storage Room A',
};

function expectFieldError(input: unknown, field: string) {
  expect(() => validateEquipmentInput(input)).toThrow(BadRequestException);

  try {
    validateEquipmentInput(input);
  } catch (error) {
    expect((error as BadRequestException).getResponse()).toMatchObject({
      errors: { [field]: expect.any(String) },
    });
  }
}

function expectExactFieldError(input: unknown, field: string, message: string) {
  try {
    validateEquipmentInput(input);
  } catch (error) {
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Invalid equipment record.',
      errors: { [field]: message },
    });
    return;
  }
  throw new Error('Expected validation to reject the input');
}

describe('validateEquipmentInput', () => {
  // SPM-111 EQUIP-CRE-03-C: direct callers cannot submit a malformed request envelope.
  it.each([null, [], 'invalid'])(
    'EQUIP-CRE-03-C rejects malformed equipment input envelope %j',
    (input) => {
      // Act and assert: validation rejects the body before inspecting individual fields.
      expectFieldError(input, 'body');
    },
  );

  // SPM-111 EQUIP-CRE-02-A: a complete record keeps all submitted values, including its name and location.
  it('EQUIP-CRE-02-A accepts equipment name, type, quantity, maintenance status, and location', () => {
    // Arrange: a Technical Support user has provided every required field.
    const input = { ...validInput };

    // Act: validate the API payload before it reaches persistence.
    const result = validateEquipmentInput(input);

    // Assert: all fields are retained exactly as submitted.
    expect(result).toEqual(input);
  });

  // SPM-111 EQUIP-CRE-02-A: validation returns only the documented equipment contract.
  it('EQUIP-CRE-02-A removes unknown request properties from validated input', () => {
    // Act: submit a valid payload containing an unsupported client-controlled property.
    const result = validateEquipmentInput({ ...validInput, id: 'forged-id' });

    // Assert: only the five API fields can reach persistence.
    expect(result).toEqual(validInput);
  });

  // SPM-111 EQUIP-CRE-03-A/C: the original required fields are enforced by the API.
  it.each([
    ['equipment name', 'name'],
    ['type', 'type'],
    ['quantity', 'quantity'],
    ['maintenance status', 'maintenanceStatus'],
  ])('EQUIP-CRE-03-A/C rejects a missing %s', (_label, field) => {
    // Arrange: remove one field from an otherwise valid request.
    const input = { ...validInput } as Record<string, unknown>;
    delete input[field];

    // Act and assert: the corresponding field receives a validation error.
    expectFieldError(input, field);
  });

  // SPM-111 EQUIP-CRE-03-D: location is required independently of the other form fields.
  it('EQUIP-CRE-03-D rejects a missing location', () => {
    expectFieldError(
      {
        name: validInput.name,
        type: validInput.type,
        quantity: validInput.quantity,
        maintenanceStatus: validInput.maintenanceStatus,
      },
      'location',
    );
  });

  // SPM-111 EQUIP-CRE-03-A/C: whitespace-only names are not valid equipment names.
  it('EQUIP-CRE-03-A/C rejects a blank equipment name', () => {
    expectFieldError({ ...validInput, name: '   ' }, 'name');
  });

  // SPM-111 EQUIP-CRE-03-D: whitespace-only locations are not valid locations.
  it('EQUIP-CRE-03-D rejects a blank location', () => {
    expectFieldError({ ...validInput, location: '   ' }, 'location');
  });

  // SPM-111 EQUIP-CRE-02-A: a submitted location is trimmed before persistence.
  it('EQUIP-CRE-02-A trims surrounding whitespace from the location', () => {
    expect(
      validateEquipmentInput({ ...validInput, location: '  Storage Room A  ' })
        .location,
    ).toBe('Storage Room A');
  });

  // SPM-111 EQUIP-CRE-02-A: names are normalised the same way as locations.
  it('EQUIP-CRE-02-A trims surrounding whitespace from the equipment name', () => {
    // Act and assert: stored names do not retain accidental surrounding spaces.
    expect(
      validateEquipmentInput({
        ...validInput,
        name: '  Conference projector  ',
      }).name,
    ).toBe('Conference projector');
  });

  // SPM-111 EQUIP-CRE-03-B/BND-1: only positive whole-number quantities work.
  it.each([0, -1, 1.5, '5', 'abc', '5kg', '', ' ', null, undefined])(
    'EQUIP-CRE-03-B/BND-1 rejects invalid quantity %j',
    (quantity) => {
      // Arrange: retain valid enum values while varying the quantity boundary.
      const input = { ...validInput, quantity };

      // Act and assert: invalid values do not pass server-side validation.
      expectFieldError(input, 'quantity');
    },
  );

  // SPM-111 EQUIP-CRE-03-BND-1: the minimum valid quantity is one.
  it.each([1, 250, MAX_EQUIPMENT_QUANTITY])(
    'EQUIP-CRE-03-BND-1 accepts positive whole quantity %i',
    (quantity) => {
      // Arrange and act: submit a valid boundary value.
      const result = validateEquipmentInput({ ...validInput, quantity });

      // Assert: the accepted integer is preserved.
      expect(result.quantity).toBe(quantity);
    },
  );

  // SPM-111 EQUIP-CRE-03-BND-2: quantities must fit the PostgreSQL integer column.
  it.each([MAX_EQUIPMENT_QUANTITY + 1, 1e21])(
    'EQUIP-CRE-03-BND-2 rejects an out-of-range quantity %i',
    (quantity) => {
      // Act and assert: persistence errors are prevented at the API boundary.
      expectFieldError({ ...validInput, quantity }, 'quantity');
    },
  );

  // SPM-111 EQUIP-CRE-03-B: quantity failures expose the documented field-specific message.
  it('EQUIP-CRE-03-B returns the exact quantity validation message', () => {
    expectExactFieldError(
      { ...validInput, quantity: 0 },
      'quantity',
      `Quantity must be a whole number between 1 and ${MAX_EQUIPMENT_QUANTITY}.`,
    );
  });

  // SPM-111 EQUIP-CRE-07-A/B: types are exactly the supplied predefined list.
  it('EQUIP-CRE-07-A exposes the exact allowed equipment types', () => {
    // Assert: the list used by the API is the story's exact predefined list.
    expect(EQUIPMENT_TYPES).toEqual([
      'Audio',
      'Visual',
      'Furniture',
      'Lighting',
      'Other',
    ]);
  });

  // SPM-111 EQUIP-CRE-07-A: each supplied type is individually accepted.
  it.each(EQUIPMENT_TYPES)(
    'EQUIP-CRE-07-A accepts allowed equipment type %s',
    (type) => {
      expect(validateEquipmentInput({ ...validInput, type }).type).toBe(type);
    },
  );

  // SPM-111 EQUIP-CRE-07-B: every unsupported type is rejected consistently.
  it.each(['Projector', 'audio', '', null])(
    'EQUIP-CRE-07-B rejects equipment type outside the predefined list: %j',
    (type) => {
      // Act and assert: unsupported type values cannot reach persistence.
      expectFieldError({ ...validInput, type }, 'type');
    },
  );

  // SPM-111 EQUIP-CRE-07-B: unsupported types expose the documented field-specific message.
  it('EQUIP-CRE-07-B returns the exact type validation message', () => {
    expectExactFieldError(
      { ...validInput, type: 'Projector' },
      'type',
      'Equipment type must be from the predefined list.',
    );
  });

  // SPM-111 EQUIP-CRE-06-A/B: statuses are exactly the supplied predefined list.
  it('EQUIP-CRE-06-A exposes the exact allowed maintenance statuses', () => {
    // Assert: the list used by the API is the story's exact predefined list.
    expect(EQUIPMENT_MAINTENANCE_STATUSES).toEqual([
      'Active',
      'Under Maintenance',
      'Retired',
    ]);
  });

  // SPM-111 EQUIP-CRE-06-A: each supplied status is individually accepted.
  it.each(EQUIPMENT_MAINTENANCE_STATUSES)(
    'EQUIP-CRE-06-A accepts allowed maintenance status %s',
    (maintenanceStatus) => {
      expect(
        validateEquipmentInput({ ...validInput, maintenanceStatus })
          .maintenanceStatus,
      ).toBe(maintenanceStatus);
    },
  );

  // SPM-111 EQUIP-CRE-06-B: every unsupported status is rejected consistently.
  it.each(['Broken', 'active', '', null])(
    'EQUIP-CRE-06-B rejects maintenance status outside the predefined list: %j',
    (maintenanceStatus) => {
      // Act and assert: unsupported status values cannot reach persistence.
      expectFieldError(
        { ...validInput, maintenanceStatus },
        'maintenanceStatus',
      );
    },
  );

  // SPM-111 EQUIP-CRE-06-B: unsupported statuses expose the documented field-specific message.
  it('EQUIP-CRE-06-B returns the exact maintenance-status validation message', () => {
    expectExactFieldError(
      { ...validInput, maintenanceStatus: 'Broken' },
      'maintenanceStatus',
      'Maintenance status must be from the predefined list.',
    );
  });
});
