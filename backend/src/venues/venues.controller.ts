import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.js';
import { VenuesService } from './venues.service.js';
import { facilityOptions } from './helpers/venue-options.js';
import { accessibilityOptions } from './helpers/accessibility-options.js';

/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Controller('api/venues')
/** Handles authenticated venue-creation requests. */
export class VenuesController {
  /* v8 ignore stop */
  constructor(private readonly venues: VenuesService) {}

  @Get('options')
  options() {
    return {
      facilities: facilityOptions.map(({ name }) => ({
        label: name,
        value: name,
      })),
      accessibility: accessibilityOptions.map(({ label }) => ({
        label,
        value: label,
      })),
    };
  }

  @Get('bookings/mine')
  listCoordinatorBookings(@Req() request: AuthenticatedRequest) {
    return this.venues.listCoordinatorBookings(
      request[CURRENT_USER_REQUEST_KEY],
    );
  }

  /** SPM-55 AC1: pending requests for the caller's venues, ordered by event date. */
  @Get('bookings/pending')
  listPendingVenueBookings(@Req() request: AuthenticatedRequest) {
    return this.venues.listPendingVenueBookings(
      request[CURRENT_USER_REQUEST_KEY],
    );
  }

  /** SPM-55 AC2: Venue Staff approve a pending request for their venue. */
  @Post('bookings/:bookingId/approve')
  approveVenueBooking(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
  ) {
    return this.venues.approveVenueBooking(
      request[CURRENT_USER_REQUEST_KEY],
      bookingId,
    );
  }

  /** SPM-55 AC3: Venue Staff reject a pending request with a reason. */
  @Post('bookings/:bookingId/reject')
  rejectVenueBooking(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    return this.venues.rejectVenueBooking(
      request[CURRENT_USER_REQUEST_KEY],
      bookingId,
      body,
    );
  }

  @Post('bookings/:bookingId/cancel')
  cancelCoordinatorBooking(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    const confirmed = Boolean(
      body &&
      typeof body === 'object' &&
      (body as { confirmed?: unknown }).confirmed === true,
    );
    return this.venues.cancelCoordinatorBooking(
      request[CURRENT_USER_REQUEST_KEY],
      bookingId,
      confirmed,
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('mine') mine?: string) {
    return this.venues.list(request[CURRENT_USER_REQUEST_KEY], mine === 'true');
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.venues.get(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Post(':id/booking-requests')
  submitBookingRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.venues.submitBookingRequest(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      body,
    );
  }

  /**
   * Delegates a venue creation request with the server-verified identity.
   *
   * @param request - Request populated by the authentication middleware.
   * @param body - Untrusted venue details from the client.
   * @returns The created venue and confirmation message.
   */
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.venues.create(request[CURRENT_USER_REQUEST_KEY], body);
  }

  /** SPM-121: updates an owned venue record. */
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.venues.update(request[CURRENT_USER_REQUEST_KEY], id, body);
  }

  @Post(':id/unavailable-periods')
  markUnavailable(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.venues.markUnavailable(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      body,
    );
  }

  @Post(':id/unavailable-periods/:periodId/end')
  endUnavailable(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('periodId') periodId: string,
  ) {
    return this.venues.endUnavailable(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      periodId,
    );
  }
}
