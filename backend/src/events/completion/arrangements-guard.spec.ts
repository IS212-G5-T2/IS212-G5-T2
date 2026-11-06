/*
 * SPM-153 AC6 (COMPLETE-EVENT-06-B): the shared guard that every arrangement mutation calls. A Completed event is
 * refused with 409 EVENT_COMPLETED and the MSG-CP-06 text; the Cancelled refusal keeps MSG-CN-04.
 */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertArrangementsEditable } from '../cancelled-guard.js';

describe('COMPLETE-EVENT-06-B: assertArrangementsEditable', () => {
  // Kills: M19 (the planning guard removed), M20 (the venue or equipment guard removed)
  it('COMPLETE-EVENT-06-B: refuses a Completed event with 409 EVENT_COMPLETED and MSG-CP-06', () => {
    let thrown: unknown;
    try {
      assertArrangementsEditable('Completed');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toEqual({
      code: 'EVENT_COMPLETED',
      message: 'The date, time, venue and equipment of a Completed event cannot be changed.',
    });
  });

  it.each(['Submitted', 'Approved', 'Planning', 'Confirmed'])(
    'COMPLETE-EVENT-06-B: does not refuse a %s event',
    (status) => {
      expect(() => assertArrangementsEditable(status)).not.toThrow();
    },
  );

  it('COMPLETE-EVENT-06-B: keeps the MSG-CN-04 refusal for a Cancelled event', () => {
    expect(() => assertArrangementsEditable('Cancelled')).toThrow(ConflictException);
    expect(() => assertArrangementsEditable('Cancelled')).toThrow(/cancelled/i);
  });
});
