import type { RegistrationStatus } from "@/types";
import { sgtDateTimeParts, sgtDayKey } from "@/utils/sgtDate";

/*
 * SPM-61 registration rules shared by the form, section and page. Limits and
 * messages mirror backend/src/registrations/validation.ts (limits) and
 * messages.ts; a parity test pins the values on both sides. The server is the authority, this
 * module only gives users early feedback.
 */

export const REGISTRATION_LIMITS = {
  fullNameMin: 1,
  fullNameMax: 100,
  emailMax: 254,
  contactDigitsMin: 8,
  contactDigitsMax: 15,
  specialRequirementsMax: 500,
} as const;

export const REGISTRATION_MESSAGES = {
  closed: "Registration has closed for this event.",
  alreadyRegistered: "You are already registered for this event.",
  success: (eventName: string) => `Registration successful. You are registered for ${eventName}.`,
  // MSG-03 and MSG-04 wording is locked (mirrors backend messages.ts).
  validation: "Please correct the highlighted fields.",
  full: "This event is fully booked.",
  failure: "We couldn't complete your registration. Please try again.",
} as const;

export interface RegistrationDetails {
  fullName: string;
  email: string;
  contactNumber: string;
  specialRequirements: string;
}

export type RegistrationErrors = Partial<Record<keyof RegistrationDetails, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inclusive at opening, exclusive at closing (D6). A missing bound is unbounded. */
export function isRegistrationOpen(
  period: { opensAt?: string; closesAt?: string },
  currentDate: Date,
): boolean {
  const current = currentDate.getTime();
  if (period.opensAt && current < new Date(period.opensAt).getTime()) return false;
  if (period.closesAt && current >= new Date(period.closesAt).getTime()) return false;
  return true;
}

/** Mirrors the server's field rules and returns per-field messages. */
export function validateRegistrationDetails(details: RegistrationDetails): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const name = details.fullName.trim();
  if (name.length < REGISTRATION_LIMITS.fullNameMin) errors.fullName = "Full name is required.";
  else if (name.length > REGISTRATION_LIMITS.fullNameMax)
    errors.fullName = `Full name must be at most ${REGISTRATION_LIMITS.fullNameMax} characters.`;

  const email = details.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (email.length > REGISTRATION_LIMITS.emailMax || !EMAIL_PATTERN.test(email))
    errors.email = "Enter a valid email address.";

  const contact = details.contactNumber.replace(/\s+/g, "");
  if (contact) {
    const digits = contact.replace(/^\+/, "");
    if (
      !/^\+?\d+$/.test(contact) ||
      digits.length < REGISTRATION_LIMITS.contactDigitsMin ||
      digits.length > REGISTRATION_LIMITS.contactDigitsMax
    ) {
      errors.contactNumber = `Contact number must have ${REGISTRATION_LIMITS.contactDigitsMin} to ${REGISTRATION_LIMITS.contactDigitsMax} digits.`;
    }
  }
  if (details.specialRequirements.trim().length > REGISTRATION_LIMITS.specialRequirementsMax)
    errors.specialRequirements = `Special requirements must be at most ${REGISTRATION_LIMITS.specialRequirementsMax} characters.`;
  return errors;
}

/** Formats an instant as "12 Mar 2027, 23:59" in Singapore time (D20). */
export function formatSgtDateTime(value: string | Date): string {
  const { date, time } = sgtDateTimeParts(value);
  return `${date}, ${time}`;
}

/** Same as formatSgtDateTime with the zone spelled out, for sentences like MSG-02. */
export function formatSgt(value: string | Date): string {
  return `${formatSgtDateTime(value)} SGT`;
}

