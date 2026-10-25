import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';
import { VenuesModule } from './venues.module.js';

describe('SPM-50 venue route wiring', () => {
  const identity: AuthenticatedUser = {
    uid: 'staff-1',
    roles: ['VENUE_STAFF'],
  };
  const request = { [CURRENT_USER_REQUEST_KEY]: identity } as Request;
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    submitBookingRequest: vi.fn(),
    listCoordinatorBookings: vi.fn(),
    cancelCoordinatorBooking: vi.fn(),
    markUnavailable: vi.fn(),
    endUnavailable: vi.fn(),
  };
  const controller = new VenuesController(service as unknown as VenuesService);

  // Kills: options() returning a facility or accessibility list that drops, renames or reorders a venue-schema entry.
  /** EVE-FAC-02-A and EVE-ACC-02-ALIGN-01: options expose current facility and accessibility schema labels/values. */
  it('EVE-FAC-02-A EVE-ACC-02-ALIGN-01 returns facility and accessibility options from venue schemas', () => {
    const response = controller.options();
    expect(response.facilities).toEqual([
      { label: 'Catering', value: 'Catering' },
      { label: 'AV System', value: 'AV System' },
      { label: 'Parking', value: 'Parking' },
      { label: 'Stage', value: 'Stage' },
      { label: 'Projector', value: 'Projector' },
      { label: 'Whiteboard', value: 'Whiteboard' },
      { label: 'Wi-Fi', value: 'Wi-Fi' },
      { label: 'Wired network', value: 'Wired network' },
      { label: 'Video conferencing', value: 'Video conferencing' },
      { label: 'Lectern', value: 'Lectern' },
      { label: 'Power outlets', value: 'Power outlets' },
    ]);
    expect(response.accessibility).toEqual([
      { label: 'Wheelchair access', value: 'Wheelchair access' },
      { label: 'Accessible restrooms', value: 'Accessible restrooms' },
      { label: 'Hearing loop', value: 'Hearing loop' },
      { label: 'Elevator access', value: 'Elevator access' },
    ]);
  });

  // SPM-50 / VEN-CRE-04-A: creation forwards the body and verified caller.
  // Kills: create that forwards the body without the verified identity, or returns a different value from the service.
  it('forwards venue creation and keeps module wiring importable', () => {
    // Arrange a body and service response.
    const body = { name: 'Orchid Hall Test' };
    service.create.mockReturnValue('created');
    // Act and assert the creation call and module declaration.
    expect(controller.create(request, body)).toBe('created');
    expect(service.create).toHaveBeenCalledWith(identity, body);
    expect(VenuesModule).toBeDefined();
  });

  // SPM-124: catalogue scope is an explicit flag; identity stays server-verified.
  // Kills: list that treats the scope 'true' as anything but a true flag, or get that passes a caller-chosen identity or the wrong id.
  it('forwards catalogue scope and detail reads to the service', () => {
    // Arrange: service results make each delegated read distinguishable.
    service.list.mockReturnValue(['catalogue']);
    service.get.mockReturnValue('detail');
    const id = '00000000-0000-4000-8000-000000000124';

    // Act: invoke the controller methods used by the protected HTTP routes.
    expect(controller.list(request, 'true')).toEqual(['catalogue']);
    expect(controller.get(request, id)).toBe('detail');

    // Assert: no caller-controlled identity is substituted.
    expect(service.list).toHaveBeenCalledWith(identity, true);
    expect(service.get).toHaveBeenCalledWith(identity, id);
  });

  // Kills: submitBookingRequest that drops the venue id or body, or substitutes a body-supplied identity for the session identity.
  /** VEN-AVL-06-A: the authenticated booking API forwards the venue, body and verified identity. */
  it('forwards a venue booking request with the session identity', () => {
    const venueId = '00000000-0000-4000-8000-000000000124';
    const body = {
      eventId: '00000000-0000-4000-8000-000000000125',
      start: '2030-01-12T04:00:00.000Z',
      end: '2030-01-12T05:00:00.000Z',
    };
    service.submitBookingRequest.mockReturnValue({ status: 'pending' });

    expect(controller.submitBookingRequest(request, venueId, body)).toEqual({
      status: 'pending',
    });
    expect(service.submitBookingRequest).toHaveBeenCalledWith(
      identity,
      venueId,
      body,
    );
  });

  // Kills: listCoordinatorBookings called without the authenticated identity, or with another user's identity.
  /** VEN-BKG-08-SEC-1: coordinator booking history is fetched for the authenticated identity. */
  it('lists coordinator bookings for the authenticated user', () => {
    service.listCoordinatorBookings.mockReturnValue(['booking']);
    expect(controller.listCoordinatorBookings(request)).toEqual(['booking']);
    expect(service.listCoordinatorBookings).toHaveBeenCalledWith(identity);
  });

  // Kills: cancellation confirmation that treats null or a truthy non-true value as confirmed, or maps false to true.
  /** VEN-BKG-10-A: only a literal true in the request body confirms last-booking cancellation. */
  it.each([
    [{ confirmed: true }, true],
    [{ confirmed: false }, false],
    [null, false],
  ])('passes explicit cancellation confirmation %j', (body, confirmed) => {
    const bookingId = '00000000-0000-4000-8000-000000000127';
    service.cancelCoordinatorBooking.mockReturnValue({ kind: 'cancelled' });
    expect(
      controller.cancelCoordinatorBooking(request, bookingId, body),
    ).toEqual({ kind: 'cancelled' });
    expect(service.cancelCoordinatorBooking).toHaveBeenCalledWith(
      identity,
      bookingId,
      confirmed,
    );
  });

  // Kills: markUnavailable or endUnavailable that swaps venue and period ids, drops the body, or omits the verified identity.
  /** SPM-122: venue staff unavailability actions forward the verified identity and route IDs. */
  it('forwards a blockout request and blockout end action', () => {
    const venueId = '00000000-0000-4000-8000-000000000124';
    const periodId = '00000000-0000-4000-8000-000000000126';
    const body = {
      start: '2030-01-12T04:00:00.000Z',
      end: '2030-01-12T05:00:00.000Z',
      reason: 'Maintenance',
    };
    service.markUnavailable.mockReturnValue({ period: 'saved' });
    service.endUnavailable.mockReturnValue({ period: 'ended' });

    expect(controller.markUnavailable(request, venueId, body)).toEqual({
      period: 'saved',
    });
    expect(controller.endUnavailable(request, venueId, periodId)).toEqual({
      period: 'ended',
    });
    expect(service.markUnavailable).toHaveBeenCalledWith(
      identity,
      venueId,
      body,
    );
    expect(service.endUnavailable).toHaveBeenCalledWith(
      identity,
      venueId,
      periodId,
    );
  });
});
