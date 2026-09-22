import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { AuthenticationMiddleware } from './authentication.middleware.js';

describe('AuthenticationMiddleware', () => {
  // Attaches the database-backed account identity after reading the HTTP-only cookie.
  it('authenticates a valid local session cookie', async () => {
    const service = {
      getConfig: vi.fn().mockReturnValue({ cookieName: 'local_session' }),
      getSessionUser: vi
        .fn()
        .mockResolvedValue({ uid: 'user-1', roles: ['ATTENDEE'] }),
    } as unknown as AuthService;
    const middleware = new AuthenticationMiddleware(service);
    const request = {
      headers: { cookie: 'other=value; local_session=opaque-token' },
    };
    const next = vi.fn();

    middleware.use(request as never, {} as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());

    expect(service.getSessionUser).toHaveBeenCalledWith('opaque-token');
    expect(request).toMatchObject({
      currentUser: { uid: 'user-1', roles: ['ATTENDEE'] },
    });
  });

  // Refuses access to the local identity endpoint when no session cookie exists.
  it('rejects a request with no local session cookie', () => {
    const service = {
      getConfig: vi.fn().mockReturnValue({ cookieName: 'local_session' }),
    } as unknown as AuthService;
    const next = vi.fn();

    new AuthenticationMiddleware(service).use(
      { headers: {} } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
  });

  // A cookie header for another cookie must not be mistaken for the session.
  it('rejects a cookie header that does not contain the configured session cookie', () => {
    const service = {
      getConfig: vi.fn().mockReturnValue({ cookieName: 'local_session' }),
    } as unknown as AuthService;
    const next = vi.fn();

    new AuthenticationMiddleware(service).use(
      { headers: { cookie: 'local_session_old=opaque-token' } } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
  });

  // An empty cookie value is equivalent to no authenticated session.
  it('rejects an empty session cookie', () => {
    const service = {
      getConfig: vi.fn().mockReturnValue({ cookieName: 'local_session' }),
    } as unknown as AuthService;
    const next = vi.fn();

    new AuthenticationMiddleware(service).use(
      { headers: { cookie: 'other=value; local_session=' } } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
  });

  // Expired, revoked, and unknown sessions are forwarded to Nest's error chain.
  it('forwards a rejected session lookup to the next middleware', async () => {
    const sessionError = new UnauthorizedException(
      'Invalid or expired session',
    );
    const service = {
      getConfig: vi.fn().mockReturnValue({ cookieName: 'local_session' }),
      getSessionUser: vi.fn().mockRejectedValue(sessionError),
    } as unknown as AuthService;
    const next = vi.fn();

    new AuthenticationMiddleware(service).use(
      { headers: { cookie: 'local_session=expired-token' } } as never,
      {} as never,
      next,
    );
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(sessionError));
  });
});
