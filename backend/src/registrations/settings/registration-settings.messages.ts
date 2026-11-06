/*
 * SPM-139 error codes and user-facing wording for the coordinator's registration settings. Wording marked ASSUMED is
 * ours: the test-case document gives the code or the rule but not the text. The frontend mirrors these strings in
 * frontend/src/features/events/lib/registrationSettings.ts; tests assert the code and the text.
 */
export const SETTINGS_ERROR_CODES = {
  validation: 'validation_error',
  incomplete: 'SETTINGS_INCOMPLETE',
  invalidPeriod: 'INVALID_PERIOD',
  invalidDatetime: 'INVALID_DATETIME',
  invalidCapacity: 'INVALID_CAPACITY',
  capacityTooLarge: 'CAPACITY_TOO_LARGE',
  capacityBelowConfirmed: 'CAPACITY_BELOW_CONFIRMED',
  notConfigurable: 'EVENT_NOT_CONFIGURABLE',
  conflict: 'SETTINGS_CONFLICT',
} as const;

export const SETTINGS_MESSAGES = {
  // MSG-CFG-01 to MSG-CFG-10 wording is fixed by the test-case document.
  saved: 'Registration settings saved.',
  closeAfterOpen: 'Registration closing time must be after the opening time.',
  closeOnOrBeforeStart: 'Registration must close on or before the event start time.',
  incomplete: 'Set the registration period and capacity before turning registration on.',
  capacityInvalid: 'Capacity must be a positive whole number.',
  capacityBelowConfirmed: (confirmed: number) =>
    `Capacity cannot be lower than the number of Confirmed registrations (${confirmed}).`,
  notConfigurable: 'Registration details can only be set while the event is Approved, Planning or Confirmed.',
  conflict: 'These settings were changed elsewhere. Reload and try again.',
  // ASSUMED: the document has no wording for these cases (F4, F8).
  capacityTooLarge: (max: number) => `Capacity cannot be more than ${max}.`,
  invalidDatetime: 'Enter a date and time with an offset, for example 2026-10-19T09:00:00+08:00.',
  invalidRequest: 'The registration settings request is not valid.',
  unknownField: 'This field is not allowed.',
  forbidden: 'Only the assigned coordinator can manage registration settings.',
  eventNotFound: 'Event not found.',
} as const;

/** The integer column limit: registration_limit is a signed 32-bit integer (database/postgresql/init/001_schema.sql). */
export const MAX_REGISTRATION_CAPACITY = 2147483647;
