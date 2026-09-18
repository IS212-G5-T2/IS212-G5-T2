/*
 * SPM-39: HTTP surface for the coordinator clarification/amendment thread.
 * Protected by FirebaseAuthenticationMiddleware, applied to this controller
 * in AppModule.
 */
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
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
    return this.clarifications.createClarification(id, this.currentUser(request), body);
  }

  @Get('events/:id/comments')
  list(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.clarifications.listComments(id, this.currentUser(request));
  }

  @Post('events/:id/clarifications/:clarificationId/reply')
  reply(
    @Param('id') id: string,
    @Param('clarificationId') clarificationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.clarifications.reply(id, clarificationId, this.currentUser(request), body);
  }

  private currentUser(request: AuthenticatedRequest): AuthenticatedUser {
    return request[CURRENT_USER_REQUEST_KEY] as AuthenticatedUser;
  }
}
