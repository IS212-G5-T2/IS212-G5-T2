import { InternalServerErrorException } from '@nestjs/common';
import type { AuthConfig } from '../auth/models/auth.models.js';

const DEFAULT_SESSION_TTL_HOURS = 8;
const DEFAULT_COOKIE_NAME = 'connectsphere_session';

/** Reads and validates the authentication session settings from the environment. */
export function getAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const configuredTtl = environment.AUTH_SESSION_TTL_HOURS;
  const sessionTtlHours =
    configuredTtl === undefined
      ? DEFAULT_SESSION_TTL_HOURS
      : Number(configuredTtl);

  if (
    !Number.isInteger(sessionTtlHours) ||
    sessionTtlHours <= 0 ||
    sessionTtlHours > 168
  ) {
    throw new InternalServerErrorException(
      'AUTH_SESSION_TTL_HOURS must be an integer between 1 and 168',
    );
  }

  return {
    cookieName: environment.AUTH_COOKIE_NAME || DEFAULT_COOKIE_NAME,
    cookieSecure: environment.AUTH_COOKIE_SECURE === 'true',
    sessionTtlHours,
  };
}
