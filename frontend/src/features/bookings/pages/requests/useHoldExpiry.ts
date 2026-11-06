import { useState, useEffect } from "react";

/**
 * Returns true if a tentative hold has expired, updating live at the exact expiry instant
 * so the caller re-renders without a page reload (SPM-133 AC1).
 * Equality (now >= holdExpiresAt) counts as expired per the test matrix.
 */
export function useHoldExpiry(
  holdExpiresAt: string | undefined,
  initialExpired: boolean,
): boolean {
  const [isExpired, setIsExpired] = useState<boolean>(() => {
    if (initialExpired) return true;
    if (!holdExpiresAt) return false;
    // A malformed holdExpiresAt string produces NaN; NaN comparisons are false, so the hook
    // returns false (not expired) rather than throwing. The backend always sends valid ISO strings.
    return Date.now() >= new Date(holdExpiresAt).getTime();
  });

  useEffect(() => {
    if (isExpired || !holdExpiresAt) return;
    const msUntilExpiry = new Date(holdExpiresAt).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      setIsExpired(true);
      return;
    }
    // setTimeout silently overflows when delay > 2^31 - 1 ms (~24.8 days) and fires immediately.
    // Holds expiring beyond that window are not live-updatable in a single render; skip the timer.
    const MAX_TIMEOUT_MS = 2_147_483_647;
    if (msUntilExpiry > MAX_TIMEOUT_MS) return;
    const id = setTimeout(() => setIsExpired(true), msUntilExpiry);
    return () => clearTimeout(id);
  }, [holdExpiresAt, isExpired]);

  return isExpired;
}
