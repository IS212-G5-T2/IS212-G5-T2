import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
import { DraftsController } from './events/drafts.controller.js';
import { DraftsService } from './events/drafts.service.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [],
  controllers: [AppController, EventsController, DraftsController],
  providers: [AppService, EventsService, DraftsService],
})
export class AppModule {}
