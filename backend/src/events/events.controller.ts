import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { EventsService } from './events.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}
  @Get('events') list(@Req() request: AuthenticatedRequest) {
    return this.events.list(request[CURRENT_USER_REQUEST_KEY]);
  }
  @Get('events/:id') get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.events.get(request[CURRENT_USER_REQUEST_KEY], id);
  }
  @Post('events') create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.events.create(request[CURRENT_USER_REQUEST_KEY], body);
  }
}
