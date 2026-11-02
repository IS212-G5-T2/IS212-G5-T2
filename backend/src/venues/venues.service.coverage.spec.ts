import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { RbacRepository } from '../auth/authorization/repository/rbac.repository.js';
import { VenuesRepository } from './repository/venues.repository.js';
import { VenuesService } from './venues.service.js';

const uid = '00000000-0000-4000-8000-000000000001';
const venueId = '00000000-0000-4000-8000-000000000002';
const eventId = '00000000-0000-4000-8000-000000000003';
const bookingId = '00000000-0000-4000-8000-000000000004';
const coordinator: AuthenticatedUser = { uid, roles: ['COORDINATOR'] };
const booking = { eventId, start: '2030-02-01T10:00:00Z', end: '2030-02-01T11:00:00Z' };

describe('venue coordinator booking service coverage', () => {
  const submitBookingRequest = vi.fn();
  const submitTentativeHoldRequest = vi.fn();
  const listCoordinatorBookings = vi.fn();
  const cancelCoordinatorBooking = vi.fn();
  const service = new VenuesService({
    submitBookingRequest,
    submitTentativeHoldRequest,
    listCoordinatorBookings,
    cancelCoordinatorBooking,
  } as unknown as VenuesRepository, {} as RbacRepository);

  it('maps authorization, validation, and booking submission outcomes', async () => {
    await expect(service.submitBookingRequest(undefined, venueId, booking)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.submitBookingRequest({ uid, roles: ['LEAD'] }, venueId, booking)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitBookingRequest(coordinator, 'bad-id', booking)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.submitBookingRequest(coordinator, venueId, { ...booking, extra: true })).rejects.toBeTruthy();

    for (const [kind, expected] of [
      ['venue-not-found', NotFoundException], ['event-not-assigned', NotFoundException],
      ['event-not-open', ConflictException], ['already-requested', ConflictException],
      ['conflict', ConflictException],
    ] as const) {
      submitBookingRequest.mockResolvedValueOnce(kind === 'conflict' ? { kind, reason: 'maintenance' } : { kind });
      await expect(service.submitBookingRequest(coordinator, venueId, booking)).rejects.toBeInstanceOf(expected);
    }
    submitBookingRequest.mockResolvedValueOnce({ id: bookingId, start: booking.start, end: booking.end, eventStatus: 'Planning', statusChanged: false });
    await expect(service.submitBookingRequest(coordinator, venueId, booking)).resolves.toMatchObject({ id: bookingId, status: 'pending', eventId, venueId });
  });

  it('maps hold outcomes and returns a pending hold request', async () => {
    await expect(service.submitTentativeHoldRequest(undefined, venueId, { eventId })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.submitTentativeHoldRequest({ uid, roles: ['LEAD'] }, venueId, { eventId })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitTentativeHoldRequest(coordinator, 'bad-id', { eventId })).rejects.toBeInstanceOf(NotFoundException);
    for (const [kind, expected] of [
      ['venue-not-found', NotFoundException], ['event-not-assigned', NotFoundException],
      ['event-not-open', ConflictException], ['already-requested', ConflictException],
      ['lead-time', ConflictException], ['configuration-unavailable', ConflictException], ['conflict', ConflictException],
    ] as const) {
      submitTentativeHoldRequest.mockResolvedValueOnce(kind === 'conflict' ? { kind, reason: 'maintenance' } : { kind });
      await expect(service.submitTentativeHoldRequest(coordinator, venueId, { eventId })).rejects.toBeInstanceOf(expected);
    }
    submitTentativeHoldRequest.mockResolvedValueOnce({ kind: 'created', id: bookingId, start: booking.start, end: booking.end });
    await expect(service.submitBookingRequest(coordinator, venueId, { eventId, request_kind: 'tentative_hold' })).resolves.toMatchObject({
      id: bookingId, requestKind: 'tentative_hold', holdDurationHours: 336, status: 'pending',
    });
  });

  it('authorizes coordinator listing and maps cancellation outcomes', async () => {
    await expect(service.listCoordinatorBookings(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.listCoordinatorBookings({ uid, roles: ['LEAD'] })).rejects.toBeInstanceOf(ForbiddenException);
    listCoordinatorBookings.mockResolvedValueOnce([]);
    await expect(service.listCoordinatorBookings(coordinator)).resolves.toEqual([]);
    await expect(service.cancelCoordinatorBooking(undefined, bookingId, false)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.cancelCoordinatorBooking({ uid, roles: ['LEAD'] }, bookingId, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cancelCoordinatorBooking(coordinator, 'bad-id', false)).rejects.toBeInstanceOf(NotFoundException);
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'not-found' });
    await expect(service.cancelCoordinatorBooking(coordinator, bookingId, false)).rejects.toBeInstanceOf(NotFoundException);
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'not-active' });
    await expect(service.cancelCoordinatorBooking(coordinator, bookingId, false)).rejects.toBeInstanceOf(ConflictException);
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'last-active' });
    await expect(service.cancelCoordinatorBooking(coordinator, bookingId, false)).rejects.toMatchObject({ response: { requiresConfirmation: true } });
    cancelCoordinatorBooking.mockResolvedValueOnce({ kind: 'cancelled' });
    await expect(service.cancelCoordinatorBooking(coordinator, bookingId, true)).resolves.toEqual({ id: bookingId, status: 'cancelled' });
  });
});
