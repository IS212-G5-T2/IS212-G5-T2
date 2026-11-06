import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
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
  active_quantity: 10,
  under_maintenance_quantity: 0,
  retired_quantity: 0,
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
  /** EQUIP-AVAIL-03-C: overlapping Reserved quantities are subtracted from Active stock only. */
  it('EQUIP-AVAIL-03-C returns a quantity breakdown and the remaining stock', async () => {
    database.query.mockResolvedValue({
      rows: [{ ...createdRow, active_quantity: 10, under_maintenance_quantity: 2, retired_quantity: 1, quantity: 13, is_available: true, reserved_quantity: 4, reserved_until: new Date('2030-01-01T12:00:00.000Z') }],
    });
    await expect(service.getAvailability(technicalSupportUser, {
      startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T11:00:00.000Z', equipmentType: 'Visual',
    })).resolves.toEqual([expect.objectContaining({
      name: 'Conference projector', activeQuantity: 10, underMaintenanceQuantity: 2,
      retiredQuantity: 1, reservedQuantity: 4, availableQuantity: 6, isAvailable: true,
      reservedUntil: '2030-01-01T12:00:00.000Z', reason: 'Under maintenance; Retired; Reserved',
    })]);
    expect(database.query.mock.calls[0][0]).toContain("r.status = 'Reserved'");
    expect(database.query.mock.calls[0][0]).toContain('ev.start_date_time < $2');
    expect(database.query.mock.calls[0][0]).toContain('ev.end_date_time > $1');
  });

  /** EQUIP-AVAIL-01-SEC-1: date-window availability is Technical-Support-only. */
  it('refuses availability checks before issuing SQL to a non-technical user', async () => {
    await expect(service.getAvailability(userWithRole('COORDINATOR'), {
      startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.query).not.toHaveBeenCalled();
  });

  /** EQUIP-AVAIL-05-B: manual unavailability wins over otherwise Active stock. */
  it('reports zero available units when a staff member manually disabled a record', async () => {
    database.query.mockResolvedValue({ rows: [{ ...createdRow, is_available: false, reserved_quantity: 0, reserved_until: null }] });
    await expect(service.getAvailability(technicalSupportUser, {
      startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z',
    })).resolves.toEqual([expect.objectContaining({ availableQuantity: 0, isAvailable: false, reason: 'Manually unavailable' })]);
  });

  /** EQUIP-AVAIL-05-A: an active record with no reservation stays available without a reason. */
  it('reports a clean active record as fully available', async () => {
    database.query.mockResolvedValue({ rows: [{ ...createdRow, is_available: true, reserved_quantity: 0, reserved_until: null }] });
    await expect(service.getAvailability(technicalSupportUser, {
      startDateTime: '2030-01-01T10:00:00.000Z', endDateTime: '2030-01-01T10:01:00.000Z',
    })).resolves.toEqual([expect.objectContaining({ availableQuantity: 10, isAvailable: true, reason: null, reservedUntil: null })]);
  });
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
      ['Conference projector', 'Visual', 10, 'Active', 10, 0, 0, 'Storage Room A'],
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

  /** EQUIP-AVAIL-08-A: creation persists each status count and returns their summed total. */
  it('EQUIP-AVAIL-08-A creates mixed-status equipment from the three quantity buckets', async () => {
    const mixed = {
      ...createdRow,
      quantity: 50,
      active_quantity: 10,
      under_maintenance_quantity: 30,
      retired_quantity: 10,
      is_available: true,
    };
    database.query.mockResolvedValue({ rows: [mixed] });

    const result = await service.create(technicalSupportUser, {
      name: 'Conference projector',
      type: 'Visual',
      activeQuantity: 10,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
      location: 'Storage Room A',
    });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/active_quantity[\s\S]*under_maintenance_quantity[\s\S]*retired_quantity/i),
      ['Conference projector', 'Visual', 50, 'Active', 10, 30, 10, 'Storage Room A'],
    );
    expect(result.equipment).toMatchObject({
      quantity: 50,
      activeQuantity: 10,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
      isAvailable: true,
    });
    expect(result.equipment.maintenanceStatus).toBeNull();
  });

  /** EQUIP-AVAIL-08-B: edits persist every changed status bucket and record those counts in history. */
  it('EQUIP-AVAIL-08-B updates retired quantity and includes the status breakdown in the audit snapshot', async () => {
    const before = { ...createdRow, is_available: false };
    const after = {
      ...createdRow,
      quantity: 50,
      active_quantity: 10,
      under_maintenance_quantity: 30,
      retired_quantity: 10,
      maintenance_status: 'Active',
      is_available: false,
    };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [before] })
        .mockResolvedValueOnce({ rows: [after] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    database.transaction.mockImplementation((work) => work(client));

    const result = await service.update(
      technicalSupportUser,
      '11111111-1111-4111-8111-111111111118',
      {
        name: 'Conference projector',
        type: 'Visual',
        location: 'Storage Room A',
        activeQuantity: 10,
        underMaintenanceQuantity: 30,
        retiredQuantity: 10,
      },
    );

    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/active_quantity = \$7[\s\S]*under_maintenance_quantity = \$8[\s\S]*retired_quantity = \$9/i),
      ['11111111-1111-4111-8111-111111111118', 'Conference projector', 'Visual', 'Storage Room A', 'Active', 50, 10, 30, 10],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/active_quantity, under_maintenance_quantity, retired_quantity/i),
      expect.arrayContaining([50, 10, 30, 10, false, 'Updated fields: Under Maintenance quantity, Retired quantity.']),
    );
    expect(result.equipment).toMatchObject({
      quantity: 50,
      activeQuantity: 10,
      underMaintenanceQuantity: 30,
      retiredQuantity: 10,
      isAvailable: false,
      maintenanceStatus: null,
    });
  });

  /** EQUIP-AVAIL-08-D: pre-migration inventory reads assign legacy totals to exactly their former status bucket. */
  it('EQUIP-AVAIL-08-D maps each legacy equipment status to its quantity bucket', async () => {
    const { active_quantity: _active, under_maintenance_quantity: _maintenance, retired_quantity: _retired, ...legacy } = createdRow;
    database.query.mockResolvedValue({
      rows: [
        { ...legacy, id: 'legacy-active', quantity: 5, maintenance_status: 'Active' },
        { ...legacy, id: 'legacy-maintenance', quantity: 7, maintenance_status: 'Under Maintenance' },
        { ...legacy, id: 'legacy-retired', quantity: 9, maintenance_status: 'Retired' },
      ],
    });

    const inventory = await service.list(technicalSupportUser);

    expect(inventory.map(({ id, activeQuantity, underMaintenanceQuantity, retiredQuantity }) => ({
      id, activeQuantity, underMaintenanceQuantity, retiredQuantity,
    }))).toEqual([
      { id: 'legacy-active', activeQuantity: 5, underMaintenanceQuantity: 0, retiredQuantity: 0 },
      { id: 'legacy-maintenance', activeQuantity: 0, underMaintenanceQuantity: 7, retiredQuantity: 0 },
      { id: 'legacy-retired', activeQuantity: 0, underMaintenanceQuantity: 0, retiredQuantity: 9 },
    ]);
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
        { ...createdRow, id: 'equipment-active', maintenance_status: 'Active', active_quantity: 10, under_maintenance_quantity: 0, retired_quantity: 0 },
        {
          ...createdRow,
          id: 'equipment-maintenance',
          maintenance_status: 'Under Maintenance',
          active_quantity: 0,
          under_maintenance_quantity: 10,
          retired_quantity: 0,
        },
        { ...createdRow, id: 'equipment-retired', maintenance_status: 'Retired', active_quantity: 0, under_maintenance_quantity: 0, retired_quantity: 10 },
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
   * EQUIP-UNAVAIL-ASSUMP-03: repeated same-state requests are rejected with 409 and create no audit entry (PO-confirmed rule).
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
        active_quantity: 0,
        under_maintenance_quantity: 10,
        retired_quantity: 0,
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
      activeQuantity: 0,
      underMaintenanceQuantity: 10,
      retiredQuantity: 0,
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

  /** Confluence EQUIP-UPDATE-02-A; SPM-118 AC2: changed editable fields update inventory and write the new state to audit. Kills: BE-118-02 (audit omitted), BE-118-03 (wrong actor), BE-118-04 (quantity omitted), BE-118-14 (name), BE-118-15 (type), BE-118-16 (location), BE-118-17 (maintenance), BE-118-18 (quantity mis-mapped). */
  it('EQUIP-UPDATE-02-A updates all allowed values and writes an audit snapshot atomically', async () => {
    const before = {
      ...createdRow,
      is_available: true,
    };
    const after = {
      ...createdRow,
      equipment_name: 'Updated projector',
      equipment_type: 'Audio',
      quantity: 7,
      active_quantity: 0,
      under_maintenance_quantity: 7,
      retired_quantity: 0,
      maintenance_status: 'Under Maintenance',
      location: 'Main Hall',
      is_available: true,
      updated_at: new Date('2026-10-15T00:00:00.000Z'),
    };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [before] })
        .mockResolvedValueOnce({ rows: [after] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    database.transaction.mockImplementation((work) => work(client));

    const result = await service.update(
      technicalSupportUser,
      '11111111-1111-4111-8111-111111111118',
      {
        name: 'Updated projector',
        type: 'Audio',
        location: 'Main Hall',
        quantity: 7,
        maintenanceStatus: 'Under Maintenance',
      },
    );

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/FROM equipment WHERE id = \$1 FOR UPDATE/i),
      ['11111111-1111-4111-8111-111111111118'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/UPDATE equipment[\s\S]*maintenance_status = \$5, quantity = \$6, active_quantity = \$7[\s\S]*RETURNING/i),
      ['11111111-1111-4111-8111-111111111118', 'Updated projector', 'Audio', 'Main Hall', 'Under Maintenance', 7, 0, 7, 0],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/INSERT INTO equipment_audit_trail[\s\S]*'Equipment record updated'/i),
      [
        'equipment-1',
        'Updated projector',
        'Audio',
        'Main Hall',
        'Under Maintenance',
        7,
        0,
        7,
        0,
        true,
        'Updated fields: Equipment name, Equipment type, Location, Active quantity, Under Maintenance quantity.',
        'support@example.test',
      ],
    );
    expect(result).toMatchObject({
      equipment: {
        id: 'equipment-1',
        name: 'Updated projector',
        type: 'Audio',
        location: 'Main Hall',
        maintenanceStatus: 'Under Maintenance',
        quantity: 7,
      },
      message: 'Equipment record updated.',
    });
  });

  /** Confluence EQUIP-UPDATE-02-B; SPM-118 AC2: properties outside the five creation fields cannot alter the persisted record. Kills: BE-118-19 (Description persisted), BE-118-20 (Specifications persisted). */
  it('EQUIP-UPDATE-02-B ignores retired Description and Specifications properties', async () => {
    const before = { ...createdRow, is_available: true };
    const after = { ...before, equipment_name: 'Updated projector', updated_at: new Date('2026-10-15T00:00:00.000Z') };
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [before] }).mockResolvedValueOnce({ rows: [after] }).mockResolvedValueOnce({ rows: [] }) };
    database.transaction.mockImplementation((work) => work(client));

    const result = await service.update(technicalSupportUser, '11111111-1111-4111-8111-111111111118', {
      name: 'Updated projector', type: 'Visual', location: 'Storage Room A', quantity: 5, maintenanceStatus: 'Active',
      description: 'must not persist', specifications: 'must not persist',
    });

    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/UPDATE equipment[\s\S]*RETURNING/i), [
      '11111111-1111-4111-8111-111111111118', 'Updated projector', 'Visual', 'Storage Room A', 'Active', 5, 5, 0, 0,
    ]);
    expect(JSON.stringify(result)).not.toMatch(/must not persist/);
  });

  const rejectsAnEmptyField = async (field: string, message: string, override: Record<string, unknown>) => {
    const error = await service.update(technicalSupportUser, '11111111-1111-4111-8111-111111111118', {
      name: 'Projector', type: 'Visual', location: 'Main Hall', quantity: 1, maintenanceStatus: 'Active', ...override,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ errors: { [field]: message } });
    expect(database.transaction).not.toHaveBeenCalled();
  };

  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: equipment type is required at the update service boundary. Kills: BE-118-09 (accepts empty type). */
  it('EQUIP-UPDATE-03-B rejects an empty type without opening a transaction', async () => rejectsAnEmptyField('type', 'Equipment type is required.', { type: '' }));
  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: equipment location is required at the update service boundary. Kills: BE-118-10 (accepts empty location). */
  it('EQUIP-UPDATE-03-B rejects an empty location without opening a transaction', async () => rejectsAnEmptyField('location', 'Location is required.', { location: '   ' }));
  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: maintenance status is required at the update service boundary. Kills: BE-118-11 (accepts empty maintenance status). */
  it('EQUIP-UPDATE-03-B rejects an empty maintenance status without opening a transaction', async () => rejectsAnEmptyField('maintenanceStatus', 'Maintenance status is required.', { maintenanceStatus: '' }));
  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: quantity is required at the update service boundary. Kills: BE-118-12 (accepts missing quantity). */
  it('EQUIP-UPDATE-03-B rejects an empty quantity without opening a transaction', async () => rejectsAnEmptyField('quantity', 'Quantity is required.', { quantity: '' }));
  /** Confluence EQUIP-UPDATE-03-B; SPM-118 AC3: equipment name is required at the update service boundary. Kills: BE-118-13 (accepts empty name). */
  it('EQUIP-UPDATE-03-B rejects an empty name without opening a transaction', async () => rejectsAnEmptyField('name', 'Equipment name is required.', { name: '   ' }));

  /** Confluence EQUIP-UPDATE-03-C; SPM-118 AC3: the update service rejects both sides of the shared integer quantity boundary. Kills: BE-118-23 (accepts zero), BE-118-24 (accepts above maximum). */
  it('EQUIP-UPDATE-03-C rejects quantities outside the inclusive integer range before opening a transaction', async () => {
    for (const quantity of [0, 2_147_483_648]) {
      const error = await service.update(technicalSupportUser, '11111111-1111-4111-8111-111111111118', {
        name: 'Projector', type: 'Visual', location: 'Main Hall', quantity, maintenanceStatus: 'Active',
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: { quantity: 'Quantity must be a whole number between 1 and 2147483647.' },
      });
      expect(database.transaction).not.toHaveBeenCalled();
    }
  });

  /** Confluence EQUIP-UPDATE-01-A; SPM-118 AC1: a selected equipment id that is absent from inventory returns not found before writes. Kills: BE-118-06 (allows a missing record to update). */
  it('EQUIP-UPDATE-01-A reports a missing equipment record without writing', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    database.transaction.mockImplementation((work) => work(client));

    const error = await service.update(
      technicalSupportUser,
      '11111111-1111-4111-8111-111111111118', {
        name: 'Projector', type: 'Visual', location: 'Main Hall', quantity: 1, maintenanceStatus: 'Active',
      },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({ message: 'Equipment record not found.' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  /** Confluence EQUIP-UPDATE-06-C; SPM-118 AC6: submitting unchanged values leaves equipment and audit history untouched. ASSUMPTION: PO-confirmed SPM-119 rule — unchanged requested state is not audited. Kills: BE-118-01 (writes a duplicate audit entry). */
  it('EQUIP-UPDATE-06-C returns the unchanged record without adding an audit entry', async () => {
    const before = { ...createdRow, is_available: true };
    const client = { query: vi.fn().mockResolvedValue({ rows: [before] }) };
    database.transaction.mockImplementation((work) => work(client));

    const result = await service.update(
      technicalSupportUser,
      '11111111-1111-4111-8111-111111111118',
      {
        name: before.equipment_name,
        type: before.equipment_type,
        location: before.location,
        activeQuantity: before.active_quantity,
        underMaintenanceQuantity: before.under_maintenance_quantity,
        retiredQuantity: before.retired_quantity,
      },
    );

    expect(result).toEqual({
      equipment: {
        id: before.id,
        name: before.equipment_name,
        type: before.equipment_type,
        location: before.location,
        quantity: before.quantity,
        activeQuantity: before.active_quantity,
        underMaintenanceQuantity: before.under_maintenance_quantity,
        retiredQuantity: before.retired_quantity,
        maintenanceStatus: before.maintenance_status,
        isAvailable: true,
        createdAt: before.created_at.toISOString(),
        updatedAt: before.updated_at.toISOString(),
      },
      message: 'No changes were made.',
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  /** Confluence EQUIP-UPDATE-01-C; SPM-118 AC1: only Technical Support may update equipment inventory. Kills: BE-118-05 (skips Technical Support authorization). */
  it('EQUIP-UPDATE-01-C refuses non-Technical-Support roles before opening a persistence transaction', async () => {
    for (const role of ['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE'] as const) {
      await expect(
        service.update(userWithRole(role), '11111111-1111-4111-8111-111111111118', {
          name: 'Projector',
          type: 'Visual',
          location: 'Main Hall',
          quantity: 1,
          maintenanceStatus: 'Active',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.transaction).not.toHaveBeenCalled();
    }
  });
});
