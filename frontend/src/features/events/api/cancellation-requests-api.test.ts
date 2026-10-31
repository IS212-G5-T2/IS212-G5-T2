/*
 * SPM-155 client for the cancellation request API (backend/src/events/cancellation-requests).
 * Oracle: the contract in docs/specs/SPM-155-test-cases.md section 0 (S1) and the Gate-1 decisions; paths, methods
 * and bodies are literals. Mutant IDs in each "Kills:" line are defined in
 * frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import {
  decideCancellationRequest,
  fetchEventCancellationRequests,
  fetchMyCancellationRequests,
  submitCancellationRequest,
} from "@/features/events/api/cancellation-requests-api";

vi.mock("@/utils/api", () => ({ api: vi.fn().mockResolvedValue("ok") }));
const apiMock = vi.mocked(api);

describe("SPM-155 cancellation request API client", () => {
  beforeEach(() => {
    apiMock.mockClear();
  });

  // Kills: FM1
  /** CANCEL-REQUEST-01-A: the request is a POST to the event's cancellation-requests route carrying the reason only. */
  it("CANCEL-REQUEST-01-A: posts the reason to the event's cancellation-requests route", async () => {
    // Act
    await submitCancellationRequest("evt-1", "No longer needed");

    // Assert
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/cancellation-requests", {
      method: "POST",
      body: JSON.stringify({ reason: "No longer needed" }),
    });
  });

  // Kills: FM1, FM2
  /** CANCEL-REQUEST-01-H subtest A: no reason sends an empty object, never `reason: ""` or a client status. */
  it("CANCEL-REQUEST-01-H: a blank reason sends an empty body", async () => {
    // Act
    await submitCancellationRequest("evt-1", "   ");

    // Assert
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/cancellation-requests", { method: "POST", body: "{}" });
  });

  // Kills: FM47
  /** CANCEL-REQUEST-02-A: reads the event's requests and the caller's dashboard list. */
  it("CANCEL-REQUEST-02-A: reads the event's requests and the dashboard list", async () => {
    // Act / Assert
    await fetchEventCancellationRequests("evt-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/cancellation-requests");
    await fetchMyCancellationRequests();
    expect(apiMock).toHaveBeenLastCalledWith("/cancellation-requests");
  });

  // Kills: FM3
  /** CANCEL-REQUEST-03-A and 03-B: the decision is a POST of exactly { decision } to the request's decision route. */
  it.each([["accept"], ["decline"]] as const)("CANCEL-REQUEST-03-A: decision %s posts only the decision", async (decision) => {
    // Act
    await decideCancellationRequest("req-1", decision);

    // Assert
    expect(apiMock).toHaveBeenCalledWith("/cancellation-requests/req-1/decision", {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  });
});
