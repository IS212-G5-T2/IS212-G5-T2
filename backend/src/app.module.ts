import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { EventsController } from './events/events.controller.js';
import { EventRejectionsController } from './events/review/event-rejections.controller.js';
import { EventsService } from './events/events.service.js';
import { EventPlanningController } from './events/event-planning.controller.js';
import { EventPlanningRepository } from './events/event-planning.repository.js';
import { EventPlanningService } from './events/event-planning.service.js';
import { DraftsController } from './event-drafts/drafts.controller.js';
import { DraftsService } from './event-drafts/drafts.service.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthenticationMiddleware } from './auth/authentication/authentication.middleware.js';
import { ClarificationsModule } from './clarifications/clarifications.module.js';
import { ClarificationsController } from './clarifications/clarifications.controller.js';
import { CLOCK, systemClock } from './common/clock.js';
import { RegistrationsController } from './registrations/registrations.controller.js';
import { ExportService } from './registrations/report/export.service.js';
import { RegistrationsService } from './registrations/registrations.service.js';
import { DatabaseModule } from './database/database.module.js';
import { EquipmentController } from './equipment/equipment.controller.js';
import { EquipmentService } from './equipment/equipment.service.js';
import { CoordinatorAvailabilityController } from './coordinator-availability/coordinator-availability.controller.js';
import { CoordinatorAvailabilityService } from './coordinator-availability/coordinator-availability.service.js';
import { VenuesController } from './venues/venues.controller.js';
import { VenuesModule } from './venues/venues.module.js';
import { LeadAssignmentController } from './lead/lead-assignment.controller.js';
import { LeadAssignmentService } from './lead/lead-assignment.service.js';

@Module({
  imports: [AuthModule, ClarificationsModule, DatabaseModule, VenuesModule],
  controllers: [
    AppController,
    EventsController,
    EventRejectionsController,
    EventPlanningController,
    DraftsController,
    RegistrationsController,
    EquipmentController,
    CoordinatorAvailabilityController,
    LeadAssignmentController,
  ],
  providers: [
    AppService,
    EventsService,
    DraftsService,
    RegistrationsService,
    ExportService,
    EquipmentService,
    CoordinatorAvailabilityService,
    LeadAssignmentService,
    EventPlanningService,
    EventPlanningRepository,
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
        EventPlanningController,
        EventPlanningService,
        EventPlanningRepository,
        DraftsController,
        RegistrationsController,
        EquipmentController,
        VenuesController,
        ClarificationsController,
        CoordinatorAvailabilityController,
        LeadAssignmentController,
      );
  }
}
