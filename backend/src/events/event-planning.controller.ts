/*
 * HTTP surface for SPM-97 / SPM-49 / SPM-85. Protected by the PostgreSQL
 * local-session AuthenticationMiddleware registered in AppModule; the verified
 * identity is passed explicitly to the service, never read from the body.
 *
 *   GET   /api/events/:id/planning                            view (organiser read-only, coordinator editable)
 *   PATCH /api/events/:id/planning                            coordinator partial update
 *   POST  /api/events/:id/planning/changes/:changeId/resolve  { decision: 'confirm'|'reject', bookingId? }
 *   GET   /api/events/:id/planning/history                    resolved flagged changes, newest first
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { EventPlanningService } from './event-planning.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api/events/:id/planning')
export class EventPlanningController {
  constructor(
    @Inject(EventPlanningService)
    private readonly planning: EventPlanningService,
  ) {}

  @Get()
  view(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.planning.getPlanningView(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Patch()
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.planning.updateEvent(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      body,
    );
  }

  @Post('changes/:changeId/resolve')
  resolve(
    @Param('id') id: string,
    @Param('changeId') changeId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.planning.resolveChange(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      changeId,
      body,
    );
  }

  @Get('history')
  history(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.planning.changeHistory(request[CURRENT_USER_REQUEST_KEY], id);
  }
}
