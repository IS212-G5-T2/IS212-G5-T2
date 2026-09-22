import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  const config = {
    cookieName: 'local_session',
    cookieSecure: false,
    sessionTtlHours: 8,
  };

  function createController() {
    const service = {
      getConfig: vi.fn().mockReturnValue(config),
      login: vi.fn().mockResolvedValue({
        token: 'opaque-token',
        user: { uid: 'user-1', roles: ['ATTENDEE'] },
      }),
      logout: vi.fn(),
    } as unknown as AuthService;
    return { controller: new AuthController(service), service };
  }

  // Valid credentials produce an HTTP-only, Lax cookie and return no session token.
  it('sets the local session cookie on login', async () => {
    const { controller, service } = createController();
    const response = { cookie: vi.fn() };

    await expect(
      controller.login(
        { email: ' attendee@local.connectsphere.test ', password: 'password' },
        response as never,
      ),
    ).resolves.toEqual({ uid: 'user-1', roles: ['ATTENDEE'] });
    expect(service.login).toHaveBeenCalledWith(
      'attendee@local.connectsphere.test',
      'password',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'local_session',
      'opaque-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 28_800_000,
      }),
    );
  });

  // The identity endpoint returns the account that authentication middleware attached.
  it('returns the authenticated request user', () => {
    const { controller } = createController();
    const user = { uid: 'user-1', roles: ['ATTENDEE'] };

    expect(controller.getCurrentUser({ currentUser: user } as never)).toBe(
      user,
    );
  });

  // Empty credentials are rejected before a database authentication query is made.
  it('rejects a malformed login body', async () => {
    const { controller } = createController();

    await expect(
      controller.login({ email: '', password: '' }, {
        cookie: vi.fn(),
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  // Missing and non-object bodies fail before any credential fields are read.
  it.each([undefined, 'email=attendee@local.connectsphere.test'])(
    'rejects a non-object login body',
    async (body) => {
      const { controller } = createController();

      await expect(
        controller.login(body, { cookie: vi.fn() } as never),
      ).rejects.toThrow(BadRequestException);
    },
  );

  // Logout is idempotent and clears the browser cookie even if it is already invalid.
  it('revokes the cookie session and clears it on logout', async () => {
    const { controller, service } = createController();
    const response = { clearCookie: vi.fn() };

    await controller.logout(
      { headers: { cookie: 'local_session=opaque-token' } } as never,
      response as never,
    );

    expect(service.logout).toHaveBeenCalledWith('opaque-token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'local_session',
      expect.objectContaining({ path: '/' }),
    );
  });

  // Logging out without a session remains repeat-safe and still expires the cookie.
  it('clears the cookie when logout has no session token', async () => {
    const { controller, service } = createController();
    const response = { clearCookie: vi.fn() };

    await controller.logout({ headers: {} } as never, response as never);

    expect(service.logout).toHaveBeenCalledWith(undefined);
    expect(response.clearCookie).toHaveBeenCalledWith(
      'local_session',
      expect.objectContaining({ path: '/' }),
    );
  });
});
