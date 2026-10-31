/*
 * SPM-155 Request Cancellation of My Event (Organiser): pure body validation.
 * Story: SPM-155. ACs: AC1 (reason), AC3 (decision). Test cases: CANCEL-REQUEST-01-H, 03-SUP-INPUT, 01-SUP-BODY.
 * Oracle tiers: SPEC = the test-case document (docs/specs/SPM-155-test-cases.md); DERIVED = a Gate-1 decision
 * (reason 0 to 500 code points, strict bodies); ASSUMED = wording of the new codes and messages.
 * Messages and codes below are literal copies; this file never imports the production message module.
 * Mutant IDs in each "Kills:" line are defined in backend/scripts/mutation/spm155.mutants.mjs.
 */
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateCreateBody, validateDecisionBody } from './cancellation-request.input.js';

const MSG_REASON = 'Use 500 characters or fewer.';
const MSG_INVALID_REQUEST = 'The request is not valid.';
const MSG_DECISION = 'Choose accept or decline.';

/** Runs `work` and returns what it threw, so the test can assert the refusal's status class and body. */
function thrown(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

describe('SPM-155 cancellation request body: reason (AC1)', () => {
  // Kills: M5c, M5e
  /** CANCEL-REQUEST-01-H subtest A: no reason is allowed (SPEC: "no reason -> HTTP 201"). Stored as null. */
  it.each([
    ['body omitted', undefined],
    ['empty object', {}],
    ['reason null', { reason: null }],
    ['reason empty string', { reason: '' }],
  ])('CANCEL-REQUEST-01-H: %s means no reason (null)', (_label, body) => {
    // Act
    const result = validateCreateBody(body);

    // Assert: exactly null, not undefined or an empty string (what the database stores)
    expect(result).toEqual({ reason: null });
  });

  // Kills: M5f
  /** CANCEL-REQUEST-01-H subtest B and C: 500 accepted, 501 refused (DERIVED: Gate-1 D-reason, 0 to 500 code points). */
  it('CANCEL-REQUEST-01-H: a reason of exactly 500 characters is accepted unchanged', () => {
    // Arrange: 500 x "a" (limit 500: on the limit)
    const reason = 'a'.repeat(500);

    // Act / Assert
    expect(validateCreateBody({ reason })).toEqual({ reason });
  });

  // Kills: M5a
  it('CANCEL-REQUEST-01-H: a reason of 501 characters is refused with 422 INVALID_REASON', () => {
    // Arrange: 501 x "a" (limit 500: one over)
    const error = thrown(() => validateCreateBody({ reason: 'a'.repeat(501) }));

    // Assert: 422 with the literal code and message
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'INVALID_REASON',
      message: MSG_REASON,
    });
  });

  // Kills: M5a, M5b, M5f
  /** CANCEL-REQUEST-01-H: the limit counts code points. 500 emoji are 1000 UTF16 units but still 500 characters. */
  it('CANCEL-REQUEST-01-H: 500 astral-plane characters are accepted and 501 are refused', () => {
    // Arrange: U+1F600 is one code point and two UTF16 units
    const emoji = '\u{1F600}';

    // Act / Assert: 500 x 1 code point = 500 accepted; 501 refused
    expect(validateCreateBody({ reason: emoji.repeat(500) })).toEqual({ reason: emoji.repeat(500) });
    expect((thrown(() => validateCreateBody({ reason: emoji.repeat(501) })) as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'INVALID_REASON',
    });
  });

  // Kills: M5c, M5f
  /** CANCEL-REQUEST-01-H (DERIVED): the reason is trimmed; spaces only means no reason; padding does not count toward 500. */
  it('CANCEL-REQUEST-01-H: spaces-only becomes null and padding around a 500-character reason is not counted', () => {
    // Arrange / Act / Assert
    expect(validateCreateBody({ reason: '   \t ' })).toEqual({ reason: null });
    // 500 characters with 10 spaces either side is still 500 after the trim, and the stored text is trimmed
    expect(validateCreateBody({ reason: `${' '.repeat(10)}${'b'.repeat(500)}${' '.repeat(10)}` })).toEqual({ reason: 'b'.repeat(500) });
  });

  // Kills: M5d
  /** CANCEL-REQUEST-01-H (DERIVED): a reason that is not text is a 400, never coerced. */
  it.each([
    ['number', 5],
    ['boolean', true],
    ['object', { text: 'x' }],
    ['array', ['x']],
  ])('CANCEL-REQUEST-01-H: a reason that is a %s is refused with 400 INVALID_REQUEST', (_label, reason) => {
    // Act
    const error = thrown(() => validateCreateBody({ reason }));

    // Assert
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_REQUEST', message: MSG_INVALID_REQUEST });
  });

  // Kills: M5g
  /** CANCEL-REQUEST-01-H subtest D: script text is stored literally (it is displayed as text only; the UI test shows it). */
  it('CANCEL-REQUEST-01-H: script text is kept exactly as typed', () => {
    // Arrange / Act / Assert: no stripping, no escaping
    expect(validateCreateBody({ reason: '<script>alert(1)</script>' })).toEqual({ reason: '<script>alert(1)</script>' });
  });
});

