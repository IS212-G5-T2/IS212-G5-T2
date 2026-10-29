import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
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
    listPendingVenueBookings: vi.fn(),
    approveVenueBooking: vi.fn(),
    rejectVenueBooking: vi.fn(),
    markUnavailable: vi.fn(),
    endUnavailable: vi.fn(),
  };
  const controller = new VenuesController(service as unknown as VenuesService);

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

  /** VEN-HOLD-01-A: a tentative hold uses the shared booking request route and verified identity. */
  it('VEN-HOLD-01-A forwards a discriminated tentative hold through booking requests', () => {
    const coordinator: AuthenticatedUser = { uid: 'coordinator-1', roles: ['COORDINATOR'] };
    const coordinatorRequest = { [CURRENT_USER_REQUEST_KEY]: coordinator } as Request;
    const venueId = '00000000-0000-4000-8000-000000000159';
    const body = {
      eventId: '00000000-0000-4000-8000-000000000158',
      request_kind: 'tentative_hold',
    };
    service.submitBookingRequest.mockReturnValue({ status: 'pending' });

    expect(controller.submitBookingRequest(coordinatorRequest, venueId, body)).toEqual({ status: 'pending' });
    expect(service.submitBookingRequest).toHaveBeenCalledWith(coordinator, venueId, body);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.submitBookingRequest)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, controller.submitBookingRequest)).toBe(':id/booking-requests');
  });

  /** VEN-REV-07-A: the review endpoints keep their HTTP methods and paths. */
  it('SPM-55 maps the review endpoints to their HTTP methods and paths', () => {
    // Route metadata pins the method and path, so a renamed path or a changed verb fails here.
    expect(Reflect.getMetadata(METHOD_METADATA, controller.listPendingVenueBookings)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, controller.listPendingVenueBookings)).toBe('bookings/pending');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.approveVenueBooking)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, controller.approveVenueBooking)).toBe('bookings/:bookingId/approve');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.rejectVenueBooking)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, controller.rejectVenueBooking)).toBe('bookings/:bookingId/reject');

    // Parameter binding: the booking ID comes from the :bookingId route parameter, and the reject body is the whole body.
    const routeArgs = (method: keyof VenuesController) =>
      Reflect.getMetadata(ROUTE_ARGS_METADATA, VenuesController, method) as Record<string, { index: number; data?: string }>;
    expect(routeArgs('approveVenueBooking')[`${RouteParamtypes.PARAM}:1`]).toMatchObject({ index: 1, data: 'bookingId' });
    expect(routeArgs('rejectVenueBooking')[`${RouteParamtypes.PARAM}:1`]).toMatchObject({ index: 1, data: 'bookingId' });
    expect(routeArgs('rejectVenueBooking')[`${RouteParamtypes.BODY}:2`]).toMatchObject({ index: 2 });
    expect(routeArgs('rejectVenueBooking')[`${RouteParamtypes.BODY}:2`].data).toBeUndefined();

    // Identity: each review route takes the whole request at index 0, so the verified session user is read from it,
    // never from a client-supplied body or parameter.
    const requestKey = `${RouteParamtypes.REQUEST}:0`;
    expect(routeArgs('listPendingVenueBookings')[requestKey]).toMatchObject({ index: 0, data: undefined });
    expect(routeArgs('approveVenueBooking')[requestKey]).toMatchObject({ index: 0, data: undefined });
    expect(routeArgs('rejectVenueBooking')[requestKey]).toMatchObject({ index: 0, data: undefined });
  });

  /** VEN-REV-01-A: the pending-list route forwards the verified staff identity. */
  it('SPM-55 forwards the pending list request with the session identity', () => {
    service.listPendingVenueBookings.mockReturnValue(['pending']);

    expect(controller.listPendingVenueBookings(request)).toEqual(['pending']);
    expect(service.listPendingVenueBookings).toHaveBeenCalledWith(identity);
  });

  /** VEN-REV-02-A: the approve route forwards the verified staff identity and the booking ID. */
  it('SPM-55 forwards the approve request with the session identity and booking ID', () => {
    const bookingId = '6f0d6f3a-2c1e-4b59-9d8a-0c3b7e1f2a44';
    service.approveVenueBooking.mockReturnValue({ status: 'approved' });

    expect(controller.approveVenueBooking(request, bookingId)).toEqual({ status: 'approved' });
    expect(service.approveVenueBooking).toHaveBeenCalledWith(identity, bookingId);
  });

  /** VEN-REV-03-A: the reject route forwards the verified staff identity, the booking ID and the rejection body. */
  it('SPM-55 forwards the reject request with the session identity, booking ID and body', () => {
    const bookingId = '6f0d6f3a-2c1e-4b59-9d8a-0c3b7e1f2a44';
    const body = { reason: 'Clashes with maintenance' };
    service.rejectVenueBooking.mockReturnValue({ status: 'rejected' });

    expect(controller.rejectVenueBooking(request, bookingId, body)).toEqual({ status: 'rejected' });
    expect(service.rejectVenueBooking).toHaveBeenCalledWith(identity, bookingId, body);
  });

  /** VEN-BKG-08-SEC-1: coordinator booking history is fetched for the authenticated identity. */
  it('lists coordinator bookings for the authenticated user', () => {
    service.listCoordinatorBookings.mockReturnValue(['booking']);
    expect(controller.listCoordinatorBookings(request)).toEqual(['booking']);
    expect(service.listCoordinatorBookings).toHaveBeenCalledWith(identity);
  });

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
