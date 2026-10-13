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
  const service = new VenuesService(
    { submitBookingRequest } as unknown as VenuesRepository,
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

    await expect(
      service.submitBookingRequest(coordinator, venueId, body),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(submitBookingRequest).toHaveBeenCalledWith(
      venueId,
      coordinator.uid,
      body,
    );
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

  /** VEN-AVL-07-SEC-1: only the assigned coordinator role can submit a request. */
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

  /** SPM-51 AC1: malformed venue identifiers are rejected before repository access. */
  it('returns not found for an invalid venue identifier', async () => {
    await expect(
      service.submitBookingRequest(coordinator, 'bad-id', body),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  /** VEN-AVL-06-B: a request cannot be attached to another coordinator's event. */
  it('returns not found when the selected event is not assigned to the caller', async () => {
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
});
