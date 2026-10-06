import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';
import { VenuesModule } from './venues.module.js';

describe('SPM-50 venue route wiring', () => {
  const identity: AuthenticatedUser = {
    uid: 'staff-1',
    roles: ['VENUE_STAFF'],
  };
  const request = { [CURRENT_USER_REQUEST_KEY]: identity } as Request;
  const service = { create: vi.fn(), list: vi.fn(), get: vi.fn() };
  const controller = new VenuesController(service as unknown as VenuesService);

  // SPM-50 / VEN-CRE-04-A: creation forwards the body and verified caller.
  it('forwards venue creation and keeps module wiring importable', () => {
    // Arrange a body and service response.
    const body = { name: 'Orchid Hall Test' };
    service.create.mockReturnValue('created');
    // Act and assert the creation call and module declaration.
    expect(controller.create(request, body)).toBe('created');
    expect(service.create).toHaveBeenCalledWith(identity, body);
    expect(VenuesModule).toBeDefined();
  });

  // SPM-124: both read routes forward only the verified identity and requested ID.
  it('forwards catalogue and detail reads to the service', () => {
    // Arrange: service results make each delegated read distinguishable.
    service.list.mockReturnValue(['catalogue']);
    service.get.mockReturnValue('detail');
    const id = '00000000-0000-4000-8000-000000000124';

    // Act: invoke the controller methods used by the protected HTTP routes.
    expect(controller.list(request)).toEqual(['catalogue']);
    expect(controller.get(request, id)).toBe('detail');

    // Assert: no caller-controlled identity is substituted.
    expect(service.list).toHaveBeenCalledWith(identity);
    expect(service.get).toHaveBeenCalledWith(identity, id);
  });
});
