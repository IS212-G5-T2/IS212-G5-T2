import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { EquipmentRequestsService } from './equipment-requests.service.js';

/* v8 ignore start -- Nest decorator metadata is not executable controller behavior. */
@Controller('api/equipment/requests')
/* v8 ignore stop */
/** Exposes the authenticated equipment-request submission and list APIs. */
export class EquipmentRequestsController {
  constructor(private readonly requests: EquipmentRequestsService) {}

  @Post()
  submit(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.requests.submit(request[CURRENT_USER_REQUEST_KEY], body);
  }

  @Put(':requestId')
  update(@Req() request: AuthenticatedRequest, @Param('requestId', new ParseUUIDPipe()) requestId: string, @Body() body: unknown) {
    return this.requests.update(request[CURRENT_USER_REQUEST_KEY], requestId, body);
  }

  @Get('eligible-events')
  listEligibleEvents(@Req() request: AuthenticatedRequest) {
    return this.requests.listEligibleEvents(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get()
  listMine(@Req() request: AuthenticatedRequest) {
    return this.requests.listMine(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('review-queue')
  listQueue(@Req() request: AuthenticatedRequest) {
    return this.requests.listQueue(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('reservations')
  listReservations(@Req() request: AuthenticatedRequest) {
    return this.requests.listReservations(request[CURRENT_USER_REQUEST_KEY]);
  }

  /** Technical Support turns a submitted request into the reservation used by SPM-113. */
  @Patch(':requestId/reserve')
  reserve(@Req() request: AuthenticatedRequest, @Param('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.requests.reserve(request[CURRENT_USER_REQUEST_KEY], requestId);
  }

}
