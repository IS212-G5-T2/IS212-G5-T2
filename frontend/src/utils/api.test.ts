import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api", () => {
  // Sends the browser-managed HTTP-only session and never reintroduces tokens.
  it("uses browser session credentials without an Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{ ok: boolean }>("/events")).resolves.toEqual({ ok: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.credentials).toBe("include");
  });

  // Uses the documented local backend origin when no build-time URL is supplied.
  it("falls back to the default API origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.stubGlobal("fetch", fetchMock);

    await api("/events");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8080/api/events");
  });

  // Preserves caller headers while adding the JSON content type required by the API.
  it("adds JSON content type without discarding caller headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api("/events", { headers: { "X-Request-Id": "request-1" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-Id")).toBe("request-1");
  });

  // Turns a transport failure into a safe message rather than leaking its cause.
  it("returns a safe error when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket refused")));

    await expect(api("/events")).rejects.toMatchObject({
      message: "Unable to reach the server. Check your connection and try again.",
    });
  });

  // Preserves validation information so forms can associate errors with fields.
  it("preserves a client error message and field errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Please correct the form.", errors: { title: "Title is required." },
    }), { status: 422 })));

    await expect(api("/events")).rejects.toMatchObject({
      message: "Please correct the form.", errors: { title: "Title is required." },
    });
  });

  // Gives a fallback when an error response has no JSON body or message.
  it("handles a non-JSON client error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad request", { status: 400 })));

    await expect(api("/events")).rejects.toMatchObject({ message: "Request failed." });
  });

  // Maps attachment-size failures to an actionable message.
  it("maps a 413 response to the attachment-size message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 413 })));

    await expect(api("/events")).rejects.toMatchObject({
      message: "The files you attached are too large. Please attach smaller files and try again.",
    });
  });

  // Does not expose server failure details to the browser.
  it("maps a server failure to a generic availability message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "database password leaked",
    }), { status: 503 })));

    await expect(api("/events")).rejects.toMatchObject({
      message: "The service is temporarily unavailable. Please try again.",
    });
  });

  // Covers the error type used by every rejected helper call.
  it("retains ApiError field errors", () => {
    expect(new ApiError("Validation failed", { title: "Required" })).toMatchObject({
      message: "Validation failed", errors: { title: "Required" },
    });
  });
});
