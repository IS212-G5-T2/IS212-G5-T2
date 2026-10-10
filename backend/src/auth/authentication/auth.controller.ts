import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../types/auth.models.js';
import type { AuthenticatedUser } from '../types/auth.models.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { AuthService } from './auth.service.js';
import { readSessionCookie } from './session-cookie.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const credentials = this.parseCredentials(body);
    const { token, user } = await this.auth.login(
      credentials.email,
      credentials.password,
    );
    this.setSessionCookie(response, token);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const config = this.auth.getConfig();
    await this.auth.logout(
      readSessionCookie(request.headers.cookie, config.cookieName),
    );
    response.clearCookie(config.cookieName, this.cookieOptions());
  }

  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    return request[CURRENT_USER_REQUEST_KEY] as AuthenticatedUser;
  }

  private parseCredentials(body: unknown): { email: string; password: string } {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Email and password are required');
    }

    const { email, password } = body as Record<string, unknown>;
    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      throw new BadRequestException('Email and password are required');
    }

    return { email: email.trim(), password };
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(
      this.auth.getConfig().cookieName,
      token,
      this.cookieOptions(),
    );
  }

  private cookieOptions() {
    const config = this.auth.getConfig();
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: config.cookieSecure,
      maxAge: config.sessionTtlHours * 60 * 60 * 1_000,
      path: '/',
    };
  }

}
