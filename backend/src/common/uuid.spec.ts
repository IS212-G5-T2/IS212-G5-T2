import { describe, expect, it } from 'vitest';
import { UUID_PATTERN } from './uuid.js';

describe('UUID_PATTERN', () => {
  /** Accepts the database identifier shape without imposing a UUID version. */
  it('accepts mixed-case UUIDs of different versions', () => {
    expect(UUID_PATTERN.test('00000000-0000-4000-8000-000000000036')).toBe(
      true,
    );
    expect(UUID_PATTERN.test('A0B1C2D3-1234-1234-ABCD-0123456789AB')).toBe(
      true,
    );
  });

  /** Rejects malformed path IDs before they are sent to PostgreSQL. */
  it('rejects incomplete or non-hex identifiers', () => {
    expect(UUID_PATTERN.test('not-a-uuid')).toBe(false);
    expect(UUID_PATTERN.test('00000000-0000-4000-8000-00000000003')).toBe(
      false,
    );
    expect(UUID_PATTERN.test('00000000-0000-4000-8000-00000000003g')).toBe(
      false,
    );
  });
});
