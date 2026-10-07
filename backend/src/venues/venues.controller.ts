import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { VenuesService } from './venues.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Controller('api/venues')
/** Handles authenticated venue-creation requests. */
export class VenuesController {
  /* v8 ignore stop */
  constructor(private readonly venues: VenuesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('mine') mine?: string) {
    return this.venues.list(request[CURRENT_USER_REQUEST_KEY], mine === 'true');
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.venues.get(request[CURRENT_USER_REQUEST_KEY], id);
  }

  /**
   * Delegates a venue creation request with the server-verified identity.
   *
   * @param request - Request populated by the authentication middleware.
   * @param body - Untrusted venue details from the client.
   * @returns The created venue and confirmation message.
   */
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.venues.create(request[CURRENT_USER_REQUEST_KEY], body);
  }
}
