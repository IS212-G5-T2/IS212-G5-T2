import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/models/auth.models.js';
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

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.equipment.list(request[CURRENT_USER_REQUEST_KEY]);
  }
}
