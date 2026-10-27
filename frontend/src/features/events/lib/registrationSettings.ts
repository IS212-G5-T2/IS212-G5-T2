/*
 * SPM-139 coordinator form rules: Singapore-time conversion and the same field rules the server applies
 * (backend/src/registrations/settings). The server stays authoritative; these rules only let the form explain a
 * problem before a request is sent. Wording mirrors backend/src/registrations/settings/registration-settings.messages.ts.
 */

export const MAX_CAPACITY = 2147483647;

export const SETTINGS_MESSAGES = {
  saved: "Registration settings saved.",
  closeAfterOpen: "Registration closing time must be after the opening time.",
  closeOnOrBeforeStart: "Registration must close on or before the event start time.",
  incomplete: "Set the registration period and capacity before enabling registration.",
  capacityInvalid: "Capacity must be a positive whole number.",
  conflict: "These settings were changed elsewhere. Reload and try again.",
  notConfigurable: "Registration cannot be configured for a cancelled or rejected event.",
  notConfigurableCompleted: "Registration cannot be configured for a completed event.",
  invalidDatetime: "Enter a date and time with an offset, for example 2026-10-19T09:00:00+08:00.",
} as const;

/** The form's text fields. Dates are "YYYY-MM-DDTHH:mm" in Singapore time, as a datetime-local input holds them. */
export interface SettingsFormValues {
  enabled: boolean;
  opens: string;
  closes: string;
  capacity: string;
}

/** The request body the form sends; omitted fields keep their saved values on the server (F1). */
export interface SettingsRequest {
  registrationEnabled: boolean;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  capacity?: number;
  version: number;
}

const SGT_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// Singapore has no daylight saving, so a fixed +08:00 offset is exact.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "2026-10-19T09:00" read as Singapore time, returned with its offset. Undefined when it is not a valid date-time. */
export function sgtInputToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!SGT_INPUT.test(trimmed)) return undefined;
  const iso = `${trimmed}:00+08:00`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/** An instant as the Singapore wall clock, "YYYY-MM-DDTHH:mm", for a datetime-local input. */
export function isoToSgtInput(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return "";
  return new Date(instant + SGT_OFFSET_MS).toISOString().slice(0, 16);
}

/** A whole number from 1 to the column maximum, from text the user typed. Surrounding spaces are ignored. */
export function parseCapacityInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_CAPACITY ? value : undefined;
}

export interface SettingsCheck {
  errors: Partial<Record<keyof SettingsFormValues | "registrationOpensAt" | "registrationClosesAt", string>>;
  request?: SettingsRequest;
}

/**
 * Checks the typed values against the rules, then builds the request when they pass. `startsAt` is the event start
 * (ISO); `version` is the version the form loaded (BR7).
 */
export function checkSettingsForm(values: SettingsFormValues, startsAt: string, version: number): SettingsCheck {
  const errors: SettingsCheck["errors"] = {};
  const opensIso = values.opens.trim() ? sgtInputToIso(values.opens) : undefined;
  const closesIso = values.closes.trim() ? sgtInputToIso(values.closes) : undefined;
  const capacity = parseCapacityInput(values.capacity);

  if (!values.capacity.trim() || capacity === undefined) errors.capacity = SETTINGS_MESSAGES.capacityInvalid;
  if (values.opens.trim() && !opensIso) errors.registrationOpensAt = SETTINGS_MESSAGES.invalidDatetime;
  if (values.closes.trim() && !closesIso) errors.registrationClosesAt = SETTINGS_MESSAGES.invalidDatetime;

  if (opensIso && closesIso && Date.parse(closesIso) <= Date.parse(opensIso))
    errors.registrationClosesAt = SETTINGS_MESSAGES.closeAfterOpen;
  if (closesIso && !errors.registrationClosesAt && Date.parse(closesIso) > Date.parse(startsAt))
    errors.registrationClosesAt = SETTINGS_MESSAGES.closeOnOrBeforeStart;

  if (values.enabled) {
    if (!opensIso && !errors.registrationOpensAt) errors.registrationOpensAt = SETTINGS_MESSAGES.incomplete;
    if (!closesIso && !errors.registrationClosesAt) errors.registrationClosesAt = SETTINGS_MESSAGES.incomplete;
  }

  if (Object.keys(errors).length > 0) return { errors };
  const request: SettingsRequest = { registrationEnabled: values.enabled, version };
  if (opensIso) request.registrationOpensAt = opensIso;
  if (closesIso) request.registrationClosesAt = closesIso;
  if (capacity !== undefined) request.capacity = capacity;
  return { errors, request };
}
