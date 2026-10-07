import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/models/auth.models.js';
import { LeadAssignmentService } from './lead-assignment.service.js';

type AuthenticatedRequest = Request & { [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser };

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Controller('api/lead')
/* v8 ignore stop */
export class LeadAssignmentController {
  constructor(private readonly lead: LeadAssignmentService) {}

  @Get('queue')
  queue(@Req() request: AuthenticatedRequest) {
    return this.lead.queue(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('coordinators')
  coordinators(@Req() request: AuthenticatedRequest) {
    return this.lead.coordinators(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Post('queue/:eventId/assign')
  assign(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lead.assign(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }

  @Get('assigned')
  assigned(@Req() request: AuthenticatedRequest) {
    return this.lead.assigned(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Post('events/:eventId/reassign')
  reassign(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lead.reassign(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }
}
