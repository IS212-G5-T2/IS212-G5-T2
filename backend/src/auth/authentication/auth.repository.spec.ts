import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { AuthRepository } from './auth.repository.js';

describe('AuthRepository', () => {
  // Uses PostgreSQL normalization and crypt verification, then maps the account row.
  it('finds an active account with its assigned roles for valid credentials', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'user-1',
          email: 'attendee@local.connectsphere.test',
          display_name: 'Local Attendee',
          roles: ['ATTENDEE'],
        },
      ],
    });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await expect(
      repository.findAccountByCredentials(
        ' Attendee@LOCAL.connectsphere.test ',
        'P@55w0rd',
      ),
    ).resolves.toEqual({
      uid: 'user-1',
      email: 'attendee@local.connectsphere.test',
      name: 'Local Attendee',
      roles: ['ATTENDEE'],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('u.email = lower(btrim($1))'),
      [' Attendee@LOCAL.connectsphere.test ', 'P@55w0rd'],
    );
    expect(query.mock.calls[0]?.[0]).toContain('u.is_active = true');
    expect(query.mock.calls[0]?.[0]).toContain(
      'u.password_hash = crypt($2, u.password_hash)',
    );
  });

  // Does not distinguish an unknown, inactive, or password-mismatched account.
  it('returns no account when credential lookup has no matching row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await expect(
      repository.findAccountByCredentials(
        'unknown@example.test',
        'wrong-password',
      ),
    ).resolves.toBeUndefined();
  });

  // Persists only the supplied hash, never the opaque cookie token itself.
  it('creates a session with its user, token digest, and expiry', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);
    const expiresAt = new Date('2026-09-21T16:00:00.000Z');

    await repository.createSession('user-1', 'token-sha256-digest', expiresAt);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO auth_sessions (user_id, token_hash, expires_at)',
      ),
      ['user-1', 'token-sha256-digest', expiresAt],
    );
  });

  // Returns identity only when its session is live, unrevoked, and owned by an active account.
  it('maps a live session row to the authenticated user shape', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          session_id: 'session-1',
          id: 'user-1',
          email: 'organiser@local.connectsphere.test',
          display_name: 'Local Organiser',
          roles: ['ORGANISER'],
        },
      ],
    });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await expect(
      repository.findSessionUser('token-sha256-digest'),
    ).resolves.toEqual({
      sessionId: 'session-1',
      uid: 'user-1',
      email: 'organiser@local.connectsphere.test',
      name: 'Local Organiser',
      roles: ['ORGANISER'],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('s.token_hash = $1'),
      ['token-sha256-digest'],
    );
    expect(query.mock.calls[0]?.[0]).toContain('s.revoked_at IS NULL');
    expect(query.mock.calls[0]?.[0]).toContain('s.expires_at > now()');
    expect(query.mock.calls[0]?.[0]).toContain('u.is_active = true');
  });

  // Treats missing, expired, revoked, and disabled-account sessions identically.
  it('returns no user when session lookup has no matching row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await expect(
      repository.findSessionUser('expired-token-digest'),
    ).resolves.toBeUndefined();
  });

  // Keeps logout repeat-safe by retaining an existing revocation timestamp.
  it('revokes a session without replacing an existing revocation timestamp', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await repository.revokeSession('token-sha256-digest');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at = COALESCE(revoked_at, now())'),
      ['token-sha256-digest'],
    );
  });

  // Propagates storage failures so callers do not misclassify an outage as invalid credentials.
  it.each([
    [
      'credential lookup',
      (repository: AuthRepository) =>
        repository.findAccountByCredentials(
          'attendee@local.connectsphere.test',
          'P@55w0rd',
        ),
    ],
    [
      'session creation',
      (repository: AuthRepository) =>
        repository.createSession(
          'user-1',
          'token-sha256-digest',
          new Date('2026-09-21T16:00:00.000Z'),
        ),
    ],
    [
      'session lookup',
      (repository: AuthRepository) =>
        repository.findSessionUser('token-sha256-digest'),
    ],
    [
      'session revocation',
      (repository: AuthRepository) =>
        repository.revokeSession('token-sha256-digest'),
    ],
  ])('propagates a database error during %s', async (_, operation) => {
    const databaseError = new Error('PostgreSQL unavailable');
    const query = vi.fn().mockRejectedValue(databaseError);
    const repository = new AuthRepository({
      query,
    } as unknown as DatabaseService);

    await expect(operation(repository)).rejects.toBe(databaseError);
  });
});
