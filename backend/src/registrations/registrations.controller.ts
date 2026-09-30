import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { RegistrationsService } from './registrations.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class RegistrationsController {
  constructor(
    @Inject(RegistrationsService) private readonly registrations: RegistrationsService,
  ) {}

  @Post('events/:eventId/registrations')
  register(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.registrations.register(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }

  @Get('events/:eventId/registrations/me')
  mine(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.registrations.findMine(request[CURRENT_USER_REQUEST_KEY], eventId);
  }
}
