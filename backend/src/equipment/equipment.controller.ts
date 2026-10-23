import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.js';
import { EquipmentService } from './equipment.service.js';

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Controller('api/equipment')
/* v8 ignore stop */
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.equipment.create(request[CURRENT_USER_REQUEST_KEY], body);
  }

  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.equipment.update(request[CURRENT_USER_REQUEST_KEY], id, body);
  }

  @Get('locations')
  listLocations(@Req() request: AuthenticatedRequest) {
    return this.equipment.listLocations(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Get('audit-trail')
  getAuditTrail(@Req() request: AuthenticatedRequest) {
    return this.equipment.getAuditTrail(request[CURRENT_USER_REQUEST_KEY]);
  }

  /** SPM-113: event-window availability, distinct from the inventory list. */
  @Get('availability')
  availability(
    @Query('startDateTime') startDateTime: string | undefined,
    @Query('endDateTime') endDateTime: string | undefined,
    @Query('equipmentType') equipmentType: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.equipment.getAvailability(request[CURRENT_USER_REQUEST_KEY], {
      startDateTime,
      endDateTime,
      equipmentType,
    });
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
