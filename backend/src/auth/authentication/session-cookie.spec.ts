import { describe, expect, it } from 'vitest';
import { readSessionCookie } from './session-cookie.js';

describe('readSessionCookie', () => {
  /** Reads only the configured cookie, including when another cookie precedes it. */
  it('reads the configured session cookie from a combined header', () => {
    expect(
      readSessionCookie(
        'other=value; local_session=opaque-token',
        'local_session',
      ),
    ).toBe('opaque-token');
  });

  /** A similarly prefixed cookie must not authenticate or revoke a session. */
  it('does not match a different cookie with the session name as a prefix', () => {
    expect(
      readSessionCookie('local_session_old=other-token', 'local_session'),
    ).toBeUndefined();
  });

  /** Missing and empty values retain the callers' existing unauthenticated behavior. */
  it('returns no usable token for absent or empty session cookies', () => {
    expect(readSessionCookie(undefined, 'local_session')).toBeUndefined();
    expect(readSessionCookie('local_session=', 'local_session')).toBe('');
  });
});
