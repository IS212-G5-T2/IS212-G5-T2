import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ClarificationsController } from './clarifications.controller.js';
import { ClarificationsRepository } from './clarifications.repository.js';
import { ClarificationsService } from './clarifications.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ClarificationsController],
  providers: [ClarificationsService, ClarificationsRepository],
})
export class ClarificationsModule {}
