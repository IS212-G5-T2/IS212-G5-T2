import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [],
  controllers: [AppController, EventsController],
  providers: [AppService, EventsService],
})
export class AppModule {}
