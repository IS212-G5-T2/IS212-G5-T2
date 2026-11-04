/*
 * SPM-157 routes:
 *   GET  /api/events/:eventId/history                    assigned coordinator, owning organiser
 *   PUT|PATCH|DELETE .../history[/:entryId]              405 with Allow: GET (AC10, the history is append-only)
 */
import { Controller, Delete, Get, Param, Patch, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../../auth/types/auth.models.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';
import { HISTORY_MESSAGES } from './event-history.messages.js';
import { EventHistoryService } from './event-history.service.js';

@Controller('api/events/:eventId/history')
export class EventHistoryController {
  constructor(private readonly history: EventHistoryService) {}

  @Get()
  read(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.history.history(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  // One handler per method: Nest keeps only the last route decorator on a handler.
  @Put()
  rejectPut(@Res() response: Response) {
    readOnly(response);
  }

  @Patch()
  rejectPatch(@Res() response: Response) {
    readOnly(response);
  }

  @Delete()
  rejectDelete(@Res() response: Response) {
    readOnly(response);
  }

  @Put(':entryId')
  rejectEntryPut(@Res() response: Response) {
    readOnly(response);
  }

  @Patch(':entryId')
  rejectEntryPatch(@Res() response: Response) {
    readOnly(response);
  }

  @Delete(':entryId')
  rejectEntryDelete(@Res() response: Response) {
    readOnly(response);
  }
}

function readOnly(response: Response) {
  response.status(405).set('Allow', 'GET').json({ statusCode: 405, message: HISTORY_MESSAGES.readOnly });
}
