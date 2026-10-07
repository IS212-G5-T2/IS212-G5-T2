import { Module } from '@nestjs/common';
import { RbacRepository } from '../auth/authorization/rbac.repository.js';
import { DatabaseModule } from '../database/database.module.js';
import { CLOCK, systemClock } from '../registrations/clock.js';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';
import { VenuesRepository } from './venues.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [VenuesController],
  providers: [
    VenuesRepository,
    VenuesService,
    RbacRepository,
    { provide: CLOCK, useValue: systemClock },
  ],
})
/** Registers the venue creation HTTP, policy, and persistence layers. */
export class VenuesModule {}
