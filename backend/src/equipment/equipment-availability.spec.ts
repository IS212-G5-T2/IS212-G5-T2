/*
 * Story: SPM-119 Mark Equipment as Unavailable
 * ACs: AC1, AC2, AC5, AC6, AC7
 * Test cases: EQUIP-UNAVAIL-01-A, 02-A, 02-B, 05-A, 05-B, 07-A, 07-B, 07-SEC-1
 *
 * RED tests: the availability service contract does not exist yet. The expected
 * values below come from the approved SPM-119 Confluence test cases, not the
 * current implementation.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { EquipmentService } from './equipment.service.js';

const client = { query: vi.fn() };
const database = { query: vi.fn(), transaction: vi.fn() };
const technician: AuthenticatedUser = {
  uid: 'tech-support-1',
  roles: ['TECH_SUPPORT'],
  email: 'techsupport1@connectsphere.com',
  name: 'Technical Support 1',
};
const activeEquipment = {
  id: 'equipment-119',
  equipment_name: 'Light bulbs',
  equipment_type: 'Lighting',
  quantity: 50,
  maintenance_status: 'Active',
  location: 'Tampines',
  is_available: true,
  created_at: new Date('2026-10-07T00:00:00.000Z'),
  updated_at: new Date('2026-10-07T00:00:00.000Z'),
};

type AvailabilityService = EquipmentService & {
  updateAvailability: (
    user: AuthenticatedUser | undefined,
    equipmentId: string,
    body: unknown,
  ) => Promise<{ equipment: { id: string; isAvailable: boolean } }>;
};

describe('SPM-119 EquipmentService availability changes', () => {
  let service: AvailabilityService;

  beforeEach(async () => {
    vi.resetAllMocks();
    database.transaction.mockImplementation(async (work) => work(client));
    const module = await Test.createTestingModule({
      providers: [
        EquipmentService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();
    service = module.get(EquipmentService) as AvailabilityService;
  });

  // EQUIP-UNAVAIL-01-A: an active record changes to unavailable after confirmation.
  it('EQUIP-UNAVAIL-01-A marks Light bulbs unavailable', async () => {
    // Arrange: the locked equipment row is active and both write operations succeed.
    client.query
      .mockResolvedValueOnce({ rows: [activeEquipment] })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: a Technical Support user confirms the supplied unavailability reason.
    const result = await service.updateAvailability(
      technician,
      'equipment-119',
      {
        isAvailable: false,
        reason: 'Damaged during transport',
      },
    );

    // Assert: the public result and availability update preserve the specification literals.
    expect(result.equipment).toMatchObject({
      id: 'equipment-119',
      isAvailable: false,
    });
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/FROM equipment[\s\S]*FOR UPDATE/i),
      ['equipment-119'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/UPDATE equipment[\s\S]*is_available/i),
      ['equipment-119', false],
    );
  });

  // EQUIP-UNAVAIL-02-A: a valid reason is retained in the Marked unavailable audit event.
  it('EQUIP-UNAVAIL-02-A stores Broken lens, sent for repair in the audit entry', async () => {
    // Arrange: an active projector changes successfully.
    client.query
      .mockResolvedValueOnce({ rows: [activeEquipment] })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: submit the literal valid reason.
    await service.updateAvailability(technician, 'equipment-119', {
      isAvailable: false,
      reason: 'Broken lens, sent for repair',
    });

    // Assert: the audit insert retains the exact supplied reason.
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/INSERT INTO equipment_audit_trail/i),
      expect.arrayContaining(['Broken lens, sent for repair']),
    );
  });

  // EQUIP-UNAVAIL-05-A: a mark-unavailable action captures the equipment snapshot and change type.
  it('EQUIP-UNAVAIL-05-A writes the before-change equipment snapshot to the audit trail', async () => {
    // Arrange: the active Light bulbs record is locked for its availability change.
    client.query
      .mockResolvedValueOnce({ rows: [activeEquipment] })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: mark it unavailable with the audit-case reason.
    await service.updateAvailability(technician, 'equipment-119', {
      isAvailable: false,
      reason: 'Under repair',
    });

    // Assert: the audit insert contains the complete state and required change label.
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/INSERT INTO equipment_audit_trail/i),
      expect.arrayContaining([
        'Light bulbs',
        'Lighting',
        'Tampines',
        'Active',
        50,
        'Marked unavailable',
        'Under repair',
      ]),
    );
  });

  // EQUIP-UNAVAIL-07-A: the service groups the equipment update and audit insert in DatabaseService.transaction.
  it('EQUIP-UNAVAIL-07-A performs the update and audit insert in one transaction', async () => {
    // Arrange: all transaction-bound queries succeed.
    client.query
      .mockResolvedValueOnce({ rows: [activeEquipment] })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: confirm a valid unavailability change.
    await service.updateAvailability(technician, 'equipment-119', {
      isAvailable: false,
      reason: 'Faulty wiring detected',
    });

    // Assert: no write uses the pool directly; both writes execute through the transaction callback.
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(database.query).not.toHaveBeenCalled();
  });

  // EQUIP-UNAVAIL-07-B: the audit event receives the reason and authenticated email required by AC7.
  it('EQUIP-UNAVAIL-07-B records Screen cracked and the acting user email', async () => {
    // Arrange: an active record can be changed.
    client.query
      .mockResolvedValueOnce({ rows: [activeEquipment] })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: submit the case's known reason.
    await service.updateAvailability(technician, 'equipment-119', {
      isAvailable: false,
      reason: 'Screen cracked',
    });

    // Assert: the audit insert attributes the event to the JWT-derived email.
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/INSERT INTO equipment_audit_trail/i),
      expect.arrayContaining([
        'Screen cracked',
        'techsupport1@connectsphere.com',
      ]),
    );
  });

  // EQUIP-UNAVAIL-06-A: a previously unavailable record becomes available again.
  it('EQUIP-UNAVAIL-06-A reactivates unavailable equipment', async () => {
    // Arrange: the selected record is currently unavailable.
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: true }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: reactivate the equipment using the PATCH payload specified by the case.
    const result = await service.updateAvailability(
      technician,
      'equipment-119',
      { isAvailable: true },
    );

    // Assert: it returns to the available state.
    expect(result.equipment).toMatchObject({
      id: 'equipment-119',
      isAvailable: true,
    });
  });

  // EQUIP-UNAVAIL-05-B: reactivation creates a distinct Reactivated audit event.
  it('EQUIP-UNAVAIL-05-B writes a Reactivated audit entry', async () => {
    // Arrange: the selected equipment was previously unavailable.
    client.query
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: false }],
      })
      .mockResolvedValueOnce({
        rows: [{ ...activeEquipment, is_available: true }],
      })
      .mockResolvedValueOnce({ rows: [] });

    // Act: reactivate it.
    await service.updateAvailability(technician, 'equipment-119', {
      isAvailable: true,
    });

    // Assert: historical state differentiates reactivation from marking unavailable.
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/INSERT INTO equipment_audit_trail/i),
      expect.arrayContaining(['Reactivated', 'techsupport1@connectsphere.com']),
    );
  });

  // EQUIP-UNAVAIL-02-B: both empty forms of the required reason are rejected before an update or audit write can occur.
  it.each(['', '   '])(
    'EQUIP-UNAVAIL-02-B rejects a %j unavailability reason without side effects',
    async (reason) => {
      // Arrange: no database operation is needed for malformed input.

      // Act and assert: the validation boundary rejects the exact invalid value.
      await expect(
        service.updateAvailability(technician, 'equipment-119', {
          isAvailable: false,
          reason,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(database.transaction).not.toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();
    },
  );

  // EQUIP-UNAVAIL-07-SEC-1: no role other than Technical Support may change availability or write audit history.
  it.each(['ATTENDEE', 'ORGANISER'] as const)(
    'EQUIP-UNAVAIL-07-SEC-1 rejects %s without updating equipment or audit history',
    async (role) => {
      // Arrange: a non-Technical-Support session targets an otherwise valid record.
      const user = {
        ...technician,
        uid: role.toLowerCase(),
        roles: [role],
      } as AuthenticatedUser;

      // Act and assert: authorization occurs before any transaction can begin.
      await expect(
        service.updateAvailability(user, 'equipment-119', {
          isAvailable: false,
          reason: 'test',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );

  // EQUIP-UNAVAIL-07-SEC-1: an absent session is distinct from a forbidden authenticated role.
  it('EQUIP-UNAVAIL-07-SEC-1 rejects an unauthenticated availability update without side effects', async () => {
    // Act and assert: the unauthenticated request cannot start a transaction.
    await expect(
      service.updateAvailability(undefined, 'equipment-119', {
        isAvailable: false,
        reason: 'test',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
