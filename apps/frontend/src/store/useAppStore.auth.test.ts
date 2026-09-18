import type { User as FirebaseUser } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./useAppStore";

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
