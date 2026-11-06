// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC1, AC6, AC7
// Test cases: PLAN-STATUS-01-B, PLAN-STATUS-06-A, PLAN-STATUS-06-C, PLAN-STATUS-07-A
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_WORKLOAD_STATUSES,
  BOOKING_OPEN_STATUSES,
  CLARIFICATION_OPEN_STATUSES,
  shouldTransitionToPlanning,
} from './event-status.js';

const ALL_STATUSES = ['Submitted', 'Approved', 'Rejected', 'Planning', 'Confirmed', 'Completed', 'Cancelled'];

describe('SPM-148 AC1: which status moves to Planning', () => {
  // Kills: M1 (every status transitions), M2 (Confirmed or Submitted also transition).
  it.each(ALL_STATUSES)('PLAN-STATUS-01-B: shouldTransitionToPlanning(%s) is true only for Approved', (status) => {
    expect(shouldTransitionToPlanning(status)).toBe(status === 'Approved');
  });
});

describe('SPM-148 AC6/AC7: one constant per list of statuses', () => {
  // Kills: M14 Planning missing from the workload list.
  it('PLAN-STATUS-06-A: the active workload list is Submitted, Approved, Planning, Confirmed', () => {
    expect([...ACTIVE_WORKLOAD_STATUSES]).toEqual(['Submitted', 'Approved', 'Planning', 'Confirmed']);
  });

  // Kills: closed statuses accepting bookings.
  it('PLAN-STATUS-01-B: booking requests are open for Approved, Planning and Confirmed only', () => {
    expect([...BOOKING_OPEN_STATUSES]).toEqual(['Approved', 'Planning', 'Confirmed']);
  });

  // Kills: M17 Planning missing, M18 Confirmed still open.
  it('PLAN-STATUS-07-A: clarifications are open in Planning and closed at Confirmed', () => {
    expect([...CLARIFICATION_OPEN_STATUSES]).toEqual(['Submitted', 'Approved', 'Planning']);
    expect(CLARIFICATION_OPEN_STATUSES).not.toContain('Confirmed');
  });
});
