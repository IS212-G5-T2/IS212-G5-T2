/*
 * Unit tests for the RBAC repository's database boundary and permission-row
 * interpretation.
 */
import { DatabaseService } from '../../database/database.service.js';
import { PermissionAction } from '../models/auth.models.js';
import { RbacRepository } from './rbac.repository.js';

describe('RbacRepository', () => {
  describe('intended behavior', () => {
    describe('buildPermissionPredicate', () => {
      it.each([
        ['create', '"create"'],
        ['read', '"read"'],
        ['update', '"update"'],
        ['delete', '"delete"'],
      ] as const)('selects the %s permission column', (action, column) => {
        const query = vi.fn();
        const database = { query } as unknown as DatabaseService;
        const repository = new RbacRepository(database);

        const predicate = repository.buildPermissionPredicate(action);

        expect(predicate).toContain(`rp.${column} = true`);
        expect(predicate).toContain('r.name = ANY($1::text[])');
        expect(predicate).toContain('lower(res.name) = lower($2)');
        expect(query).not.toHaveBeenCalled();
      });
    });

    it.each(roleResourcePermissions)(
      'checks $role permissions for $resource (CRUD: $crud)',
      async ({ role, resource, crud }) => {
        const query = vi.fn();
        crudActions.forEach((_, index) => {
          query.mockResolvedValueOnce({
            rows: [{ allowed: crud[index] === '1' }],
          });
        });

        const database = { query } as unknown as DatabaseService;
        const repository = new RbacRepository(database);
        const actualCrud = await Promise.all(
          crudActions.map((action) =>
            repository.hasPermission(role, resource, action),
          ),
        );

        expect(actualCrud.map((allowed) => (allowed ? '1' : '0')).join('')).toBe(
          crud,
        );
        expect(query).toHaveBeenCalledTimes(crudActions.length);
        expect(query.mock.calls.map(([, params]) => params)).toEqual(
          crudActions.map((action) => [action, role, resource]),
        );
      },
    );
  });

  describe('unintended behavior', () => {
    it('rejects an arbitrary or injected permission column', () => {
      const repository = new RbacRepository({} as DatabaseService);
      const invalidAction =
        'audit_log; DROP TABLE roles; --' as PermissionAction;

      expect(() => repository.buildPermissionPredicate(invalidAction)).toThrow(
        'Unsupported permission action',
      );
    });

    it('denies an action when no permission row is found', async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new RbacRepository(database);

      await expect(
        repository.hasPermission('ATTENDEE', 'Event', 'delete'),
      ).resolves.toBe(false);
    });

    it('denies an explicitly disallowed permission', async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [{ allowed: false }],
      });
      const database = { query } as unknown as DatabaseService;
      const repository = new RbacRepository(database);

      await expect(
        repository.hasPermission('ORGANISER', 'Event', 'delete'),
      ).resolves.toBe(false);
    });

    it('does not treat a truthy non-boolean value as allowed', async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [{ allowed: 'true' }],
      });
      const database = { query } as unknown as DatabaseService;
      const repository = new RbacRepository(database);

      await expect(
        repository.hasPermission('ATTENDEE', 'Event', 'create'),
      ).resolves.toBe(false);
    });
  });
});

const crudActions = ['create', 'read', 'update', 'delete'] as const;

const rolePermissionMatrix = [
  {
    role: 'ORGANISER',
    permissions: {
      Event: '1110',
      'Event Review': '0100',
      'Event Change Request': '1100',
      Venue: '0000',
      'Venue Unavailability': '0000',
      'Venue Booking': '0000',
      'Equipment Request': '0000',
      'Equipment Reservation': '0000',
      'Attendee Registration': '0100',
      Notification: '0100',
    },
  },
  {
    role: 'COORDINATOR',
    permissions: {
      Event: '0110',
      'Event Review': '1110',
      'Event Change Request': '0110',
      Venue: '0100',
      'Venue Unavailability': '0100',
      'Venue Booking': '1110',
      'Equipment Request': '1110',
      'Equipment Reservation': '0100',
      'Attendee Registration': '0100',
      Notification: '0100',
    },
  },
  {
    role: 'VENUE_STAFF',
    permissions: {
      Event: '0100',
      'Event Review': '0000',
      'Event Change Request': '0000',
      Venue: '1110',
      'Venue Unavailability': '1111',
      'Venue Booking': '0110',
      'Equipment Request': '0000',
      'Equipment Reservation': '0000',
      'Attendee Registration': '0000',
      Notification: '0100',
    },
  },
  {
    role: 'TECH_SUPPORT',
    permissions: {
      Event: '0100',
      'Event Review': '0000',
      'Event Change Request': '0000',
      Venue: '0000',
      'Venue Unavailability': '0000',
      'Venue Booking': '0000',
      'Equipment Request': '0110',
      'Equipment Reservation': '1111',
      'Attendee Registration': '0000',
      Notification: '0100',
    },
  },
  {
    role: 'ATTENDEE',
    permissions: {
      Event: '0100',
      'Event Review': '0000',
      'Event Change Request': '0000',
      Venue: '0000',
      'Venue Unavailability': '0000',
      'Venue Booking': '0000',
      'Equipment Request': '0000',
      'Equipment Reservation': '0000',
      'Attendee Registration': '1101',
      Notification: '0100',
    },
  },
] as const;

const roleResourcePermissions = rolePermissionMatrix.flatMap(
  ({ role, permissions }) =>
    Object.entries(permissions).map(([resource, crud]) => ({
      role,
      resource,
      crud,
    })),
);
