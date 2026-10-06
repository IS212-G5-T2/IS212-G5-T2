import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { EventsController } from './events/events.controller.js';
import { EventRejectionsController } from './events/event-rejections.controller.js';
import { EventsService } from './events/events.service.js';
import { DraftsController } from './events/drafts.controller.js';
import { DraftsService } from './events/drafts.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthenticationMiddleware } from './auth/authentication/authentication.middleware.js';
import { ClarificationsModule } from './clarifications/clarifications.module.js';
import { ClarificationsController } from './clarifications/clarifications.controller.js';
import { CLOCK, systemClock } from './registrations/clock.js';
import { RegistrationsController } from './registrations/registrations.controller.js';
import { RegistrationsService } from './registrations/registrations.service.js';
import { DatabaseModule } from './database/database.module.js';
import { EquipmentController } from './equipment/equipment.controller.js';
import { EquipmentService } from './equipment/equipment.service.js';
import { CoordinatorAvailabilityController } from './coordinators/coordinator-availability.controller.js';
import { CoordinatorAvailabilityService } from './coordinators/coordinator-availability.service.js';
import { VenuesController } from './venues/venues.controller.js';
import { VenuesModule } from './venues/venues.module.js';

@Module({
  imports: [AuthModule, ClarificationsModule, DatabaseModule, VenuesModule],
  controllers: [
    AppController,
    EventsController,
    EventRejectionsController,
    DraftsController,
    RegistrationsController,
    EquipmentController,
    CoordinatorAvailabilityController,
  ],
  providers: [
    AppService,
    EventsService,
    DraftsService,
    RegistrationsService,
    EquipmentService,
    CoordinatorAvailabilityService,
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
        EquipmentController,
        VenuesController,
        ClarificationsController,
        CoordinatorAvailabilityController,
        VenuesController,
      );
  }
}
