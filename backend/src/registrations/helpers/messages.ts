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
  // SPM-138 waitlist. The 422 code is fixed by D14; the other two codes were ASSUMED and are PO confirmed 22 Oct 2026 (SC-138-001, SC-138-002).
  waitlistNotAvailable: 'WAITLIST_NOT_AVAILABLE',
  alreadyOnWaitlist: 'already_on_waitlist',
  notWithdrawable: 'registration_not_withdrawable',
  // SPM-139 F5: the coordinator has disabled registration (distinct from closed and not-yet-open).
  disabled: 'REGISTRATION_DISABLED',
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

const SGT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Formats an instant as its Singapore calendar date, no time (for example 10 Jan 2027). */
export function formatSgtDate(value: Date): string {
  return SGT_DATE_FORMAT.format(value);
}

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
  // SPM-61 A-NULL: a legacy registration without a name, email or contact number (CSV keeps the cell empty).
  reportNotProvided: 'Not provided',
  exportFormatInvalid: 'Export format must be csv or pdf.',
  // SPM-138 waitlist (D14, wording locked). MSG-WL-02 is shown by the frontend only.
  waitlistJoined: (eventName: string, position: number) =>
    `You have joined the waitlist for ${eventName}. Your position is ${position}.`,
  waitlistNotAvailable: 'This event still has available spots. Please register directly.',
  waitlistDuplicate: 'You are already on the waitlist for this event.',
  waitlistPromoted: (eventName: string) => `A spot opened up. You are now registered for ${eventName}.`,
  // SPM-136 rule (a person cannot be both a waiting-list attendee and the organiser or assigned coordinator). PO confirmed 22 Oct 2026 (SC-136-008).
  ownEventWaitlist: 'An organiser or the assigned coordinator cannot join the waiting list for their own event.',
  waitlistCancelled: (eventName: string) =>
    `${eventName} has been cancelled. Your waitlist place is cancelled.`,
  // SC-138-002 (PO confirmed 22 Oct 2026): a Removed or Cancelled entry cannot be withdrawn. The spec gives the 409 only.
  notWithdrawable: 'This registration can no longer be withdrawn.',
  // SPM-139 F5 (ASSUMED wording: the test-case document gives the code, not the text).
  disabled: 'Registration is not available for this event.',
} as const;
