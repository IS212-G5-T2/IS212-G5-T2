import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { EventsController } from './events/events.controller.js';
import { EventRejectionsController } from './events/event-rejections.controller.js';
import { EventsService } from './events/events.service.js';
import { EventPlanningController } from './events/event-planning.controller.js';
import { EventPlanningRepository } from './events/event-planning.repository.js';
import { EventPlanningService } from './events/event-planning.service.js';
import { DraftsController } from './events/drafts.controller.js';
import { DraftsService } from './events/drafts.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthenticationMiddleware } from './auth/authentication/authentication.middleware.js';
import { ClarificationsModule } from './clarifications/clarifications.module.js';
import { ClarificationsController } from './clarifications/clarifications.controller.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [AuthModule, ClarificationsModule, DatabaseModule],
  controllers: [
    AppController,
    EventsController,
    EventRejectionsController,
    EventPlanningController,
    DraftsController,
  ],
  providers: [
    AppService,
    EventsService,
    DraftsService,
    EventPlanningService,
    EventPlanningRepository,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthenticationMiddleware)
      .forRoutes(
        { path: 'api/auth/me', method: RequestMethod.GET },
        EventsController,
        EventRejectionsController,
        EventPlanningController,
        DraftsController,
        ClarificationsController,
      );
  }
}
