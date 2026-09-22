import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validateMessage } from './clarification-input.js';

describe('validateMessage', () => {
  it('rejects a blank message', () => {
    expect(() => validateMessage({ message: '' }, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a whitespace-only message', () => {
    expect(() =>
      validateMessage({ message: ' \n\t ' }, 'Message cannot be blank.'),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing message field', () => {
    expect(() => validateMessage({}, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-string message', () => {
    expect(() => validateMessage({ message: 42 }, 'Message cannot be blank.')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a message over the length limit', () => {
    expect(() =>
      validateMessage({ message: 'a'.repeat(2001) }, 'Message cannot be blank.'),
    ).toThrow(BadRequestException);
  });

  it('trims and accepts a valid message', () => {
    expect(validateMessage({ message: '  Please confirm the layout.  ' }, 'x')).toBe(
      'Please confirm the layout.',
    );
  });

  it('surfaces the caller-supplied error text', () => {
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
