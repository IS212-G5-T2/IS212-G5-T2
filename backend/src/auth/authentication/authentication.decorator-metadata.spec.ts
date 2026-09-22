import { afterEach, describe, expect, it, vi } from 'vitest';

describe('authentication decorator metadata', () => {
  afterEach(() => {
    vi.doUnmock('./auth.repository.js');
    vi.doUnmock('./auth.service.js');
    vi.doUnmock('../../database/database.service.js');
    vi.resetModules();
  });

  // Nest falls back to Object metadata if the controller dependency is unavailable at evaluation time.
  it('defines the controller with a missing service constructor', async () => {
    vi.doMock('./auth.service.js', () => ({ AuthService: undefined }));

    const { AuthController } = await import('./auth.controller.js');

    expect(AuthController).toBeTypeOf('function');
    expect(Reflect.getMetadata('design:paramtypes', AuthController)).toEqual([
      Object,
    ]);
  });

  // Nest falls back to Object metadata if the repository database dependency is unavailable.
  it('defines the repository with a missing database constructor', async () => {
    vi.doMock('../../database/database.service.js', () => ({
      DatabaseService: undefined,
    }));

    const { AuthRepository } = await import('./auth.repository.js');

    expect(AuthRepository).toBeTypeOf('function');
    expect(Reflect.getMetadata('design:paramtypes', AuthRepository)).toEqual([
      Object,
    ]);
  });

  // Nest falls back to Object metadata if the service repository dependency is unavailable.
  it('defines the service with a missing repository constructor', async () => {
    vi.doMock('./auth.repository.js', () => ({ AuthRepository: undefined }));

    const { AuthService } = await import('./auth.service.js');

    expect(AuthService).toBeTypeOf('function');
    expect(Reflect.getMetadata('design:paramtypes', AuthService)).toEqual([
      Object,
    ]);
  });

  // Nest falls back to Object metadata if the middleware service dependency is unavailable.
  it('defines the middleware with a missing service constructor', async () => {
    vi.doMock('./auth.service.js', () => ({ AuthService: undefined }));

    const { AuthenticationMiddleware } =
      await import('./authentication.middleware.js');

    expect(AuthenticationMiddleware).toBeTypeOf('function');
    expect(
      Reflect.getMetadata('design:paramtypes', AuthenticationMiddleware),
    ).toEqual([Object]);
  });
});
