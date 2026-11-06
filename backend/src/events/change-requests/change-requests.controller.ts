/*
 * HTTP surface for SPM-64 (organiser change requests). Protected by the
 * local-session AuthenticationMiddleware registered in AppModule; the verified
 * identity is passed explicitly to the service, never read from the body.
 *
 *   POST /api/events/:id/change-requests                          organiser submits { changes, reason? }  -> 201
 *   GET  /api/events/:id/change-requests                          owner or assigned coordinator, newest first
 *   POST /api/events/:id/change-requests/:requestId/withdraw      owner withdraws a pending request
 *   GET  /api/change-requests[?status=Pending|Approved|Denied|Withdrawn|Closed]   the caller's requests (dashboard)
 *
 * SPM-65 (assigned coordinator only, ChangeRequestReviewService):
 *   GET  /api/events/:id/change-requests/:requestId/conflicts            read-only conflict preview (AC3)
 *   POST /api/events/:id/change-requests/:requestId/approve              {} -> 200 (AC4, AC7-AC10)
 *   POST /api/events/:id/change-requests/:requestId/deny                 { reason } -> 200 (AC5, AC10)
 *   POST /api/events/:id/change-requests/:requestId/recheck/:itemId      tick off an arrangement (AC9)
 *   GET  /api/events/:id/change-requests/audit                           audit log, owner or assigned coordinator (AC10)
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { ChangeRequestsService } from './change-requests.service.js';
import { ChangeRequestReviewService } from './review/change-request-review.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class ChangeRequestsController {
  constructor(
    @Inject(ChangeRequestsService)
    private readonly changeRequests: ChangeRequestsService,
    @Inject(ChangeRequestReviewService)
    private readonly review: ChangeRequestReviewService,
  ) {}

  @Post('events/:id/change-requests')
  create(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.changeRequests.create(request[CURRENT_USER_REQUEST_KEY], id, body);
  }

  @Get('events/:id/change-requests')
  listForEvent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.changeRequests.listForEvent(request[CURRENT_USER_REQUEST_KEY], id);
  }

  // Declared before the :requestId routes so "audit" is never read as a request id.
  @Get('events/:id/change-requests/audit')
  auditLog(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.review.auditLog(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Get('events/:id/change-requests/:requestId/conflicts')
  preview(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.review.preview(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      requestId,
    );
  }

  @Post('events/:id/change-requests/:requestId/approve')
  @HttpCode(200)
  approve(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.review.approve(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      requestId,
      body,
    );
  }

  @Post('events/:id/change-requests/:requestId/deny')
  @HttpCode(200)
  deny(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.review.deny(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      requestId,
      body,
    );
  }

  @Post('events/:id/change-requests/:requestId/recheck/:itemId')
  @HttpCode(200)
  markRechecked(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.review.markRechecked(
      request[CURRENT_USER_REQUEST_KEY],
      id,
      requestId,
      itemId,
    );
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
