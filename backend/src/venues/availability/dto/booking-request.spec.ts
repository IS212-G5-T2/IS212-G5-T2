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

  /** SPM-51 AC1: event dates need absolute ISO instants and a positive duration. */
  it.each([
    {
      label: 'start without a timezone',
      start: '2030-01-12T04:00',
      end: valid.end,
    },
    {
      label: 'impossible calendar date',
      start: '2030-02-30T04:00:00Z',
      end: valid.end,
    },
    { label: 'invalid end', start: valid.start, end: 'not-a-time' },
    { label: 'equal start and end', start: valid.start, end: valid.start },
    { label: 'end before start', start: valid.end, end: valid.start },
  ])('rejects event times with $label', ({ start, end }) => {
    expect(() => validateBookingRequest({ ...valid, start, end })).toThrow(
      'Enter a valid event start and end time.',
    );
  });

  /** SPM-51 AC1: valid UTC instants pass through without altering their values. */
  it('returns a valid booking request unchanged', () => {
    expect(validateBookingRequest(valid)).toEqual(valid);
  });

  // SPM-148 R7 (PLAN-STATUS-04-C, 08-A). Kills: M9/M20 body fields silently accepted.
  it.each([
    { label: 'status', extra: { status: 'Confirmed' } },
    { label: 'eventStatus', extra: { eventStatus: 'Cancelled' } },
    { label: 'changedBy', extra: { changedBy: 'COO-02' } },
    { label: 'changedAt', extra: { changedAt: '2020-01-01T00:00:00Z' } },
  ])('PLAN-STATUS-04-C: rejects a request carrying $label', ({ extra }) => {
    expect(() => validateBookingRequest({ ...valid, ...extra })).toThrow(BadRequestException);
    try {
      validateBookingRequest({ ...valid, ...extra });
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'UNSUPPORTED_BOOKING_FIELDS',
        message: 'The booking request contains unsupported fields.',
      });
    }
  });
});
