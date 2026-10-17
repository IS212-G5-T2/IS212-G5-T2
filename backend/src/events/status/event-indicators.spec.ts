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

describe('SPM-94 boundaries and interactions for the indicator rules', () => {
  // BND: the assignment rule changes exactly at Submitted and at an unset coordinator.
  // Kills: M6 (indicator for any unassigned event), M7 (indicator ignores status), empty id treated as assigned.
  it.each([
    // status,      coordinatorId, expected
    ['Submitted', '', true], // ASSUMPTION A3: an empty id means no coordinator
    ['Approved', null, false], // one step past Submitted
  ])('TRACK-EVENT-STATUS-02-A BND: %s with coordinator %j gives %s', (status, coordinatorId, expected) => {
    expect(deriveAssignmentIndicator(status, coordinatorId)).toBe(expected);
  });

  // BND: the terminal suppression set is exactly Completed, Cancelled and Rejected; Confirmed is not terminal.
  // Kills: suppression set missing a member, or Confirmed added to it.
  it.each([
    // state,     status,      expected
    ['approved', 'Confirmed', 'CLEARED'], // smallest non-terminal status after Planning
    ['pending', 'Submitted', 'AWAITING_CHECK'], // Submitted is not terminal
    ['pending', 'Planning', 'AWAITING_CHECK'],
  ])('TRACK-EVENT-STATUS-03-B BND: state %s on a %s event gives %s', (state, status, expected) => {
    expect(deriveSafetyIndicator(state, status)).toBe(expected);
  });

  // INT: the terminal check runs before the state lookup, so a terminal event shows none whatever its state.
  // Kills: state lookup moved before the terminal check (ordering fault; not one of the spec mutants).
  it.each([
    ['pending', 'Cancelled', null],
    ['changes_needed', 'Completed', null],
    ['approved', 'Rejected', null],
  ])('TRACK-EVENT-STATUS-03-B INT: terminal %s state on %s gives none', (state, status, expected) => {
    expect(deriveSafetyIndicator(state, status)).toBe(expected);
  });
});

// ASSUMPTION index (additions)
// A3: an empty-string coordinator id counts as unassigned (02-A BND row)
