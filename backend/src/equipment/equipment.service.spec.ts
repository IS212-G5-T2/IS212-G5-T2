import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { EquipmentService } from './equipment.service.js';

const database = { query: vi.fn() };

const technicalSupportUser: AuthenticatedUser = {
  uid: 'tech-support-1',
  roles: ['TECH_SUPPORT'],
  email: 'support@example.test',
  name: 'Technical Support',
};

function userWithRole(role: AuthenticatedUser['roles'][number]): AuthenticatedUser {
  return {
    uid: `${role.toLowerCase()}-1`,
    roles: [role],
    email: `${role.toLowerCase()}@example.test`,
    name: role,
  };
}

const createdRow = {
  id: 'equipment-1',
  equipment_name: 'Conference projector',
  equipment_type: 'Visual',
  quantity: 10,
  maintenance_status: 'Active',
  location: 'Storage Room A',
  created_at: new Date('2026-10-03T00:00:00.000Z'),
  updated_at: new Date('2026-10-03T00:00:00.000Z'),
};

let service: EquipmentService;

beforeEach(async () => {
  vi.resetAllMocks();
  const module = await Test.createTestingModule({
    providers: [EquipmentService, { provide: DatabaseService, useValue: database }],
  }).compile();
  service = module.get(EquipmentService);
});

describe('EquipmentService', () => {
  // SPM-111 EQUIP-CRE-03-C: service validation remains effective even when UI checks are bypassed.
  it.each([
    ['missing name', { type: 'Audio', quantity: 5, maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['missing type', { name: 'Conference projector', quantity: 5, maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['missing quantity', { name: 'Conference projector', type: 'Audio', maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['missing maintenance status', { name: 'Conference projector', type: 'Audio', quantity: 5, location: 'Storage Room A' }],
    ['missing location', { name: 'Conference projector', type: 'Audio', quantity: 5, maintenanceStatus: 'Active' }],
    ['zero quantity', { name: 'Conference projector', type: 'Audio', quantity: 0, maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['decimal quantity', { name: 'Conference projector', type: 'Audio', quantity: 1.5, maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['invalid type', { name: 'Conference projector', type: 'Projector', quantity: 5, maintenanceStatus: 'Active', location: 'Storage Room A' }],
    ['invalid maintenance status', { name: 'Conference projector', type: 'Audio', quantity: 5, maintenanceStatus: 'Broken', location: 'Storage Room A' }],
  ])('EQUIP-CRE-03-C rejects %s before database access', async (_caseName, body) => {
    // Act and assert: malformed API payloads are rejected without persistence.
    await expect(service.create(technicalSupportUser, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-04-A: a valid submission persists a record and confirms it.
  it('EQUIP-CRE-04-A creates an equipment record and returns a confirmation message', async () => {
    // Arrange: the authorised user submits valid form values and the database returns its row.
    database.query.mockResolvedValue({ rows: [createdRow] });

    // Act: create the record through the service boundary.
    const result = await service.create(technicalSupportUser, {
      name: 'Conference projector',
      type: 'Visual',
      quantity: 10,
      maintenanceStatus: 'Active',
      location: 'Storage Room A',
    });

    // Assert: persistence receives all fields and the UI can display confirmation.
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO equipment'),
      ['Conference projector', 'Visual', 10, 'Active', 'Storage Room A'],
    );
    expect(result).toMatchObject({
      equipment: {
        id: 'equipment-1',
        name: 'Conference projector',
        type: 'Visual',
        quantity: 10,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
      message: expect.stringMatching(/created/i),
    });
  });

  // SPM-111 EQUIP-CRE-05-A: a newly created record is returned by inventory retrieval.
  it('EQUIP-CRE-05-A returns the persisted record in the inventory list', async () => {
    // Arrange: inventory persistence already includes the newly created row.
    database.query.mockResolvedValue({ rows: [createdRow] });

    // Act: retrieve the system inventory.
    const inventory = await service.list(technicalSupportUser);

    // Assert: the same id and submitted values are visible to the inventory consumer.
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM equipment'),
    );
    expect(inventory).toContainEqual(
      expect.objectContaining({
        id: 'equipment-1',
        name: 'Conference projector',
        type: 'Visual',
        quantity: 10,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      }),
    );
  });

  // SPM-111 EQUIP-CRE-01-B / EQUIP-CRE-05-SEC-1: inventory is Technical Support only.
  it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE'] as const)(
    'EQUIP-CRE-01-B/EQUIP-CRE-05-SEC-1 rejects %s inventory access before persistence',
    async (role) => {
      // Act and assert: non-Technical-Support roles cannot read total equipment inventory.
      await expect(service.list(userWithRole(role))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  // SPM-111 EQUIP-CRE-05-SEC-1: anonymous callers cannot read inventory.
  it('EQUIP-CRE-05-SEC-1 rejects unauthenticated inventory access before persistence', async () => {
    await expect(service.list(undefined as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-01-B / EQUIP-CRE-05-SEC-1: creation remains Technical Support only.
  it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE'] as const)(
    'EQUIP-CRE-01-B/EQUIP-CRE-05-SEC-1 rejects %s before persistence',
    async (role) => {
    // Act and assert: the role check happens before any persistence call.
    await expect(
      service.create(userWithRole(role), {
        type: 'Audio',
        name: 'Conference projector',
        quantity: 5,
        maintenanceStatus: 'Active',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).not.toHaveBeenCalled();
    },
  );

  // SPM-111 EQUIP-CRE-05-SEC-1: unauthenticated create attempts receive 401.
  it('EQUIP-CRE-05-SEC-1 rejects an unauthenticated create attempt before persistence', async () => {
    await expect(
      service.create(undefined as never, {
        type: 'Audio',
        name: 'Conference projector',
        quantity: 5,
        maintenanceStatus: 'Active',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-02-C: the locations lookup returns distinct stored locations for the dropdown.
  it('EQUIP-CRE-02-C returns distinct stored locations for the dropdown', async () => {
    // Arrange: the database returns distinct location rows.
    database.query.mockResolvedValue({ rows: [{ location: 'Main Hall' }, { location: 'Storage Room A' }] });

    // Act: list locations for the create-form dropdown.
    const locations = await service.listLocations(technicalSupportUser);

    // Assert: a DISTINCT, ordered location query runs and its values are returned as plain strings.
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT DISTINCT location[\s\S]*ORDER BY location/i),
    );
    expect(locations).toEqual(['Main Hall', 'Storage Room A']);
  });

  // SPM-111 EQUIP-CRE-02-C / EQUIP-CRE-05-SEC-1: the locations lookup is Technical Support only.
  it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE'] as const)(
    'EQUIP-CRE-02-C rejects %s locations access before persistence',
    async (role) => {
      // Act and assert: non-Technical-Support roles cannot read stored locations.
      await expect(service.listLocations(userWithRole(role))).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  // SPM-111 EQUIP-CRE-02-C / EQUIP-CRE-05-SEC-1: anonymous callers cannot read locations.
  it('EQUIP-CRE-02-C rejects unauthenticated locations access before persistence', async () => {
    await expect(service.listLocations(undefined as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
  });
});
