import {
  Body,
  Controller,
  Get,
  Req,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { EventsService } from './events.service.js';

@Controller('api')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}
  @Get('events') list(@Req() request: { currentUser?: AuthenticatedUser }) {
    return this.events.list(request.currentUser);
  }
  @Get('events/:id') get(
    @Req() request: { currentUser?: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.events.get(request.currentUser, id);
  }
  @Post('events') create(
    @Req() request: { currentUser?: AuthenticatedUser },
    @Body() body: unknown,
  ) {
    return this.events.create(request.currentUser, body);
  }
}
