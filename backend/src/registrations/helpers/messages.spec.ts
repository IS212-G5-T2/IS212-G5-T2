import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';

describe('SPM-138 waitlist notice wording', () => {
  /** MSG-WL promotion notice: names the event the attendee was moved into. */
  it('waitlistPromoted names the event', () => {
    expect(MESSAGES.waitlistPromoted('Gala Night')).toBe('A spot opened up. You are now registered for Gala Night.');
  });

  /** MSG-WL-06: the cancelled-event notice tells the waitlisted attendee their place is cancelled. */
  it('waitlistCancelled names the event and says the waitlist place is cancelled', () => {
    expect(MESSAGES.waitlistCancelled('Gala Night')).toBe('Gala Night has been cancelled. Your waitlist place is cancelled.');
  });
});
