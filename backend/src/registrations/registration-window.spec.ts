/*
 * EVENT-REG-01-BND-1 / EVENT-REG-02-BND-1 (ASSUMED IDs): registration window
 * instants at the pure-function level. The window is inclusive at open and
 * exclusive at close (D6).
 */
import { describe, expect, it } from 'vitest';
import { isRegistrationOpen } from './registration-window.js';

const opensAt = new Date('2030-01-10T02:00:00.000Z');
const closesAt = new Date('2030-01-20T02:00:00.000Z');
const at = (offsetMs: number, base = opensAt) => new Date(base.getTime() + offsetMs);
const event = { registrationEnabled: true, status: 'Confirmed', opensAt, closesAt };

describe('EVENT-REG-01-BND-1 / EVENT-REG-02-BND-1: registration window instants', () => {
  // [A] one second before the window opens registration is not open.
  it('[A] 1s before open: closed', () => {
    expect(isRegistrationOpen(event, at(-1000))).toBe(false);
  });
  // [B] the opening instant itself is open (inclusive).
  it('[B] exactly at open: open', () => {
    expect(isRegistrationOpen(event, opensAt)).toBe(true);
  });
  // [C] one minute before closing is still open.
  it('[C] 1 min before close: open', () => {
    expect(isRegistrationOpen(event, at(-60_000, closesAt))).toBe(true);
  });
  // [D] the closing instant is already closed (exclusive).
  it('[D] exactly at close: closed', () => {
    expect(isRegistrationOpen(event, closesAt)).toBe(false);
  });
  // Only Confirmed events are registrable; Approved is internal workflow state.
  it('is never open for an Approved event', () => {
    expect(isRegistrationOpen({ ...event, status: 'Approved' }, at(1000))).toBe(false);
  });
  // A disabled registration setting is never open, even inside the window.
  it('is never open when registration is disabled', () => {
    expect(isRegistrationOpen({ ...event, registrationEnabled: false }, at(1000))).toBe(false);
  });
  // Every non-Confirmed status is closed, even inside the window (one case each).
  it.each(['Submitted', 'Rejected', 'Completed', 'Cancelled'])('is never open for a %s event', (status) => {
    expect(isRegistrationOpen({ ...event, status }, at(1000))).toBe(false);
  });
  // A missing bound is treated as unbounded on that side.
  it('treats a missing bound as unbounded', () => {
    expect(isRegistrationOpen({ ...event, opensAt: null }, at(-1_000_000))).toBe(true);
    expect(isRegistrationOpen({ ...event, closesAt: null }, at(1e12))).toBe(true);
  });
});
