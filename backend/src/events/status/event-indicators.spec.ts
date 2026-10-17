// Story: SPM-94 Track My Event Status (Organiser)
// ACs: AC2 (awaiting assignment), AC3 (safety indicator)
// Test cases: TRACK-EVENT-STATUS-02-A, 02-B, 03-B (rule level)
import { describe, expect, it } from 'vitest';
import { deriveAssignmentIndicator, deriveSafetyIndicator } from './event-indicators.js';

describe('SPM-94 AC2: awaiting Coordinator assignment iff Submitted and unassigned', () => {
  // Kills: M6 (indicator for any unassigned event), M7 (indicator persists after assignment)
  it.each([
    // status,      coordinatorId, expected
    ['Submitted', null, true], // EVT-501: unassigned Submitted
    ['Submitted', undefined, true],
    ['Submitted', 'COO-01', false], // assigned: indicator clears
    ['Under Review', null, false], // EVT-502: not Submitted
    ['Draft', null, false], // EVT-508 is not Submitted
    ['Rejected', null, false], // unassigned Rejected event
  ])('TRACK-EVENT-STATUS-02-A/B: %s with coordinator %s gives %s', (status, coordinatorId, expected) => {
    expect(deriveAssignmentIndicator(status, coordinatorId)).toBe(expected);
  });
});

describe('SPM-94 AC3: at most one safety indicator, from the safety state', () => {
  // Kills: M8 (changes requested and cleared swapped), M9 (two indicators at once is prevented by a single return value)
  it.each([
    // state,             status,       expected
    ['pending', 'Planning', 'AWAITING_CHECK'], // EVT-503
    ['changes_needed', 'Planning', 'CHANGES_REQUESTED'], // EVT-504
    ['approved', 'Confirmed', 'CLEARED'], // EVT-505
    ['rejected', 'Planning', null], // no indicator for a Rejected safety outcome (D5)
    [null, 'Planning', null], // no safety record: nothing guessed
    [undefined, 'Planning', null],
    ['approved', 'Cancelled', null], // terminal event shows none (D5, ASSUMED)
    ['pending', 'Completed', null],
    ['changes_needed', 'Rejected', null],
  ])('TRACK-EVENT-STATUS-03-B: state %s on a %s event gives %s', (state, status, expected) => {
    expect(deriveSafetyIndicator(state, status)).toBe(expected);
  });
});

// ASSUMPTION index
// A2: Rejected safety outcome, missing record and terminal statuses show no indicator (D5) -> 03-B rows 4 to 9
