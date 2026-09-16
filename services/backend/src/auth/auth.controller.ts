/*
 * Exposes the authenticated identity required by clients to confirm the
 * Firebase session the backend has accepted. The route is protected by the
 * FirebaseAuthenticationMiddleware in AppModule.
 */
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from './models/auth.models.js';
import type { AuthenticatedUser } from './models/auth.models.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('auth')
export class AuthController {
  /**
   * Returns the identity and roles decoded from a verified Firebase ID token.
   *
   * The authentication middleware rejects requests without a valid token before
   * this handler runs. No Firebase credentials, ID token, or other sensitive
   * claims are returned.
   *
   * @param request - Request augmented by FirebaseAuthenticationMiddleware.
   * @returns The authenticated user's Firebase UID, email when available, and roles.
   */
  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    return request[CURRENT_USER_REQUEST_KEY] as AuthenticatedUser;
  }
}
