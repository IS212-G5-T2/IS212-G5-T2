/*
 * SPM-139 unit tests for the pure settings rules. Every expected value is a literal taken from the resolved spec
 * (BR2 to BR6, 01-E, 02-D, 04-D, 05-C, 05-D, 07-B, 07-C), never recomputed from the implementation.
 * Event start in every table: 2026-11-07 18:00 SGT (= 10:00Z).
 */
import { describe, expect, it } from 'vitest';
import {
  parseRegistrationSettingsBody,
  validateRegistrationSettings,
  type SavedSettings,
  type SettingsPatch,
} from './registration-settings.validation.js';

const START = { startsAt: new Date('2026-11-07T10:00:00.000Z') };
const NONE: SavedSettings = { registrationEnabled: false, opensAt: null, closesAt: null, capacity: 1 };
const SAVED: SavedSettings = {
  registrationEnabled: true,
  opensAt: new Date('2026-10-19T01:00:00.000Z'),
  closesAt: new Date('2026-10-28T15:59:00.000Z'),
  capacity: 50,
};
const sgt = (value: string) => new Date(value);

function run(saved: SavedSettings, patch: SettingsPatch, confirmed = 0, max = 2147483647) {
  return validateRegistrationSettings(saved, patch, START, confirmed, max);
}

describe('SPM-139 AC5 and AC6: the closing time against the opening time and the event start', () => {
  // Kills: M10 (`<` for `<=` at the start), M9 (closing after the start accepted)
  it.each([
    ['2026-11-07T17:59:00+08:00', true],
    ['2026-11-07T18:00:00+08:00', true], // equal to the start is valid (R3)
    ['2026-11-07T18:01:00+08:00', false],
  ])('closing %s against the 18:00 start: accepted=%s', (closes, accepted) => {
    const decision = run(NONE, {
      registrationEnabled: true,
      opensAt: sgt('2026-10-19T09:00:00+08:00'),
      closesAt: sgt(closes),
      capacity: 50,
    });
    expect(decision.ok).toBe(accepted);
    if (!accepted && !decision.ok) {
      expect(decision.violation.code).toBe('INVALID_PERIOD');
      expect(decision.violation.field).toBe('registrationClosesAt');
      expect(decision.violation.message).toBe('Registration must close on or before the event start time.');
    }
  });

  // Kills: M8 (equal times accepted), a closing time before the opening time accepted.
  it.each([
    ['2026-10-23T09:00:00+08:00', '2026-10-23T09:00:00+08:00'], // equal
    ['2026-10-23T09:00:00+08:00', '2026-10-22T09:00:00+08:00'], // closing before opening
  ])('opening %s and closing %s: refused with the closing-after-opening text', (opens, closes) => {
    const decision = run(NONE, { opensAt: sgt(opens), closesAt: sgt(closes) });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('INVALID_PERIOD');
      expect(decision.violation.field).toBe('registrationClosesAt');
      expect(decision.violation.message).toBe('Registration closing time must be after the opening time.');
    }
  });

  // An opening time in the past is valid: registration opens at once (BR4, 02-B).
  it('accepts an opening time before the current time', () => {
    const decision = run(NONE, {
      registrationEnabled: true,
      opensAt: sgt('2026-10-18T11:00:00+08:00'),
      closesAt: sgt('2026-10-28T23:59:00+08:00'),
      capacity: 50,
    });
    expect(decision.ok).toBe(true);
  });
});

describe('SPM-139 AC7: the capacity is a JSON whole number from 1 to the column maximum', () => {
  const valid = { registrationEnabled: true, opensAt: sgt('2026-10-19T09:00:00+08:00'), closesAt: sgt('2026-10-28T23:59:00+08:00') };

  // Kills: M12 (string coercion), M13 (no upper bound), lower bound off by one (03-B).
  it.each([0, -1, 2.5, '10', '1e3', null])('refuses capacity %j with INVALID_CAPACITY', (capacity) => {
    const decision = run(NONE, { ...valid, capacity });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('INVALID_CAPACITY');
      expect(decision.violation.message).toBe('Capacity must be a positive whole number.');
    }
  });

  it.each([1, 1000, 2147483647])('accepts capacity %i', (capacity) => {
    expect(run(NONE, { ...valid, capacity }).ok).toBe(true);
  });

  // Kills: M13 (500 from the database instead of the column maximum).
  it('refuses 2147483648 with CAPACITY_TOO_LARGE, never a server error', () => {
    const decision = run(NONE, { ...valid, capacity: 2147483648 });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('CAPACITY_TOO_LARGE');
      expect(decision.violation.message).toBe('Capacity cannot be more than 2147483647.');
    }
  });
});

