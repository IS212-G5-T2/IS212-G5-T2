/*
 * SPM-136 AC2 and AC3: the pure rules of cancellation (CANCEL-EVENT-02-C, 03-B).
 * Expected values are literals from the Confluence test cases and the decision record, not from the code.
 */
import { describe, expect, it } from 'vitest';
import { isConfirmed, isCancellable } from './cancel-rules.js';

describe('SPM-136 cancellation rules', () => {
  // CANCEL-EVENT-02-C: only the boolean true confirms; every other value is refused (decision D5).
  describe('CANCEL-EVENT-02-C: confirmation must be the boolean true', () => {
    it('CANCEL-EVENT-02-C: accepts confirmed: true', () => {
      expect(isConfirmed({ targetStatus: 'Cancelled', confirmed: true })).toBe(true);
    });

    it.each([
      ['omitted', { targetStatus: 'Cancelled' }],
      ['false', { targetStatus: 'Cancelled', confirmed: false }],
      ['the string "true"', { targetStatus: 'Cancelled', confirmed: 'true' }],
      ['the number 1', { targetStatus: 'Cancelled', confirmed: 1 }],
      ['null', { targetStatus: 'Cancelled', confirmed: null }],
      ['an empty object', {}],
      ['no body', undefined],
    ])('CANCEL-EVENT-02-C: refuses confirmation %s', (_label, body) => {
      expect(isConfirmed(body)).toBe(false);
    });
  });

  // CANCEL-EVENT-03-B: Submitted, Approved, Planning and Confirmed are cancellable; the rest are not (decision F9).
  describe('CANCEL-EVENT-03-B: the cancellable set', () => {
    it.each(['Submitted', 'Approved', 'Planning', 'Confirmed'])('CANCEL-EVENT-03-B: %s is cancellable', (status) => {
      expect(isCancellable(status)).toBe(true);
    });

    it.each(['Completed', 'Rejected', 'Cancelled', 'submitted', 'confirmed', '', 'Under Review'])(
      'CANCEL-EVENT-03-B: %j is not cancellable',
      (status) => {
        expect(isCancellable(status)).toBe(false);
      },
    );
  });
});
