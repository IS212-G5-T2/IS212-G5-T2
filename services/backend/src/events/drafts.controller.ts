import { Body, Controller, Get, Req, Param, Post, Put } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { DraftsService } from './drafts.service.js';

/* v8 ignore start -- unreachable emitDecoratorMetadata paramtype guard */
@Controller('api/requests')
export class DraftsController {
  /* v8 ignore stop */
  constructor(private readonly drafts: DraftsService) {}
  @Get() list(@Req() request: { currentUser?: AuthenticatedUser }) {
    return this.drafts.list(request.currentUser);
  }
  @Get(':id') get(
    @Req() request: { currentUser?: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.drafts.get(request.currentUser, id);
  }
  @Put(':id') save(
    @Req() request: { currentUser?: AuthenticatedUser },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.save(request.currentUser, id, body);
  }
  @Post(':id/submit') submit(
    @Req() request: { currentUser?: AuthenticatedUser },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.submit(request.currentUser, id, body);
  }
}
