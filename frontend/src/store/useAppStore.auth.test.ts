import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, login, logout, restoreSession } from "@/lib/auth";
import { api } from "@/utils/api";
import { useAppStore } from "./useAppStore";
import type { User } from "@/types";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, login: vi.fn(), logout: vi.fn(), restoreSession: vi.fn() };
});

const mockLogin = vi.mocked(login);
const mockLogout = vi.mocked(logout);
const mockRestoreSession = vi.mocked(restoreSession);
const placeholder = { id: "current-user", name: "Current User", email: "", role: "attendee" as const };
const multiRoleUser: User = {
  id: "user-1", name: "Coor_Venue", email: "coordinator_venuestaff@connectsphere.test",
  role: "coordinator", roles: ["coordinator", "venue_staff"],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ currentUser: placeholder, isAuthenticated: false, authLoading: false });
});

describe("useAppStore authentication", () => {
  // Stores the full server role list and trims the email at the store boundary.
  it("signs in and retains every assigned role", async () => {
    mockLogin.mockResolvedValueOnce(multiRoleUser);

    await expect(useAppStore.getState().login(" coordinator_venuestaff@connectsphere.test ", "P@55w0rd"))
      .resolves.toEqual({ success: true });

    expect(mockLogin).toHaveBeenCalledWith("coordinator_venuestaff@connectsphere.test", "P@55w0rd");
    expect(useAppStore.getState()).toMatchObject({
      currentUser: multiRoleUser, isAuthenticated: true, authLoading: false,
    });
  });

  // Keeps expected authentication failures user-safe without changing session state.
  it("returns an expected authentication error without authenticating", async () => {
    mockLogin.mockRejectedValueOnce(new AuthError(401, "Invalid email or password"));

    await expect(useAppStore.getState().login("attendee1@connectsphere.test", "wrong"))
      .resolves.toEqual({ success: false, error: "Invalid email or password" });

    expect(useAppStore.getState()).toMatchObject({ currentUser: placeholder, isAuthenticated: false });
  });

  // Prevents unexpected implementation errors from reaching the login page.
  it("returns a generic error for an unexpected login failure", async () => {
    mockLogin.mockRejectedValueOnce(new Error("connection detail"));

    await expect(useAppStore.getState().login("attendee1@connectsphere.test", "wrong"))
      .resolves.toEqual({ success: false, error: "We couldn't sign you in. Please try again." });
  });

  // Restores a valid persisted HTTP-only session during application startup.
  it("restores an active session", async () => {
    mockRestoreSession.mockResolvedValueOnce(multiRoleUser);

    await useAppStore.getState().restoreAuthSession();

    expect(useAppStore.getState()).toMatchObject({ currentUser: multiRoleUser, isAuthenticated: true, authLoading: false });
  });

  // A missing session is an ordinary signed-out state rather than an error.
  it("sets a signed-out state when session restoration finds no cookie", async () => {
    useAppStore.setState({
      currentUser: multiRoleUser,
      isAuthenticated: true,
      events: [{ id: "cached-event" } as never],
      notifications: [{ id: "cached-notification" } as never],
    });
    mockRestoreSession.mockResolvedValueOnce(undefined);

    await useAppStore.getState().restoreAuthSession();

    expect(useAppStore.getState()).toMatchObject({
      currentUser: placeholder, isAuthenticated: false, authLoading: false,
      events: [], notifications: [],
    });
  });

  // A failed session lookup cannot leave the loading screen stuck or preserve stale identity.
  it("clears state when session restoration fails", async () => {
    useAppStore.setState({ currentUser: multiRoleUser, isAuthenticated: true });
    mockRestoreSession.mockRejectedValueOnce(new Error("network failure"));

    await useAppStore.getState().restoreAuthSession();

    expect(useAppStore.getState()).toMatchObject({ currentUser: placeholder, isAuthenticated: false, authLoading: false });
  });

  // A late startup session result must not undo a newer sign-out action.
  it("keeps the signed-out state when a stale session restore resolves", async () => {
    let resolveRestore!: (user: User | undefined) => void;
    mockRestoreSession.mockImplementationOnce(
      () => new Promise<User | undefined>((resolve) => { resolveRestore = resolve; }),
    );
    mockLogout.mockResolvedValueOnce();

    // Start restoration, then sign out before its request completes.
    const pendingRestore = useAppStore.getState().restoreAuthSession();
    await Promise.resolve();
    await useAppStore.getState().logout();

    // The obsolete restore result cannot reinstate the previous user.
    resolveRestore(multiRoleUser);
    await pendingRestore;
    expect(useAppStore.getState()).toMatchObject({
      currentUser: placeholder,
      isAuthenticated: false,
      authLoading: false,
    });
  });

  // A failed startup lookup that finishes after a newer lookup succeeded must not sign that user out.
  it("keeps a newer session when an older session lookup fails late", async () => {
    let rejectOlder!: (error: Error) => void;
    mockRestoreSession
      .mockImplementationOnce(() => new Promise<User | undefined>((_resolve, reject) => { rejectOlder = reject; }))
      .mockResolvedValueOnce(multiRoleUser);

    const olderLookup = useAppStore.getState().restoreAuthSession();
    await useAppStore.getState().restoreAuthSession();
    rejectOlder(new Error("network failure"));
    await olderLookup;

    expect(useAppStore.getState()).toMatchObject({
      currentUser: multiRoleUser,
      isAuthenticated: true,
      authLoading: false,
    });
  });

  /** A shared API 401 clears identity, cached collections, and user-specific filters. */
  it("clears auth and every cached collection when a shared API request gets a 401", async () => {
    useAppStore.setState({
      currentUser: multiRoleUser,
      isAuthenticated: true,
      events: [{ id: "cached-event" } as never],
      venues: [{ id: "cached-venue" } as never],
      bookings: [{ id: "cached-booking" } as never],
      equipment: [{ id: "cached-equipment" } as never],
      equipmentRequests: [{ id: "cached-request" } as never],
      registrations: [{ id: "cached-registration" } as never],
      notifications: [{ id: "cached-notification" } as never],
      eventListFilters: { attendee: "past", status: "confirmed" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(api("/notifications")).rejects.toMatchObject({ status: 401, message: "Request failed." });

    expect(useAppStore.getState()).toMatchObject({
      currentUser: placeholder,
      isAuthenticated: false,
      authLoading: false,
      events: [], venues: [], bookings: [], equipment: [], equipmentRequests: [], registrations: [], notifications: [],
      eventListFilters: { attendee: "upcoming", status: null },
    });
  });

  /** Authorization, validation, and server errors do not imply an expired session. */
  it.each([403, 422, 500])("keeps the signed-in session for an API %s response", async (status) => {
    useAppStore.setState({ currentUser: multiRoleUser, isAuthenticated: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

    await expect(api("/notifications")).rejects.toMatchObject({ status });

    expect(useAppStore.getState()).toMatchObject({ currentUser: multiRoleUser, isAuthenticated: true });
  });

  /** Transport failures leave the current client session intact. */
  it("keeps the signed-in session when an API request fails before receiving a response", async () => {
    useAppStore.setState({ currentUser: multiRoleUser, isAuthenticated: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    await expect(api("/notifications")).rejects.toMatchObject({ status: undefined });

    expect(useAppStore.getState()).toMatchObject({ currentUser: multiRoleUser, isAuthenticated: true });
  });

  /** A response from a previous session revision cannot clear the newer login. */
  it("does not let an old request's late 401 clear a newer successful login", async () => {
    useAppStore.setState({ currentUser: placeholder, isAuthenticated: false });
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));

    const oldRequest = api("/notifications").catch((error: unknown) => error);
    await Promise.resolve();
    mockLogin.mockResolvedValueOnce(multiRoleUser);
    await useAppStore.getState().login(multiRoleUser.email, "secret");
    resolveResponse(new Response(null, { status: 401 }));
    await oldRequest;

    expect(useAppStore.getState()).toMatchObject({ currentUser: multiRoleUser, isAuthenticated: true });
  });

  // Logout always clears browser state after a successful server-side revocation.
  it("clears authentication state after logout", async () => {
    useAppStore.setState({ currentUser: multiRoleUser, isAuthenticated: true });
    mockLogout.mockResolvedValueOnce();

    await useAppStore.getState().logout();

    expect(mockLogout).toHaveBeenCalledOnce();
    expect(useAppStore.getState()).toMatchObject({ currentUser: placeholder, isAuthenticated: false, authLoading: false });
  });

  // Logout clears browser identity even if the backend is unavailable, avoiding a stale session UI.
  it("clears authentication state when logout request fails", async () => {
    useAppStore.setState({ currentUser: multiRoleUser, isAuthenticated: true });
    mockLogout.mockRejectedValueOnce(new Error("network failure"));

    await expect(useAppStore.getState().logout()).rejects.toThrow("network failure");

    expect(useAppStore.getState()).toMatchObject({ currentUser: placeholder, isAuthenticated: false, authLoading: false });
  });
});
