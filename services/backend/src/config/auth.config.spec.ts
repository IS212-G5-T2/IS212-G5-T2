import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { getAuthConfig } from './auth.config.js';

describe('getAuthConfig', () => {
  // Uses the documented development defaults when no deployment-specific values exist.
  it('uses an eight-hour non-secure cookie by default', () => {
    expect(getAuthConfig({})).toEqual({
      cookieName: 'connectsphere_session',
      cookieSecure: false,
      sessionTtlHours: 8,
    });
  });

  // Accepts an explicit secure-cookie setting for HTTPS deployments.
  it('reads valid environment overrides', () => {
    expect(
      getAuthConfig({
        AUTH_COOKIE_NAME: 'session',
        AUTH_COOKIE_SECURE: 'true',
        AUTH_SESSION_TTL_HOURS: '24',
      }),
    ).toEqual({
      cookieName: 'session',
      cookieSecure: true,
      sessionTtlHours: 24,
    });
  });

  // Rejects unsafe or malformed expiry configuration before issuing a session.
  it.each(['0', '-1', '1.5', '169', 'not-a-number'])(
    'rejects invalid TTL %s',
    (ttl) => {
      expect(() => getAuthConfig({ AUTH_SESSION_TTL_HOURS: ttl })).toThrow(
        InternalServerErrorException,
      );
    },
  );
});
