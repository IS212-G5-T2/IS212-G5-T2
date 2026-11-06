import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { CoordinatorQueueService } from './coordinator-queue.service.js';

/** SPM-48: `GET /api/coordinator/queue[?status=planning,submitted]`, coordinator only. */
@Controller('api/coordinator')
export class CoordinatorQueueController {
  constructor(@Inject(CoordinatorQueueService) private readonly queueService: CoordinatorQueueService) {}

  // AC4: the latest status on every refresh or revisit, so the queue is never served from a cache.
  @Get('queue')
  @Header('Cache-Control', 'no-store')
  queue(@Query('status') status: unknown, @Req() request: AuthenticatedRequest) {
    return this.queueService.queue(request[CURRENT_USER_REQUEST_KEY], status);
  }
}
