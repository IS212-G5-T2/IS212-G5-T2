import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';
import { PLANNING_CODES, PLANNING_MESSAGES } from '../../../events/status/planning.messages.js';

export interface BookingRequestInput {
  eventId: string;
  specialRequests?: string;
}

/** Validates event identity and the optional note; time always comes from the persisted event row. */
export function validateBookingRequest(value: unknown): BookingRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('A booking request is required.');
  const input = value as Record<string, unknown>;
  const fields = ['eventId', 'specialRequests'];
  if (Object.keys(input).some((key) => !fields.includes(key)))
    throw new BadRequestException({ code: PLANNING_CODES.unsupportedFields, message: PLANNING_MESSAGES.unsupportedFields });
  if (typeof input.eventId !== 'string' || !UUID_PATTERN.test(input.eventId))
    throw new BadRequestException('Choose a valid event.');
  if ('start' in input || 'end' in input || 'startDateTime' in input || 'endDateTime' in input)
    throw new BadRequestException('Booking times are taken from the selected event and cannot be supplied.');
  if (input.specialRequests !== undefined && (typeof input.specialRequests !== 'string' || input.specialRequests.length > 2000))
    throw new BadRequestException('Special requests must be 2,000 characters or fewer.');
  return {
    eventId: input.eventId,
    ...(typeof input.specialRequests === 'string' && input.specialRequests.trim()
      ? { specialRequests: input.specialRequests.trim() }
      : {}),
  };
}
