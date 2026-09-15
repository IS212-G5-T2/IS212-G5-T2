/*
 * Unit tests for Firebase token verification, credential source precedence,
 * role-claim normalization, and invalid-token error mapping.
 */
import { UnauthorizedException } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { FirebaseTokenService } from './firebase-token.service.js';

vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(() => 'application-default-credential'),
  cert: vi.fn((value: object) => ({ cert: value })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn((options?: object) => ({ options })),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('FirebaseTokenService', () => {
  const originalServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const originalServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const originalAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const originalGoogleCloudProject = process.env.GCLOUD_PROJECT;

  beforeEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.GCLOUD_PROJECT;
    vi.mocked(getApps).mockReturnValue([]);
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn(),
    } as never);
  });

  afterEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalServiceAccountJson;
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = originalServiceAccountPath;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = originalAuthEmulatorHost;
    process.env.GCLOUD_PROJECT = originalGoogleCloudProject;
    vi.clearAllMocks();
  });

  describe('intended behavior', () => {
    it('returns authenticated user details from verified Firebase claims', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('valid-token')).resolves.toEqual({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE'],
      });
    });

    it.each([
      'ORGANISER',
      'COORDINATOR',
      'VENUE_STAFF',
      'TECH_SUPPORT',
      'ATTENDEE',
    ])('accepts supported role %s', async (role) => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: [role],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('valid-token')).resolves.toMatchObject({
        roles: [role],
      });
    });

    it('accepts two supported roles in one token', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE', 'ORGANISER'],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('valid-token')).resolves.toMatchObject({
        roles: ['ATTENDEE', 'ORGANISER'],
      });
    });

    it('omits email when the optional Firebase email claim is missing', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('valid-token')).resolves.toEqual({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
    });

    it('passes the provided token into Firebase Admin verification', async () => {
      const verifyIdToken = mockVerifiedClaims({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('specific-token');

      expect(verifyIdToken).toHaveBeenCalledWith('specific-token');
    });

    it('reuses an existing Firebase app before initializing credentials', async () => {
      const existingApp = { name: 'existing-app' };
      const verifyIdToken = mockVerifiedClaims({
        uid: 'firebase-user-1',
        email: 'attendee@example.com',
        roles: ['ATTENDEE'],
      });
      vi.mocked(getApps).mockReturnValue([existingApp] as never);
      vi.mocked(getAuth).mockReturnValue({ verifyIdToken } as never);
      const service = new FirebaseTokenService();

      await service.verifyIdToken('valid-token');

      expect(getAuth).toHaveBeenCalledWith(existingApp);
      expect(initializeApp).not.toHaveBeenCalled();
    });

    it('prefers Firebase service account path over raw JSON', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = './firebase-service-account.json';
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: 'json-project',
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ project_id: 'path-project' }),
      );
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('valid-token');

      expect(cert).toHaveBeenCalledWith({ project_id: 'path-project' });
      expect(initializeApp).toHaveBeenCalledWith({
        credential: { cert: { project_id: 'path-project' } },
      });
    });

    it('uses raw Firebase service account JSON when no path is configured', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: 'json-project',
      });
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('valid-token');
      
      expect(process.env.FIREBASE_SERVICE_ACCOUNT_PATH).toBeUndefined();
      expect(cert).toHaveBeenCalledWith({ project_id: 'json-project' });
    });

    it('uses application default credentials when no service account is configured', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('valid-token');

      expect(applicationDefault).toHaveBeenCalled();
      expect(initializeApp).toHaveBeenCalledWith({
        credential: 'application-default-credential',
      });
    });

    it('uses the Auth Emulator project without service-account credentials', async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = 'firebase-auth:9099';
      process.env.GCLOUD_PROJECT = 'demo-is212';
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('emulator-token');

      expect(initializeApp).toHaveBeenCalledWith({ projectId: 'demo-is212' });
      expect(applicationDefault).not.toHaveBeenCalled();
    });

    it('uses the default emulator project when GCLOUD_PROJECT is not configured', async () => {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = 'firebase-auth:9099';
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await service.verifyIdToken('emulator-token');

      expect(initializeApp).toHaveBeenCalledWith({ projectId: 'demo-is212' });
      expect(applicationDefault).not.toHaveBeenCalled();
    });
  });

  // ================= unintended behavior ====================
  describe('unintended behavior', () => {
    it('returns 401 when Firebase verification fails', async () => {
      vi.mocked(getAuth).mockReturnValue({
        verifyIdToken: vi.fn().mockRejectedValue(new Error('expired')),
      } as never);
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when uid is missing', async () => {
      mockVerifiedClaims({
        roles: ['ATTENDEE'],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when roles claim is not an array', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: 'ATTENDEE',
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when role is invalid', async () => {
      mockVerifiedClaims({
        uid: 'firebase-user-1',
        roles: ['admin'],
      });
      const service = new FirebaseTokenService();

      await expect(service.verifyIdToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

function mockVerifiedClaims(claims: object): ReturnType<typeof vi.fn> {
  const verifyIdToken = vi.fn().mockResolvedValue(claims);
  vi.mocked(getAuth).mockReturnValue({ verifyIdToken } as never);

  return verifyIdToken;
}
