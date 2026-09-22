import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const repository = {
    findAccountByCredentials: vi.fn(),
    createSession: vi.fn(),
    findSessionUser: vi.fn(),
    revokeSession: vi.fn(),
  } as unknown as AuthRepository;
  let service: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(repository.findAccountByCredentials).mockReset();
    vi.mocked(repository.createSession).mockReset();
    vi.mocked(repository.findSessionUser).mockReset();
    vi.mocked(repository.revokeSession).mockReset();
    service = new AuthService(repository);
  });

  // Creates an opaque session from an already verified account.
  it('logs a seeded local account in with a server-side session', async () => {
    vi.mocked(repository.findAccountByCredentials).mockResolvedValue({
      uid: 'user-1', email: 'attendee@local.connectsphere.test', name: 'Local Attendee',
      roles: ['ATTENDEE'],
    });

    const result = await service.login('attendee@local.connectsphere.test', 'P@55w0rd');

    expect(result.token).toHaveLength(43);
    expect(result.user).toEqual({
      uid: 'user-1', email: 'attendee@local.connectsphere.test', name: 'Local Attendee', roles: ['ATTENDEE'],
    });
    expect(repository.createSession).toHaveBeenCalledWith(
      'user-1', expect.stringMatching(/^[0-9a-f]{64}$/), expect.any(Date),
    );
  });

  // Gives the same generic response for an unknown email or incorrect password.
  it('rejects invalid credentials without creating a session', async () => {
    vi.mocked(repository.findAccountByCredentials).mockResolvedValue(undefined);

    await expect(service.login('unknown@example.test', 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  // Reads the identity from an active persisted session rather than a browser token claim.
  it('returns the user associated with an active session', async () => {
    vi.mocked(repository.findSessionUser).mockResolvedValue({
      sessionId: 'session-1', uid: 'user-1', email: 'attendee@local.connectsphere.test',
      name: 'Local Attendee', roles: ['ATTENDEE'],
    });

    await expect(service.getSessionUser('opaque-token')).resolves.toEqual({
      uid: 'user-1', email: 'attendee@local.connectsphere.test', name: 'Local Attendee', roles: ['ATTENDEE'],
    });
  });

  // Treats expired, revoked, and missing session rows as unauthenticated.
  it('rejects a missing or expired session', async () => {
    vi.mocked(repository.findSessionUser).mockResolvedValue(undefined);

    await expect(service.getSessionUser('expired-token')).rejects.toThrow(UnauthorizedException);
  });

  // Logout hashes the opaque cookie before revoking its database record.
  it('revokes the persisted session when logging out', async () => {
    await service.logout('opaque-token');

    expect(repository.revokeSession).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
  });
});
