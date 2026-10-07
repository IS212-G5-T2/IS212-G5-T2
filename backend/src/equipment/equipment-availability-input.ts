import { BadRequestException } from '@nestjs/common';

export interface AvailabilityInput {
  isAvailable: boolean;
  reason?: string;
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
