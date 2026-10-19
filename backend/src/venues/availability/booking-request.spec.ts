import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { RbacRepository } from '../../auth/authorization/repository/rbac.repository.js';
import { VenuesRepository } from '../repository/venues.repository.js';
import { VenuesService } from '../venues.service.js';

const venueId = '00000000-0000-4000-8000-000000000124';
const eventId = '00000000-0000-4000-8000-000000000125';
const coordinator: AuthenticatedUser = {
  uid: '00000000-0000-4000-8000-000000000126',
  roles: ['COORDINATOR'],
};
const body = {
  eventId,
  start: '2030-01-12T04:00:00.000Z',
  end: '2030-01-12T05:00:00.000Z',
};

describe('SPM-51 venue booking request submission', () => {
  const submitBookingRequest = vi.fn();
  const listCoordinatorBookings = vi.fn();
  const cancelCoordinatorBooking = vi.fn();
  const service = new VenuesService(
    {
      submitBookingRequest,
      listCoordinatorBookings,
      cancelCoordinatorBooking,
    } as unknown as VenuesRepository,
    {} as RbacRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  /** VEN-AVL-07-SEC-1: an API conflict refuses the request and leaves persistence untouched. */
  it('returns a conflict when the fresh schedule check finds a new booking', async () => {
    submitBookingRequest.mockResolvedValue({
      kind: 'conflict',
      reason: 'Workshop',
    });
    listCoordinatorBookings.mockResolvedValue([]);

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(submitBookingRequest).toHaveBeenCalledWith(
      venueId,
      coordinator.uid,
      body,
    );
  });

  /** SPM-54 AC7: the Coordinator gets a stable 409 when an active request already exists for this event and venue. */
  it('returns a conflict for an active event and venue duplicate', async () => {
    submitBookingRequest.mockResolvedValue({
      kind: 'already-requested',
      id: 'booking-existing',
      status: 'pending',
    });

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ACTIVE_VENUE_REQUEST_EXISTS',
      }),
    });
    expect(submitBookingRequest).toHaveBeenCalledOnce();
  });

  /** VEN-AVL-06-A: a conflict-free request returns its persisted pending booking reference. */
  it('returns the recorded request and booking reference after persistence succeeds', async () => {
    submitBookingRequest.mockResolvedValue({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000099',
      start: body.start,
      end: body.end,
    });

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000099',
      eventId,
      venueId,
      start: body.start,
      end: body.end,
      status: 'pending',
      bookingReference: 'VB-00000000',
    });
  });

  /** SPM-51 AC6: only a coordinator role can submit a request. Kills: role-check removal (B07). */
  it('rejects anonymous and non-coordinator callers before persistence', async () => {
    await expect(
      service.submitBookingRequest(undefined, venueId, body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.submitBookingRequest(
        { uid: 'staff', roles: ['VENUE_STAFF'] },
        venueId,
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  /** SPM-51 AC6: malformed venue identifiers are rejected before repository access. */
  it('returns not found for an invalid venue identifier', async () => {
    await expect(
      service.submitBookingRequest(coordinator, 'bad-id', body),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  /** VEN-BKG-03-SEC-2: an unassigned Coordinator cannot create a venue request for another Coordinator's event. */
  it('VEN-BKG-03-SEC-2 SPM-54 refuses an event not assigned to the caller', async () => {
    submitBookingRequest.mockResolvedValue({ kind: 'event-not-assigned' });

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** SPM-51 AC6: a venue removed before submission is reported as not found. */
  it('returns not found when the repository cannot lock the selected venue', async () => {
    submitBookingRequest.mockResolvedValue({ kind: 'venue-not-found' });

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /** VEN-BKG-02-B: an event outside the open-for-booking states is blocked at the service boundary. */
  it('SPM-54 preserves the closed-event conflict response without creating a request', async () => {
    submitBookingRequest.mockResolvedValue({
      kind: 'event-not-open',
      status: 'Submitted',
    });

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EVENT_NOT_OPEN_FOR_BOOKING',
      }),
    });
    expect(submitBookingRequest).toHaveBeenCalledOnce();
  });

  /** VEN-BKG-08-SEC-1: only the authenticated Coordinator can read bookings scoped to their assignment. */
  it('VEN-BKG-08-SEC-1 SPM-54 scopes the booking list to an authenticated Coordinator', async () => {
    listCoordinatorBookings.mockResolvedValue([{ id: 'booking-1' }]);
    await expect(service.listCoordinatorBookings(coordinator)).resolves.toEqual(
      [{ id: 'booking-1' }],
    );
    expect(listCoordinatorBookings).toHaveBeenCalledWith(coordinator.uid);
    await expect(
      service.listCoordinatorBookings(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.listCoordinatorBookings({ uid: 'staff', roles: ['VENUE_STAFF'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** VEN-BKG-09-SEC-1: malformed or unowned booking identifiers do not cancel another event's request. */
  it('VEN-BKG-09-SEC-1 SPM-54 rejects malformed and unowned venue booking cancellations', async () => {
    await expect(
      service.cancelCoordinatorBooking(coordinator, 'bad-id', false),
    ).rejects.toBeInstanceOf(NotFoundException);
    cancelCoordinatorBooking.mockResolvedValue({ kind: 'not-found' });
    await expect(
      service.cancelCoordinatorBooking(coordinator, venueId, false),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.cancelCoordinatorBooking(undefined, venueId, false),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.cancelCoordinatorBooking(
        { uid: 'staff', roles: ['VENUE_STAFF'] },
        venueId,
        false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** VEN-BKG-09-A: only active booking statuses can be cancelled; cancelled history rows remain unchanged. */
  it('SPM-54 refuses inactive bookings and returns retained cancellation status for active bookings', async () => {
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'not-active' });
    await expect(
      service.cancelCoordinatorBooking(coordinator, venueId, true),
    ).rejects.toBeInstanceOf(ConflictException);
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'cancelled' });
    await expect(
      service.cancelCoordinatorBooking(coordinator, venueId, true),
    ).resolves.toEqual({ id: venueId, status: 'cancelled' });
  });

  /** VEN-BKG-10-A and VEN-BKG-10-SEC-1: a last-active cancellation without the agreed confirmation boolean returns a warning. */
  it('VEN-BKG-10-A VEN-BKG-10-SEC-1 SPM-54 requires explicit confirmation for the last active booking', async () => {
    cancelCoordinatorBooking.mockResolvedValue({ kind: 'last-active' });
    await expect(
      service.cancelCoordinatorBooking(coordinator, venueId, false),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LAST_ACTIVE_VENUE_BOOKING',
        requiresConfirmation: true,
      }),
    });
  });
});
