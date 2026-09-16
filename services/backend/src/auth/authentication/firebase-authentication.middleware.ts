/*
 * Authenticates protected HTTP requests by verifying Firebase Bearer tokens and
 * attaching the verified user to the request for downstream handlers.
 */
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  CURRENT_USER_REQUEST_KEY,
  PUBLIC_ROUTES,
} from '../models/auth.models.js';
import { FirebaseTokenService } from './firebase-token.service.js';

@Injectable()
export class FirebaseAuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly firebaseTokenService: FirebaseTokenService) {}

  /**
   * Runs before protected route handlers to authenticate the request.
   *
   * @param request - Incoming Express request.
   * @param _response - Express response, unused because this middleware only authenticates.
   * @param next - Express callback used to continue or forward auth errors.
   */
  use(request: Request, _response: Response, next: NextFunction): void {
    if (this.isPublicRoute(request)) {
      next();
      return;
    }

    this.authenticate(request).then(() => next(), next);
  }

  /**
   * Verifies the Bearer token and stores the verified user on the request.
   *
   * @param request - Request that must contain a Firebase Bearer token.
   * @throws UnauthorizedException when the token is missing or invalid.
   */
  private async authenticate(request: Request): Promise<void> {
    const token = this.extractBearerToken(request);
    const user = await this.firebaseTokenService.verifyIdToken(token);

    Object.assign(request, {
      [CURRENT_USER_REQUEST_KEY]: user,
    });
  }

  /**
   * Extracts the Firebase ID token from the Authorization header.
   *
   * @param request - Request containing an Authorization header.
   * @returns Bearer token value without the `Bearer` prefix.
   * @throws UnauthorizedException when the header is missing or malformed.
   */
  private extractBearerToken(request: Request): string {
    const authorizationHeader = request.header('authorization')?.trim();

    if (!authorizationHeader) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const match = authorizationHeader.match(/^Bearer\s+(\S+)$/i);
    
    if (!match?.[1]) {
      throw new UnauthorizedException('Malformed bearer token');
    }

    return match[1];
  }

  /**
   * Checks whether this request should bypass Firebase authentication.
   *
   * @param request - Incoming request to compare with configured public routes.
   * @returns True when the request matches a public route.
   */
  private isPublicRoute(request: Request): boolean {
    return PUBLIC_ROUTES.some(
      (route) => route.method === request.method && route.path === request.path,
    );
  }
}
