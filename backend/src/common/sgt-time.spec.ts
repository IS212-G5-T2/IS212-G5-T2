/*
 * Singapore wall-clock formatting used in server-built text (conflict details
 * under "Changes Awaiting Review"). The expectations are literal SGT text so
 * they hold whatever time zone the test process runs in.
 */
import { describe, expect, it } from 'vitest';
import { sgtDate, sgtDateTime, sgtRange, sgtTime } from './sgt-time.js';

const at = (iso: string) => Date.parse(iso);

describe('sgt-time', () => {
  /** A UTC instant is shown 8 hours later, with lowercase am/pm. */
  it('formats a UTC instant as Singapore time with am/pm', () => {
    expect(sgtTime(at('2026-11-10T10:30:00.000Z'))).toBe('6:30 pm');
    expect(sgtDateTime(at('2026-11-10T01:05:00.000Z'))).toBe('10 Nov 2026, 9:05 am');
  });

  /** Midnight and noon use 12, not 0. */
  it('shows midnight as 12:00 am and noon as 12:00 pm', () => {
    expect(sgtTime(at('2026-11-10T16:00:00.000Z'))).toBe('12:00 am');
    expect(sgtTime(at('2026-11-10T04:00:00.000Z'))).toBe('12:00 pm');
  });

  /** The Singapore date changes at 16:00 UTC, not at UTC midnight. */
  it('uses the Singapore calendar day', () => {
    expect(sgtDate(at('2026-11-10T15:59:00.000Z'))).toBe('10 Nov 2026');
    expect(sgtDate(at('2026-11-10T16:00:00.000Z'))).toBe('11 Nov 2026');
  });

  /** A same-day range names the date once; a range crossing midnight names both. */
  it('names the date once for a same-day range and twice across midnight', () => {
    expect(sgtRange(at('2026-11-10T10:00:00.000Z'), at('2026-11-10T14:00:00.000Z'))).toBe(
      '10 Nov 2026, 6:00 pm – 10:00 pm',
    );
    expect(sgtRange(at('2026-11-10T15:00:00.000Z'), at('2026-11-10T17:00:00.000Z'))).toBe(
      '10 Nov 2026, 11:00 pm – 11 Nov 2026, 1:00 am',
    );
  });
});
