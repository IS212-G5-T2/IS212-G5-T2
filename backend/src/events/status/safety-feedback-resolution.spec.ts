import { describe, expect, it } from 'vitest';
import { safetyFeedbackCanBeResolved } from './safety-feedback-resolution.js';

describe('SPM-129 rejected feedback resolution', () => {
  /** SAFETY-QUEUE-05-SUP-REJECT-RESOLUTION: coordinator feedback resolution is available after rejection and changes-needed outcomes only. */
  it('allows resolution for rejected and changes-needed outcomes, but not other safety states', () => {
    expect(safetyFeedbackCanBeResolved('rejected')).toBe(true);
    expect(safetyFeedbackCanBeResolved('changes_needed')).toBe(true);
    expect(safetyFeedbackCanBeResolved('approved')).toBe(false);
    expect(safetyFeedbackCanBeResolved('pending')).toBe(false);
    expect(safetyFeedbackCanBeResolved(undefined)).toBe(false);
  });
});
