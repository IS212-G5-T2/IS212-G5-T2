import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EventRequestsModule } from './event-requests/event-requests.module.js';

@Module({
  imports: [EventRequestsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
