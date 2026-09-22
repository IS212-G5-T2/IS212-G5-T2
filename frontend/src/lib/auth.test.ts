import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, login, logout, restoreSession, toLocalUser } from "./auth";

const account = {
  uid: "user-1",
  email: "attendee1@connectsphere.test",
  name: "Local Attendee",
  roles: ["ATTENDEE"],
};

describe("auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // USER-LOGIN-01-A: The server role is mapped into the UI's existing route-guard role model.
  it("maps a supported server role into the UI user", () => {
    expect(toLocalUser(account)).toEqual({
      id: "user-1",
      email: "attendee1@connectsphere.test",
      name: "Local Attendee",
      role: "attendee",
      roles: ["attendee"],
    });
  });

  // USER-LOGIN-01-A: Retain every supported server role while choosing the first for legacy display.
  it("normalizes mixed-case roles and preserves the configured role order", () => {
    expect(toLocalUser({
      uid: "user-2",
      email: "organiser_coordinator@connectsphere.test",
      roles: [" coordinator ", "organiser", "UNKNOWN"],
    })).toMatchObject({
      role: "organiser",
      roles: ["organiser", "coordinator"],
    });
  });

  // USER-LOGIN-01-A: An account without an authorized role must never become a UI session.
  it("rejects a server account with no supported role", () => {
    expect(toLocalUser({ ...account, roles: ["UNKNOWN"] })).toBeUndefined();
  });

  // USER-LOGIN-01-A: Incomplete server profiles still have safe presentational fallbacks.
  it("uses email, then a neutral name and empty email, when profile fields are omitted", () => {
    expect(toLocalUser({ uid: "email-name", email: "fallback@connectsphere.test", roles: ["ATTENDEE"] }))
      .toMatchObject({ name: "fallback@connectsphere.test", email: "fallback@connectsphere.test" });
    expect(toLocalUser({ uid: "anonymous-name", roles: ["ATTENDEE"] }))
      .toMatchObject({ name: "Signed-in user", email: "" });
  });

  // USER-LOGIN-01-B: Login sends credentials once and lets the browser retain the HTTP-only cookie.
  it("posts credentials to the backend and returns its mapped identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(account), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(login("attendee1@connectsphere.test", "P@55w0rd")).resolves.toMatchObject({ role: "attendee" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attendee1@connectsphere.test", password: "P@55w0rd" }),
    });
  });

  // USER-LOGIN-01-C: The backend's safe invalid-credential message is surfaced to the form.
  it("throws a typed error for a JSON login failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid email or password." }), { status: 401 })));

    await expect(login("attendee1@connectsphere.test", "wrong-password"))
      .rejects.toMatchObject({ name: "Error", status: 401, message: "Invalid email or password." });
  });

  // USER-LOGIN-01-C: A malformed backend error body falls back to a safe generic message.
  it("uses the generic message when a login failure has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));

    await expect(login("attendee1@connectsphere.test", "P@55w0rd"))
      .rejects.toMatchObject({ status: 503, message: "We couldn't sign you in. Please try again." });
  });

  // USER-LOGIN-01-C: A successful response cannot authenticate an account without an application role.
  it("rejects a successful login response with no supported role", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...account, roles: [] }), { status: 200 })));

    await expect(login("attendee1@connectsphere.test", "P@55w0rd"))
      .rejects.toMatchObject({ status: 403, message: "This account does not have a supported ConnectSphere role." });
  });

  // USER-LOGIN-01-D: An absent cookie is a normal signed-out state, not a browser error.
  it("treats a 401 session lookup as signed out without parsing a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(restoreSession()).resolves.toBeUndefined();
  });

  // USER-LOGIN-01-D: A valid server-side cookie restores the mapped user identity.
  it("restores a session with a credentialed backend request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(account), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toMatchObject({ id: "user-1", role: "attendee" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/me"), { credentials: "include" });
  });

  // USER-LOGIN-01-D: Non-401 session failures are actionable errors rather than signed-out states.
  it("throws a typed error for another session-lookup failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Session expired." }), { status: 419 })));

    await expect(restoreSession()).rejects.toMatchObject({ status: 419, message: "Session expired." });
  });

  // USER-LOGIN-01-D: A valid response without an application role remains unauthenticated.
  it("does not restore a session for an account with no supported role", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...account, roles: ["UNKNOWN"] }), { status: 200 })));

    await expect(restoreSession()).resolves.toBeUndefined();
  });

  // USER-LOGIN-01-E: Logout delegates revocation to the backend while including the session cookie.
  it("posts a credentialed logout request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  });

  // USER-LOGIN-01-C: The error class also provides a default message when callers omit one.
  it("creates an AuthError with a safe fallback message", () => {
    expect(new AuthError(500)).toMatchObject({ status: 500, message: "We couldn't sign you in. Please try again." });
  });

  // USER-LOGIN-01-B: The client remains runnable in a local environment without an API-base override.
  it("uses the local backend default when VITE_API_BASE_URL is absent", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.resetModules();
    const { logout: logoutWithDefaultBase } = await import("./auth");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await logoutWithDefaultBase();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8080/api/auth/logout", expect.any(Object));
  });
});
