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
    const repository = { processExpiredTentativeHolds: vi.fn().mockResolvedValue([]), processTentativeHoldReminders: vi.fn().mockResolvedValue([]) } as unknown as VenuesRepository;
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
    const repository = { processExpiredTentativeHolds: vi.fn(() => work), processTentativeHoldReminders: vi.fn().mockResolvedValue([]) } as unknown as VenuesRepository;
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
    const repository = { processExpiredTentativeHolds: vi.fn().mockResolvedValue([]), processTentativeHoldReminders: vi.fn().mockResolvedValue([]) } as unknown as VenuesRepository;
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
      processTentativeHoldReminders: vi.fn().mockResolvedValue([]),
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
  // SPM-134: the 48-hour reminder runs on the same tick as the expiry processor.

  /**
   * HOLD-EXP-NOTIF-01-I (SPM-134 AC1): one tick runs the expiry processor first and then the reminder processor, each
   * once, so the reminders go out on the existing scheduler cadence.
   * Kills: a reminder processor that is never scheduled, or runs before the expiry processor.
   */
  it('HOLD-EXP-NOTIF-01-I one tick runs expiry processing and then reminder processing once each', async () => {
    const order: string[] = [];
    const repository = {
      processExpiredTentativeHolds: vi.fn(async () => { order.push('expiry'); return []; }),
      processTentativeHoldReminders: vi.fn(async () => { order.push('reminder'); return []; }),
    } as unknown as VenuesRepository;

    await new TentativeHoldExpiryScheduler(repository).process();

    expect(order).toEqual(['expiry', 'reminder']);
  });

  /**
   * HOLD-EXP-NOTIF-02-F (SPM-134 AC2): a failure in one processor is logged and does not stop the other on the same tick.
   * Kills: one try block around both calls.
   */
  it.each([
    ['expiry', 'processExpiredTentativeHolds', 'processTentativeHoldReminders'],
    ['reminder', 'processTentativeHoldReminders', 'processExpiredTentativeHolds'],
  ])('HOLD-EXP-NOTIF-02-F a failing %s processor does not stop the other one', async (_label, failing, other) => {
    const repository = {
      processExpiredTentativeHolds: vi.fn().mockResolvedValue([]),
      processTentativeHoldReminders: vi.fn().mockResolvedValue([]),
      [failing]: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as VenuesRepository;
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await new TentativeHoldExpiryScheduler(repository).process();

    expect((repository as unknown as Record<string, ReturnType<typeof vi.fn>>)[other]).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