describe('SPM-139 AC8: capacity cannot drop below the Confirmed count', () => {
  // Kills: M21 (check missing), M20 (Withdrawn or Waitlisted counted). The count passed in is Registered only (BR6).
  it.each([
    [4, false],
    [5, true],
    [6, true],
  ])('capacity %i with 5 Confirmed: accepted=%s', (capacity, accepted) => {
    const decision = run(SAVED, { capacity }, 5);
    expect(decision.ok).toBe(accepted);
    if (!accepted && !decision.ok) {
      expect(decision.violation.code).toBe('CAPACITY_BELOW_CONFIRMED');
      expect(decision.violation.message).toBe('Capacity cannot be lower than the number of Confirmed registrations (5).');
    }
  });
});

describe('SPM-139 BR3: enabling needs the period and capacity in the resulting state', () => {
  // Kills: M4 (completeness not checked). Saved values stay when a field is omitted (F1).
  it('refuses enabling when the opening time is missing', () => {
    const decision = run(NONE, { registrationEnabled: true, closesAt: sgt('2026-10-28T23:59:00+08:00') });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('SETTINGS_INCOMPLETE');
      expect(decision.violation.field).toBe('registrationOpensAt');
      expect(decision.violation.message).toBe('Set the registration period and capacity before turning registration on.');
    }
  });

  it('refuses enabling when the closing time is missing', () => {
    const decision = run(NONE, { registrationEnabled: true, opensAt: sgt('2026-10-19T09:00:00+08:00') });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.violation.field).toBe('registrationClosesAt');
  });

  // Disabling keeps the saved values (M2).
  it('disabling keeps the saved period and capacity', () => {
    const decision = run(SAVED, { registrationEnabled: false });
    expect(decision).toEqual({ ok: true, settings: { ...SAVED, registrationEnabled: false } });
  });

  // Provided values are validated whether or not registration is enabled (BR3).
  it('validates a provided period even while registration is disabled', () => {
    const decision = run(NONE, {
      registrationEnabled: false,
      opensAt: sgt('2026-10-23T09:00:00+08:00'),
      closesAt: sgt('2026-10-22T09:00:00+08:00'),
    });
    expect(decision.ok).toBe(false);
  });
});

describe('SPM-139 F1: the merge keeps saved values for omitted fields', () => {
  it('a lone capacity change keeps the saved period', () => {
    const decision = run(SAVED, { capacity: 80 });
    expect(decision).toEqual({ ok: true, settings: { ...SAVED, capacity: 80 } });
  });
});

describe('SPM-139 parseRegistrationSettingsBody: the request shape', () => {
  // Kills: M7 (offset-less or invalid date-time accepted), 12-A (unknown fields accepted).
  it.each([
    ['no offset', { registrationOpensAt: '2026-10-19T09:00:00', version: 0 }],
    ['invalid calendar', { registrationOpensAt: '2026-13-45T25:61', version: 0 }],
    ['not a date', { registrationOpensAt: 'not-a-date', version: 0 }],
    ['explicit null', { registrationClosesAt: null, version: 0 }],
  ])('refuses a date-time that is %s with 400 INVALID_DATETIME', (_label, body) => {
    const parsed = parseRegistrationSettingsBody(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(400);
      expect(parsed.violation.code).toBe('INVALID_DATETIME');
    }
  });

  it.each([
    ['confirmedCount', { confirmedCount: 0, version: 0 }],
    ['status', { status: 'Cancelled', version: 0 }],
    ['eventId', { eventId: 'EVT-911', version: 0 }],
  ])('refuses an unknown field %s with 400', (field, body) => {
    const parsed = parseRegistrationSettingsBody(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.field).toBe(field);
  });

  it.each([
    ['missing', {}],
    ['string', { version: '1' }],
    ['negative', { version: -1 }],
  ])('refuses a %s version with 400', (_label, body) => {
    expect(parseRegistrationSettingsBody(body).ok).toBe(false);
  });

  it('refuses a non-object body with 400', () => {
    expect(parseRegistrationSettingsBody(null).ok).toBe(false);
    expect(parseRegistrationSettingsBody([]).ok).toBe(false);
  });

  it('parses an offset date-time and Z to the same instant', () => {
    const parsed = parseRegistrationSettingsBody({
      registrationOpensAt: '2026-10-19T09:00:00+08:00',
      registrationClosesAt: '2026-10-19T01:00:00Z',
      capacity: 50,
      version: 3,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.version).toBe(3);
      expect(parsed.patch.opensAt?.toISOString()).toBe('2026-10-19T01:00:00.000Z');
      expect(parsed.patch.closesAt?.toISOString()).toBe('2026-10-19T01:00:00.000Z');
      expect(parsed.patch.capacity).toBe(50);
    }
  });
});

