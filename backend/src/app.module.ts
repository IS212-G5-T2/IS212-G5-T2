import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { EventsController } from './events/events.controller.js';
import { EventRejectionsController } from './events/rejections/event-rejections.controller.js';
import { EventsService } from './events/events.service.js';
import { DraftsController } from './events/drafts/drafts.controller.js';
import { DraftsService } from './events/drafts/drafts.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthenticationModule } from './authentication/authentication.module.js';
import { AuthenticationMiddleware } from './authentication/authentication.middleware.js';
import { ClarificationsModule } from './clarifications/clarifications.module.js';
import { ClarificationsController } from './clarifications/clarifications.controller.js';
import { CLOCK, systemClock } from './registrations/clock.js';
import { RegistrationsController } from './registrations/registrations.controller.js';
import { RegistrationsService } from './registrations/registrations.service.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [AuthenticationModule, ClarificationsModule, DatabaseModule],
  controllers: [
    AppController,
    EventsController,
    EventRejectionsController,
    DraftsController,
    RegistrationsController,
  ],
  providers: [
    AppService,
    EventsService,
    DraftsService,
    RegistrationsService,
    { provide: CLOCK, useValue: systemClock },
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
        DraftsController,
        RegistrationsController,
        ClarificationsController,
      );
  }
}
