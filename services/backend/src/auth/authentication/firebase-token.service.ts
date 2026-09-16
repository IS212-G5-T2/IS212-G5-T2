/*
 * Wraps Firebase Admin token verification and converts verified custom claims
 * into the backend's authenticated user model.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthenticatedUser, UserRole } from '../models/auth.models.js';

@Injectable()
export class FirebaseTokenService {
  /**
   * Verifies a Firebase ID token and returns the authenticated backend user.
   *
   * @param idToken - Firebase ID token from the request Bearer token.
   * @returns Authenticated user identity and normalized RBAC roles.
   * @throws UnauthorizedException when Firebase verification or claim validation fails.
   */
  async verifyIdToken(idToken: string): Promise<AuthenticatedUser> {
    try {
      const decodedToken = await getAuth(this.getFirebaseApp()).verifyIdToken(idToken);
      return this.toAuthenticatedUser(decodedToken);
    } catch {
      // Do not expose whether signature, expiry, Firebase setup, or claims failed.
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  /**
   * Gets or initializes the Firebase Admin app used to verify ID tokens.
   *
   * @returns Existing or newly initialized Firebase Admin app instance.
   */
  private getFirebaseApp() {
    /*
     * Firebase Admin apps are process-wide singletons; reuse the first one so
     * hot reloads/tests do not try to initialize the default app more than once.
     */
    const existingApp = getApps()[0];

    if (existingApp) {
      return existingApp;
    }

    /*
     * The Auth Emulator verifies locally issued tokens and does not require a
     * service account. A matching project ID keeps its tokens and the browser
     * SDK on the same emulator project.
     */
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      return initializeApp({
        projectId: process.env.GCLOUD_PROJECT ?? 'demo-is212',
      });
    }

    /*
     * Prefer a local JSON file path so developers do not need to paste a large
     * service account blob into `.env`.
     */
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath) {
      return initializeApp({
        credential: cert(
          JSON.parse(readFileSync(resolve(serviceAccountPath), 'utf8')) as object,
        ),
      });
    }

    /*
     * Keep raw JSON as a fallback for CI or hosted environments where mounting
     * a file is awkward.
     */
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccount) {
      return initializeApp({
        credential: cert(JSON.parse(serviceAccount) as object),
      });
    }

    return initializeApp({
      credential: applicationDefault(),
    });
  }

  /**
   * Converts verified Firebase claims into the backend user shape.
   *
   * @param claims - Verified Firebase token claims.
   * @returns Authenticated user identity used by downstream middleware/controllers.
   * @throws UnauthorizedException when required uid or roles claims are missing or invalid.
   */
  private toAuthenticatedUser(claims: FirebaseClaims): AuthenticatedUser {
    if (!claims.uid || typeof claims.uid !== 'string') {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const roles = this.toRoles(claims.roles);

    if (roles.length === 0) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return {
      uid: claims.uid,
      roles,
      email: claims.email,
    };
  }

  /**
   * Normalizes Firebase custom role claims into supported RBAC roles.
   *
   * @param roles - Raw roles claim from Firebase custom claims.
   * @returns Matching RBAC roles after normalization and de-duplication.
   */
  private toRoles(roles: unknown): UserRole[] {
    if (!Array.isArray(roles)) {
      return [];
    }

    /*
     * Firebase custom claims are user-controlled by project configuration, so
     * normalize before comparing with the RBAC seed role names.
     */
    const supportedRoles: UserRole[] = [
      'ORGANISER',
      'COORDINATOR',
      'VENUE_STAFF',
      'TECH_SUPPORT',
      'ATTENDEE',
    ];

    return [
      ...new Set(
        roles
          .filter((role): role is string => typeof role === 'string')
          .map((role) => role.trim().toUpperCase())
          .filter((role): role is UserRole =>
            supportedRoles.includes(role as UserRole),
          ),
      ),
    ];
  }
}

interface FirebaseClaims {
  uid: string;
  email?: string;
  roles?: unknown;
}
