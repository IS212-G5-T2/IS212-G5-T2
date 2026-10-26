import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { RbacRepository } from '../auth/authorization/repository/rbac.repository.js';
import { VenuesService } from './venues.service.js';
import { VenuesRepository } from './repository/venues.repository.js';

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

  // SPM-124: the normal catalogue is shared; My venues alone derives an owner scope from the session.
  it('returns the shared catalogue by default and scopes only an explicit My venues request', async () => {
    const records = [{ id: venue.id }];
    list.mockResolvedValue(records);

    await expect(service.list(staff)).resolves.toBe(records);
    await expect(service.list(staff, true)).resolves.toBe(records);

    expect(list).toHaveBeenNthCalledWith(1, undefined);
    expect(list).toHaveBeenNthCalledWith(2, staff.uid);
    expect(hasPermission).toHaveBeenCalledWith('VENUE_STAFF', 'Venue', 'read');
  });

  // SPM-124: a second role must never reduce a Coordinator's read access.
  it('keeps the shared catalogue for Coordinators and dual-role accounts', async () => {
    await service.list(coordinator);
    await service.list({
      uid: 'dual-role',
      roles: ['COORDINATOR', 'VENUE_STAFF'],
    });

    expect(list).toHaveBeenNthCalledWith(1, undefined);
    expect(list).toHaveBeenNthCalledWith(2, undefined);
  });

  /** SPM54-UI-MODE-01: venue readers may browse without Coordinator booking capability, while missing or denied identities remain blocked. */
  it('SPM54-UI-MODE-01 allows read-only venue browsing and denies unauthorized reads', async () => {
    const records = [{ id: venue.id }];
    list.mockResolvedValue(records);

    await expect(service.list(staff)).resolves.toBe(records);
    await expect(service.list(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    hasPermission.mockResolvedValue(false);
    await expect(service.list(staff)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(list).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledWith(undefined);
    expect(hasPermission).toHaveBeenCalledWith('VENUE_STAFF', 'Venue', 'read');
  });

  // SPM-124: malformed and missing detail identifiers use the same not-found result.
  it('returns not found for malformed or absent venue IDs', async () => {
    get.mockResolvedValue(undefined);

    await expect(service.get(staff, 'invalid')).rejects.toMatchObject({
      status: 404,
    });
    expect(get).not.toHaveBeenCalled();
    await expect(
      service.get(staff, '00000000-0000-4000-8000-000000000124'),
    ).rejects.toMatchObject({ status: 404 });
    expect(get).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000124');
  });

  /** SPM-51 AC1: an authorized coordinator can read a venue before checking its schedule. */
  it('SPM54-UI-MODE-01 returns a readable venue record for browse-only access', async () => {
    get.mockResolvedValue(venue);

    await expect(
      service.get(coordinator, 'b9c6f700-85b1-4a79-96d8-5f5c3fd616fb'),
    ).resolves.toBe(venue);
    expect(get).toHaveBeenCalledWith(venue.id);
  });
});

describe('SPM-55 venue booking review service', () => {
  const bookingId = '6f0d6f3a-2c1e-4b59-9d8a-0c3b7e1f2a44';
  const listPendingVenueBookings = vi.fn();
  const approveBooking = vi.fn();
  const rejectBooking = vi.fn();
  const hasPermission = vi.fn();
  const service = new VenuesService(
    {
      listPendingVenueBookings,
      approveVenueBooking: approveBooking,
      rejectVenueBooking: rejectBooking,
    } as unknown as VenuesRepository,
    { hasPermission } as unknown as RbacRepository,
  );
  const decided = {
    id: bookingId,
    eventId: 'event-1',
    venueId: venue.id,
    status: 'approved' as const,
    start: '2030-01-12T04:00:00.000Z',
    end: '2030-01-12T05:00:00.000Z',
    bookingReference: 'VB-6F0D6F3A',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    hasPermission.mockResolvedValue(true);
  });

  /** VEN-REV-01-A: only Venue Staff with venue update permission can list pending requests. */
  it('SPM-55 AC1 lists pending requests for Venue Staff and rejects other callers before any query', async () => {
    listPendingVenueBookings.mockResolvedValue([{ id: bookingId }]);
    await expect(service.listPendingVenueBookings(staff)).resolves.toEqual([
      { id: bookingId },
    ]);
    expect(listPendingVenueBookings).toHaveBeenCalledWith(staff.uid);
    // The gate checks the Venue update permission specifically, not a read permission.
    expect(hasPermission).toHaveBeenCalledWith('VENUE_STAFF', 'Venue', 'update');

    await expect(
      service.listPendingVenueBookings(coordinator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listPendingVenueBookings(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(listPendingVenueBookings).toHaveBeenCalledTimes(1);
  });

  /** VEN-REV-01-C: a Venue Staff member without venue update permission is denied the pending list. */
  it('SPM-55 AC1 denies the pending list when the Venue update permission is missing', async () => {
    hasPermission.mockResolvedValue(false);
    await expect(
      service.listPendingVenueBookings(staff),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listPendingVenueBookings).not.toHaveBeenCalled();
  });

  /** VEN-REV-02-A: approval confirms the booking for the authenticated owner and returns the updated record. */
  it('SPM-55 AC2 approves a pending request using the verified staff identity', async () => {
    approveBooking.mockResolvedValue({ kind: 'decided', booking: decided });
    await expect(
      service.approveVenueBooking(staff, bookingId),
    ).resolves.toEqual(decided);
    expect(approveBooking).toHaveBeenCalledWith(staff.uid, bookingId);
  });

  /** VEN-REV-02-C: approval of a booking outside the caller's venues is reported as not found. */
  it('SPM-55 AC2 reports a missing or foreign booking as not found on approval', async () => {
    approveBooking.mockResolvedValue({ kind: 'not-found' });
    await expect(
      service.approveVenueBooking(staff, bookingId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** VEN-REV-02-C: a malformed booking ID is rejected before the repository is queried. */
  it('SPM-55 AC2 rejects a malformed booking ID on approval without querying', async () => {
    await expect(
      service.approveVenueBooking(staff, 'not-a-uuid'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(approveBooking).not.toHaveBeenCalled();
  });

  /** VEN-REV-01-C: a non-Venue-Staff caller cannot approve or reject. */
  it('SPM-55 AC2 AC3 denies approval and rejection to Coordinators without querying', async () => {
    await expect(
      service.approveVenueBooking(coordinator, bookingId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.rejectVenueBooking(coordinator, bookingId, { reason: 'Clash' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.approveVenueBooking(undefined, bookingId),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(approveBooking).not.toHaveBeenCalled();
    expect(rejectBooking).not.toHaveBeenCalled();
  });

  /** VEN-REV-06-A: a cancelled, approved or rejected request returns a clear 409 and is not changed. */
  it.each(['cancelled', 'approved', 'rejected', 'released'])('SPM-55 AC6 returns BOOKING_ALREADY_DECIDED when approving a %s request', async (status) => {
      approveBooking.mockResolvedValue({ kind: 'already-decided', status });
      const failure = await service
        .approveVenueBooking(staff, bookingId)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure as ConflictException).getResponse()).toEqual({
        code: 'BOOKING_ALREADY_DECIDED',
        message: `This booking request is already ${status} and can no longer be approved or rejected.`,
      });
    },
  );

  /** VEN-REV-02-B: approval re-checks the slot and reports the overlapping booking instead of double-booking. */
  it('SPM-55 AC2 returns BOOKING_SLOT_CONFLICT when the slot is taken at approval time', async () => {
    approveBooking.mockResolvedValue({
      kind: 'conflict',
      reason: 'Lecture Series',
    });
    const failure = await service
      .approveVenueBooking(staff, bookingId)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toEqual({
      code: 'BOOKING_SLOT_CONFLICT',
      message:
        'This slot can no longer be approved because it conflicts with Lecture Series. Check availability again before approving.',
    });
  });

  /** VEN-REV-03-A: rejection stores the trimmed, non-empty reason and returns the rejected booking. */
  it('SPM-55 AC3 rejects a pending request with the trimmed reason', async () => {
    rejectBooking.mockResolvedValue({
      kind: 'decided',
      booking: {
        ...decided,
        status: 'rejected',
        rejectionReason: 'Clashes with maintenance',
      },
    });
    await expect(
      service.rejectVenueBooking(staff, bookingId, {
        reason: '  Clashes with maintenance  ',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      rejectionReason: 'Clashes with maintenance',
    });
    expect(rejectBooking).toHaveBeenCalledWith(
      staff.uid,
      bookingId,
      'Clashes with maintenance',
    );
  });

  /** VEN-REV-03-B: a rejection without a non-empty reason is refused before any write. */
  it.each([
    ['a missing body', undefined],
    ['a non-object body', 'Clash'],
    ['a missing reason', {}],
    ['a non-string reason', { reason: 42 }],
    ['a whitespace-only reason', { reason: '   ' }],
  ])('SPM-55 AC3 refuses rejection with %s', async (_label, body) => {
    const failure = await service
      .rejectVenueBooking(staff, bookingId, body)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BadRequestException);
    expect((failure as BadRequestException).getResponse()).toEqual({
      message: 'A rejection reason is required.',
      errors: { reason: 'Enter why this booking cannot be accepted.' },
    });
    expect(rejectBooking).not.toHaveBeenCalled();
  });

  /** VEN-REV-03-B: a reason longer than the 1000-character limit is refused, while exactly 1000 characters is accepted. */
  it('SPM-55 AC3 enforces the 1000-character rejection reason limit', async () => {
    const tooLong = { reason: 'x'.repeat(1001) };
    const failure = await service
      .rejectVenueBooking(staff, bookingId, tooLong)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BadRequestException);
    expect((failure as BadRequestException).getResponse()).toEqual({
      message: 'The rejection reason is too long.',
      errors: { reason: 'Use 1000 characters or fewer.' },
    });
    expect(rejectBooking).not.toHaveBeenCalled();

    rejectBooking.mockResolvedValue({ kind: 'decided', booking: decided });
    await service.rejectVenueBooking(staff, bookingId, {
      reason: 'x'.repeat(1000),
    });
    expect(rejectBooking).toHaveBeenCalledTimes(1);

    // The limit applies after trimming: 1010 raw characters that trim to 990 are accepted and stored trimmed.
    const padded = `${' '.repeat(10)}${'x'.repeat(990)}${' '.repeat(10)}`;
    expect(padded.length).toBe(1010);
    await service.rejectVenueBooking(staff, bookingId, { reason: padded });
    expect(rejectBooking).toHaveBeenCalledTimes(2);
    expect(rejectBooking).toHaveBeenLastCalledWith(staff.uid, bookingId, 'x'.repeat(990));
  });

  /** VEN-REV-06-A: rejecting an already decided or cancelled request returns 409 with the decided status. */
  it.each(['cancelled', 'approved', 'rejected', 'released'])('SPM-55 AC6 returns BOOKING_ALREADY_DECIDED when rejecting a %s request', async (status) => {
      rejectBooking.mockResolvedValue({ kind: 'already-decided', status });
      const failure = await service
        .rejectVenueBooking(staff, bookingId, { reason: 'Clash' })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure as ConflictException).getResponse()).toEqual({
        code: 'BOOKING_ALREADY_DECIDED',
        message: `This booking request is already ${status} and can no longer be approved or rejected.`,
      });
    },
  );

  /** VEN-REV-03-C: rejecting a booking outside the caller's venues is reported as not found. */
  it('SPM-55 AC3 reports a missing or foreign booking as not found on rejection', async () => {
    rejectBooking.mockResolvedValue({ kind: 'not-found' });
    await expect(
      service.rejectVenueBooking(staff, bookingId, { reason: 'Clash' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // A malformed ID must be refused before the repository is queried; clear the valid call above first.
    rejectBooking.mockClear();
    await expect(
      service.rejectVenueBooking(staff, 'not-a-uuid', { reason: 'Clash' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rejectBooking).not.toHaveBeenCalled();
  });

  /** VEN-REV-03-D: authorization runs before reason validation, so a Coordinator with an empty reason gets 403, not 400. */
  it('SPM-55 AC3 denies a Coordinator with an invalid rejection body before validating the reason', async () => {
    await expect(
      service.rejectVenueBooking(coordinator, bookingId, { reason: '   ' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.rejectVenueBooking(coordinator, bookingId, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rejectBooking).not.toHaveBeenCalled();
  });
});
