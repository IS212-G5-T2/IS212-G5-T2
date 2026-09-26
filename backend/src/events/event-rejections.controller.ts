import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { EventsService } from './events.service.js';

type AuthenticatedRequest = Request & { currentUser?: AuthenticatedUser };

@Controller('api')
export class EventRejectionsController {
  constructor(private readonly events: EventsService) {}

  @Post('events/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.events.reject(id, body, request.currentUser);
  }

  @Post('events/:id/approve')
  approve(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.events.approve(id, request.currentUser);
  }

  @Get('notifications')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.events.notifications(request.currentUser);
  }

  @Post('notifications/:id/read')
  readNotification(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.events.readNotification(id, request.currentUser);
  }
}
