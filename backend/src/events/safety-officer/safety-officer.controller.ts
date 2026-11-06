import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { SafetyOfficerService } from './safety-officer.service.js';

@Controller('api/safety-officer')
export class SafetyOfficerController {
  constructor(@Inject(SafetyOfficerService) private readonly safety: SafetyOfficerService) {}

  @Get('queue')
  @Header('Cache-Control', 'no-store')
  queue(@Req() request: AuthenticatedRequest) {
    return this.safety.queue(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('queue/:eventId')
  @Header('Cache-Control', 'no-store')
  details(@Param('eventId', new ParseUUIDPipe()) eventId: string, @Req() request: AuthenticatedRequest) {
    return this.safety.details(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  @Post('queue/:eventId/decision')
  respond(@Param('eventId', new ParseUUIDPipe()) eventId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.safety.respond(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }
}
