import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateMessage } from './clarification-input.js';

/*
 * SPM-39 test case map (unit level, input validation only):
 *   REQ-CLAR-01-B (AC2): "rejects a blank message"
 *   REQ-CLAR-01-C (AC2): "rejects a whitespace-only message"
 * The other cases in this file (missing field, non-string, length limit, trim, caller-supplied text) support AC2
 * but are not named in the SPM-39 document.
 */
describe('validateMessage', () => {
  // SPM-39 REQ-CLAR-01-B (AC2)
  it('rejects a blank message', () => {
    expect(() => validateMessage({ message: '' }, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  // SPM-39 REQ-CLAR-01-C (AC2)
  it('rejects a whitespace-only message', () => {
    expect(() =>
      validateMessage({ message: ' \n\t ' }, 'Message cannot be blank.'),
    ).toThrow(BadRequestException);
  });

  it('REQ-CLAR-SUP-33 rejects a missing message field', () => {
    expect(() => validateMessage({}, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  it('REQ-CLAR-SUP-34 rejects a non-string message', () => {
    expect(() => validateMessage({ message: 42 }, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  it('REQ-CLAR-SUP-35 rejects a message over the length limit', () => {
    expect(() =>
      validateMessage({ message: 'a'.repeat(2001) }, 'Message cannot be blank.'),
    ).toThrow(BadRequestException);
  });

  it('REQ-CLAR-SUP-36 trims and accepts a valid message', () => {
    expect(validateMessage({ message: '  Please confirm the layout.  ' }, 'x')).toBe(
      'Please confirm the layout.',
    );
  });

  it('REQ-CLAR-SUP-37 surfaces the caller-supplied error text', () => {
    try {
      validateMessage({ message: '' }, 'Reply message cannot be blank.');
      expect.fail('expected validateMessage to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: 'Reply message cannot be blank.',
      });
    }
  });
});

describe('validateMessage: a body that is not an object', () => {
  // SPM-39 REQ-CLAR-01-B (AC2): a missing or malformed body is treated as a blank message.
  // Kills: the object check removed (null or an array is read as a message), or the fallback changed.
  it.each([null, undefined, ['Please confirm.'], 'Please confirm.'])('rejects the body %j as a blank message', (body) => {
    expect(() => validateMessage(body, 'Message cannot be blank.')).toThrow(BadRequestException);
  });
});
