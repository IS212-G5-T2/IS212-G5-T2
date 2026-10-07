// SPM-123: the frontend side of the Lead API contract.
// Test cases: LEAD-ASN-02-F, 03-E, 05-F.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignRequest, getLeadCoordinators, getLeadQueue } from "./lead-api";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // A fixed API origin and a fetch double that answers with an empty list.
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SPM-123 Lead API", () => {
  // The queue is a plain GET.
  it("LEAD-ASN-02-F loads the queue from GET /api/lead/queue", async () => {
    // Act: load the queue.
    await getLeadQueue();

    // Assert: a GET (no method override, no body) to the queue route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/lead/queue");
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  // The coordinators list is a plain GET.
  it("LEAD-ASN-03-E loads coordinators from GET /api/lead/coordinators", async () => {
    // Act: load the coordinators.
    await getLeadCoordinators();

    // Assert: a GET to the coordinators route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/lead/coordinators");
    expect(init.method).toBeUndefined();
  });

  // Assigning posts only the chosen coordinator's id.
  it("LEAD-ASN-05-F assigns with POST /api/lead/queue/:id/assign and { coordinatorId }", async () => {
    // Arrange: the server confirms.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Assigned." }), { status: 201 }));

    // Act: assign event-1 to c1.
    const result = await assignRequest("event-1", "c1");

    // Assert: a POST with exactly { coordinatorId } to the request's assign route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/lead/queue/event-1/assign");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ coordinatorId: "c1" });
    expect(result).toEqual({ message: "Assigned." });
  });
});
