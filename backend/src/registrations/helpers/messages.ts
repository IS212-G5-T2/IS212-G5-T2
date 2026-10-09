/*
 * SPM-61 single source of truth for user-facing registration messages and
 * error codes. The frontend keeps a mirror in frontend/src/utils/registration.ts.
 * Field limits live in validation.ts.
 */
export const REGISTRATION_ERROR_CODES = {
  validation: 'validation_error',
  closed: 'registration_closed',
  notOpen: 'registration_not_open',
  full: 'registration_full',
  duplicate: 'already_registered',
  // SPM-120 withdrawal. Code names are assumed (not fixed by the AC text).
  eventAlreadyOccurred: 'event_already_occurred',
  alreadyWithdrawn: 'registration_already_withdrawn',
} as const;

// Same format as the frontend: 12 Mar 2027, 23:59 (24-hour, SGT).
const SGT_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Formats an instant in Singapore time for user-facing messages. */
export function formatSgt(value: Date): string {
  return `${SGT_FORMAT.format(value)} SGT`;
}

export const MESSAGES = {
  // MSG-01, MSG-05, MSG-06: wording defined by the test-case contract.
  closed: 'Registration has closed for this event.',
  alreadyRegistered: 'You are already registered for this event.',
  success: (eventName: string) =>
    `Registration successful. You are registered for ${eventName}.`,
  // MSG-02, MSG-03, MSG-04 and the fully-booked message: wording locked.
  notOpen: (opensAt: Date) =>
    `Registration for this event opens on ${formatSgt(opensAt)}.`,
  validation: 'Please correct the highlighted fields.',
  failure: "We couldn't complete your registration. Please try again.",
  full: 'This event is fully booked.',
  attendeeOnly: 'Attendee access required.',
  eventNotFound: 'Event not found.',
  // SPM-120. The AC5 literal has no full stop. MSG-11 is the chosen success
  // wording; MSG-12 is the already-withdrawn wording from the test cases.
  registrationNotFound: 'Registration not found.',
  eventAlreadyOccurred: 'Event has already occurred',
  alreadyWithdrawn: 'This registration has already been withdrawn.',
  withdrawalSuccess: (eventName: string) =>
    `Your withdrawal from ${eventName} has been processed.`,
  // SPM-63. MSG-08 is fixed by the test cases; the PDF empty state and the 400 are picked (D17 / A11).
  reportForbidden: "You do not have access to this event's registrations.",
  reportEmptyPdf: 'No registrations to display',
  exportFormatInvalid: 'Export format must be csv or pdf.',
} as const;
