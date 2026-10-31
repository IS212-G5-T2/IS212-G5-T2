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

  /** VEN-CONF-02-A: approval reports the conflict and returns its occupied interval to the review UI. */
  it('VEN-CONF-02-A SPM-56 includes conflicting occupied periods in the approval error', async () => {
    const conflicts = [{
      id: 'block-1', reason: 'Lecture Series', kind: 'booking' as const,
      start: '2030-01-12T03:20:00.000Z', end: '2030-01-12T04:00:00.000Z',
      occupiedStart: '2030-01-12T02:50:00.000Z', occupiedEnd: '2030-01-12T04:45:00.000Z',
      status: 'approved' as const,
    }];
    approveBooking.mockResolvedValue({
      kind: 'conflict',
      reason: 'Lecture Series',
      conflicts,
    });
    const failure = await service
      .approveVenueBooking(staff, bookingId)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toEqual({
      code: 'BOOKING_SLOT_CONFLICT',
      message:
        'This slot can no longer be approved because it conflicts with Lecture Series. Check availability again before approving.',
      conflicts,
    });
  });

  /** VEN-CONF-02-VAR-1: multiple distinct blocker names are joined as "A, B and C" with duplicates removed. */
  it('VEN-CONF-02-VAR-1 SPM-56 joins multiple distinct blocker names and removes duplicates', async () => {
    const conflicts = [
      { id: 'b1', reason: 'Alpha Event', kind: 'booking' as const, start: '2030-01-12T03:00:00.000Z', end: '2030-01-12T04:00:00.000Z', occupiedStart: '2030-01-12T03:00:00.000Z', occupiedEnd: '2030-01-12T04:00:00.000Z', status: 'approved' as const },
      { id: 'b2', reason: 'Beta Event', kind: 'booking' as const, start: '2030-01-12T03:30:00.000Z', end: '2030-01-12T04:30:00.000Z', occupiedStart: '2030-01-12T03:30:00.000Z', occupiedEnd: '2030-01-12T04:30:00.000Z', status: 'approved' as const },
      { id: 'b3', reason: 'Alpha Event', kind: 'booking' as const, start: '2030-01-12T04:00:00.000Z', end: '2030-01-12T05:00:00.000Z', occupiedStart: '2030-01-12T04:00:00.000Z', occupiedEnd: '2030-01-12T05:00:00.000Z', status: 'approved' as const },
    ];
    approveBooking.mockResolvedValue({ kind: 'conflict', reason: 'Alpha Event', conflicts });
    const failure = await service
      .approveVenueBooking(staff, bookingId)
      .catch((error: unknown) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'BOOKING_SLOT_CONFLICT',
      message: 'This slot can no longer be approved because it conflicts with Alpha Event and Beta Event. Check availability again before approving.',
    });
  });

  /** VEN-CONF-02-VAR-2: when the repository returns no conflict rows the lead-time reason string is used verbatim. */
  it('VEN-CONF-02-VAR-2 SPM-56 uses the repository reason string when conflicts array is empty', async () => {
    approveBooking.mockResolvedValue({
      kind: 'conflict',
      reason: 'The event is now inside the 336-hour lead-time minimum for a tentative hold.',
      conflicts: [],
    });
    const failure = await service
      .approveVenueBooking(staff, bookingId)
      .catch((error: unknown) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'BOOKING_SLOT_CONFLICT',
      message: 'The event is now inside the 336-hour lead-time minimum for a tentative hold.',
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

describe('SPM-121 venue service update', () => {
  const updateFn = vi.fn();
  const hasPermission = vi.fn();
  const venueId = 'b9c6f700-85b1-4a79-96d8-5f5c3fd616fb';
  const validBody = {
    name: 'Updated Hall',
    location: 'Block B Level 1',
    capacity: 80,
    facilities: ['Wi-Fi'],
    accessibility: [],
    layouts: ['Theatre'],
    operatingInformation: 'Open daily',
    setupTimeMinutes: 30,
    turnaroundTimeMinutes: 45,
  };
  const updatedVenue = { id: venueId, ...validBody, ownerId: staff.uid };
  const service = new VenuesService(
    { update: updateFn } as unknown as VenuesRepository,
    { hasPermission } as unknown as RbacRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    hasPermission.mockResolvedValue(true);
    updateFn.mockResolvedValue({
      kind: 'updated',
      venue: updatedVenue,
      affectedBookings: [],
      capacityBookings: [],
    });
  });

  /** VEN-UPD-05-SVC-A: unauthenticated caller gets 401. */
  it('VEN-UPD-05-SVC-A returns 401 when no identity is provided', async () => {
    await expect(service.update(undefined, venueId, validBody)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-05-SVC-B: non-staff role gets 403. */
  it('VEN-UPD-05-SVC-B returns 403 when the caller is not Venue Staff', async () => {
    await expect(service.update(coordinator, venueId, validBody)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-03-SVC-A: invalid venue UUID returns 404 before the repository is called. */
  it('VEN-UPD-03-SVC-A returns 404 for a non-UUID venue id', async () => {
    await expect(service.update(staff, 'not-a-uuid', validBody)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-04-SVC-A: duplicate name+location from the DB returns 409. */
  it('VEN-UPD-04-SVC-A maps the duplicate constraint to 409 with field errors', async () => {
    const pgDup = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'venues_name_location_unique',
    });
    updateFn.mockRejectedValueOnce(pgDup);
    await expect(service.update(staff, venueId, validBody)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(updateFn).toHaveBeenCalledOnce();
  });

  /** VEN-UPD-07-SVC-A: repository returning forbidden maps to 403. */
  it('VEN-UPD-07-SVC-A returns 403 when the repository says forbidden', async () => {
    updateFn.mockResolvedValueOnce({ kind: 'forbidden' });
    await expect(service.update(staff, venueId, validBody)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /** VEN-UPD-07-SVC-B: AC2 — a non-venue-staff role (e.g. coordinator) cannot edit any venue. */
  it('VEN-UPD-07-SVC-B returns 403 when the hasPermission check fails for a non-venue-staff role', async () => {
    hasPermission.mockResolvedValueOnce(false);
    await expect(service.update(staff, venueId, validBody)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-03-SVC-B: repository returning not-found maps to 404. */
  it('VEN-UPD-03-SVC-B returns 404 when the repository says not-found', async () => {
    updateFn.mockResolvedValueOnce({ kind: 'not-found' });
    await expect(service.update(staff, venueId, validBody)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /** VEN-UPD-05-SVC-C: successful update returns venue + booking lists + message. */
  it('VEN-UPD-05-SVC-C returns updated venue with affectedBookings and capacityBookings on success', async () => {
    const result = await service.update(staff, venueId, validBody);
    expect(result).toEqual({
      venue: updatedVenue,
      affectedBookings: [],
      capacityBookings: [],
      message: 'Venue updated successfully.',
    });
    expect(updateFn).toHaveBeenCalledWith(staff.uid, venueId, expect.objectContaining({ name: validBody.name }));
  });

  /** VEN-UPD-03-A: AC3 — submitting a body with an empty required field returns 400 before the repository is called. */
  it('VEN-UPD-03-A returns 400 with field errors when a required field is empty', async () => {
    await expect(
      service.update(staff, venueId, { ...validBody, name: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-03-B: AC3 — empty capacity, setup or turnaround is rejected, not silently stored. */
  it.each([
    { field: 'capacity', value: undefined },
    { field: 'setupTimeMinutes', value: undefined },
    { field: 'turnaroundTimeMinutes', value: undefined },
  ])('VEN-UPD-03-B rejects empty $field', async ({ field, value }) => {
    await expect(
      service.update(staff, venueId, { ...validBody, [field]: value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-03-C-SVC: AC3 — nonempty invalid capacity values are rejected. */
  it.each([0, -1, 1_000_001, 2.5])('VEN-UPD-03-C-SVC rejects capacity %s', async (capacity) => {
    await expect(
      service.update(staff, venueId, { ...validBody, capacity }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-02-BND-1-SVC: AC2 — capacity boundaries 1 and 1000000 are accepted through update. */
  it.each([1, 1_000_000])('VEN-UPD-02-BND-1-SVC accepts boundary capacity %s', async (capacity) => {
    const result = await service.update(staff, venueId, { ...validBody, capacity });
    expect(result.message).toBe('Venue updated successfully.');
    expect(updateFn).toHaveBeenCalledWith(staff.uid, venueId, expect.objectContaining({ capacity }));
  });

  /** VEN-UPD-03-D-SVC: AC3 — negative or fractional durations are rejected. */
  it.each([
    { field: 'setupTimeMinutes', value: -1 },
    { field: 'turnaroundTimeMinutes', value: -1 },
    { field: 'setupTimeMinutes', value: 1.5 },
  ])('VEN-UPD-03-D-SVC rejects $field=$value', async ({ field, value }) => {
    await expect(
      service.update(staff, venueId, { ...validBody, [field]: value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-02-BND-2-SVC: AC2 — zero durations are accepted; negative are rejected. */
  it('VEN-UPD-02-BND-2-SVC accepts zero setup and turnaround', async () => {
    const result = await service.update(staff, venueId, {
      ...validBody,
      setupTimeMinutes: 0,
      turnaroundTimeMinutes: 0,
    });
    expect(result.message).toBe('Venue updated successfully.');
    expect(updateFn).toHaveBeenCalledWith(
      staff.uid,
      venueId,
      expect.objectContaining({ setupTimeMinutes: 0, turnaroundTimeMinutes: 0 }),
    );
  });

  /** VEN-UPD-03-BND-1-SVC: AC3 — whitespace-only required strings are rejected. */
  it.each(['name', 'location', 'operatingInformation'])(
    'VEN-UPD-03-BND-1-SVC rejects whitespace-only %s',
    async (field) => {
      await expect(
        service.update(staff, venueId, { ...validBody, [field]: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(updateFn).not.toHaveBeenCalled();
    },
  );

  /** VEN-UPD-03-BND-2-SVC: AC3 — overlength text fields are rejected. */
  it.each([
    { field: 'name', length: 201 },
    { field: 'location', length: 301 },
    { field: 'operatingInformation', length: 201 },
  ])('VEN-UPD-03-BND-2-SVC rejects $field at $length chars', async ({ field, length }) => {
    await expect(
      service.update(staff, venueId, { ...validBody, [field]: 'x'.repeat(length) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-03-IMG-1-SVC: AC3 — invalid image type or oversized image is rejected. */
  it.each([
    { desc: 'text/plain type', image: { name: 'notes.txt', type: 'text/plain', size: 4, dataUrl: 'data:text/plain;base64,dGVzdA==' } },
    { desc: 'oversized PNG', image: { name: 'big.png', type: 'image/png', size: 5 * 1024 * 1024 + 1, dataUrl: 'data:image/png;base64,dGVzdA==' } },
  ])('VEN-UPD-03-IMG-1-SVC rejects $desc', async ({ image }) => {
    await expect(
      service.update(staff, venueId, { ...validBody, image }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFn).not.toHaveBeenCalled();
  });

  /** VEN-UPD-02-A-SVC: AC2 — all ten field groups are forwarded to the repository on update. */
  it('VEN-UPD-02-A-SVC forwards all venue fields including image to the repository', async () => {
    const image = { name: 'hall.png', type: 'image/png', size: 4, dataUrl: 'data:image/png;base64,dGVzdA==' };
    const fullBody = { ...validBody, image };
    await service.update(staff, venueId, fullBody);
    expect(updateFn).toHaveBeenCalledWith(staff.uid, venueId, expect.objectContaining({
      name: validBody.name,
      location: validBody.location,
      capacity: validBody.capacity,
      facilities: validBody.facilities,
      accessibility: validBody.accessibility,
      layouts: validBody.layouts,
      operatingInformation: validBody.operatingInformation,
      setupTimeMinutes: validBody.setupTimeMinutes,
      turnaroundTimeMinutes: validBody.turnaroundTimeMinutes,
      image,
    }));
  });

  /** VEN-UPD-07-SEC-1-SVC: AC7 — same-role, different-creator API attempt returns 403. */
  it('VEN-UPD-07-SEC-1-SVC rejects update from a different Venue Staff via API', async () => {
    updateFn.mockResolvedValueOnce({ kind: 'forbidden' });
    const otherStaff = { uid: 'other-staff-2', roles: ['VENUE_STAFF'] as string[] };
    await expect(
      service.update(otherStaff as AuthenticatedUser, venueId, validBody),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** VEN-UPD-05-B-SVC: AC5 — a failed save does not return a success message. */
  it('VEN-UPD-05-B-SVC throws instead of returning success when the repository errors', async () => {
    updateFn.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(service.update(staff, venueId, validBody)).rejects.toThrow('DB connection lost');
  });
});
