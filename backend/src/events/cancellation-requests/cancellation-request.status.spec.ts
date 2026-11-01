/*
 * SPM-155 derived display status of a cancellation request (AC2, D4).
 * A stored pending request whose event is Completed or Cancelled is shown as Closed with a line saying why;
 * nothing is written. Oracle: Gate-1 decision D4 (DERIVED); the two lines are ASSUMED text (D4).
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm155.mutants.mjs.
 */
import { describe, expect, it } from 'vitest';
import { displayStatusOf } from './cancellation-request.status.js';

describe('SPM-155 displayStatusOf (AC2, D4)', () => {
  // Kills: M14b
  /** CANCEL-REQUEST-02-SUP-CLOSED (DERIVED: D4): a pending request on a cancelled event is Closed with the cancelled line. */
  it('CANCEL-REQUEST-02-SUP-CLOSED: pending on a Cancelled event is closed with "The event is already cancelled."', () => {
    // Act / Assert
    expect(displayStatusOf('pending', 'Cancelled')).toEqual({
      displayStatus: 'closed',
      closedNote: 'The event is already cancelled.',
    });
  });

  // Kills: M14a
  /** CANCEL-REQUEST-02-SUP-CLOSED (DERIVED: D4): a pending request on a completed event is Closed with the completed line. */
  it('CANCEL-REQUEST-02-SUP-CLOSED: pending on a Completed event is closed with "The event is already completed."', () => {
    // Act / Assert
    expect(displayStatusOf('pending', 'Completed')).toEqual({
      displayStatus: 'closed',
      closedNote: 'The event is already completed.',
    });
  });

  // Kills: M14c
  /** CANCEL-REQUEST-02-A: a pending request on any open status stays pending, with no note. */
  it.each(['Submitted', 'Approved', 'Planning', 'Confirmed', 'Rejected'])(
    'CANCEL-REQUEST-02-A: pending on a %s event stays pending',
    (eventStatus) => {
      // Act / Assert: no closedNote key at all
      expect(displayStatusOf('pending', eventStatus)).toEqual({ displayStatus: 'pending' });
    },
  );

  // Kills: M17a
  /** CANCEL-REQUEST-02-B / 02-C: accepted and declined are shown as stored whatever the event's status is. */
  it.each([
    ['accepted', 'Cancelled'],
    ['accepted', 'Completed'],
    ['declined', 'Cancelled'],
    ['declined', 'Confirmed'],
    ['declined', 'Completed'],
  ])('CANCEL-REQUEST-02-B: stored %s on a %s event is shown as stored', (stored, eventStatus) => {
    // Act / Assert
    expect(displayStatusOf(stored as 'accepted' | 'declined', eventStatus)).toEqual({ displayStatus: stored });
  });
});
