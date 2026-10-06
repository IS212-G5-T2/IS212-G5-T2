// SPM-80 Coordinator Updates Availability: the frontend side of the availability API contract.
// ACs: AC2 (save unavailable), AC3 (view and modify at any time).
// Test cases: COOR-AVAIL-02-E, COOR-AVAIL-03-I.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMyAvailability, saveMyAvailability } from "./availability-api";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // A fixed API origin and a fetch double that answers with a saved value.
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ available: false }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SPM-80 availability API", () => {
  // Loading reads the signed-in coordinator's own availability.
  it("COOR-AVAIL-03-I loads availability from GET /api/coordinators/me/availability", async () => {
    // Act: load availability.
    const result = await getMyAvailability();

    // Assert: a GET (no method override, no body) to the coordinator's own route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/coordinators/me/availability");
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(result).toEqual({ available: false });
  });

  // Saving sends only the chosen value, as a real boolean.
  it("COOR-AVAIL-02-E saves with PUT /api/coordinators/me/availability and { available }", async () => {
    // Act: save Unavailable.
    const result = await saveMyAvailability(false);

    // Assert: a PUT with exactly { available: false } to the same route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/coordinators/me/availability");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ available: false });
    expect(result).toEqual({ available: false });
  });
});
