import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateTentativeHoldRequest } from './tentative-hold-request.js';

const eventId = '00000000-0000-4000-8000-000000000159';

describe('SPM-159 tentative hold request input', () => {
  /** VEN-HOLD-02-A: only the selected event identity is accepted; scheduling values stay server-owned. */
  it('VEN-HOLD-02-A accepts an event id without client-supplied timing', () => {
    expect(validateTentativeHoldRequest({ eventId })).toEqual({ eventId });
  });

  /** VEN-HOLD-05-SUP-DISCRIMINATOR: the shared booking API accepts the hold discriminator and trims its note. */
  it('VEN-HOLD-05-SUP-DISCRIMINATOR accepts the hold discriminator and trims an optional special request', () => {
    expect(validateTentativeHoldRequest({
      eventId,
      request_kind: 'tentative_hold',
      specialRequest: '  Microphones, please.  ',
    })).toEqual({
      eventId,
      request_kind: 'tentative_hold',
      specialRequest: 'Microphones, please.',
    });
  });

  /** VEN-HOLD-12-SUP-INPUT: malformed or extra client fields fail before persistence. */
  it.each([
    null,
    [],
    {},
    { eventId: 'invalid' },
    { eventId, start: '2030-01-25T10:00:00Z' },
    { eventId, request_kind: 'booking' },
    { eventId, specialRequest: 'x'.repeat(1001) },
  ])('VEN-HOLD-12-SUP-INPUT rejects invalid hold request input %#', (value) => {
    expect(() => validateTentativeHoldRequest(value)).toThrow(
      BadRequestException,
    );
  });
});
