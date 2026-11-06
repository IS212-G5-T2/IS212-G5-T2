import { BadRequestException } from '@nestjs/common';
import { UUID_PATTERN } from '../../../common/uuid.js';

export interface TentativeHoldRequestInput {
  eventId: string;
  request_kind?: 'tentative_hold';
  specialRequest?: string;
}

/** Accepts hold intent and optional staff note; times and buffers stay server-owned. */
export function validateTentativeHoldRequest(
  value: unknown,
): TentativeHoldRequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Choose an event for the tentative hold.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['eventId', 'request_kind', 'specialRequest'].includes(key)))
    throw new BadRequestException('Unsupported tentative hold request fields.');
  if (input.request_kind !== undefined && input.request_kind !== 'tentative_hold')
    throw new BadRequestException('Unsupported booking request kind.');
  if (typeof input.eventId !== 'string' || !UUID_PATTERN.test(input.eventId))
    throw new BadRequestException('Choose a valid event.');
  if (input.specialRequest !== undefined &&
      (typeof input.specialRequest !== 'string' || input.specialRequest.length > 1000))
    throw new BadRequestException('Special requests must be 1,000 characters or fewer.');
  return {
    eventId: input.eventId,
    ...(input.request_kind === 'tentative_hold' ? { request_kind: 'tentative_hold' as const } : {}),
    ...(typeof input.specialRequest === 'string' && input.specialRequest.trim()
      ? { specialRequest: input.specialRequest.trim() }
      : {}),
  };
}
