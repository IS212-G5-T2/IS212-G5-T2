/*
 * SPM-39: HTTP surface for the coordinator clarification/amendment thread.
 * Protected by the PostgreSQL local-session middleware in AppModule.
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
    return this.clarifications.createClarification(id, this.getDemoOrAuthedUser(request), body);
  }

  @Get('events/:id/comments')
  list(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.clarifications.listComments(id, this.getDemoOrAuthedUser(request));
  }

  @Post('events/:id/clarifications/:clarificationId/reply')
  reply(
    @Param('id') id: string,
    @Param('clarificationId') clarificationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.clarifications.reply(id, clarificationId, this.getDemoOrAuthedUser(request), body);
  }

  @Post('events/:id/clarifications/:clarificationId/resolve')
  resolve(
    @Param('id') id: string,
    @Param('clarificationId') clarificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clarifications.resolve(id, clarificationId, this.getDemoOrAuthedUser(request));
  }

  private getDemoOrAuthedUser(request: AuthenticatedRequest): AuthenticatedUser {
    const authed = request[CURRENT_USER_REQUEST_KEY];
    if (authed) return authed;

    // Demo mode fallback: return a stub coordinator or organiser based on the operation
    if (process.env.DEMO_ORGANISER_ENABLED === 'true') {
      return {
        uid: 'current-user',
        roles: ['COORDINATOR', 'ORGANISER'],
        name: 'Demo User',
        email: 'demo@example.test',
      };
    }

    throw new Error('Authentication required');
  }
}
