import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
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

  /** SPM-120: the attendee withdraws their own registration. Accepts no body or {}. */
  @Post('registrations/:registrationId/withdraw')
  @HttpCode(200)
  withdraw(
    @Param('registrationId') registrationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.registrations.withdraw(request[CURRENT_USER_REQUEST_KEY], registrationId, body);
  }

  @Get('events/:eventId/registrations/me')
  mine(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.registrations.findMine(request[CURRENT_USER_REQUEST_KEY], eventId);
  }
}
