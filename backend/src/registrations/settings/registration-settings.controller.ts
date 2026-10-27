/*
 * HTTP surface for SPM-139 registration settings. Protected by the PostgreSQL local-session AuthenticationMiddleware
 * registered in AppModule; the verified identity is passed explicitly to the service, never read from the body.
 *
 *   GET /api/events/:id/registration-settings   the assigned coordinator's saved settings and Confirmed count
 *   PUT /api/events/:id/registration-settings   partial save; omitted fields keep their saved value; requires version
 */
import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY, type AuthenticatedUser } from '../../auth/types/auth.models.js';
import { RegistrationSettingsService } from './registration-settings.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api/events/:id/registration-settings')
export class RegistrationSettingsController {
  constructor(
    @Inject(RegistrationSettingsService)
    private readonly settings: RegistrationSettingsService,
  ) {}

  @Get()
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.settings.get(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Put()
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.settings.update(request[CURRENT_USER_REQUEST_KEY], id, body);
  }
}
