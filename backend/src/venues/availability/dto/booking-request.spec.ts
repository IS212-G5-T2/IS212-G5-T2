import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateBookingRequest } from './booking-request.js';

const valid = {
  eventId: '00000000-0000-4000-8000-000000000125',
  start: '2030-01-12T04:00:00.000Z',
  end: '2030-01-12T05:00:00.000Z',
};

describe('validateBookingRequest', () => {
  /** SPM-51 AC1: only a JSON object can represent a booking request. */
  it.each([undefined, null, [], 'request'])(
    'rejects non-object request values',
    (value) => {
      expect(() => validateBookingRequest(value)).toThrow(BadRequestException);
    },
  );

  /** SPM-51 AC1: the request must reference a UUID event. */
  it.each([undefined, 12, 'not-a-uuid'])(
    'rejects malformed event IDs',
    (eventId) => {
      expect(() => validateBookingRequest({ ...valid, eventId })).toThrow(
        'Choose a valid event.',
      );
    },
  );

  /** SPM-51 AC1: event dates need absolute ISO instants and a positive duration. */
  it.each([
    { start: '2030-01-12T04:00', end: valid.end },
    { start: '2030-02-30T04:00:00Z', end: valid.end },
    { start: valid.start, end: 'not-a-time' },
    { start: valid.start, end: valid.start },
    { start: valid.end, end: valid.start },
  ])('rejects invalid or reversed event times', (times) => {
    expect(() => validateBookingRequest({ ...valid, ...times })).toThrow(
      'Enter a valid event start and end time.',
    );
  });

  /** SPM-51 AC1: valid UTC instants pass through without altering their values. */
  it('returns a valid booking request unchanged', () => {
    expect(validateBookingRequest(valid)).toEqual(valid);
  });
});
