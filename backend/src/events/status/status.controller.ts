/*
 * SPM-135 HTTP surface (D3). Identity comes from the verified session only
 * (request.currentUser), never from the URL or body.
 *
 *   POST /api/events/:eventId/status-change              { targetStatus }
 *   GET  /api/events/:eventId/arrangements-status        assigned coordinator (readiness + checklist)
 *   POST /api/events/:eventId/confirm-no-equipment       assigned coordinator
 *   POST /api/events/:eventId/safety-check/request       assigned coordinator
 *   POST /api/events/:eventId/safety-check/feedback/:feedbackId/resolve       assigned coordinator
 *   DELETE /api/events/:eventId/equipment-reservations/:equipmentReservationId assigned coordinator (unavailable only)
 *   DELETE /api/events/:eventId/venue-requests/:venueRequestId                 assigned coordinator (unavailable only)
 *   DELETE /api/events/:eventId/safety-check/feedback/:feedbackId/resolve      assigned coordinator
 *   GET  /api/events/:eventId/confirmed-arrangements     submitting organiser
 *   GET  /api/events/:eventId/status-history             assigned coordinator, owning organiser (SPM-148)
 *   PUT|DELETE .../status-history[/:entryId]             405, the history is append-only
 */
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PLANNING_MESSAGES } from './planning.messages.js';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { StatusService } from './status.service.js';

@Controller('api/events/:eventId')
export class StatusController {
  constructor(@Inject(StatusService) private readonly status: StatusService) {}

  @Post('status-change')
  @HttpCode(200)
  changeStatus(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.status.changeStatus(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }

  @Get('arrangements-status')
  arrangementsStatus(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.arrangementsStatus(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  @Post('confirm-no-equipment')
  @HttpCode(200)
  confirmNoEquipment(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.confirmNoEquipment(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  @Post('safety-check/request')
  @HttpCode(200)
  requestSafetyCheck(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.requestSafetyCheck(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  @Post('safety-check/feedback/:feedbackId/resolve')
  @HttpCode(200)
  resolveFeedback(@Param('eventId') eventId: string, @Param('feedbackId') feedbackId: string, @Req() request: AuthenticatedRequest) {
    return this.status.resolveFeedback(request[CURRENT_USER_REQUEST_KEY], eventId, feedbackId);
  }

  @Delete('safety-check/feedback/:feedbackId/resolve')
  @HttpCode(200)
  unresolveFeedback(@Param('eventId') eventId: string, @Param('feedbackId') feedbackId: string, @Req() request: AuthenticatedRequest) {
    return this.status.unresolveFeedback(request[CURRENT_USER_REQUEST_KEY], eventId, feedbackId);
  }

  @Delete('equipment-reservations/:equipmentReservationId')
  @HttpCode(200)
  removeEquipmentRequest(@Param('eventId') eventId: string, @Param('equipmentReservationId') equipmentReservationId: string, @Req() request: AuthenticatedRequest) {
    return this.status.removeEquipmentRequest(request[CURRENT_USER_REQUEST_KEY], eventId, equipmentReservationId);
  }

  @Delete('venue-requests/:venueRequestId')
  @HttpCode(200)
  removeVenueRequest(@Param('eventId') eventId: string, @Param('venueRequestId') venueRequestId: string, @Req() request: AuthenticatedRequest) {
    return this.status.removeVenueRequest(request[CURRENT_USER_REQUEST_KEY], eventId, venueRequestId);
  }

  @Get('confirmed-arrangements')
  confirmedArrangements(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.confirmedArrangements(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  // SPM-148 PLAN-STATUS-04-A, 04-A-SEC: the status history read (see StatusService.statusHistory).
  @Get('status-history')
  statusHistory(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.statusHistory(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  // SPM-148 PLAN-STATUS-04-B: the history is append-only; PUT and DELETE answer 405 with Allow: GET.
  @Put('status-history')
  rejectHistoryPut(@Res() response: Response) {
    return this.historyReadOnly(response);
  }

  @Put('status-history/:entryId')
  rejectHistoryEntryPut(@Res() response: Response) {
    return this.historyReadOnly(response);
  }

  @Delete('status-history')
  rejectHistoryDelete(@Res() response: Response) {
    return this.historyReadOnly(response);
  }

  @Delete('status-history/:entryId')
  rejectHistoryEntryDelete(@Res() response: Response) {
    return this.historyReadOnly(response);
  }

  private historyReadOnly(response: Response) {
    response
      .status(405)
      .set('Allow', 'GET')
      .json({ statusCode: 405, message: PLANNING_MESSAGES.historyReadOnly });
  }
}
