import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { EventsService } from './events.service.js';

@Controller('api')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}
  @Get('events') list() {
    return this.events.list();
  }
  @Get('events/:id') get(@Param('id') id: string) {
    return this.events.get(id);
  }
  @Post('events') create(@Body() body: unknown) {
    return this.events.create(body);
  }
  @Post('events/:id/assign') assign(@Param('id') id: string, @Body() body: unknown) {
    return this.events.assignCoordinator(id, body);
  }
}
