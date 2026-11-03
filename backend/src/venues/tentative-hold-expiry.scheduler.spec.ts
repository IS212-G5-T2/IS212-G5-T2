import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { VenuesRepository } from './repository/venues.repository.js';
import { TentativeHoldExpiryScheduler } from './tentative-hold-expiry.scheduler.js';

describe('TentativeHoldExpiryScheduler', () => {
  afterEach(() => {
    delete process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** VEN-HOLD-DEC-06-B: a configured interval triggers expiry processing and module shutdown stops the timer. */
  it('VEN-HOLD-DEC-06-B invokes expiry processing on the configured schedule and clears its timer', async () => {
    vi.useFakeTimers();
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = '5000';
    const repository = { processExpiredTentativeHolds: vi.fn().mockResolvedValue([]) } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository);

    // Lifecycle shutdown before initialization is safe and schedules no work.
    scheduler.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(4999);
    expect(repository.processExpiredTentativeHolds).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.processExpiredTentativeHolds).toHaveBeenCalledOnce();
    scheduler.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(repository.processExpiredTentativeHolds).toHaveBeenCalledOnce();
  });

  /** VEN-HOLD-DEC-06-B: overlapping scheduled work does not run the expiry processor twice. */
  it('VEN-HOLD-DEC-06-B coalesces overlapping expiry processor calls', async () => {
    let finish!: () => void;
    const work = new Promise<string[]>((resolve) => { finish = () => resolve([]); });
    const repository = { processExpiredTentativeHolds: vi.fn(() => work) } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository);

    const first = scheduler.process();
    await scheduler.process();
    expect(repository.processExpiredTentativeHolds).toHaveBeenCalledOnce();
    finish();
    await first;
  });

  /** VEN-HOLD-DEC-06-B: invalid scheduler configuration uses the safe one-minute default interval. */
  it('VEN-HOLD-DEC-06-B falls back to the default interval when configuration is invalid', async () => {
    vi.useFakeTimers();
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = '999';
    const repository = { processExpiredTentativeHolds: vi.fn().mockResolvedValue([]) } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository);

    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(repository.processExpiredTentativeHolds).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.processExpiredTentativeHolds).toHaveBeenCalledOnce();
    scheduler.onModuleDestroy();
  });

  /** VEN-HOLD-DEC-06-B: processor failures are logged and do not prevent the next scheduled attempt. */
  it('VEN-HOLD-DEC-06-B logs processor errors and allows a later scheduled attempt', async () => {
    const repository = {
      processExpiredTentativeHolds: vi.fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockRejectedValueOnce('untyped failure'),
    } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await scheduler.process();
    await scheduler.process();

    expect(repository.processExpiredTentativeHolds).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][1]).toContain('database unavailable');
    expect(error.mock.calls[1][1]).toBe('untyped failure');
  });
});
