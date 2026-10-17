/*
 * SPM-136 AC7 (CANCEL-EVENT-07-A): the shared guard that every arrangement mutation calls.
 * Only the Cancelled status is refused; the message and code are the MSG-CN-04 literals.
 */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertEventNotCancelled } from './cancelled-guard.js';

describe('CANCEL-EVENT-07-A: assertEventNotCancelled', () => {
  // Kills: S23
  it('CANCEL-EVENT-07-A: refuses a Cancelled event with 409 EVENT_CANCELLED and MSG-CN-04', () => {
    // Act: call the guard with a Cancelled status and capture what it throws
    let thrown: unknown;
    try {
      assertEventNotCancelled('Cancelled');
    } catch (error) {
      thrown = error;
    }

    // Assert: a 409 with the EVENT_CANCELLED code and the MSG-CN-04 text
    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toEqual({
      code: 'EVENT_CANCELLED',
      message: 'This event has been cancelled and its arrangements cannot be changed.',
    });
  });

  // Kills: none identified
  it.each(['Submitted', 'Approved', 'Planning', 'Confirmed', 'Completed', 'Rejected'])(
    'CANCEL-EVENT-07-A: does not refuse a %s event (the guard only applies to Cancelled)',
    (status) => {
      // Act and assert: no throw for any status other than Cancelled
      expect(() => assertEventNotCancelled(status)).not.toThrow();
    },
  );
});
