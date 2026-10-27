/*
 * SPM-139: the one place that decides whether a coordinator's registration settings may be saved.
 *
 * - parseRegistrationSettingsBody checks the request shape (strict keys, date-times with an offset, a version).
 * - validateRegistrationSettings merges the request over the saved settings and applies the field rules. It is pure:
 *   the event start, the Confirmed count and the maximum come in as arguments, so every boundary is a table test.
 *
 * Merge rule (F1): a field that is absent keeps its saved value; an explicit null is refused.
 * Period rules run whenever the request provides a date-time, whether or not registration is enabled. Completeness
 * (opening, closing and capacity present) runs only when registration is enabled in the merged result.
 */
import {
  MAX_REGISTRATION_CAPACITY,
  SETTINGS_ERROR_CODES,
  SETTINGS_MESSAGES,
} from './registration-settings.messages.js';

export interface SavedSettings {
  registrationEnabled: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  capacity: number;
}

/** A parsed request. `capacity` stays unknown here: its type and range are checked by validateRegistrationSettings. */
export interface SettingsPatch {
  registrationEnabled?: boolean;
  opensAt?: Date;
  closesAt?: Date;
  capacity?: unknown;
}

export interface SettingsViolation {
  field: string;
  code: string;
  message: string;
}

export type SettingsDecision =
  | { ok: true; settings: SavedSettings }
  | { ok: false; violation: SettingsViolation };

export type ParseDecision =
  | { ok: true; patch: SettingsPatch; version: number }
  | { ok: false; violation: SettingsViolation; status: 400 };

const KNOWN_FIELDS = ['registrationEnabled', 'registrationOpensAt', 'registrationClosesAt', 'capacity', 'version'];
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses the PUT body. Anything malformed is refused before the rules run (BR11, D6). */
export function parseRegistrationSettingsBody(body: unknown): ParseDecision {
  const invalid = (field: string, code: string, message: string): ParseDecision => ({
    ok: false,
    status: 400,
    violation: { field, code, message },
  });

  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return invalid('body', SETTINGS_ERROR_CODES.validation, SETTINGS_MESSAGES.invalidRequest);

  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.includes(key)) return invalid(key, SETTINGS_ERROR_CODES.validation, SETTINGS_MESSAGES.unknownField);
  }

  const { version } = input;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    return invalid('version', SETTINGS_ERROR_CODES.validation, SETTINGS_MESSAGES.invalidRequest);

  const patch: SettingsPatch = {};
  if (input.registrationEnabled !== undefined) {
    if (typeof input.registrationEnabled !== 'boolean')
      return invalid('registrationEnabled', SETTINGS_ERROR_CODES.validation, SETTINGS_MESSAGES.invalidRequest);
    patch.registrationEnabled = input.registrationEnabled;
  }

  for (const [key, field] of [
    ['registrationOpensAt', 'opensAt'],
    ['registrationClosesAt', 'closesAt'],
  ] as const) {
    if (input[key] === undefined) continue;
    const parsed = parseDateTime(input[key]);
    if (!parsed) return invalid(key, SETTINGS_ERROR_CODES.invalidDatetime, SETTINGS_MESSAGES.invalidDatetime);
    patch[field] = parsed;
  }

  if (input.capacity !== undefined) patch.capacity = input.capacity;
  return { ok: true, patch, version };
}

/** An ISO 8601 date-time that carries an offset or Z. Without one the instant is ambiguous, so it is refused. */
function parseDateTime(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !DATETIME_PATTERN.test(value)) return undefined;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

export function validateRegistrationSettings(
  saved: SavedSettings,
  patch: SettingsPatch,
  event: { startsAt: Date },
  confirmedCount: number,
  maxCapacity: number = MAX_REGISTRATION_CAPACITY,
): SettingsDecision {
  const fail = (field: string, code: string, message: string): SettingsDecision => ({
    ok: false,
    violation: { field, code, message },
  });

  // Capacity: a JSON whole number from 1 up to the column maximum. Strings, decimals, 0, negatives and null are refused.
  const capacity = patch.capacity === undefined ? saved.capacity : patch.capacity;
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1)
    return fail('capacity', SETTINGS_ERROR_CODES.invalidCapacity, SETTINGS_MESSAGES.capacityInvalid);
  if (capacity > maxCapacity)
    return fail('capacity', SETTINGS_ERROR_CODES.capacityTooLarge, SETTINGS_MESSAGES.capacityTooLarge(maxCapacity));

  const opensAt = patch.opensAt === undefined ? saved.opensAt : patch.opensAt;
  const closesAt = patch.closesAt === undefined ? saved.closesAt : patch.closesAt;
  const registrationEnabled = patch.registrationEnabled ?? saved.registrationEnabled;

  // Period: runs when a date-time was provided (merged values are checked, so a lone change is judged against the other).
  if (patch.opensAt !== undefined || patch.closesAt !== undefined) {
    if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime())
      return fail('registrationClosesAt', SETTINGS_ERROR_CODES.invalidPeriod, SETTINGS_MESSAGES.closeAfterOpen);
    // Equal to the start is valid (R3): registration closes at the start instant because the close is exclusive.
    if (closesAt && closesAt.getTime() > event.startsAt.getTime())
      return fail('registrationClosesAt', SETTINGS_ERROR_CODES.invalidPeriod, SETTINGS_MESSAGES.closeOnOrBeforeStart);
  }

  // Completeness: enabling needs the period in the resulting state.
  if (registrationEnabled) {
    if (!opensAt)
      return fail('registrationOpensAt', SETTINGS_ERROR_CODES.incomplete, SETTINGS_MESSAGES.incomplete);
    if (!closesAt)
      return fail('registrationClosesAt', SETTINGS_ERROR_CODES.incomplete, SETTINGS_MESSAGES.incomplete);
  }

  // Capacity cannot drop below the Confirmed count (only Registered rows are counted, BR6).
  if (capacity < confirmedCount)
    return fail(
      'capacity',
      SETTINGS_ERROR_CODES.capacityBelowConfirmed,
      SETTINGS_MESSAGES.capacityBelowConfirmed(confirmedCount),
    );

  return {
    ok: true,
    settings: { registrationEnabled, opensAt, closesAt, capacity },
  };
}
