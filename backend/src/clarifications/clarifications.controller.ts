/*
 * SPM-39: HTTP surface for the coordinator clarification/amendment thread.
 * Protected by the PostgreSQL local-session middleware in AppModule.
 */
import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { ClarificationsService } from './clarifications.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class ClarificationsController {
  constructor(private readonly clarifications: ClarificationsService) {}

  @Post('events/:id/clarifications')
  create(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.clarifications.createClarification(id, this.requireUser(request), body);
  }

  @Get('events/:id/comments')
  list(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.clarifications.listComments(id, this.requireUser(request));
  }

  @Post('events/:id/clarifications/:clarificationId/reply')
  reply(
    @Param('id') id: string,
    @Param('clarificationId') clarificationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.clarifications.reply(id, clarificationId, this.requireUser(request), body);
  }

  @Post('events/:id/clarifications/:clarificationId/resolve')
  resolve(
    @Param('id') id: string,
    @Param('clarificationId') clarificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clarifications.resolve(id, clarificationId, this.requireUser(request));
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    const user = request[CURRENT_USER_REQUEST_KEY];
    if (!user) throw new UnauthorizedException('Authentication required.');
    return user;
  }
}
