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
  // Kills: M1 (start boundary written as `>=`); the 18:01 row also catches the start rule removed (no mutant id)
  it.each([
    ['2026-11-07T17:59:00+08:00', true],
    ['2026-11-07T18:00:00+08:00', true], // equal to the start is valid (R3)
    ['2026-11-07T18:01:00+08:00', false],
  ])('CONFIG-REG-06-C: closing %s against the 18:00 start: accepted=%s', (closes, accepted) => {
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

  // Kills: M2 (equal times accepted); the second row catches a closing time before the opening time accepted (no mutant id)
  it.each([
    ['2026-10-23T09:00:00+08:00', '2026-10-23T09:00:00+08:00'], // equal
    ['2026-10-23T09:00:00+08:00', '2026-10-22T09:00:00+08:00'], // closing before opening
  ])('CONFIG-REG-05-C: opening %s and closing %s: refused with the closing-after-opening text', (opens, closes) => {
    const decision = run(NONE, { opensAt: sgt(opens), closesAt: sgt(closes) });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('INVALID_PERIOD');
      expect(decision.violation.field).toBe('registrationClosesAt');
      expect(decision.violation.message).toBe('Registration closing time must be after the opening time.');
    }
  });

  // An opening time in the past is valid: registration opens at once (BR4, 02-B).
  it('CONFIG-REG-02-C: accepts an opening time before the current time', () => {
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

  // Kills: M3 (lower bound moved to 0), M5 (whole-number check removed); string and null rows have no mutant id.
  it.each([0, -1, 2.5, '10', '1e3', null])('CONFIG-REG-07-C: refuses capacity %j with INVALID_CAPACITY', (capacity) => {
    const decision = run(NONE, { ...valid, capacity });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('INVALID_CAPACITY');
      expect(decision.violation.message).toBe('Capacity must be a positive whole number.');
    }
  });

  it.each([1, 1000, 2147483647])('CONFIG-REG-07-D: accepts capacity %i', (capacity) => {
    expect(run(NONE, { ...valid, capacity }).ok).toBe(true);
  });

  // Guards the column maximum (a 500 from the database instead of a 422); M32 removes the maximum check.
  it('CONFIG-REG-07-D: refuses 2147483648 with CAPACITY_TOO_LARGE, never a server error', () => {
    const decision = run(NONE, { ...valid, capacity: 2147483648 });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('CAPACITY_TOO_LARGE');
      expect(decision.violation.message).toBe('Capacity cannot be more than 2147483647.');
    }
  });
});

describe('SPM-139 AC8: capacity cannot drop below the Confirmed count', () => {
  // The count passed in is Registered only (BR6). The equal row is killed by M7; the other rows have no mutant id here.
  it.each([
    [4, false],
    [5, true],
    [6, true],
  ])('CONFIG-REG-08-B: capacity %i with 5 Confirmed: accepted=%s', (capacity, accepted) => {
    const decision = run(SAVED, { capacity }, 5);
    expect(decision.ok).toBe(accepted);
    if (!accepted && !decision.ok) {
      expect(decision.violation.code).toBe('CAPACITY_BELOW_CONFIRMED');
      expect(decision.violation.message).toBe('Capacity cannot be lower than the number of Confirmed registrations (5).');
    }
  });
});

describe('SPM-139 BR3: enabling needs the period and capacity in the resulting state', () => {
  // Kills: M6 (completeness check removed). Saved values stay when a field is omitted (F1).
  it('CONFIG-REG-01-E: refuses enabling when the opening time is missing', () => {
    const decision = run(NONE, { registrationEnabled: true, closesAt: sgt('2026-10-28T23:59:00+08:00') });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('SETTINGS_INCOMPLETE');
      expect(decision.violation.field).toBe('registrationOpensAt');
      expect(decision.violation.message).toBe('Set the registration period and capacity before turning registration on.');
    }
  });

  it('CONFIG-REG-01-E: refuses enabling when the closing time is missing', () => {
    const decision = run(NONE, { registrationEnabled: true, opensAt: sgt('2026-10-19T09:00:00+08:00') });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.violation.field).toBe('registrationClosesAt');
  });

  // Disabling keeps the saved values (killed by M9 and M10).
  it('CONFIG-REG-01-B: disabling keeps the saved period and capacity', () => {
    const decision = run(SAVED, { registrationEnabled: false });
    expect(decision).toEqual({ ok: true, settings: { ...SAVED, registrationEnabled: false } });
  });

  // Provided values are validated whether or not registration is enabled (BR3).
  it('CONFIG-REG-02-D: validates a provided period even while registration is disabled', () => {
    const decision = run(NONE, {
      registrationEnabled: false,
      opensAt: sgt('2026-10-23T09:00:00+08:00'),
      closesAt: sgt('2026-10-22T09:00:00+08:00'),
    });
    expect(decision.ok).toBe(false);
  });
});