const sgtDayNumber = (value: Date): number => {
  const [year, month, day] = sgtDayKey(value).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/**
 * Calendar-day difference between two instants in Singapore time. This is not
 * hoursRemaining / 24: a 23:59 close is "0 days" away on the closing day.
 */
export function sgtCalendarDayDiff(from: Date, to: Date): number {
  return sgtDayNumber(to) - sgtDayNumber(from);
}

/** Heading for an open registration: "Registration closes today" / "in 1 day" / "in N days". */
export function registrationClosingHeading(closesAt: string, now: Date): string {
  const days = sgtCalendarDayDiff(now, new Date(closesAt));
  if (days <= 0) return "Registration closes today";
  return `Registration closes in ${days} ${days === 1 ? "day" : "days"}`;
}

/*
 * SPM-120 withdrawal rules. The server is the authority (it re-checks the event
 * start and ownership); these only drive what the page offers.
 */

/**
 * Wording is locked by the AC text and the test cases. The blocked message has
 * no full stop (AC5). The success message is the chosen MSG-11 wording and is
 * built here from the event name the page already holds, never from the response.
 */
export const WITHDRAWAL_MESSAGES = {
  eventAlreadyOccurred: "Event has already occurred",
  success: (eventName: string) => `Your withdrawal from ${eventName} has been processed.`,
} as const;

/**
 * The one client-side definition of "the event has already occurred": the cut-off
 * is the event start instant, exclusive (at or after the start is blocked).
 * Mirrors backend/src/registrations/event-start.ts.
 */
export function hasEventStarted(event: { startDateTime: string }, now: Date): boolean {
  return now.getTime() >= new Date(event.startDateTime).getTime();
}

/*
 * Withdrawn registration card redesign (SPM-120 follow-up). The timeline always
 * shows absolute SGT timestamps (formatSgtDateTime); nothing here renders a bare
 * "today"/"just now" as the only time information.
 */

/** "today", "1 day" or "N days" until the given instant, in Singapore calendar days. */
export function daysUntilLabel(target: string | Date, now: Date): string {
  const days = sgtCalendarDayDiff(now, new Date(target));
  if (days <= 0) return "today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Footer copy for the withdrawn-card "Register again" action, one line per blocked state. */
export const REREGISTER_FOOTER = {
  changedYourMind: "Changed your mind?",
  full: "This event is full.",
  opensOn: (date: string) => `Registration opens ${date}.`,
  closedOn: (date: string) => `Registration closed on ${date}.`,
  closed: "Registration is closed.",
  eventStarted: "Event has already started.",
} as const;

/*
 * SPM-138 waitlist. The server is the authority (it re-checks the window, fullness, duplicates and the position);
 * these only drive what the page offers. Copy mirrors backend/src/registrations/helpers/messages.ts (D14, wording locked).
 */
export const WAITLIST_MESSAGES = {
  /** MSG-WL-01: built here from the event name and the response position, never from the server's text (D14). */
  joined: (eventName: string, position: number) =>
    `You have joined the waitlist for ${eventName}. Your position is ${position}.`,
  /** MSG-WL-02: the full-event sentence shown with the Join control. */
  full: "This event is full. Join the waitlist to be notified if a spot opens.",
  /** The join control. */
  join: "Join Waitlist",
  /** The card's position notice (SPM-138 UI): the place in line for a waitlisted attendee. */
  inLine: (position: number) => `You're #${position} in line`,
} as const;

/** The page state an attendee is shown (D16). */
export type RegistrationUiState =
  | "closed"
  | "not-yet-open"
  | "register"
  | "full-join"
  | "registered"
  | "waitlisted"
  | "cancelled";

/**
 * Chooses the registration state for an attendee. The attendee's own confirmed, waiting or cancelled status wins over the
 * window. Otherwise the window decides: closed beats not-yet-open, and an open window offers Join when the event is full
 * and Register when a place is free. A removed or withdrawn entry falls through to the window, as a new attempt would.
 *
 * @param window The registration window at the current instant.
 * @param full Whether the Confirmed count has reached the limit.
 * @param myStatus The attendee's own registration status, if any.
 */
export function registrationUiState(
  window: "open" | "closed" | "not-yet-open",
  full: boolean,
  myStatus: RegistrationStatus | undefined,
): RegistrationUiState {
  if (myStatus === "registered") return "registered";
  if (myStatus === "waitlisted") return "waitlisted";
  if (myStatus === "cancelled") return "cancelled";
  if (window === "closed") return "closed";
  if (window === "not-yet-open") return "not-yet-open";
  return full ? "full-join" : "register";
}
