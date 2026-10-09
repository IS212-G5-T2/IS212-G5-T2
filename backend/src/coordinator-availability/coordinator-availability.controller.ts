import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/types/auth.models.js';
import { CoordinatorAvailabilityService } from './coordinator-availability.service.js';

type AuthenticatedRequest = Request & { [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser };

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Controller('api/coordinators/me/availability')
/* v8 ignore stop */
export class CoordinatorAvailabilityController {
  constructor(private readonly availability: CoordinatorAvailabilityService) {}

  @Get()
  getMine(@Req() request: AuthenticatedRequest) {
    return this.availability.getMine(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Put()
  updateMine(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.availability.updateMine(request[CURRENT_USER_REQUEST_KEY], body);
  }
}
