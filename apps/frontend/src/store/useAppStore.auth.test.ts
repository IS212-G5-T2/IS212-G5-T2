import type { User as FirebaseUser, IdTokenResult } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./useAppStore";
import type { EventRecord } from "@/types";

/**
 * Creates the smallest Firebase user double needed by the role-resolution flow.
 *
 * @param roles - Custom role claims returned by the Firebase ID token.
 * @returns A Firebase user-shaped test double with a verified token result.
 */
function firebaseUserWithRoles(roles: unknown): FirebaseUser {
  return {
    uid: "organiser-1",
    displayName: "Event Organiser",
    email: "organiser@example.com",
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: { roles } }),
  } as unknown as FirebaseUser;
}

// Reset the auth-specific state without replacing the Zustand action methods.
beforeEach(() => {
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: false,
    currentUser: {
      id: "current-user",
      name: "Current User",
      email: "",
      role: "attendee",
    },
  });
});

describe("setAuthUser", () => {
  // An earlier account's token lookup must not restore that account after sign-out.
  it("ignores a late token result after sign-out", async () => {
    // Hold the previous account's lookup open.
    let resolve!: (value: IdTokenResult) => void;
    const user = firebaseUserWithRoles(["ORGANISER"]);
    vi.mocked(user.getIdTokenResult).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = useAppStore.getState().setAuthUser(user);
    // Sign out before the previous lookup finishes.
    await useAppStore.getState().setAuthUser(null);
    resolve({
      claims: { roles: ["ORGANISER"] },
      token: "test-token",
      authTime: "2026-01-01T00:00:00Z",
      issuedAtTime: "2026-01-01T00:00:00Z",
      expirationTime: "2026-01-01T01:00:00Z",
      signInProvider: "password",
      signInSecondFactor: null,
    });
    await pending;
    // The signed-out session remains in effect.
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });
  // Private cached events must not survive account switching or sign-out.
  it.each([null, firebaseUserWithRoles(["ORGANISER"])])("clears prior account events on session change", async (user) => {
    // Start with the previous account's cached event.
    useAppStore.setState({ events: [{ id: "private-event" } as EventRecord] });
    // Resolve sign-out or another user's session.
    await useAppStore.getState().setAuthUser(user);
    // No previous owner's event remains in memory.
    expect(useAppStore.getState().events).toEqual([]);
  });
  it("identifies an Event Organiser from the verified Firebase role claim", async () => {
    await useAppStore.getState().setAuthUser(firebaseUserWithRoles(["ORGANISER"]));

    expect(useAppStore.getState()).toMatchObject({
      authLoading: false,
      isAuthenticated: true,
      currentUser: {
        id: "organiser-1",
        role: "organiser",
      },
    });
  });

  it("does not authenticate a user with no supported Firebase role claim", async () => {
    await useAppStore.getState().setAuthUser(firebaseUserWithRoles(["ADMIN"]));

    expect(useAppStore.getState()).toMatchObject({
      authLoading: false,
      isAuthenticated: false,
      currentUser: { role: "attendee" },
    });
  });
});
