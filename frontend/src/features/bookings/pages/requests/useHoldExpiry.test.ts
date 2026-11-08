import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoldExpiry } from "./useHoldExpiry";

/**
 * Unit tests for useHoldExpiry (SPM-133 AC1).
 * Fake timers are used throughout so no real wall-clock time is consumed and
 * delays stay within the 32-bit signed integer limit that setTimeout accepts.
 */
describe("useHoldExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Traceability: Jira 133 AC1 (matrix 39223343)
  /**
   * VEN-HOLD-EXP-01-B: hook returns false when the hold has not yet expired.
   * initialExpired is false; holdExpiresAt is a short time in the future.
   */
  it("VEN-HOLD-EXP-01-B returns false when the hold has not yet expired", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => useHoldExpiry(future, false));
    expect(result.current).toBe(false);
  });

  // Traceability: Jira 133 AC1 (matrix 39223343)
  /**
   * VEN-HOLD-EXP-01-BND-1: hook returns true at the exact equality boundary (now >= holdExpiresAt).
   * Equality counts as expired per the AC and test matrix.
   */
  it("VEN-HOLD-EXP-01-BND-1 returns true at the exact expiry instant (equality boundary)", () => {
    // Set a time exactly equal to now (no advance needed; Date.now() equals the expiry).
    const now = new Date(Date.now()).toISOString();
    const { result } = renderHook(() => useHoldExpiry(now, false));
    expect(result.current).toBe(true);
  });

  // Traceability: Jira 133 AC1 (matrix 39223343)
  /**
   * VEN-HOLD-EXP-01-A: hook auto-updates to true via setTimeout when the hold reaches its expiry.
   * Uses a short delay (5 s) to stay safely within the 32-bit signed integer limit.
   */
  it("VEN-HOLD-EXP-01-A auto-updates to true when the hold reaches its expiry", () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    const { result } = renderHook(() => useHoldExpiry(future, false));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current).toBe(true);
  });

  // Traceability: Jira 133 AC5 (matrix 39223343)
  /**
   * VEN-HOLD-EXP-05-A: hook returns true immediately on mount when holdExpiresAt is at or
   * before now — covers the AC5 case where the user opens or reloads the page after expiry.
   */
  it("VEN-HOLD-EXP-05-A returns true immediately on mount when the hold is already past its expiry", () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    const { result } = renderHook(() => useHoldExpiry(past, false));
    expect(result.current).toBe(true);
  });

  // Traceability: Jira 133 AC5 (matrix 39223343)
  /**
   * VEN-HOLD-EXP-05-B: when the server marks the hold expired (initialExpired=true) but no
   * holdExpiresAt date is present (e.g. manually cancelled then expired), the hook still
   * returns true immediately — the flag is sufficient on its own.
   */
  it("VEN-HOLD-EXP-05-B returns true when initialExpired is true and holdExpiresAt is undefined", () => {
    const { result } = renderHook(() => useHoldExpiry(undefined, true));
    expect(result.current).toBe(true);
  });

  /** Returns true immediately when initialExpired is true (server-side expired flag). */
  it("VEN-HOLD-EXP-05-SUP-1 returns true immediately when initialExpired is true", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => useHoldExpiry(future, true));
    expect(result.current).toBe(true);
  });

  /** Returns false when holdExpiresAt is undefined and initialExpired is false. */
  it("VEN-HOLD-EXP-01-SUP-1 returns false when holdExpiresAt is undefined", () => {
    const { result } = renderHook(() => useHoldExpiry(undefined, false));
    expect(result.current).toBe(false);
  });

  /** Clears the timer on unmount and does not call setState after the component is gone. */
  it("VEN-HOLD-EXP-01-SUP-2 clears the timer on unmount without error", () => {
    const future = new Date(Date.now() + 5_000).toISOString();
    const { unmount } = renderHook(() => useHoldExpiry(future, false));
    unmount();
    // Advancing past expiry after unmount should not trigger a state-update warning.
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  /**
   * Verifies that holdExpiresAt beyond the 32-bit setTimeout limit (> ~24.8 days) does not
   * cause the timer to fire immediately (which would incorrectly flip isExpired to true).
   */
  it("VEN-HOLD-EXP-01-SUP-3 does not set isExpired when expiry is beyond the 32-bit setTimeout limit", () => {
    // 2^31 ms ≈ 24.86 days; use 25 days to be clearly over the limit.
    const farFuture = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useHoldExpiry(farFuture, false));
    expect(result.current).toBe(false);
    // Advance by the full 25-day delta; no setTimeout should have been set.
    act(() => {
      vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1000);
    });
    // Still false — no scheduled flip.
    expect(result.current).toBe(false);
  });
});
