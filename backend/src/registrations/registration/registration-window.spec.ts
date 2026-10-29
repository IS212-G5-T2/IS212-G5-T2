/*
 * EVENT-REG-01-BND-1 / EVENT-REG-02-BND-1 (ASSUMED IDs): registration window
 * instants at the pure-function level. The window is inclusive at open and
 * exclusive at close (D6).
 */
import { describe, expect, it } from 'vitest';
import { isRegistrationOpen, registrationWindowState } from './registration-window.js';

const opensAt = new Date('2030-01-10T02:00:00.000Z');
const closesAt = new Date('2030-01-20T02:00:00.000Z');
const at = (offsetMs: number, base = opensAt) => new Date(base.getTime() + offsetMs);
const event = { registrationEnabled: true, status: 'Confirmed', opensAt, closesAt };

// EVENT-REG-01-BND-1: the opening boundary and the open-state rules
describe('EVENT-REG-01-BND-1: the opening boundary and the open-state rules', () => {
  // [A] one second before the window opens registration is not open.
  it('[A] one second before the opening instant, registration is not open', () => {
    expect(isRegistrationOpen(event, at(-1000))).toBe(false);
  });
  // [B] the opening instant itself is open (inclusive).
  it('[B] exactly at the opening instant, registration is open', () => {
    expect(isRegistrationOpen(event, opensAt)).toBe(true);
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

// SPM-139 F5: a disabled registration reports its own state, distinct from closed.
describe('SPM-139 F5: the disabled state', () => {
  it('reports disabled, not closed, when the coordinator has switched registration off', () => {
    expect(registrationWindowState({ ...event, registrationEnabled: false }, at(1000))).toBe('disabled');
  });
  // Kills: W-PRECEDENCE (a disabled event that is also not Confirmed reports disabled instead of closed).
  it('reports closed, not disabled, for a switched-off event that is not Confirmed', () => {
    expect(registrationWindowState({ ...event, status: 'Approved', registrationEnabled: false }, at(1000))).toBe('closed');
  });
  it('still reports closed for an enabled event outside the window', () => {
    expect(registrationWindowState(event, at(-1000))).toBe('not_open');
    expect(registrationWindowState(event, closesAt)).toBe('closed');
  });
});

// EVENT-REG-02-BND-1: the closing boundary
describe('EVENT-REG-02-BND-1: the closing boundary', () => {
  // [C] one minute before the closing instant, registration is still accepted (open side of the close boundary).
  it('[C] one minute before the closing instant, registration is still accepted', () => {
    expect(isRegistrationOpen(event, at(-60_000, closesAt))).toBe(true);
  });
  // [D] the closing instant is already closed (exclusive).
  it('[D] exactly at the closing instant, registration is closed', () => {
    expect(isRegistrationOpen(event, closesAt)).toBe(false);
  });
});

// The one predicate every caller uses: true only inside an open, enabled, Confirmed window.
describe('SPM-139 isRegistrationOpen: plain cases (mutation mapping)', () => {
  // Kills: isRegistrationOpen returning the wrong comparison (open for a switched-off or closed window)
  it('CONFIG-REG-02-C: isRegistrationOpen is true only inside an open, enabled, Confirmed window', () => {
    expect(isRegistrationOpen(event, at(1000))).toBe(true);
    expect(isRegistrationOpen({ ...event, registrationEnabled: false }, at(1000))).toBe(false);
    expect(isRegistrationOpen(event, at(-1000))).toBe(false);
  });
});
