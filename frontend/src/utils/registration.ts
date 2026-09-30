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

const SGT_FORMAT = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Formats an ISO instant in Singapore time (D20). */
export function formatSgt(value: string): string {
  return `${SGT_FORMAT.format(new Date(value))} SGT`;
}
