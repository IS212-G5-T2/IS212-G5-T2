import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../common/clock.js';
import { VenuesRepository } from './repository/venues.repository.js';

const DEFAULT_INTERVAL_MS = 30_000;

/** Runs the idempotent hold-expiry processor at startup and once per configured interval. */
@Injectable()
export class TentativeHoldExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TentativeHoldExpiryScheduler.name);
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly repository: VenuesRepository,
    @Optional() @Inject(CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  onModuleInit(): void {
    const configured = Number(process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS);
    const intervalMs =
      Number.isSafeInteger(configured) && configured >= 1_000
        ? configured
        : DEFAULT_INTERVAL_MS;
    void this.processDueHolds();
    this.interval = setInterval(() => void this.processDueHolds(), intervalMs);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async processDueHolds(): Promise<void> {
    try {
      await this.repository.expireDueTentativeHolds(this.clock.now());
    } catch (error) {
      this.logger.error('Failed to persist due tentative hold expiries', error);
    }
  }
}
