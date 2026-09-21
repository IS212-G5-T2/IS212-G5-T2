import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventsController } from './events/events.controller.js';
import { EventRejectionsController } from './events/event-rejections.controller.js';
import { EventsService } from './events/events.service.js';
import { DraftsController } from './events/drafts.controller.js';
import { DraftsService } from './events/drafts.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthController } from './auth/auth.controller.js';
import { FirebaseAuthenticationMiddleware } from './auth/authentication/firebase-authentication.middleware.js';
import { ClarificationsModule } from './clarifications/clarifications.module.js';
import { ClarificationsController } from './clarifications/clarifications.controller.js';

@Module({
  imports: [AuthModule, ClarificationsModule],
  controllers: [
    AppController,
    EventsController,
    EventRejectionsController,
    DraftsController,
  ],
  providers: [AppService, EventsService, DraftsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(FirebaseAuthenticationMiddleware)
      .forRoutes(
        AuthController,
        ClarificationsController,
        EventRejectionsController,
      );
  }
}
