/*
 * Story: SPM-120 Withdraw Registration
 * ACs: AC4 (cannot withdraw once the event date has passed)
 * Test cases: WITHDRAW-EVENT-REG-04-C (unit part)
 *
 * The cut-off is the event start instant and it is exclusive: at or after the
 * start a withdrawal is refused [A7, confirmed by the 04-C boundary case].
 * A7 is an assumption pending Product Owner confirmation.
 */
import { describe, expect, it } from 'vitest';
import { hasEventStarted } from './event-start.js';

// EVT-T5 starts 2026-11-01 09:00:00 SGT, which is 01:00:00 UTC.
const event = { startDateTime: new Date('2026-11-01T01:00:00.000Z') };

describe('SPM-120 AC4: hasEventStarted (event start is an exclusive cut-off)', () => {
  // Oracle (SPEC, 04-C): one second before the start the event has not started.
  // Mutant killed: M1 inverted comparison (`<` / `<=` swapped).
  it('WITHDRAW-EVENT-REG-04-C (unit): is false one second before the start', () => {
    expect(hasEventStarted(event, new Date('2026-11-01T08:59:59+08:00'))).toBe(false);
  });

  // Oracle (SPEC, 04-C Subtest B): exactly at the start the event has started.
  // Mutant killed: M1 `>=` weakened to `>`.
  it('WITHDRAW-EVENT-REG-04-C (unit): is true exactly at the start instant', () => {
    expect(hasEventStarted(event, new Date('2026-11-01T09:00:00+08:00'))).toBe(true);
  });

  // Oracle (DERIVED, added Subtest C): one second after the start it is still true.
  // Mutant killed: `>=` replaced by `===`.
  it('WITHDRAW-EVENT-REG-04-C (unit): is true one second after the start', () => {
    expect(hasEventStarted(event, new Date('2026-11-01T09:00:01+08:00'))).toBe(true);
  });
});
