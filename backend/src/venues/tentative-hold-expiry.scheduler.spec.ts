import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VenuesRepository } from './repository/venues.repository.js';
import { TentativeHoldExpiryScheduler } from './tentative-hold-expiry.scheduler.js';

describe('TentativeHoldExpiryScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS;
  });

  /** VEN-HOLD-DEC-06-B: destroying a module before scheduler startup is safe and creates no interval. */
  it('handles module destruction before initialization', () => {
    vi.useFakeTimers();
    const repository = { expireDueTentativeHolds: vi.fn() } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository, { now: () => new Date('2030-11-15T00:59:59.000Z') });

    expect(() => scheduler.onModuleDestroy()).not.toThrow();
    expect(repository.expireDueTentativeHolds).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  /** VEN-HOLD-DEC-06-B: the registered timer invokes expiry processing repeatedly without duplicate transitions. */
  it('runs the expiry processor at startup and on its configured timer', async () => {
    vi.useFakeTimers();
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = '1000';
    const now = new Date('2030-11-15T00:59:59.000Z');
    const repository = {
      expireDueTentativeHolds: vi.fn().mockResolvedValue(1),
    } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository, { now: () => now });

    scheduler.onModuleInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(repository.expireDueTentativeHolds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(repository.expireDueTentativeHolds).toHaveBeenCalledTimes(2));
    expect(repository.expireDueTentativeHolds).toHaveBeenNthCalledWith(2, now);
    scheduler.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  /** VEN-HOLD-DEC-06-B: invalid cadence configuration falls back safely and processor errors do not stop expiry processing. */
  it('uses the default cadence for invalid configuration and contains processor failures', async () => {
    vi.useFakeTimers();
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = 'not-a-duration';
    const repository = {
      expireDueTentativeHolds: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as VenuesRepository;
    const scheduler = new TentativeHoldExpiryScheduler(repository, { now: () => new Date('2030-11-15T00:59:59.000Z') });
    const logger = vi.spyOn((scheduler as unknown as { logger: { error: (...args: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);

    scheduler.onModuleInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(repository.expireDueTentativeHolds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(repository.expireDueTentativeHolds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(repository.expireDueTentativeHolds).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
