import {
  BadRequestException,
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
const eventId = '00000000-0000-4000-8000-000000000159';
const coordinator: AuthenticatedUser = {
  uid: '00000000-0000-4000-8000-000000000126',
  roles: ['COORDINATOR'],
};
const start = '2030-01-25T10:00:00.000Z';
const end = '2030-01-25T12:00:00.000Z';

describe('SPM-159 tentative hold requests', () => {
  const submitTentativeHoldRequest = vi.fn();
  const submitBookingRequest = vi.fn();
  const service = new VenuesService(
    { submitTentativeHoldRequest, submitBookingRequest } as unknown as VenuesRepository,
    {} as RbacRepository,
  );

  beforeEach(() => vi.resetAllMocks());

  /** VEN-HOLD-05-A/06-A: an eligible hold request returns Pending and explicitly says the hold is not active. */
  it('VEN-HOLD-05-A returns approval-pending confirmation after the repository saves the request', async () => {
    submitTentativeHoldRequest.mockResolvedValue({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000777',
      start,
      end,
    });
    const result = await service.submitTentativeHoldRequest(coordinator, venueId, {
      eventId,
    });
    expect(result).toMatchObject({
      eventId,
      venueId,
      start,
      end,
      status: 'pending',
      holdDurationHours: 336,
      holdStartsAt: 'venue-staff-approval',
    });
    expect(result.message).toContain('Venue Staff approval');
    expect(result.message).toContain('not active yet');
    expect(submitTentativeHoldRequest).toHaveBeenCalledWith(venueId, coordinator.uid, {
      eventId,
    });
  });

  /** VEN-HOLD-05-SUP-DISPATCH: the shared booking endpoint routes the hold discriminator to hold persistence. */
  it('VEN-HOLD-05-SUP-DISPATCH routes a tentative hold through booking request submission and preserves its note', async () => {
    submitTentativeHoldRequest.mockResolvedValue({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000777',
      start,
      end,
      specialRequest: 'Microphones, please.',
    });
    const result = await service.submitBookingRequest(coordinator, venueId, {
      eventId,
      request_kind: 'tentative_hold',
      specialRequest: 'Microphones, please.',
    });
    expect(result).toMatchObject({
      requestKind: 'tentative_hold',
      specialRequest: 'Microphones, please.',
    });
    expect(submitTentativeHoldRequest).toHaveBeenCalledWith(venueId, coordinator.uid, {
      eventId,
      request_kind: 'tentative_hold',
      specialRequest: 'Microphones, please.',
    });
  });

  /** VEN-HOLD-01-SUP-BOOKING-DISPATCH: the shared endpoint preserves ordinary booking dispatch when no hold discriminator is supplied. */
  it('VEN-HOLD-01-SUP-BOOKING-DISPATCH routes an ordinary booking request through existing persistence', async () => {
    submitBookingRequest.mockResolvedValue({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000778',
      start,
      end,
      eventStatus: 'planning',
      statusChanged: false,
    });
    const result = await service.submitBookingRequest(coordinator, venueId, {
      eventId,
      start,
      end,
    });
    expect(result).toMatchObject({ eventId, venueId, start, end, status: 'pending' });
    expect(submitBookingRequest).toHaveBeenCalledWith(venueId, coordinator.uid, {
      eventId,
      start,
      end,
    });
    expect(submitTentativeHoldRequest).not.toHaveBeenCalled();
  });

  /** VEN-HOLD-01-SEC-1: only the authenticated assigned Coordinator can request a tentative hold. */
  it('VEN-HOLD-01-SEC-1 rejects missing and non-Coordinator identities', async () => {
    await expect(
      service.submitTentativeHoldRequest(undefined, venueId, { eventId }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.submitTentativeHoldRequest(
        { uid: 'staff', roles: ['VENUE_STAFF'] },
        venueId,
        { eventId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(submitTentativeHoldRequest).not.toHaveBeenCalled();
  });

  /** VEN-HOLD-12-SUP-INPUT: malformed venue ids and extra client timing fields fail closed. */
  it('VEN-HOLD-12-SUP-INPUT validates the venue route and refuses client timing fields', async () => {
    await expect(
      service.submitTentativeHoldRequest(coordinator, 'bad-id', { eventId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, {
        eventId,
        start,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(submitTentativeHoldRequest).not.toHaveBeenCalled();
  });

  /** VEN-HOLD-09-B/09-C: same-pair Pending requests and Active holds return a stable duplicate refusal. */
  it('VEN-HOLD-09-B returns a conflict when a same-pair request already exists', async () => {
    submitTentativeHoldRequest.mockResolvedValue({
      kind: 'already-requested',
      status: 'pending',
    });
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, { eventId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACTIVE_VENUE_REQUEST_EXISTS' }),
    });
  });

  /** VEN-HOLD-03-A: the server refuses a request when the buffered occupied start is too close. */
  it('VEN-HOLD-03-A maps insufficient lead time to a reason the Coordinator can fix', async () => {
    submitTentativeHoldRequest.mockResolvedValue({ kind: 'lead-time' });
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, { eventId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TENTATIVE_HOLD_LEAD_TIME' }),
    });
  });

  /** VEN-HOLD-02-B: unavailable venue setup/turnaround configuration creates no request and explains the refusal. */
  it('VEN-HOLD-02-B reports unavailable timing configuration', async () => {
    submitTentativeHoldRequest.mockResolvedValue({
      kind: 'configuration-unavailable',
    });
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, { eventId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VENUE_TIMING_UNAVAILABLE' }),
    });
  });

  /** VEN-HOLD-07-B/C and VEN-HOLD-12-B: conflicts return a retryable reason without success confirmation. */
  it('VEN-HOLD-07-B maps a current occupied-period conflict to an actionable error', async () => {
    submitTentativeHoldRequest.mockResolvedValue({
      kind: 'conflict',
      reason: 'Existing event',
    });
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, { eventId }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VENUE_SCHEDULE_CONFLICT' }),
    });
  });

  /** VEN-HOLD-01-A: unknown venues, unassigned events, and closed event states leave the request path unavailable. */
  it.each([
    [{ kind: 'venue-not-found' }, NotFoundException],
    [{ kind: 'event-not-assigned' }, NotFoundException],
    [{ kind: 'event-not-open', status: 'Cancelled' }, ConflictException],
  ] as const)('VEN-HOLD-01-A maps repository refusal %#', async (result, error) => {
    submitTentativeHoldRequest.mockResolvedValue(result);
    await expect(
      service.submitTentativeHoldRequest(coordinator, venueId, { eventId }),
    ).rejects.toBeInstanceOf(error);
  });
});
