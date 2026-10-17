// SPM-80 Coordinator Updates Availability: route contract for the availability API.
// ACs: AC2 (save unavailable), AC3 (view and modify at any time).
// Test cases: COOR-AVAIL-02-D, COOR-AVAIL-03-H.
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/types/auth.models.js';
import { CoordinatorAvailabilityController } from './coordinator-availability.controller.js';
import type { CoordinatorAvailabilityService } from './coordinator-availability.service.js';

const service = { getMine: vi.fn(), updateMine: vi.fn() };

const coordinator: AuthenticatedUser = {
  uid: 'coord-1',
  roles: ['COORDINATOR'],
  email: 'coordinator1@example.test',
  name: 'Coordinator One',
};

// A request carrying the session user, as the authentication middleware leaves it.
const request = { [CURRENT_USER_REQUEST_KEY]: coordinator } as never;

let controller: CoordinatorAvailabilityController;

beforeEach(() => {
  // A fresh controller and service double per test.
  vi.resetAllMocks();
  controller = new CoordinatorAvailabilityController(
    service as unknown as CoordinatorAvailabilityService,
  );
});

describe('SPM-80 availability routes', () => {
  // The frontend calls this exact URL, so the route is part of the contract.
  it('COOR-AVAIL-03-H serves GET /api/coordinators/me/availability for the signed-in user', async () => {
    // Arrange: the service reports the saved value.
    service.getMine.mockResolvedValue({ available: false });

    // Act: handle the GET.
    const result = await controller.getMine(request);

    // Assert: route, method, and the session user are wired through.
    expect(Reflect.getMetadata(PATH_METADATA, CoordinatorAvailabilityController)).toBe(
      'api/coordinators/me/availability',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, controller.getMine)).toBe(RequestMethod.GET);
    expect(service.getMine).toHaveBeenCalledWith(coordinator);
    expect(result).toEqual({ available: false });
  });

  // Saving passes the body and the session user, never a user from the request body.
  it('COOR-AVAIL-02-D serves PUT /api/coordinators/me/availability with the body and the signed-in user', async () => {
    // Arrange: the service reports the saved value.
    service.updateMine.mockResolvedValue({ available: false });

    // Act: handle the PUT.
    const result = await controller.updateMine({ available: false }, request);

    // Assert: PUT on the same route, with the session user and body in that order.
    expect(Reflect.getMetadata(METHOD_METADATA, controller.updateMine)).toBe(RequestMethod.PUT);
    expect(service.updateMine).toHaveBeenCalledWith(coordinator, { available: false });
    expect(result).toEqual({ available: false });
  });
});
