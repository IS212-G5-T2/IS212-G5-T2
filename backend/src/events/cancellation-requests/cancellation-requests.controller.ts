/*
 * HTTP surface for SPM-155 (Organiser requests cancellation of their event). Protected by the local-session
 * AuthenticationMiddleware registered in AppModule; the verified identity is passed explicitly to the service,
 * never read from the body.
 *
 *   POST /api/events/:id/cancellation-requests         the submitting Organiser files { reason? }  -> 201
 *   GET  /api/events/:id/cancellation-requests         owner or assigned Coordinator, newest first (no-store)
 *   GET  /api/cancellation-requests                    the caller's latest request per event (no-store)
 *   POST /api/cancellation-requests/:id/decision       assigned Coordinator { decision: accept | decline } -> 200
 */
import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { CancellationRequestsService } from './cancellation-requests.service.js';

/* v8 ignore start -- Nest decorator metadata is not executable in unit tests. */
@Controller('api')
/* v8 ignore stop */
export class CancellationRequestsController {
  constructor(@Inject(CancellationRequestsService) private readonly requests: CancellationRequestsService) {}

  @Post('events/:id/cancellation-requests')
  create(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.requests.create(request[CURRENT_USER_REQUEST_KEY], id, body);
  }

  // AC2 / 02-F: the latest status on every refresh, so a request's status is never served from a cache.
  @Get('events/:id/cancellation-requests')
  @Header('Cache-Control', 'no-store')
  listForEvent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.requests.listForEvent(request[CURRENT_USER_REQUEST_KEY], id);
  }

  @Get('cancellation-requests')
  @Header('Cache-Control', 'no-store')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.requests.listMine(request[CURRENT_USER_REQUEST_KEY]);
  }

  @Post('cancellation-requests/:id/decision')
  @HttpCode(200)
  decide(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.requests.decide(request[CURRENT_USER_REQUEST_KEY], id, body);
  }
}
