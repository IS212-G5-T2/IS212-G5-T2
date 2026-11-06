import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.js';
import { CoordinatorAvailabilityService } from './coordinator-availability.service.js';

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
