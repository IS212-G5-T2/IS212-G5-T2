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
      email: "coordinator_venuestaff@connectsphere.test",
      roles: [" venue_staff ", "coordinator", "UNKNOWN"],
    })).toMatchObject({
      role: "coordinator",
      roles: ["coordinator", "venue_staff"],
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

  // SPM-123 LEAD-ASN-11-B: the server's COORDINATOR_LEAD role becomes the UI's Lead role.
  it("LEAD-ASN-11-B recognises the Lead role from the server", () => {
    // Act: map the seeded Lead account.
    const user = toLocalUser({ uid: "lead-1", email: "lead@connectsphere.test", roles: ["COORDINATOR_LEAD"] });

    // Assert: a signed-in Lead, not an account without a role.
    expect(user).toMatchObject({ role: "coordinator_lead", roles: ["coordinator_lead"] });
  });

  // SPM-128: Safety Officer authentication (Confluence matrix 36896780).
  describe("SPM-128 Safety Officer authentication", () => {
    /** SAFETY-LOGIN-01-A: Valid credentials map the server's SAFETY_OFFICER role to safety_officer in the UI user model. */
    it("SAFETY-LOGIN-01-A recognises the Safety Officer role from the server", () => {
      const user = toLocalUser({
        uid: "safety-1",
        email: "safety_officer1@connectsphere.test",
        roles: ["SAFETY_OFFICER"],
      });

      expect(user).toBeDefined();
      expect(user?.role).toBe("safety_officer");
      expect(user?.roles).toEqual(["safety_officer"]);
      expect(user?.id).toBe("safety-1");
      expect(user?.email).toBe("safety_officer1@connectsphere.test");
    });

    /** SAFETY-LOGIN-01-B: Submitting an incorrect password rejects login with a 401 AuthError. */
    it("SAFETY-LOGIN-01-B wrong password returns AuthError with status 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid email or password." }), { status: 401 }),
      ));

      await expect(login("safety_officer1@connectsphere.test", "wrong-password"))
        .rejects.toMatchObject({ name: "Error", status: 401, message: "Invalid email or password." });
    });

    /** SAFETY-LOGIN-01-C: A non-JSON login error body falls back to the safe generic message. */
    it("SAFETY-LOGIN-01-C non-JSON error body falls back to generic message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response("unavailable", { status: 503 }),
      ));

      await expect(login("safety_officer1@connectsphere.test", "P@55w0rd"))
        .rejects.toMatchObject({ status: 503, message: "We couldn't sign you in. Please try again." });
    });

    /** SAFETY-LOGIN-01-D: Mixed-case or whitespace-padded role string is normalised and recognised. */
    it("SAFETY-LOGIN-01-D mixed-case or whitespace-padded role is still recognised", () => {
      const user = toLocalUser({
        uid: "safety-2",
        email: "s@test.test",
        roles: [" safety_officer "],
      });

      expect(user).toBeDefined();
      expect(user?.role).toBe("safety_officer");
    });

    /** SAFETY-LOGIN-03-A: Wrong password surfaces the server's exact error message. */
    it("SAFETY-LOGIN-03-A wrong password surfaces server error message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid email or password." }), { status: 401 }),
      ));

      const promise = login("safety_officer1@connectsphere.test", "wrong");
      await expect(promise).rejects.toSatisfy(
        (err: unknown) => err instanceof AuthError && err.status === 401 && err.message === "Invalid email or password.",
      );
    });

    /** SAFETY-LOGIN-03-B: Non-JSON error body shows generic fallback message instead of raw parse error. */
    it("SAFETY-LOGIN-03-B non-JSON error body shows generic fallback message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response("unavailable", { status: 503 }),
      ));

      const promise = login("safety_officer1@connectsphere.test", "P@55w0rd");
      await expect(promise).rejects.toSatisfy(
        (err: unknown) => err instanceof AuthError && err.status === 503 && err.message === "We couldn't sign you in. Please try again.",
      );
    });

    /** SAFETY-LOGIN-03-C: A 200 response with no supported role denies login with a 403 error. */
    it("SAFETY-LOGIN-03-C valid HTTP 200 but no supported role denies access", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ uid: "safety-1", roles: [] }), { status: 200 }),
      ));

      await expect(login("safety_officer1@connectsphere.test", "P@55w0rd"))
        .rejects.toMatchObject({ status: 403, message: "This account does not have a supported ConnectSphere role." });
    });
  });
});
