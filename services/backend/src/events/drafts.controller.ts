import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { DraftsService } from './drafts.service.js';

@Controller('api/requests')
export class DraftsController {
  constructor(@Inject(DraftsService) private readonly drafts: DraftsService) {}
  @Get() list() {
    return this.drafts.list();
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.drafts.get(id);
  }
  @Put(':id') save(@Param('id') id: string, @Body() body: unknown) {
    return this.drafts.save(id, body);
  }
  @Post(':id/submit') submit(@Param('id') id: string, @Body() body: unknown) {
    return this.drafts.submit(id, body);
  }
}
