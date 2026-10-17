import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';

export interface AvailabilityInput {
  isAvailable: boolean;
  reason?: string;
}

/** Reject malformed identifiers before PostgreSQL can turn them into a 500. */
export function validateEquipmentAvailabilityId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException({
      message: 'Invalid availability update.',
      errors: { id: 'Equipment ID must be a UUID.' },
    });
  }
}

/**
 * SPM-119 AC2/AC7: marking equipment unavailable requires a non-blank reason;
 * reactivating it does not (there is nothing to explain away).
 */
export function validateAvailabilityInput(input: unknown): AvailabilityInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException({
      message: 'Invalid availability update.',
      errors: { body: 'Availability details are required.' },
    });
  }
  const value = input as Record<string, unknown>;
  if (typeof value.isAvailable !== 'boolean') {
    throw new BadRequestException({
      message: 'Invalid availability update.',
      errors: { isAvailable: 'isAvailable must be true or false.' },
    });
  }
  if (value.isAvailable === false) {
    if (typeof value.reason !== 'string' || value.reason.trim().length === 0) {
      throw new BadRequestException({
        message: 'Invalid availability update.',
        errors: { reason: 'Enter a reason first.' },
      });
    }
    return { isAvailable: false, reason: value.reason.trim() };
  }
  return { isAvailable: true };
}
