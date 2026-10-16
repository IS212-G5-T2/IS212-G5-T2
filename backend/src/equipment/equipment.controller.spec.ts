import { describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { EquipmentController } from './equipment.controller.js';
import { EquipmentService } from './equipment.service.js';

describe('EquipmentController route delegation', () => {
  const identity: AuthenticatedUser = {
    uid: 'tech-support-1',
    roles: ['TECH_SUPPORT'],
    email: 'support@example.test',
    name: 'Technical Support',
  };
  const request = { [CURRENT_USER_REQUEST_KEY]: identity } as AuthenticatedRequest;
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    listLocations: vi.fn(),
    updateAvailability: vi.fn(),
    update: vi.fn(),
    getAuditTrail: vi.fn(),
  };
  const controller = new EquipmentController(service as unknown as EquipmentService);

  /**
   * EQUIP-CRE-04-C: the create route forwards the verified caller and submitted record to the service.
   */
  it('EQUIP-CRE-04-C delegates equipment creation with the verified caller', () => {
    const body = { name: 'Conference projector' };
    service.create.mockReturnValue('created');

    expect(controller.create(body, request)).toBe('created');
    expect(service.create).toHaveBeenCalledWith(identity, body);
  });

  /**
   * EQUIP-UNAVAIL-04-F: only the literal true query opts into unavailable records.
   */
  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
  ])('EQUIP-UNAVAIL-04-F delegates equipment listing for query %s', (query, expected) => {
    service.list.mockReturnValue('listed');

    expect(controller.list(query, request)).toBe('listed');
    expect(service.list).toHaveBeenCalledWith(identity, { includeUnavailable: expected });
  });

  /**
   * EQUIP-VIEW-02-C: the locations route forwards the verified caller to the lookup service.
   */
  it('EQUIP-VIEW-02-C delegates the equipment locations lookup', () => {
    service.listLocations.mockReturnValue(['Storage Room A']);

    expect(controller.listLocations(request)).toEqual(['Storage Room A']);
    expect(service.listLocations).toHaveBeenCalledWith(identity);
  });

  /**
   * EQUIP-UNAVAIL-01-C: the update route forwards the equipment and requested state unchanged.
   */
  it('EQUIP-UNAVAIL-01-C delegates an availability update without changing its payload', () => {
    const body = { isAvailable: false, reason: 'Lens sent for repair' };
    service.updateAvailability.mockReturnValue('updated');

    expect(controller.updateAvailability('equipment-1', body, request)).toBe('updated');
    expect(service.updateAvailability).toHaveBeenCalledWith(identity, 'equipment-1', body);
  });

  /**
   * EQUIP-UNAVAIL-05-F: the audit route forwards the verified caller to the shared audit lookup.
   */
  it('EQUIP-UNAVAIL-05-F delegates the shared equipment audit-trail lookup', () => {
    service.getAuditTrail.mockReturnValue(['audit-entry']);

    expect(controller.getAuditTrail(request)).toEqual(['audit-entry']);
    expect(service.getAuditTrail).toHaveBeenCalledWith(identity);
  });

  /** Confluence EQUIP-UPDATE-02-A; SPM-118 AC1/AC2: the equipment update route forwards the selected id, body, and authenticated user. */
  it('EQUIP-UPDATE-02-A delegates a record update with the verified caller', () => {
    const body = { name: 'Projector', type: 'Visual', location: 'Main Hall', quantity: 2, maintenanceStatus: 'Active' };
    service.update.mockReturnValue('updated');

    expect(controller.update('equipment-1', body, request)).toBe('updated');
    expect(service.update).toHaveBeenCalledWith(identity, 'equipment-1', body);
  });
});
