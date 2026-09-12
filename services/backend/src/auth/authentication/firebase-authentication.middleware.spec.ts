/*
 * Unit tests for the Firebase authentication middleware's request-level token
 * verification, user attachment, and public-route bypass behavior.
 */
import { UnauthorizedException } from '@nestjs/common';
import { FirebaseAuthenticationMiddleware } from './firebase-authentication.middleware.js';
import { FirebaseTokenService } from './firebase-token.service.js';

describe('FirebaseAuthenticationMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('intended behavior', () => {
    it('verifies a Firebase bearer token and attaches the authenticated user', async () => {
      const firebaseTokenService = {
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'firebase-user-1',
          email: 'attendee@example.com',
          roles: ['ATTENDEE'],
        }),
      } as unknown as FirebaseTokenService;

      const middleware = new FirebaseAuthenticationMiddleware(
        firebaseTokenService,
      );

      const request = {
        method: 'GET',
        path: '/protected-route-path',
        header: vi.fn().mockReturnValue('Bearer valid-token'),
      };

      const next = vi.fn();

      middleware.use(request as never, {} as never, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(firebaseTokenService.verifyIdToken).toHaveBeenCalledWith(
        'valid-token',
      );
      expect(request).toHaveProperty('currentUser', {
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
        email: 'attendee@example.com',
      });
    });

    it('allows public routes without a bearer token', () => {
      const firebaseTokenService = {
        verifyIdToken: vi.fn(),
      } as unknown as FirebaseTokenService;
      const middleware = new FirebaseAuthenticationMiddleware(
        firebaseTokenService,
      );
      const request = {
        method: 'GET',
        path: '/healthz',
        header: vi.fn(),
      };
      const next = vi.fn();

      middleware.use(request as never, {} as never, next);

      expect(next).toHaveBeenCalledWith();
      expect(firebaseTokenService.verifyIdToken).not.toHaveBeenCalled();
    });
  });

  // ================= unintended behavior ====================
  describe('unintended behavior', () => {
    it('returns 401 middleware errors when the bearer token is missing', async () => {
      const middleware = new FirebaseAuthenticationMiddleware({
        verifyIdToken: vi.fn(),
      } as unknown as FirebaseTokenService);
      const request = {
        method: 'GET',
        path: '/protected-route-path',
        header: vi.fn().mockReturnValue(undefined),
      };
      const next = vi.fn();

      middleware.use(request as never, {} as never, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
    });

    it('returns 401 middleware errors when the bearer header is malformed', async () => {
      const middleware = new FirebaseAuthenticationMiddleware({
        verifyIdToken: vi.fn(),
      } as unknown as FirebaseTokenService);
      const request = {
        method: 'GET',
        path: '/protected-route-path',
        header: vi.fn().mockReturnValue('Bearer valid-token extra'),
      };
      const next = vi.fn();

      middleware.use(request as never, {} as never, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
    });

    it('forwards Firebase verification errors to the middleware chain', async () => {
      const verificationError = new UnauthorizedException(
        'Invalid authentication token',
      );
      const middleware = new FirebaseAuthenticationMiddleware({
        verifyIdToken: vi.fn().mockRejectedValue(verificationError),
      } as unknown as FirebaseTokenService);
      const request = {
        method: 'GET',
        path: '/protected-route-path',
        header: vi.fn().mockReturnValue('Bearer invalid-token'),
      };
      const next = vi.fn();

      middleware.use(request as never, {} as never, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

      expect(next).toHaveBeenCalledWith(verificationError);
    });
  });
});
