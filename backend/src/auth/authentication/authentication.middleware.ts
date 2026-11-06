import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runAsActor } from '../../common/actor-context.js';
import { CURRENT_USER_REQUEST_KEY } from '../types/auth.models.js';
import { AuthService } from './auth.service.js';
import { readSessionCookie } from './session-cookie.js';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const token = readSessionCookie(
      request.headers.cookie,
      this.auth.getConfig().cookieName,
    );
    if (!token) {
      next(new UnauthorizedException('Missing session'));
      return;
    }

    this.auth.getSessionUser(token).then((user) => {
      Object.assign(request, { [CURRENT_USER_REQUEST_KEY]: user });
      // SPM-157: the rest of the request runs as this user, so its database writes are attributed to them.
      runAsActor(user.uid, () => next());
    }, next);
  }

}
