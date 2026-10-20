import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_USER_REQUEST_KEY,
  type AuthenticatedUser,
} from '../auth/types/auth.models.js';
import type { DatabaseService } from '../database/database.service.js';
import type { EventsService } from '../events/events.service.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsService } from './drafts.service.js';

// A test header stands in for the authentication middleware: it attaches the
// identity that the middleware would have verified from the bearer token.
const principals: Record<string, AuthenticatedUser> = {
  organiser: { uid: 'current-user', roles: ['ORGANISER'] },
  attendee: { uid: 'attendee-test', roles: ['ATTENDEE'] },
};
const id = '00000000-0000-4000-8000-000000000037';
const body = {
  fields: {},
  version: 0,
  operationId: '00000000-0000-4000-8000-000000000099',
};

type Send = (
  server: ReturnType<INestApplication['getHttpServer']>,
  principal?: string,
) => request.Test;

const routes: Array<{ name: string; send: Send }> = [
  {
    name: 'GET /api/requests',
    send: (server, principal) => withPrincipal(request(server).get('/api/requests'), principal),
  },
  {
    name: 'GET /api/requests/:id',
    send: (server, principal) =>
      withPrincipal(request(server).get(`/api/requests/${id}`), principal),
  },
  {
    name: 'PUT /api/requests/:id',
    send: (server, principal) =>
      withPrincipal(request(server).put(`/api/requests/${id}`), principal).send(body),
  },
  {
    name: 'POST /api/requests/:id/submit',
    send: (server, principal) =>
      withPrincipal(request(server).post(`/api/requests/${id}/submit`), principal).send(body),
  },
];

function withPrincipal(test: request.Test, principal?: string) {
  return principal ? test.set('x-test-principal', principal) : test;
}

// Supporting checks: the controller and service over HTTP, with a stand-in for authentication.
// They do not prove the real session middleware. Real-session checks are in
// backend/test/drafts.e2e-spec.ts, which is not run in this suite.
describe('SPM-37 draft routes over HTTP, controller to service (supporting)', () => {
  let app: INestApplication;
  const database = { query: vi.fn(), transaction: vi.fn() };
  const events = { create: vi.fn(), get: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DraftsController],
      providers: [
        {
          provide: DraftsService,
          useValue: new DraftsService(
            events as unknown as EventsService,
            database as unknown as DatabaseService,
          ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req, _res, next) => {
      const principal = req.headers['x-test-principal'];
      if (typeof principal === 'string' && principals[principal]) {
        (req as unknown as Record<string, unknown>)[CURRENT_USER_REQUEST_KEY] =
          principals[principal];
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // No identity is rejected with 401 before any storage access.
  it.each(routes)('$name returns 401 without an identity and never reaches storage', async ({ send }) => {
    const response = await send(app.getHttpServer());
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Authentication required.');
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  // A signed-in attendee is rejected with 403 before any storage access.
  it.each(routes)('$name returns 403 for an attendee and never reaches storage', async ({ send }) => {
    const response = await send(app.getHttpServer(), 'attendee');
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Organiser access required.');
    expect(database.query).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
