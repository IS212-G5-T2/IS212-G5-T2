import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { getAuthConfig } from '../../config/auth.config.js';
import type { AuthenticatedUser } from '../models/auth.models.js';
import type { AuthConfig } from '../models/auth.models.js';
import { AuthRepository } from './auth.repository.js';

@Injectable()
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  getConfig(): AuthConfig {
    return getAuthConfig();
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const account = await this.repository.findAccountByCredentials(
      email,
      password,
    );

    if (!account) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = randomBytes(32).toString('base64url');
    const config = this.getConfig();
    const expiresAt = new Date(
      Date.now() + config.sessionTtlHours * 60 * 60 * 1_000,
    );
    await this.repository.createSession(
      account.uid,
      this.hashToken(token),
      expiresAt,
    );

    return {
      token,
      user: {
        uid: account.uid,
        email: account.email,
        name: account.name,
        roles: account.roles,
      },
    };
  }

  async getSessionUser(token: string): Promise<AuthenticatedUser> {
    const user = await this.repository.findSessionUser(this.hashToken(token));
    if (!user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return {
      uid: user.uid,
      email: user.email,
      name: user.name,
      roles: user.roles,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.repository.revokeSession(this.hashToken(token));
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
