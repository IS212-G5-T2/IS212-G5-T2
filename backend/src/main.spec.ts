import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SPM-36 bootstrap wiring (main.ts). The Nest application is replaced by a recording stub so the
// test checks what the entry point asks for, not a live HTTP server.
const { app, create } = vi.hoisted(() => {
  const app = {
    enableCors: vi.fn(),
    useBodyParser: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn(async () => undefined),
  };
  return { app, create: vi.fn(async () => app) };
});

vi.mock('@nestjs/core', () => ({ NestFactory: { create } }));
vi.mock('./config/load-environment.js', () => ({ loadEnvironment: vi.fn() }));
vi.mock('./app.module.js', () => ({ AppModule: class AppModule {} }));

describe('application bootstrap (main.ts)', () => {
  const savedPort = process.env.PORT;

  beforeEach(() => {
    vi.clearAllMocks();
    // main.ts runs bootstrap() when it is imported, so each test needs a fresh module instance.
    vi.resetModules();
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.PORT;
    else process.env.PORT = savedPort;
  });

  // Parent AC (SUPPORTING): SPM-36 AC8
  /** The app is created without Nest's default body parser, configured, and listens on the default port. */
  it('EVE-CRE-SUP-11 creates the app without the default body parser, configures it, and listens on port 3000', async () => {
    delete process.env.PORT;

    await import('./main.js');

    const { AppModule } = await import('./app.module.js');
    expect(create).toHaveBeenCalledWith(AppModule, { bodyParser: false });
    // configureApp registers CORS and the body parsers on the app it was given.
    expect(app.enableCors).toHaveBeenCalledTimes(1);
    expect(app.useBodyParser).toHaveBeenCalledWith('json', expect.objectContaining({ limit: '80mb' }));
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3000);
  });

  /** When the PORT environment value is set, the app listens on that port instead of the default. */
  it('listens on the port named by the PORT environment value when one is set', async () => {
    process.env.PORT = '4321';

    await import('./main.js');

    expect(app.listen).toHaveBeenCalledWith('4321');
  });
});
