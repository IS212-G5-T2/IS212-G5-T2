// Story: SPM-94 Track My Event Status (Organiser)
// ACs: AC4 (latest status, no stale data across sessions)
// Test cases: TRACK-EVENT-STATUS-04-B (C: logout then login clears stores)
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  restoreSession: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

import { logout } from "@/lib/auth";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

const orgOneEvent = {
  id: "00000000-0000-4000-8000-000000000501",
  name: "Student Mixer",
  organiserId: "ORG-01",
} as unknown as EventRecord;

describe("SPM-94 AC4 / 04-B C: logout leaves no previous organiser's data in the store", () => {
  beforeEach(() => {
    useAppStore.setState({ events: [orgOneEvent], isAuthenticated: true });
  });

  // Kills: M12 (store not cleared on logout)
  it("TRACK-EVENT-STATUS-04-B: after logout the events list is empty", async () => {
    await useAppStore.getState().logout();

    expect(useAppStore.getState().events).toEqual([]);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });
});

describe("SPM-94 AC4 / 04-B C: logout clears the store even when the request fails", () => {
  // Kills: the clear moved after a successful logout request (a failed request would leave the previous organiser's events).
  it("TRACK-EVENT-STATUS-04-B: the events list is empty after a failed logout request", async () => {
    useAppStore.setState({ events: [orgOneEvent], isAuthenticated: true });
    vi.mocked(logout).mockRejectedValueOnce(new Error("network down"));

    await expect(useAppStore.getState().logout()).rejects.toThrow("network down");

    expect(useAppStore.getState().events).toEqual([]);
  });
});
