/*
 * SPM-61 validation and sanitization. Test Case IDs are ASSUMED from the
 * task's Test Case Matrix because docs/specs/SPM-61-test-cases.md is not in
 * the repository; quoted expectations are the Jira AC3 wording.
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';
import { sanitizeText } from './sanitization.js';
import { REGISTRATION_LIMITS, validateRegistration } from './validation.js';

const valid = { fullName: 'Alice Tan', email: 'alice@example.com' };

/** Runs the validator and returns the field error map it rejects with. */
function errorsFor(body: unknown): Record<string, string> {
  try {
    validateRegistration(body);
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as {
      errors: Record<string, string>;
      code: string;
      message: string;
    };
    expect(response.code).toBe('validation_error');
    expect(response.message).toBe(MESSAGES.validation);
    return response.errors;
  }
  throw new Error('Expected validation to fail');
}

// EVENT-REG-03-B
describe('EVENT-REG-03-B: required fields (AC3: "I can enter my details and submit my registration")', () => {
  // Missing or blank required fields are rejected with a per-field error.
  it.each([
    ['fullName missing', { email: valid.email }, 'fullName'],
    ['fullName whitespace only', { ...valid, fullName: '   ' }, 'fullName'],
    ['email missing', { fullName: valid.fullName }, 'email'],
    ['email whitespace only', { ...valid, email: '  ' }, 'email'],
  ])('[A] %s -> 400 with field error', (_name, body, field) => {
    expect(errorsFor(body)).toHaveProperty(field);
  });

  // Non-object bodies are rejected outright instead of crashing.
  it.each([[null], ['text'], [42], [[]]])('[B] non-object body %j -> 400', (body) => {
    expect(() => validateRegistration(body)).toThrow(BadRequestException);
  });
});

// EVENT-REG-03-C
describe('EVENT-REG-03-C: invalid formats (table-driven)', () => {
  // Bad email, name and contact formats each produce a field error.
  it.each([
    ['email without @', { ...valid, email: 'alice.example.com' }, 'email'],
    ['email without domain', { ...valid, email: 'alice@' }, 'email'],
    ['email with spaces', { ...valid, email: 'ali ce@example.com' }, 'email'],
    ['contact with letters', { ...valid, contactNumber: '9123abcd' }, 'contactNumber'],
    ['contact too short', { ...valid, contactNumber: '1234567' }, 'contactNumber'],
    ['contact too long', { ...valid, contactNumber: '1'.repeat(16) }, 'contactNumber'],
    ['fullName not a string', { ...valid, fullName: 123 }, 'fullName'],
  ])('%s -> 400', (_name, body, field) => {
    expect(errorsFor(body)).toHaveProperty(field);
  });

  // Accepted contact formats are normalised to bare digits with an optional leading +.
  it.each([
    ['91234567', '91234567'],
    ['+65 9123 4567', '+6591234567'],
    ['  9123 4567 ', '91234567'],
    ['', undefined],
  ])('contact %j is stored as %j', (input, stored) => {
    expect(validateRegistration({ ...valid, contactNumber: input }).contactNumber).toBe(stored);
  });
});

// EVENT-REG-03-BND-1
describe('EVENT-REG-03-BND-1: field length limits (table-driven)', () => {
  const { fullNameMax, emailMax, specialRequirementsMax, contactDigitsMin, contactDigitsMax } =
    REGISTRATION_LIMITS;

  // Limits are inclusive: at the limit passes, one over fails.
  it('[A] fullName 1 and 100 characters pass, 101 fails', () => {
    expect(() => validateRegistration({ ...valid, fullName: 'A' })).not.toThrow();
    expect(() => validateRegistration({ ...valid, fullName: 'A'.repeat(fullNameMax) })).not.toThrow();
    expect(errorsFor({ ...valid, fullName: 'A'.repeat(fullNameMax + 1) })).toHaveProperty('fullName');
  });

  // The maximum email length passes; one over fails.
  it('[B] email at the limit passes, one over fails', () => {
    const local = 'a'.repeat(emailMax - '@example.com'.length);
    expect(() => validateRegistration({ ...valid, email: `${local}@example.com` })).not.toThrow();
    expect(errorsFor({ ...valid, email: `a${local}@example.com` })).toHaveProperty('email');
  });

  // Contact digit count boundaries are 8 and 15.
  it('[C] contact 8 and 15 digits pass, 7 and 16 fail', () => {
    expect(() => validateRegistration({ ...valid, contactNumber: '1'.repeat(contactDigitsMin) })).not.toThrow();
    expect(() => validateRegistration({ ...valid, contactNumber: '1'.repeat(contactDigitsMax) })).not.toThrow();
    expect(errorsFor({ ...valid, contactNumber: '1'.repeat(contactDigitsMin - 1) })).toHaveProperty('contactNumber');
    expect(errorsFor({ ...valid, contactNumber: '1'.repeat(contactDigitsMax + 1) })).toHaveProperty('contactNumber');
  });

  // Special requirements are optional and capped.
  it('[D] specialRequirements at the limit passes, one over fails', () => {
    expect(() => validateRegistration({ ...valid, specialRequirements: 'x'.repeat(specialRequirementsMax) })).not.toThrow();
    expect(errorsFor({ ...valid, specialRequirements: 'x'.repeat(specialRequirementsMax + 1) })).toHaveProperty('specialRequirements');
  });

  // Limits are pinned so the frontend mirror cannot drift silently.
  it('[E] limit values match the frontend mirror', () => {
    expect(REGISTRATION_LIMITS).toEqual({
      fullNameMin: 1,
      fullNameMax: 100,
      emailMax: 254,
      contactDigitsMin: 8,
      contactDigitsMax: 15,
      specialRequirementsMax: 500,
    });
  });
});

// EVENT-REG-03-D
describe('EVENT-REG-03-D: server-controlled fields (D15 strict schema)', () => {
  // Unknown or server-controlled keys are rejected, never silently ignored.
  it.each(['status', 'attendeeId', 'eventId', 'id', 'registeredAt', 'extra'])(
    'body containing %s -> 400',
    (key) => {
      expect(errorsFor({ ...valid, [key]: 'x' })).toHaveProperty(key);
    },
  );
});

// EVENT-REG-03-SEC-1
describe('EVENT-REG-03-SEC-1: store literal, escape on output', () => {
  // Markup and SQL text are kept exactly as typed; only control characters go.
  it('[A] keeps HTML and SQL text literally', () => {
    const payload = `<script>alert(1)</script>'; DROP TABLE users;--`;
    const out = validateRegistration({ ...valid, specialRequirements: payload });
    expect(out.specialRequirements).toBe(payload);
  });

  // Control characters and outer whitespace are stripped.
  it('[B] trims and strips control characters', () => {
    expect(sanitizeText('  Al\u0000ice\u0007  ', { multiline: false })).toBe('Alice');
    expect(sanitizeText('line1\r\nline2\u0001', { multiline: true })).toBe('line1\nline2');
    expect(sanitizeText('a\nb', { multiline: false })).toBe('ab');
  });
});