describe('SPM-155 cancellation request body: strict create body (AC1)', () => {
  // Kills: M18a
  /** CANCEL-REQUEST-01-SUP-BODY (DERIVED: strict schema): unknown fields are a 400 and are never read. */
  it.each([
    ['status', { status: 'accepted' }],
    ['requestedById', { requestedById: 'someone-else' }],
    ['eventId', { eventId: '11111111-1111-4111-8111-111111111111' }],
    ['decidedBy', { decidedBy: 'x' }],
    ['reason with an extra field', { reason: 'ok', extra: 1 }],
  ])('CANCEL-REQUEST-01-SUP-BODY: an unknown field (%s) is refused with 400 INVALID_REQUEST', (_label, body) => {
    // Act
    const error = thrown(() => validateCreateBody(body));

    // Assert
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_REQUEST', message: MSG_INVALID_REQUEST });
  });

  // Kills: M18c
  it.each([
    ['an array', []],
    ['a string', 'reason'],
    ['a number', 3],
  ])('CANCEL-REQUEST-01-SUP-BODY: a body that is %s is refused with 400 INVALID_REQUEST', (_label, body) => {
    // Act / Assert
    expect((thrown(() => validateCreateBody(body)) as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_REQUEST',
      message: MSG_INVALID_REQUEST,
    });
  });
});

describe('SPM-155 cancellation decision body (AC3)', () => {
  // Kills: M18d
  /** CANCEL-REQUEST-03-SUP-INPUT (SPEC: S1 body `{ "decision": "accept" | "decline" }`): both values are returned as given. */
  it.each([
    ['accept', 'accept'],
    ['decline', 'decline'],
  ])('CANCEL-REQUEST-03-SUP-INPUT: decision %s is accepted', (value, expected) => {
    // Act / Assert
    expect(validateDecisionBody({ decision: value })).toEqual({ decision: expected });
  });

  // Kills: M18b
  /** CANCEL-REQUEST-03-SUP-INPUT (DERIVED, D7): any other decision is 400 INVALID_DECISION (near-miss values included). */
  it.each([
    ['missing', {}],
    ['null', { decision: null }],
    ['Accept (case)', { decision: 'Accept' }],
    ['accept with a trailing space', { decision: 'accept ' }],
    ['approve', { decision: 'approve' }],
    ['number 1', { decision: 1 }],
    ['true', { decision: true }],
    ['empty', { decision: '' }],
    ['undefined body', undefined],
  ])('CANCEL-REQUEST-03-SUP-INPUT: decision %s is refused with 400 INVALID_DECISION', (_label, body) => {
    // Act
    const error = thrown(() => validateDecisionBody(body));

    // Assert
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_DECISION', message: MSG_DECISION });
  });

  // Kills: M18a
  /** CANCEL-REQUEST-03-SUP-INPUT (DERIVED, strict schema): an unknown field is 400 INVALID_REQUEST even with a valid decision. */
  it.each([
    ['status', { decision: 'accept', status: 'accepted' }],
    ['decidedBy', { decision: 'decline', decidedBy: 'x' }],
    ['eventId', { decision: 'accept', eventId: 'y' }],
  ])('CANCEL-REQUEST-03-SUP-INPUT: an unknown field (%s) is refused with 400 INVALID_REQUEST', (_label, body) => {
    // Act
    const error = thrown(() => validateDecisionBody(body));

    // Assert
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_REQUEST', message: MSG_INVALID_REQUEST });
  });

  // Kills: M18c
  it.each([
    ['an empty array', []],
    ['an array holding the value', ['accept']],
    ['a string', 'accept'],
    ['a number', 3],
  ])('CANCEL-REQUEST-03-SUP-INPUT: a body that is %s is refused with 400 INVALID_REQUEST', (_label, body) => {
    // Act / Assert
    expect((thrown(() => validateDecisionBody(body)) as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_REQUEST',
      message: MSG_INVALID_REQUEST,
    });
  });
});
