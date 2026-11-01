import { describe, expect, it, vi } from "vitest";
import {
  advanceAuthSessionRevision,
  getAuthSessionRevision,
  onAuthSessionExpired,
  reportAuthSessionExpired,
} from "./authSessionRevision";

describe("auth session request revision", () => {
  /** A current 401 notifies listeners; stale revisions and unsubscribed listeners are ignored. */
  it("notifies listeners only for a current request and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = onAuthSessionExpired(listener);
    const oldRevision = getAuthSessionRevision();
    const currentRevision = advanceAuthSessionRevision();

    reportAuthSessionExpired(oldRevision);
    expect(listener).not.toHaveBeenCalled();

    reportAuthSessionExpired(currentRevision);
    expect(listener).toHaveBeenCalledExactlyOnceWith(currentRevision);

    unsubscribe();
    reportAuthSessionExpired(currentRevision);
    expect(listener).toHaveBeenCalledExactlyOnceWith(currentRevision);
  });
});
