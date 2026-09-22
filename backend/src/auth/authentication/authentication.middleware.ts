import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../models/auth.models.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const token = this.readCookie(
      request.headers.cookie,
      this.auth.getConfig().cookieName,
    );
    if (!token) {
      next(new UnauthorizedException('Missing session'));
      return;
    }

    this.auth.getSessionUser(token).then((user) => {
      Object.assign(request, { [CURRENT_USER_REQUEST_KEY]: user });
      next();
    }, next);
  }

  private readCookie(
    header: string | undefined,
    cookieName: string,
  ): string | undefined {
    if (!header) return undefined;

    return header
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
  }
}
