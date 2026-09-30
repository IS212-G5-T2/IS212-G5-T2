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
} as const;

const SGT_FORMAT = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
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
} as const;
