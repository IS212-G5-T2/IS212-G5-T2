import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller.js';
import { CURRENT_USER_REQUEST_KEY } from './models/auth.models.js';

describe('AuthController', () => {
  it('returns only the authenticated user attached by middleware', () => {
    const controller = new AuthController();
    const authenticatedUser = {
      uid: 'firebase-user-1',
      email: 'organiser@example.test',
      roles: ['ORGANISER'] as const,
    };

    expect(
      controller.getCurrentUser({
        [CURRENT_USER_REQUEST_KEY]: authenticatedUser,
      } as never),
    ).toEqual(authenticatedUser);
  });
});
