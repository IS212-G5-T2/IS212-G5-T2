/*
 * SPM-136 AC2 and AC3: the pure rules of cancellation (CANCEL-EVENT-02-C, 03-B).
 * Expected values are literals from the Confluence test cases and the decision record, not from the code.
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm136.mutants.mjs.
 */
import { describe, expect, it } from 'vitest';
import { isConfirmed, isCancellable } from './cancel-rules.js';

describe('SPM-136 cancellation rules', () => {
  // CANCEL-EVENT-02-C: only the boolean true confirms; every other value is refused (decision D5).
  describe('CANCEL-EVENT-02-C: confirmation must be the boolean true', () => {
    // Kills: R1 (confirmation never accepted)
    it('CANCEL-EVENT-02-C: accepts confirmed: true', () => {
      // Arrange
      const body = { targetStatus: 'Cancelled', confirmed: true };

      // Act
      const accepted = isConfirmed(body);

      // Assert: the boolean true is accepted
      expect(accepted).toBe(true);
    });

    // Kills: M10 (the string "true"); R3 (omitted, empty object, null: only false refused); R6 (false: any boolean
    // confirms); R8 (no body: the missing-body guard removed); R4 (the number 1: loose equality with true)
    it.each([
      ['omitted', { targetStatus: 'Cancelled' }],
      ['false', { targetStatus: 'Cancelled', confirmed: false }],
      ['the string "true"', { targetStatus: 'Cancelled', confirmed: 'true' }],
      ['the number 1', { targetStatus: 'Cancelled', confirmed: 1 }],
      ['null', { targetStatus: 'Cancelled', confirmed: null }],
      ['an empty object', {}],
      ['no body', undefined],
    ])('CANCEL-EVENT-02-C: refuses confirmation %s', (_label, body) => {
      // Act
      const accepted = isConfirmed(body);

      // Assert: every value other than boolean true is refused
      expect(accepted).toBe(false);
    });

    /** BND: the string "false" sits one step from the boolean false; a non-empty string must not confirm. */
    // Kills: R5 (any non-empty string confirms)
    it('CANCEL-EVENT-02-C-BND-1: the string "false" is refused, not read as a non-empty (truthy) value', () => {
      // Arrange
      const body = { targetStatus: 'Cancelled', confirmed: 'false' };

      // Act
      const accepted = isConfirmed(body);

      // Assert: refused
      expect(accepted).toBe(false);
    });

    /** BND: the string "1" sits one step from the number 1 already refused above; loose equality with true must not confirm. */
    // Kills: R4 (confirmation compared with loose equality, so 1 and "1" are read as true)
    it('CANCEL-EVENT-02-C-BND-2: the string "1" is refused, not read as true by loose equality', () => {
      // Arrange
      const body = { targetStatus: 'Cancelled', confirmed: '1' };

      // Act
      const accepted = isConfirmed(body);

      // Assert: refused
      expect(accepted).toBe(false);
    });
  });

  // CANCEL-EVENT-03-B: Submitted, Approved, Planning and Confirmed are cancellable; the rest are not (decision F9).
  describe('CANCEL-EVENT-03-B: the cancellable set', () => {
    // Kills: S22 (Submitted row), M12 (Approved row), S30 (Planning row), S31 (Confirmed row)
    it.each(['Submitted', 'Approved', 'Planning', 'Confirmed'])('CANCEL-EVENT-03-B: %s is cancellable', (status) => {
      // Act
      const cancellable = isCancellable(status);

      // Assert: the status is in the cancellable set
      expect(cancellable).toBe(true);
    });

    // Kills: M2 (Completed row), S21 (Rejected row), S32 (Cancelled row), S33 (lower-case rows), S34 (the unknown
    // statuses '' and 'Under Review' under a deny-list)
    it.each(['Completed', 'Rejected', 'Cancelled', 'submitted', 'confirmed', '', 'Under Review'])(
      'CANCEL-EVENT-03-B: %j is not cancellable',
      (status) => {
        // Act
        const cancellable = isCancellable(status);

        // Assert: the status is outside the cancellable set
        expect(cancellable).toBe(false);
      },
    );

    /**
     * BND: Draft is the step one before Submitted, the first cancellable status. The rule is an allow-list, so a
     * status one step outside the set is refused. (Draft is an event_drafts status, not an events status; the rule
     * is pure and must refuse it wherever the value comes from.)
     */
    // Kills: S35 (Draft added to the cancellable set)
    it('CANCEL-EVENT-03-B-BND-1: Draft, one step before Submitted, is not cancellable', () => {
      // Act
      const cancellable = isCancellable('Draft');

      // Assert: refused
      expect(cancellable).toBe(false);
    });
  });
});
