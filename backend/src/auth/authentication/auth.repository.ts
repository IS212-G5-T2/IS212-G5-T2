import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type {
  AuthAccount,
  AuthAccountRow,
  SessionRow,
  SessionUser,
} from '../models/auth.models.js';

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAccountByCredentials(
    email: string,
    password: string,
  ): Promise<AuthAccount | undefined> {
    const result = await this.database.query<AuthAccountRow>(
      `
        SELECT u.id, u.email, u.display_name,
               array_agg(r.name ORDER BY r.id)::text[] AS roles
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.email = lower(btrim($1))
          AND u.is_active = true
          AND u.password_hash = crypt($2, u.password_hash)
        GROUP BY u.id
      `,
      [email, password],
    );

    const account = result.rows[0];
    return account && this.toAccount(account);
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  }

  async findSessionUser(tokenHash: string): Promise<SessionUser | undefined> {
    const result = await this.database.query<SessionRow>(
      `
        SELECT s.id AS session_id, u.id, u.email, u.display_name,
               array_agg(r.name ORDER BY r.id)::text[] AS roles
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.is_active = true
        GROUP BY s.id, u.id
      `,
      [tokenHash],
    );

    const session = result.rows[0];
    return session && {
      sessionId: session.session_id,
      uid: session.id,
      email: session.email,
      name: session.display_name,
      roles: session.roles,
    };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.database.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE token_hash = $1`,
      [tokenHash],
    );
  }

  private toAccount(account: AuthAccountRow): AuthAccount {
    return {
      uid: account.id,
      email: account.email,
      name: account.display_name,
      roles: account.roles,
    };
  }
}
