// SPM-123: the frontend side of the Lead API contract.
// Test cases: LEAD-ASN-02-F, 03-E, 05-F; SPM-47 LEAD-REASN-01-F, 03-E.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignRequest, getAssignedEvents, getLeadCoordinators, getLeadQueue, reassignEvent } from "./lead-api";

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

describe("SPM-47 Lead reassignment API", () => {
  // The reassignment list is a plain GET.
  it("LEAD-REASN-01-F loads assigned events from GET /api/lead/assigned", async () => {
    // Act: load the list.
    await getAssignedEvents();

    // Assert: a GET (no method override, no body) to the list route.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/lead/assigned");
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  // Reassigning sends the chosen coordinator and the one the page showed.
  it("LEAD-REASN-03-E reassigns with POST /api/lead/events/:id/reassign and { coordinatorId, currentCoordinatorId }", async () => {
    // Arrange: the server confirms.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Event \"Welcome Evening\" reassigned to Coordinator 2." }), { status: 201 }));

    // Act: reassign event-1 from c1 to c2.
    const result = await reassignEvent("event-1", "c2", "c1");

    // Assert: a POST to the event's reassign route with exactly those two ids, and the server's reply returned.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/lead/events/event-1/reassign");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ coordinatorId: "c2", currentCoordinatorId: "c1" });
    expect(result).toEqual({ message: 'Event "Welcome Evening" reassigned to Coordinator 2.' });
  });
});
