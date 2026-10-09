import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/types/auth.models.js';
import { EquipmentService } from './equipment.service.js';

type AuthenticatedRequest = Request & { [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser };

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Controller('api/equipment')
/* v8 ignore stop */
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.equipment.create(request[CURRENT_USER_REQUEST_KEY], body);
  }

  @Get('locations')
  listLocations(@Req() request: AuthenticatedRequest) {
    return this.equipment.listLocations(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('audit-trail')
  getAuditTrail(@Req() request: AuthenticatedRequest) {
    return this.equipment.getAuditTrail(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get()
  list(@Query('includeUnavailable') includeUnavailable: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.equipment.list(request[CURRENT_USER_REQUEST_KEY], {
      includeUnavailable: includeUnavailable === 'true',
    });
  }

  @Patch(':id/availability')
  updateAvailability(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.equipment.updateAvailability(request[CURRENT_USER_REQUEST_KEY], id, body);
  }
}