// Plain-titled boundary cases, one per rule, so each mutant in scripts/mutation/spm139.mutants.mjs maps to one test.
describe('SPM-139 plain boundary cases (mutation mapping)', () => {
  const window = { registrationEnabled: true, opensAt: sgt('2026-10-19T09:00:00+08:00'), closesAt: null };
  const start = { startsAt: sgt('2026-11-07T18:00:00+08:00') };
  const NONE_SAVED: SavedSettings = { registrationEnabled: false, opensAt: null, closesAt: null, capacity: 1 };

  // Kills: the start boundary written as `>=` (equal to the start refused)
  it('CONFIG-REG-06-C: a closing time equal to the event start is accepted', () => {
    expect(validateRegistrationSettings(NONE_SAVED, { ...window, closesAt: sgt('2026-11-07T18:00:00+08:00'), capacity: 50 }, start, 0).ok).toBe(true);
  });

  // Kills: the opening boundary written as `<` (closing equal to opening accepted)
  it('CONFIG-REG-05-C: a closing time equal to the opening time is refused', () => {
    const decision = validateRegistrationSettings(NONE_SAVED, { ...window, closesAt: sgt('2026-10-19T09:00:00+08:00'), capacity: 50 }, start, 0);
    expect(decision.ok).toBe(false);
  });

  // Kills: the lower capacity bound moved to 0 (zero accepted)
  it('CONFIG-REG-07-D: capacity 0 is refused', () => {
    expect(validateRegistrationSettings(NONE_SAVED, { capacity: 0 }, start, 0).ok).toBe(false);
  });

  // Kills: the upper capacity bound written as `>=` (the maximum refused)
  it('CONFIG-REG-07-D: capacity 2147483647 is accepted', () => {
    expect(validateRegistrationSettings(NONE_SAVED, { capacity: 2147483647 }, start, 0).ok).toBe(true);
  });

  // Kills: the whole-number check removed (2.5 accepted)
  it('CONFIG-REG-07-C: capacity 2.5 is refused', () => {
    expect(validateRegistrationSettings(NONE_SAVED, { capacity: 2.5 }, start, 0).ok).toBe(false);
  });

  // Kills: the Confirmed minimum written as `<=` (a capacity equal to the Confirmed count refused)
  it('CONFIG-REG-08-B: a capacity equal to the Confirmed count is accepted', () => {
    expect(validateRegistrationSettings({ ...NONE_SAVED, capacity: 5 }, { capacity: 5 }, start, 5).ok).toBe(true);
  });

  // Kills: the offset requirement removed (a date-time without an offset accepted)
  it('CONFIG-REG-02-D: a date-time without an offset is refused', () => {
    expect(parseRegistrationSettingsBody({ registrationOpensAt: '2026-10-19T09:00:00', version: 0 }).ok).toBe(false);
  });

  // Kills: the disabled settings returned with their period cleared
  it('CONFIG-REG-01-B: a disabled event keeps its saved opening time in the decision', () => {
    const saved: SavedSettings = { registrationEnabled: true, opensAt: sgt('2026-10-19T09:00:00+08:00'), closesAt: sgt('2026-10-28T23:59:00+08:00'), capacity: 50 };
    const decision = validateRegistrationSettings(saved, { registrationEnabled: false }, start, 0);
    expect(decision).toEqual({ ok: true, settings: { ...saved, registrationEnabled: false } });
  });
});

describe('SPM-139 request shape: plain cases (mutation mapping)', () => {
  // Kills: the boolean check on registrationEnabled removed (a non-boolean accepted)
  it('CONFIG-REG-11-C: a non-boolean registrationEnabled is refused with 400', () => {
    const parsed = parseRegistrationSettingsBody({ registrationEnabled: 'yes', version: 0 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.status).toBe(400);
  });
});

describe('SPM-139 closing time one minute after the opening time (mutation mapping)', () => {
  // Kills: the opening boundary widened by a minute (a closing time one minute after the opening refused)
  it('CONFIG-REG-05-D: a closing time one minute after the opening time is accepted', () => {
    const decision = validateRegistrationSettings(
      { registrationEnabled: false, opensAt: null, closesAt: null, capacity: 1 },
      { registrationEnabled: true, opensAt: sgt('2026-10-19T10:00:00+08:00'), closesAt: sgt('2026-10-19T10:01:00+08:00'), capacity: 50 },
      { startsAt: sgt('2026-11-07T18:00:00+08:00') },
      0,
    );
    expect(decision.ok).toBe(true);
  });
});


describe('SPM-139 date-time text: a date-time that is not in the calendar is refused', () => {
  it('refuses an opening time whose month does not exist', () => {
    const parsed = parseRegistrationSettingsBody({ registrationEnabled: true, version: 0, registrationOpensAt: '2026-13-01T09:00:00+08:00' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.code).toBe('INVALID_DATETIME');
  });
});
