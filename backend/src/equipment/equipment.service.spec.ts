import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { EquipmentService } from './equipment.service.js';

const database = { query: vi.fn(), transaction: vi.fn() };

const technicalSupportUser: AuthenticatedUser = {
  uid: 'tech-support-1',
  roles: ['TECH_SUPPORT'],
  email: 'support@example.test',
  name: 'Technical Support',
};

function userWithRole(
  role: AuthenticatedUser['roles'][number],
): AuthenticatedUser {
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
    providers: [
      EquipmentService,
      { provide: DatabaseService, useValue: database },
    ],
  }).compile();
  service = module.get(EquipmentService);
});

describe('EquipmentService', () => {
  // SPM-111 EQUIP-CRE-03-C: service validation remains effective even when UI checks are bypassed.
  it.each([
    [
      'missing name',
      {
        type: 'Audio',
        quantity: 5,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'missing type',
      {
        name: 'Conference projector',
        quantity: 5,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'missing quantity',
      {
        name: 'Conference projector',
        type: 'Audio',
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'missing maintenance status',
      {
        name: 'Conference projector',
        type: 'Audio',
        quantity: 5,
        location: 'Storage Room A',
      },
    ],
    [
      'missing location',
      {
        name: 'Conference projector',
        type: 'Audio',
        quantity: 5,
        maintenanceStatus: 'Active',
      },
    ],
    [
      'zero quantity',
      {
        name: 'Conference projector',
        type: 'Audio',
        quantity: 0,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'decimal quantity',
      {
        name: 'Conference projector',
        type: 'Audio',
        quantity: 1.5,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'invalid type',
      {
        name: 'Conference projector',
        type: 'Projector',
        quantity: 5,
        maintenanceStatus: 'Active',
        location: 'Storage Room A',
      },
    ],
    [
      'invalid maintenance status',
      {
        name: 'Conference projector',
        type: 'Audio',
        quantity: 5,
        maintenanceStatus: 'Broken',
        location: 'Storage Room A',
      },
    ],
  ])(
    'EQUIP-CRE-03-C rejects %s before database access',
    async (_caseName, body) => {
      // Act and assert: malformed API payloads are rejected without persistence.
      await expect(
        service.create(technicalSupportUser, body),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(database.query).not.toHaveBeenCalled();
    },
  );

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
      message: 'Equipment record created.',
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
          location: 'Storage Room A',
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
        location: 'Storage Room A',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
  });

  // SPM-111 EQUIP-CRE-01-B: any role set containing Technical Support is authorised.
  it('EQUIP-CRE-01-B accepts a multi-role Technical Support user', async () => {
    database.query.mockResolvedValue({ rows: [createdRow] });

    await expect(
      service.list({
        ...technicalSupportUser,
        roles: ['COORDINATOR', 'TECH_SUPPORT'],
      }),
    ).resolves.toHaveLength(1);
  });

  // SPM-111 EQUIP-CRE-01-B: an authenticated user with no roles is not authorised.
  it('EQUIP-CRE-01-B rejects a user with no roles', async () => {
    await expect(
      service.list({ ...technicalSupportUser, roles: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).not.toHaveBeenCalled();
  });

  // EQUIP-VIEW-04-B (AC4, service layer). Kills: toEquipment() hard-coding
  // maintenanceStatus, swapping it with another field, or dropping a row during
  // mapping. This mocks database.query, so it cannot catch a SQL-level filter
  // (e.g. a stray WHERE maintenance_status = 'Active') that would always return
  // exactly the rows this mock is told to return; that guarantee comes from the
  // real-SQL case in equipment.e2e-spec.ts (EQUIP-VIEW-04-C).
  it('EQUIP-VIEW-04-B maps every maintenance status to its equipment record', async () => {
    // Arrange: the database holds one record per supported maintenance status.
    database.query.mockResolvedValue({
      rows: [
        { ...createdRow, id: 'equipment-active', maintenance_status: 'Active' },
        {
          ...createdRow,
          id: 'equipment-maintenance',
          maintenance_status: 'Under Maintenance',
        },
        { ...createdRow, id: 'equipment-retired', maintenance_status: 'Retired' },
      ],
    });

    // Act: retrieve the full inventory.
    const inventory = await service.list(technicalSupportUser);

    // Assert: every status reaches the caller, not just Active.
    expect(inventory.map((record) => record.maintenanceStatus)).toEqual([
      'Active',
      'Under Maintenance',
      'Retired',
    ]);
  });

  /**
   * EQUIP-UNAVAIL-04-C: explicit opt-in returns unavailable equipment from the inventory query.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21528785/EQUIP-UNAVAIL-04#C
   */
  it('SPM-119 AC4 lists unavailable equipment after explicit opt-in', async () => {
    database.query.mockResolvedValue({ rows: [{ ...createdRow, is_available: false }] });

    const inventory = await service.list(technicalSupportUser, { includeUnavailable: true });

    const [sql] = database.query.mock.calls.at(-1) ?? [];
    // Opt-in must remove the predicate entirely; an alternative predicate such
    // as `is_available IS TRUE` would still incorrectly hide unavailable rows.
    expect(sql).toMatch(/FROM equipment\s+ORDER BY created_at DESC/i);
    expect(sql).not.toMatch(/\bWHERE\b/i);
    expect(inventory).toEqual([expect.objectContaining({
      id: 'equipment-1',
      isAvailable: false,
    })]);
  });

  /**
   * EQUIP-UNAVAIL-ASSUMP-03: existing behavior rejects a repeated same-state request with no audit write, pending a product rule.
   */
  it('EQUIP-UNAVAIL-ASSUMP-03 rejects an availability update when the record already has that state', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ ...createdRow, is_available: false }] }),
    };
    database.transaction.mockImplementation((work) => work(client));

    await expect(
      service.updateAvailability(
        technicalSupportUser,
        '11111111-1111-4111-8111-111111111119',
        {
          isAvailable: false,
          reason: 'Already marked unavailable',
        },
      ),
    ).rejects.toThrow('Equipment is already unavailable.');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      '11111111-1111-4111-8111-111111111119',
    ]);
  });

  /**
   * EQUIP-UNAVAIL-07-SEC-06: an unknown equipment UUID returns not found without writing history.
   * Covers the missing-row branch before the availability transition is attempted.
   */
  it('SPM-119 returns not found when an availability update targets no equipment record', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    database.transaction.mockImplementation((work) => work(client));

    await expect(
      service.updateAvailability(
        technicalSupportUser,
        '11111111-1111-4111-8111-111111111119',
        { isAvailable: false, reason: 'Equipment record no longer exists' },
      ),
    ).rejects.toThrow('Equipment record not found.');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      '11111111-1111-4111-8111-111111111119',
    ]);
  });

  // SPM-111 EQUIP-CRE-02-C: the locations lookup returns distinct stored locations for the dropdown.
  it('EQUIP-CRE-02-C returns distinct stored locations for the dropdown', async () => {
    // Arrange: the database returns distinct location rows.
    database.query.mockResolvedValue({
      rows: [{ location: 'Main Hall' }, { location: 'Storage Room A' }],
    });

    // Act: list locations for the create-form dropdown.
    const locations = await service.listLocations(technicalSupportUser);

    // Assert: a DISTINCT, ordered location query runs and its values are returned as plain strings.
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /SELECT DISTINCT location[\s\S]*ORDER BY location/i,
      ),
    );
    expect(locations).toEqual(['Main Hall', 'Storage Room A']);
  });

  // SPM-111 EQUIP-CRE-02-C / EQUIP-CRE-05-SEC-1: the locations lookup is Technical Support only.
  it.each(['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE'] as const)(
    'EQUIP-CRE-02-C rejects %s locations access before persistence',
    async (role) => {
      // Act and assert: non-Technical-Support roles cannot read stored locations.
      await expect(
        service.listLocations(userWithRole(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  // SPM-111 EQUIP-CRE-02-C / EQUIP-CRE-05-SEC-1: anonymous callers cannot read locations.
  it('EQUIP-CRE-02-C rejects unauthenticated locations access before persistence', async () => {
    await expect(
      service.listLocations(undefined as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.query).not.toHaveBeenCalled();
  });

  /**
   * EQUIP-UNAVAIL-05-E: the audit response maps every stored snapshot field to its API representation.
   */
  it('SPM-119 AC5 maps every persisted audit-trail field for Technical Support', async () => {
    database.query.mockResolvedValue({
      rows: [{
        id: 'audit-1',
        equipment_id: 'equipment-1',
        equipment_name: 'Conference projector',
        equipment_type: 'Visual',
        location: 'Storage Room A',
        maintenance_status: 'Under Maintenance',
        quantity: 10,
        is_available: false,
        change_type: 'Marked unavailable',
        reason: 'Lens sent for repair',
        changed_by: 'support@example.test',
        changed_at: new Date('2026-10-14T01:02:03.000Z'),
      }],
    });

    const result = await service.getAuditTrail(technicalSupportUser);

    expect(database.query).toHaveBeenCalledWith(expect.stringMatching(
      /FROM equipment_audit_trail ORDER BY changed_at DESC/i,
    ));
    expect(result).toEqual([{
      id: 'audit-1',
      equipmentId: 'equipment-1',
      equipmentName: 'Conference projector',
      equipmentType: 'Visual',
      location: 'Storage Room A',
      maintenanceStatus: 'Under Maintenance',
      quantity: 10,
      isAvailable: false,
      changeType: 'Marked unavailable',
      reason: 'Lens sent for repair',
      changedBy: 'support@example.test',
      timestamp: '2026-10-14T01:02:03.000Z',
    }]);
  });

  /**
   * EQUIP-UNAVAIL-07-SEC-03: audit-trail reads reject unauthenticated callers.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21037609/EQUIP-UNAVAIL-HARDENING#EQUIP-UNAVAIL-07-SEC-03
   * Kills: removing the authentication guard from getAuditTrail().
   */
  it('SPM-119 AC5 rejects unauthenticated audit-trail access', async () => {
    await expect(service.getAuditTrail(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  /**
   * EQUIP-UNAVAIL-07-SEC-03: audit-trail reads reject callers without Technical Support access.
   * Confluence: https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/21037609/EQUIP-UNAVAIL-HARDENING#EQUIP-UNAVAIL-07-SEC-03
   * Kills: accepting any authenticated role in getAuditTrail().
   */
  it('SPM-119 AC5 rejects non-Technical-Support audit-trail access', async () => {
    await expect(
      service.getAuditTrail(userWithRole('ORGANISER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).not.toHaveBeenCalled();
  });
});
