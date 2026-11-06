import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';
import {
  PLANNING_CODES,
  PLANNING_MESSAGES,
} from '../../../events/status/planning.messages.js';

export interface BookingRequestInput {
  eventId: string;
  start: string;
  end: string;
  specialRequest?: string;
}

const BOOKING_FIELDS = ['eventId', 'start', 'end', 'specialRequest'];

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i;

/** Validates the event and absolute interval accepted for a venue request. */
export function validateBookingRequest(value: unknown): BookingRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('A booking request is required.');
  const input = value as Record<string, unknown>;
  // SPM-148 R7: status and history fields are server-authored; reject, never ignore.
  // SPM-148 PLAN-STATUS-04-C, 08-A: strict schema; the client cannot send status, history or actor fields (400).
  if (Object.keys(input).some((key) => !BOOKING_FIELDS.includes(key)))
    throw new BadRequestException({
      code: PLANNING_CODES.unsupportedFields,
      message: PLANNING_MESSAGES.unsupportedFields,
    });
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
  if (
    input.specialRequest !== undefined &&
    (typeof input.specialRequest !== 'string' ||
      input.specialRequest.length > 1000)
  )
    throw new BadRequestException(
      'Special requests must be 1,000 characters or fewer.',
    );
  return {
    eventId: input.eventId,
    start: input.start,
    end: input.end,
    ...(typeof input.specialRequest === 'string' && input.specialRequest.trim()
      ? { specialRequest: input.specialRequest.trim() }
      : {}),
  };
}
