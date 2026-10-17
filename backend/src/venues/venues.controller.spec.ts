import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';
import { VenuesModule } from './venues.module.js';

describe('SPM-50 venue route wiring', () => {
  const identity: AuthenticatedUser = {
    uid: 'staff-1',
    roles: ['VENUE_STAFF'],
  };
  const request = { [CURRENT_USER_REQUEST_KEY]: identity } as Request;
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    submitBookingRequest: vi.fn(),
    markUnavailable: vi.fn(),
    endUnavailable: vi.fn(),
  };
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

  // SPM-124: catalogue scope is an explicit flag; identity stays server-verified.
  it('forwards catalogue scope and detail reads to the service', () => {
    // Arrange: service results make each delegated read distinguishable.
    service.list.mockReturnValue(['catalogue']);
    service.get.mockReturnValue('detail');
    const id = '00000000-0000-4000-8000-000000000124';

    // Act: invoke the controller methods used by the protected HTTP routes.
    expect(controller.list(request, 'true')).toEqual(['catalogue']);
    expect(controller.get(request, id)).toBe('detail');

    // Assert: no caller-controlled identity is substituted.
    expect(service.list).toHaveBeenCalledWith(identity, true);
    expect(service.get).toHaveBeenCalledWith(identity, id);
  });

  /** VEN-AVL-06-A: the authenticated booking API forwards the venue, body and verified identity. */
  it('forwards a venue booking request with the session identity', () => {
    const venueId = '00000000-0000-4000-8000-000000000124';
    const body = {
      eventId: '00000000-0000-4000-8000-000000000125',
      start: '2030-01-12T04:00:00.000Z',
      end: '2030-01-12T05:00:00.000Z',
    };
    service.submitBookingRequest.mockReturnValue({ status: 'pending' });

    expect(controller.submitBookingRequest(request, venueId, body)).toEqual({
      status: 'pending',
    });
    expect(service.submitBookingRequest).toHaveBeenCalledWith(
      identity,
      venueId,
      body,
    );
  });

  /** SPM-122: venue staff unavailability actions forward the verified identity and route IDs. */
  it('forwards a blockout request and blockout end action', () => {
    const venueId = '00000000-0000-4000-8000-000000000124';
    const periodId = '00000000-0000-4000-8000-000000000126';
    const body = {
      start: '2030-01-12T04:00:00.000Z',
      end: '2030-01-12T05:00:00.000Z',
      reason: 'Maintenance',
    };
    service.markUnavailable.mockReturnValue({ period: 'saved' });
    service.endUnavailable.mockReturnValue({ period: 'ended' });

    expect(controller.markUnavailable(request, venueId, body)).toEqual({
      period: 'saved',
    });
    expect(controller.endUnavailable(request, venueId, periodId)).toEqual({
      period: 'ended',
    });
    expect(service.markUnavailable).toHaveBeenCalledWith(
      identity,
      venueId,
      body,
    );
    expect(service.endUnavailable).toHaveBeenCalledWith(
      identity,
      venueId,
      periodId,
    );
  });
});
