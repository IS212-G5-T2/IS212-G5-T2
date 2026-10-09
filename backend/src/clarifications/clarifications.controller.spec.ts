import { UnauthorizedException } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import { ClarificationsController } from './clarifications.controller.js';
import type { ClarificationsService } from './clarifications.service.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000042';

function build() {
  const service = {
    createClarification: vi.fn(),
    listComments: vi.fn(),
    reply: vi.fn(),
    resolve: vi.fn(),
  } as unknown as ClarificationsService;
  return { controller: new ClarificationsController(service), service };
}

describe('ClarificationsController authentication', () => {
  afterEach(() => vi.unstubAllEnvs());

  // No session means 401 on every route, even with the retired demo flag set: no stand-in user is created.
  it.each([
    ['create', (c: ClarificationsController, req: never) => c.create(EVENT_ID, req, {})],
    ['list', (c: ClarificationsController, req: never) => c.list(EVENT_ID, req)],
    ['reply', (c: ClarificationsController, req: never) => c.reply(EVENT_ID, 'c1', req, {})],
    ['resolve', (c: ClarificationsController, req: never) => c.resolve(EVENT_ID, 'c1', req)],
  ])('%s answers 401 without a session', (_name, call) => {
    vi.stubEnv('DEMO_ORGANISER_ENABLED', 'true');
    const { controller } = build();

    expect(() => call(controller, {} as never)).toThrow(UnauthorizedException);
  });

  // With a session, the verified user is passed to the service unchanged.
  it('passes the session user to the service', async () => {
    const { controller, service } = build();
    const user = { uid: 'coordinator-1', roles: ['COORDINATOR'] };
    vi.mocked(service.listComments).mockResolvedValue([]);

    await controller.list(EVENT_ID, { [CURRENT_USER_REQUEST_KEY]: user } as never);

    expect(service.listComments).toHaveBeenCalledWith(EVENT_ID, user);
  });
});
