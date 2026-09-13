import { Module } from '@nestjs/common';
import { EventRequestsController } from './event-requests.controller.js';
import { EventRequestsService } from './event-requests.service.js';
import { EventRequestsRepository } from './event-requests.repository.js';

@Module({ controllers: [EventRequestsController], providers: [EventRequestsService, EventRequestsRepository] })
export class EventRequestsModule {}
