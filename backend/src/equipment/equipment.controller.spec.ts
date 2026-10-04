import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_USER_REQUEST_KEY,
  type AuthenticatedUser,
} from '../auth/models/auth.models.js';
import { EquipmentController } from './equipment.controller.js';
import type { EquipmentService } from './equipment.service.js';

const technicalSupport: AuthenticatedUser = {
  uid: 'tech-support-1',
  roles: ['TECH_SUPPORT'],
  email: 'support@example.test',
  name: 'Technical Support',
};

const service = {
  create: vi.fn(),
  list: vi.fn(),
  listLocations: vi.fn(),
};

function request(user?: AuthenticatedUser) {
  return { [CURRENT_USER_REQUEST_KEY]: user } as never;
}

describe('EquipmentController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // SPM-111 EQUIP-CRE-04-A: controller forwards valid form data and authenticated identity.
  it('EQUIP-CRE-04-A delegates a create request with its body and current user', async () => {
    // Arrange: service returns the 201-compatible creation response.
    const body = { type: 'Visual', quantity: 10, maintenanceStatus: 'Active' };
    const response = { equipment: { id: 'equipment-1', ...body }, message: 'Equipment record created.' };
    service.create.mockResolvedValue(response);
    const controller = new EquipmentController(service as unknown as EquipmentService);

    // Act: handle the authenticated HTTP request.
    const result = await controller.create(body, request(technicalSupport));

    // Assert: controller preserves request identity and payload for service validation/persistence.
    expect(service.create).toHaveBeenCalledWith(technicalSupport, body);
    expect(result).toBe(response);
  });

  // SPM-111 EQUIP-CRE-05-A: the inventory endpoint delegates with the current user.
  it('EQUIP-CRE-05-A delegates inventory retrieval with the current user', async () => {
    // Arrange: service returns the new persisted equipment record in inventory.
    const inventory = [{ id: 'equipment-1', type: 'Visual', quantity: 10, maintenanceStatus: 'Active' }];
    service.list.mockResolvedValue(inventory);
    const controller = new EquipmentController(service as unknown as EquipmentService);

    // Act and assert: authenticated inventory calls preserve the request user.
    await expect(controller.list(request(technicalSupport))).resolves.toBe(inventory);
    expect(service.list).toHaveBeenCalledWith(technicalSupport);
  });

  // SPM-111 EQUIP-CRE-02-C: the locations endpoint delegates with the current user.
  it('EQUIP-CRE-02-C delegates locations retrieval with the current user', async () => {
    // Arrange: service returns the stored distinct locations for the dropdown.
    const locations = ['Main Hall', 'Storage Room A'];
    service.listLocations.mockResolvedValue(locations);
    const controller = new EquipmentController(service as unknown as EquipmentService);

    // Act and assert: authenticated locations calls preserve the request user.
    await expect(controller.listLocations(request(technicalSupport))).resolves.toBe(locations);
    expect(service.listLocations).toHaveBeenCalledWith(technicalSupport);
  });

  // SPM-111 EQUIP-CRE-01-B / EQUIP-CRE-05-SEC-1: authorization receives the request identity.
  it('EQUIP-CRE-01-B/EQUIP-CRE-05-SEC-1 passes an absent current user to the service guard', async () => {
    // Arrange: downstream guard rejects unauthenticated creation.
    const controller = new EquipmentController(service as unknown as EquipmentService);
    const body = { type: 'Audio', quantity: 5, maintenanceStatus: 'Active' };

    // Act: invoke the route without authenticated request context.
    await controller.create(body, request());

    // Assert: the controller does not substitute an identity or bypass the guard.
    expect(service.create).toHaveBeenCalledWith(undefined, body);
  });

  // SPM-111 EQUIP-CRE-01-B / EQUIP-CRE-05-SEC-1: controller preserves a 403 from the service guard.
  it('EQUIP-CRE-01-B/EQUIP-CRE-05-SEC-1 propagates a forbidden create attempt', async () => {
    // Arrange: the service guard denies an organiser before persistence.
    const organiser: AuthenticatedUser = {
      uid: 'organiser-1',
      roles: ['ORGANISER'],
      email: 'organiser@example.test',
      name: 'Organiser',
    };
    const forbidden = new ForbiddenException();
    service.create.mockRejectedValue(forbidden);
    const controller = new EquipmentController(service as unknown as EquipmentService);
    const body = { type: 'Audio', quantity: 5, maintenanceStatus: 'Active' };

    // Act and assert: HTTP handling receives the service authorization error unchanged.
    await expect(controller.create(body, request(organiser))).rejects.toBe(forbidden);
    expect(service.create).toHaveBeenCalledWith(organiser, body);
  });
});
