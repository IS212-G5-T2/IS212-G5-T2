/*
 * SPM-153 message catalogue: the completed text names the event (MSG-CP-01), and the refusal codes are fixed.
 */
import { describe, expect, it } from 'vitest';
import { COMPLETION_CODES, COMPLETION_MESSAGES } from './completion.messages.js';

describe('COMPLETE-EVENT-01-A: the completion message', () => {
  it('COMPLETE-EVENT-01-A: names the event in the MSG-CP-01 text', () => {
    expect(COMPLETION_MESSAGES.completed('Product Launch Mixer')).toBe('Product Launch Mixer has been marked as Completed.');
  });

  it('COMPLETE-EVENT-01-A: the codes are the ones the API returns', () => {
    expect(COMPLETION_CODES).toMatchObject({ notCompletable: 'EVENT_NOT_COMPLETABLE', notEnded: 'EVENT_NOT_ENDED', arrangementsLocked: 'EVENT_COMPLETED' });
  });
});
