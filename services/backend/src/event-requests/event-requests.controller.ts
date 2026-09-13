import { Body, Controller, Get, Header, Inject, Param, Put } from '@nestjs/common';
import { EventRequestsService } from './event-requests.service.js';
import { anonymousDraftWorkspace } from './draft-workspace.js';

@Controller('event-requests')
export class EventRequestsController {
  constructor(@Inject(EventRequestsService) private readonly service: EventRequestsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list() { return this.service.list(anonymousDraftWorkspace); }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string) { return this.service.get(id, anonymousDraftWorkspace); }
  @Put(':id/draft')
  @Header('Cache-Control', 'no-store')
  save(@Param('id') id: string, @Body() body: unknown) {
    return this.service.save(id, body, anonymousDraftWorkspace);
  }
}
