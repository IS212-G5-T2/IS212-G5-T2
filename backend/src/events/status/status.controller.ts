/*
 * SPM-135 HTTP surface (D3). Identity comes from the verified session only
 * (request.currentUser), never from the URL or body.
 *
 *   POST /api/events/:eventId/status-change              { targetStatus }
 *   GET  /api/events/:eventId/arrangements-status        assigned coordinator
 *   GET  /api/events/:eventId/confirmed-arrangements     submitting organiser
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
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

  @Get('confirmed-arrangements')
  confirmedArrangements(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.status.confirmedArrangements(request[CURRENT_USER_REQUEST_KEY], eventId);
  }
}
