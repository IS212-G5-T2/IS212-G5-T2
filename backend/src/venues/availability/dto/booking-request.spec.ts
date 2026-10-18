import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateBookingRequest } from './booking-request.js';

const valid = {
  eventId: '00000000-0000-4000-8000-000000000125',
};

describe('validateBookingRequest', () => {
  /** SPM-51 AC1: only a JSON object can represent a booking request. */
  it.each([
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: 'array', value: [] },
    { label: 'string', value: 'request' },
  ])('rejects a $label request value', ({ value }) => {
    expect(() => validateBookingRequest(value)).toThrow(BadRequestException);
  });

  /** SPM-51 AC1: the request must reference a UUID event. */
  it.each([
    { label: 'missing', eventId: undefined },
    { label: 'number', eventId: 12 },
    { label: 'malformed string', eventId: 'not-a-uuid' },
  ])('rejects a $label event ID', ({ eventId }) => {
    expect(() => validateBookingRequest({ ...valid, eventId })).toThrow(
      'Choose a valid event.',
    );
  });

  /** SPM-54 AC3: the server rejects client-supplied event times rather than trusting a spoofed interval. */
  it.each([
    { start: '2030-01-12T04:00:00.000Z' },
    { end: '2030-01-12T05:00:00.000Z' },
    { startDateTime: '2030-01-12T04:00:00.000Z', endDateTime: '2030-01-12T05:00:00.000Z' },
  ])('rejects client-supplied booking times', (spoofedTimes) => {
    expect(() => validateBookingRequest({ ...valid, ...spoofedTimes })).toThrow(BadRequestException);
  });

  /** SPM-54 AC3: accepted request data contains only event identity and the optional note. */
  it('returns valid request fields without client booking times', () => {
    expect(validateBookingRequest(valid)).toEqual(valid);
  });

  /** SPM-54 AC3: unknown request fields cannot introduce a second time source. */
  it('rejects unsupported request fields', () => {
    expect(() => validateBookingRequest({ ...valid, startAt: 'spoofed' })).toThrow(BadRequestException);
  });

  /** SPM-54 AC3: optional special requests are trimmed and bounded before persistence. */
  it('normalizes a special request and rejects oversized text', () => {
    expect(validateBookingRequest({ ...valid, specialRequests: '  Step-free access  ' }).specialRequests).toBe('Step-free access');
    expect(() => validateBookingRequest({ ...valid, specialRequests: 'x'.repeat(2001) })).toThrow(BadRequestException);
  });
});
