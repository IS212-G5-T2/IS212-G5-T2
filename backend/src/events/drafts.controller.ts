import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DraftsService } from './drafts.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

/* v8 ignore start -- unreachable emitDecoratorMetadata paramtype guard */
@Controller('api/requests')
export class DraftsController {
  /* v8 ignore stop */
  constructor(private readonly drafts: DraftsService) {}
  @Get() list(@Req() request: AuthenticatedRequest) {
    return this.drafts.list(request[CURRENT_USER_REQUEST_KEY]);
  }
  @Get(':id') get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.drafts.get(request[CURRENT_USER_REQUEST_KEY], id);
  }
  @Put(':id') save(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.drafts.save(request[CURRENT_USER_REQUEST_KEY], id, body);
  }
  @Post(':id/submit') submit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.drafts.submit(request[CURRENT_USER_REQUEST_KEY], id, body);
  }
}
