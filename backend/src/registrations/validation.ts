/*
 * SPM-61 strict request validation. Unknown or server-controlled keys are
 * rejected (D15) so a client can never set status, attendee or event ids.
 */
import { BadRequestException } from '@nestjs/common';
import { MESSAGES, REGISTRATION_ERROR_CODES } from './messages.js';
import { sanitizeText } from './sanitization.js';

/*
 * Field limits are locked here (single source of truth on the backend; the
 * frontend mirror is pinned by a parity test).
 */
export const REGISTRATION_LIMITS = {
  fullNameMin: 1,
  fullNameMax: 100,
  // RFC 5321 maximum address length. Locked.
  emailMax: 254,
  contactDigitsMin: 8,
  contactDigitsMax: 15,
  // Locked: special requirements are capped at 500 characters.
  specialRequirementsMax: 500,
} as const;

export const REGISTRATION_FIELDS = [
  'fullName',
  'email',
  'contactNumber',
  'specialRequirements',
] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

export interface RegistrationInput {
  fullName: string;
  email: string;
  contactNumber?: string;
  specialRequirements?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^\+?\d+$/;

/** Validates and sanitises a registration body, throwing a 400 with per-field errors. */
export function validateRegistration(body: unknown): RegistrationInput {
  const errors: Record<string, string> = {};
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid({ form: 'A registration object is required.' });
  }
  const data = body as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!(REGISTRATION_FIELDS as readonly string[]).includes(key)) {
      errors[key] = 'This field is not accepted.';
    }
  }

  const fullName = text(data, 'fullName', false, errors);
  const email = text(data, 'email', false, errors);
  const special = text(data, 'specialRequirements', true, errors);
  const contact = text(data, 'contactNumber', false, errors);

  if (fullName !== undefined) {
    if (fullName.length < REGISTRATION_LIMITS.fullNameMin) errors.fullName = 'Full name is required.';
    else if (fullName.length > REGISTRATION_LIMITS.fullNameMax)
      errors.fullName = `Full name must be at most ${REGISTRATION_LIMITS.fullNameMax} characters.`;
  }
  if (email !== undefined) {
    if (!email) errors.email = 'Email is required.';
    else if (email.length > REGISTRATION_LIMITS.emailMax || !EMAIL_PATTERN.test(email))
      errors.email = 'Enter a valid email address.';
  }
  if (special !== undefined && special.length > REGISTRATION_LIMITS.specialRequirementsMax) {
    errors.specialRequirements = `Special requirements must be at most ${REGISTRATION_LIMITS.specialRequirementsMax} characters.`;
  }
  let contactNumber: string | undefined;
  if (contact) {
    const compact = contact.replace(/\s+/g, '');
    const digits = compact.replace(/^\+/, '');
    if (
      !CONTACT_PATTERN.test(compact) ||
      digits.length < REGISTRATION_LIMITS.contactDigitsMin ||
      digits.length > REGISTRATION_LIMITS.contactDigitsMax
    ) {
      errors.contactNumber = `Contact number must have ${REGISTRATION_LIMITS.contactDigitsMin} to ${REGISTRATION_LIMITS.contactDigitsMax} digits.`;
    } else contactNumber = compact;
  }

  if (Object.keys(errors).length) throw invalid(errors);
  return {
    fullName: fullName as string,
    email: (email as string).toLowerCase(),
    contactNumber,
    specialRequirements: special || undefined,
  };
}

/** Reads one optional-or-required string field; non-strings become field errors. */
function text(
  data: Record<string, unknown>,
  key: RegistrationField,
  multiline: boolean,
  errors: Record<string, string>,
): string | undefined {
  const value = data[key];
  if (value === undefined || value === null) {
    if (key === 'fullName' || key === 'email') errors[key] = `${key === 'email' ? 'Email' : 'Full name'} is required.`;
    return undefined;
  }
  if (typeof value !== 'string') {
    errors[key] = 'This field must be text.';
    return undefined;
  }
  return sanitizeText(value, { multiline });
}

function invalid(errors: Record<string, string>): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: REGISTRATION_ERROR_CODES.validation,
    message: MESSAGES.validation,
    errors,
  });
}
