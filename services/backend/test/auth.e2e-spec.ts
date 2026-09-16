/*
 * End-to-end tests proving the production authenticated-user endpoint accepts
 * Firebase Auth Emulator credentials and rejects invalid authentication.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('FirebaseAuthenticationMiddleware (e2e)', () => {
  let app: INestApplication<App>;
  let testUser: EmulatorUser;

  beforeEach(async () => {
    testUser = await createEmulatorUser('ATTENDEE');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('returns the verified Firebase user from the production auth endpoint', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${testUser.idToken}`)
      .expect(200)
      .expect({
        uid: testUser.uid,
        roles: ['ATTENDEE'],
        email: testUser.email,
      });
  });

  it('returns 401 when authentication is invalid', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('returns 401 when authentication is missing on protected routes', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects an incorrect Firebase email/password before a token is issued', async () => {
    const response = await signInWithPassword(testUser.email, 'wrong-password');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  afterEach(async () => {
    await getAuth(getFirebaseEmulatorApp()).deleteUser(testUser.uid);
    await app?.close();
  });
});

interface EmulatorUser {
  email: string;
  idToken: string;
  uid: string;
}

async function createEmulatorUser(role: string): Promise<EmulatorUser> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'password123';
  const emulatorUrl = getFirebaseEmulatorUrl();
  const apiKey = 'fake-api-key';

  const signUpResponse = await fetch(
    `${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signUp = (await signUpResponse.json()) as { localId?: string };

  if (!signUpResponse.ok || !signUp.localId) {
    throw new Error(`Could not create Firebase emulator user: ${JSON.stringify(signUp)}`);
  }

  await getAuth(getFirebaseEmulatorApp()).setCustomUserClaims(signUp.localId, {
    roles: [role],
  });

  const signInResponse = await signInWithPassword(email, password);
  const signIn = (await signInResponse.json()) as { idToken?: string };

  if (!signInResponse.ok || !signIn.idToken) {
    throw new Error(`Could not sign in Firebase emulator user: ${JSON.stringify(signIn)}`);
  }

  return { email, idToken: signIn.idToken, uid: signUp.localId };
}

/**
 * Signs a user in through the Firebase Auth Emulator REST interface.
 *
 * @param email - Firebase emulator user's email address.
 * @param password - Firebase emulator user's password.
 * @returns Firebase REST API response, containing an ID token on success.
 */
function signInWithPassword(email: string, password: string): Promise<Response> {
  return fetch(
    `${getFirebaseEmulatorUrl()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
}

/**
 * Returns the configured Firebase Auth Emulator HTTP origin.
 *
 * @returns Firebase Auth Emulator origin.
 */
function getFirebaseEmulatorUrl(): string {
  return `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
}

function getFirebaseEmulatorApp() {
  return (
    getApps()[0] ??
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? 'demo-is212',
    })
  );
}
