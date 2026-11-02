/*
 * SPM-153 HTTP surface for the completion record (AC5). Identity comes from the verified session only.
 *
 *   GET /api/events/:eventId/completion-record   assigned coordinator
 *   PUT /api/events/:eventId/completion-record   assigned coordinator, Completed events only
 */
import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { CompletionRecordService } from './completion-record.service.js';

@Controller('api/events/:eventId/completion-record')
export class CompletionRecordController {
  constructor(@Inject(CompletionRecordService) private readonly records: CompletionRecordService) {}

  @Get()
  read(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.records.read(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  @Put()
  save(@Param('eventId') eventId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.records.save(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }
}
