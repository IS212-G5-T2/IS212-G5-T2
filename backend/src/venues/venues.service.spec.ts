import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { RbacRepository } from '../auth/authorization/rbac.repository.js';
import { VenuesService } from './venues.service.js';
import { VenuesRepository } from './venues.repository.js';

const staff: AuthenticatedUser = { uid: 'staff-1', roles: ['VENUE_STAFF'] };
const coordinator: AuthenticatedUser = {
  uid: 'coord-1',
  roles: ['COORDINATOR'],
};
const venue = {
  id: 'b9c6f700-85b1-4a79-96d8-5f5c3fd616fb',
  name: 'Orchid Hall Test',
  location: 'Test Building Level 3',
  capacity: 120,
  facilities: ['AV System', 'Wi-Fi'],
  accessibility: ['Wheelchair access'],
  layouts: ['Classroom', 'Theatre'],
  operatingInformation: 'Closed on public holidays',
  operatingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  operatingStartTime: '08:00',
  operatingEndTime: '22:00',
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};
const venueInput = {
  name: venue.name,
  location: venue.location,
  capacity: venue.capacity,
  facilities: venue.facilities,
  accessibility: venue.accessibility,
  layouts: venue.layouts,
  operatingInformation: venue.operatingInformation,
  operatingDays: venue.operatingDays,
  operatingStartTime: venue.operatingStartTime,
  operatingEndTime: venue.operatingEndTime,
  setupTimeMinutes: venue.setupTimeMinutes,
  turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
};
describe('SPM-50 venue service', () => {
  const create = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const hasPermission = vi.fn();
  const service = new VenuesService(
    { create, list, get } as unknown as VenuesRepository,
    { hasPermission } as unknown as RbacRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    hasPermission.mockResolvedValue(true);
    create.mockResolvedValue(venue);
    list.mockResolvedValue([]);
  });

  // SPM-50 / VEN-CRE-01-B / AC1: a Coordinator without Venue create permission cannot save.
  it('denies creation without Venue create permission and never queries for an insert', async () => {
    // Arrange a denied permission.
    hasPermission.mockResolvedValue(false);
    // Act and assert access is denied before persistence.
    await expect(
      service.create(coordinator, venueInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  // SPM-50 / AC1 authorization regression: missing sessions must never reach the protected venue write.
  it('rejects unauthenticated creates', async () => {
    // Act and assert the write stops before database access.
    await expect(service.create(undefined, venueInput)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.create({ uid: '', roles: ['VENUE_STAFF'] }, venueInput),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
  });

  // SPM-50 / VEN-CRE-04-A, VEN-CRE-05-A, VEN-CRE-05-B: a valid request saves one complete record and confirms success.
  it('creates a venue with a successful confirmation', async () => {
    // Act using the complete Confluence fixture.
    const response = await service.create(staff, venueInput);
    // Assert exact mapping and repository input.
    expect(response).toEqual({ venue, message: 'Venue created successfully.' });
    expect(create).toHaveBeenCalledWith(staff.uid, venueInput);
  });

  // SPM-50 owner rule: request fields cannot replace the verified creator ID.
  it('uses the authenticated owner for each create and ignores a spoofed owner', async () => {
    // Arrange two staff sessions and a client payload carrying a false owner.
    const otherStaff: AuthenticatedUser = {
      uid: 'staff-2',
      roles: ['VENUE_STAFF'],
    };
    const spoofed = {
      ...venueInput,
      owner_user_id: 'attacker-id',
      ownerUserId: 'attacker-id',
    };

    // Act through the service with each verified identity.
    await service.create(staff, spoofed);
    await service.create(otherStaff, spoofed);

    // Assert only the server identity is forwarded to persistence.
    expect(create).toHaveBeenNthCalledWith(1, staff.uid, venueInput);
    expect(create).toHaveBeenNthCalledWith(2, otherStaff.uid, venueInput);
  });

  // SPM-50 / VEN-CRE-03-A: invalid input is blocked before SQL even when staff is authorized.
  it('blocks invalid input without writing a record', async () => {
    // Act with a missing field and assert no insert.
    await expect(
      service.create(staff, { ...venueInput, name: '' }),
    ).rejects.toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  // SPM-50 / AC5 regression: other database errors propagate to standard error handling.
  it('propagates unexpected persistence errors', async () => {
    // Arrange a generic failure and assert it is preserved.
    const failure = new Error('database unavailable');
    create.mockRejectedValue(failure);
    await expect(service.create(staff, venueInput)).rejects.toBe(failure);
  });

  // SPM-50 duplicate prevention: PostgreSQL's normalized name/location conflict becomes a clear API error.
  it('reports a duplicate venue name and location as a field-level conflict', async () => {
    create.mockRejectedValue({
      code: '23505',
      constraint: 'venues_name_location_unique',
    });

    const result = service.create(staff, venueInput);

    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toMatchObject({
      response: {
        message: 'A venue with this name and location already exists.',
        errors: {
          name: 'Use a different venue name or location.',
          location: 'Use a different venue name or location.',
        },
      },
    });
  });

  // SPM-50 duplicate prevention: unrelated database uniqueness errors are not misreported as venue duplicates.
  it('propagates a uniqueness error from another constraint', async () => {
    const failure = { code: '23505', constraint: 'another_constraint' };
    create.mockRejectedValue(failure);

    await expect(service.create(staff, venueInput)).rejects.toBe(failure);
  });

  // SPM-50 / AC1 authorization regression: multi-role accounts may use any granted Venue permission.
  it('allows a second role when the first has no permission', async () => {
    // Arrange a denied and then allowed role.
    hasPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    // Act and assert the authorized create succeeds.
    expect(
      await service.create(
        { uid: 'both', roles: ['ORGANISER', 'VENUE_STAFF'] },
        venueInput,
      ),
    ).toEqual({ venue, message: 'Venue created successfully.' });
    expect(create).toHaveBeenCalledWith('both', venueInput);
  });

  // SPM-124: Venue Staff reads are restricted to the verified owner ID.
  it('scopes Venue Staff catalogue reads to their verified user ID', async () => {
    const records = [{ id: venue.id }];
    list.mockResolvedValue(records);

    await expect(service.list(staff)).resolves.toBe(records);

    expect(list).toHaveBeenCalledWith(staff.uid);
    expect(hasPermission).toHaveBeenCalledWith('VENUE_STAFF', 'Venue', 'read');
  });

  // SPM-124: Coordinators retain full read access and a staff role takes precedence on dual-role accounts.
  it('gives Coordinators the full catalogue while dual-role staff remain scoped', async () => {
    await service.list(coordinator);
    await service.list({ uid: 'dual-role', roles: ['COORDINATOR', 'VENUE_STAFF'] });

    expect(list).toHaveBeenNthCalledWith(1, undefined);
    expect(list).toHaveBeenNthCalledWith(2, 'dual-role');
  });

  // SPM-124: malformed and missing detail identifiers use the same not-found result.
  it('returns not found for malformed or absent venue IDs', async () => {
    get.mockResolvedValue(undefined);

    await expect(service.get(staff, 'invalid')).rejects.toMatchObject({ status: 404 });
    await expect(
      service.get(staff, '00000000-0000-4000-8000-000000000124'),
    ).rejects.toMatchObject({ status: 404 });
    expect(get).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000124', staff.uid);
  });
});
