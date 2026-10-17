/*
 * HTTP surface for SPM-64 (organiser change requests). Protected by the
 * local-session AuthenticationMiddleware registered in AppModule; the verified
 * identity is passed explicitly to the service, never read from the body.
 *
 *   POST /api/events/:id/change-requests                          organiser submits { changes, reason? }  -> 201
 *   GET  /api/events/:id/change-requests                          owner or assigned coordinator, newest first
 *   POST /api/events/:id/change-requests/:requestId/withdraw      owner withdraws a pending request
 *   GET  /api/change-requests[?status=Pending|Approved|Denied|Withdrawn]   the caller's requests (dashboard)
 *
 * The coordinator's approve/deny decision is SPM-65.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { ChangeRequestsService } from './change-requests.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class ChangeRequestsController {
  constructor(
    @Inject(ChangeRequestsService)
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  @Post('events/:id/change-requests')
  create(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.changeRequests.create(request[CURRENT_USER_REQUEST_KEY], id, body);
  }

  @Get('events/:id/change-requests')
  listForEvent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.changeRequests.listForEvent(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Post('events/:id/change-requests/:requestId/withdraw')
  @HttpCode(200)
  withdraw(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.changeRequests.withdraw(request[CURRENT_USER_REQUEST_KEY], id, requestId);
  }

  @Get('change-requests')
  listMine(@Query('status') status: unknown, @Req() request: AuthenticatedRequest) {
    return this.changeRequests.listMine(request[CURRENT_USER_REQUEST_KEY], status);
  }
}
