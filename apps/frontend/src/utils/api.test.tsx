import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("Q1-035 API success sends JSON, custom headers and timeout", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ version: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_API_BASE_URL", "http://test.local");
  expect(
    await api("/requests", { method: "PUT", headers: { "X-Test": "yes" } }),
  ).toEqual({ version: 1 });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://test.local/api/requests",
    expect.objectContaining({
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Test": "yes" },
      signal: expect.any(AbortSignal),
    }),
  );
});
it("Q1-036 API connection failure is actionable", async () => {
  vi.stubEnv("VITE_API_BASE_URL", undefined);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  await expect(api("/requests")).rejects.toThrow("Unable to reach the server");
});
it.each([
  [400, { message: "Invalid", errors: { name: "Too long" } }, "Invalid"],
  [409, {}, "Request failed."],
  [
    503,
    { message: "Internal secret" },
    "The service is temporarily unavailable. Please try again.",
  ],
])("Q1-037 API status %s gives safe error", async (status, data, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, status, json: async () => data }),
  );
  await expect(api("/requests")).rejects.toMatchObject({ message });
  await expect(api("/requests")).rejects.toBeInstanceOf(ApiError);
});