describe('SPM-139 F1: the merge keeps saved values for omitted fields', () => {
  it('CONFIG-REG-02-D: a lone capacity change keeps the saved period', () => {
    const decision = run(SAVED, { capacity: 80 });
    expect(decision).toEqual({ ok: true, settings: { ...SAVED, capacity: 80 } });
  });
});

describe('SPM-139 parseRegistrationSettingsBody: the request shape', () => {
  // Kills: M8 (offset-less date-time accepted); the other rows have no mutant id.
  it.each([
    ['no offset', { registrationOpensAt: '2026-10-19T09:00:00', version: 0 }],
    ['invalid calendar', { registrationOpensAt: '2026-13-45T25:61', version: 0 }],
    ['not a date', { registrationOpensAt: 'not-a-date', version: 0 }],
    ['explicit null', { registrationClosesAt: null, version: 0 }],
  ])('CONFIG-REG-02-D: refuses a date-time that is %s with 400 INVALID_DATETIME', (_label, body) => {
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
  ])('CONFIG-REG-11-C: refuses an unknown field %s with 400', (field, body) => {
    const parsed = parseRegistrationSettingsBody(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.field).toBe(field);
  });

  it.each([
    ['missing', {}],
    ['string', { version: '1' }],
    ['negative', { version: -1 }],
    ['non-integer', { version: 1.5 }],
  ])('refuses a %s version with 400', (_label, body) => {
    expect(parseRegistrationSettingsBody(body).ok).toBe(false);
  });

  it('refuses registrationEnabled null with 400 (null is not "keep saved")', () => {
    const parsed = parseRegistrationSettingsBody({ registrationEnabled: null, version: 0 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.status).toBe(400);
      expect(parsed.violation.field).toBe('registrationEnabled');
    }
  });

  it('refuses a non-object body with 400', () => {
    expect(parseRegistrationSettingsBody(null).ok).toBe(false);
    expect(parseRegistrationSettingsBody([]).ok).toBe(false);
  });

  it('CONFIG-REG-02-B: parses an offset date-time and Z to the same instant', () => {
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


describe('SPM-139 AC2 02-D: a lone opening time is judged against the saved closing time', () => {
  it.each([
    ['equal to', '2026-10-28T15:59:00.000Z'],
    ['after', '2026-10-29T01:00:00.000Z'],
  ])('CONFIG-REG-05-C: an opening time %s the saved closing time is refused with INVALID_PERIOD on the closing field', (_label, opens) => {
    const decision = run(SAVED, { opensAt: new Date(opens) });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.violation.code).toBe('INVALID_PERIOD');
      expect(decision.violation.field).toBe('registrationClosesAt');
      expect(decision.violation.message).toBe('Registration closing time must be after the opening time.');
    }
  });
});

describe('SPM-139 date-time text: a date-time that is not in the calendar is refused', () => {
  it.each([
    '2026-02-30T10:00:00Z',
    '2026-02-31T10:00:00+08:00',
    '2026-04-31T10:00:00Z',
    '2027-02-29T10:00:00Z',
    '2026-00-10T10:00:00Z',
    '2026-01-00T10:00:00Z',
  ])('CONFIG-REG-02-D: refuses %s, a day that does not exist, with INVALID_DATETIME', (value) => {
    const parsed = parseRegistrationSettingsBody({ registrationOpensAt: value, version: 0 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.code).toBe('INVALID_DATETIME');
  });

  it.each(['2028-02-29T10:00:00Z', '2026-12-31T24:00:00Z'])('CONFIG-REG-02-D: still accepts %s', (value) => {
    expect(parseRegistrationSettingsBody({ registrationOpensAt: value, version: 0 }).ok).toBe(true);
  });

  it('CONFIG-REG-02-D: refuses an opening time whose month does not exist', () => {
    const parsed = parseRegistrationSettingsBody({ registrationEnabled: true, version: 0, registrationOpensAt: '2026-13-01T09:00:00+08:00' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.code).toBe('INVALID_DATETIME');
  });
});

describe('SPM-139 date-time text: an hour that does not exist is refused', () => {
  it('CONFIG-REG-02-D: refuses an opening time whose hour is 25', () => {
    const parsed = parseRegistrationSettingsBody({ registrationEnabled: true, version: 0, registrationOpensAt: '2026-10-19T25:00:00+08:00' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.violation.code).toBe('INVALID_DATETIME');
  });
});
