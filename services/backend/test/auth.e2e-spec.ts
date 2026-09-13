/*
 * End-to-end tests proving route-bound Firebase authentication middleware
 * attaches verified users and rejects invalid or missing authentication.
 */
import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Req,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import {
  AuthenticatedUser,
  CURRENT_USER_REQUEST_KEY,
} from '../src/auth/models/auth.models.js';
import { FirebaseAuthenticationMiddleware } from '../src/auth/authentication/firebase-authentication.middleware.js';

@Controller('__test__/auth')
class TestAuthController {
  @Get('profile')
  getProfile(
    @Req() request: Request & { currentUser?: AuthenticatedUser },
  ): AuthenticatedUser | undefined {
    return request[CURRENT_USER_REQUEST_KEY];
  }
}

@Module({
  imports: [AuthModule],
  controllers: [TestAuthController],
})
class TestAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FirebaseAuthenticationMiddleware).forRoutes(TestAuthController);
  }
}

describe('FirebaseAuthenticationMiddleware (e2e)', () => {
  let app: INestApplication<App>;
  let testUser: EmulatorUser | undefined;

  beforeEach(async () => {
    testUser = await createEmulatorUser('ATTENDEE');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('attaches the verified Firebase user to protected requests', () => {
    return request(app.getHttpServer())
      .get('/__test__/auth/profile')
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
      .get('/__test__/auth/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('returns 401 when authentication is missing on protected routes', () => {
    return request(app.getHttpServer()).get('/__test__/auth/profile').expect(401);
  });

  afterEach(async () => {
    if (testUser) {
      await getAuth(getFirebaseEmulatorApp()).deleteUser(testUser.uid);
    }
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
  const emulatorUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
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

  const signInResponse = await fetch(
    `${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signIn = (await signInResponse.json()) as { idToken?: string };

  if (!signInResponse.ok || !signIn.idToken) {
    throw new Error(`Could not sign in Firebase emulator user: ${JSON.stringify(signIn)}`);
  }

  return { email, idToken: signIn.idToken, uid: signUp.localId };
}

function getFirebaseEmulatorApp() {
  return (
    getApps()[0] ??
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? 'demo-is212',
    })
  );
}
