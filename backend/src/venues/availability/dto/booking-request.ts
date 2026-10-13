import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';

export interface BookingRequestInput {
  eventId: string;
  start: string;
  end: string;
}

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;

/** Validates the event and absolute interval accepted for a venue request. */
export function validateBookingRequest(value: unknown): BookingRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('A booking request is required.');
  const input = value as Record<string, unknown>;
  if (typeof input.eventId !== 'string' || !UUID_PATTERN.test(input.eventId))
    throw new BadRequestException('Choose a valid event.');
  if (
    typeof input.start !== 'string' ||
    typeof input.end !== 'string' ||
    !ISO_INSTANT.test(input.start) ||
    !ISO_INSTANT.test(input.end) ||
    !Number.isFinite(Date.parse(input.start)) ||
    !Number.isFinite(Date.parse(input.end)) ||
    Date.parse(input.start) >= Date.parse(input.end)
  )
    throw new BadRequestException('Enter a valid event start and end time.');
  return { eventId: input.eventId, start: input.start, end: input.end };
}
