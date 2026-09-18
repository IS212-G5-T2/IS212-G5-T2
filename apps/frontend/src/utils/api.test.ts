import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/firebase";
import { api } from "./api";

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
}));

const mockedAuth = auth as unknown as {
  currentUser: { getIdToken: () => Promise<string> } | null;
};

afterEach(() => {
  mockedAuth.currentUser = null;
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("forwards the signed-in Firebase ID token as a Bearer credential", async () => {
    mockedAuth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("firebase-id-token"),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{ ok: boolean }>("/events")).resolves.toEqual({ ok: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer firebase-id-token",
    );
  });

  it("allows public requests when no Firebase user is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api<{ ok: boolean }>("/events");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });
});
