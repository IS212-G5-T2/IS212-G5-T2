import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { VenuesRepository } from './repository/venues.repository.js';

const DEFAULT_INTERVAL_MS = 60_000;

/** Periodically persists processing of logically expired approved tentative holds and sends their expiry reminders. */
/* v8 ignore start -- TypeScript decorator metadata emits an unreachable fallback branch. */
@Injectable()
export class TentativeHoldExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TentativeHoldExpiryScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly venues: VenuesRepository) {}
/* v8 ignore stop */

  onModuleInit(): void {
    const configured = Number(process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured >= 1_000 ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.process(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Exposed for deterministic tests; overlapping timer ticks are coalesced. One tick persists elapsed holds as expired
   * and then sends the 48-hour reminders (SPM-134); a failure in one is logged and does not stop the other.
   */
  async process(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run('Tentative hold expiry processing', () => this.venues.processExpiredTentativeHolds());
      await this.run('Tentative hold reminder processing', () => this.venues.processTentativeHoldReminders());
    } finally {
      this.running = false;
    }
  }

  private async run(label: string, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`${label} failed`, error instanceof Error ? error.stack : String(error));
    }
  }
}
