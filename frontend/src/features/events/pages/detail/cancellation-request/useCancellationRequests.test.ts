import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCancellationRequests } from "@/features/events/pages/detail/cancellation-request/useCancellationRequests";
import { fetchEventCancellationRequests } from "@/features/events/api/cancellation-requests-api";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { deferred } from "@/test/deferred";

/*
 * SPM-155: the loader of an event's cancellation requests. Only the newest load may set the state (AC2: the latest
 * status, never an older reply). Mutant IDs in each "Kills:" line are defined in
 * frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/features/events/api/cancellation-requests-api", () => ({ fetchEventCancellationRequests: vi.fn() }));
const fetchMock = vi.mocked(fetchEventCancellationRequests);

const request = (status: "pending" | "declined"): CancellationRequest => ({
  id: "req-1",
  eventId: "evt-1",
  eventName: "Hack Night",
  status,
  displayStatus: status,
  reason: null,
  requestedBy: "Farid Rahman",
  requestedAt: "2026-10-12T04:00:00.000Z",
});

beforeEach(() => fetchMock.mockReset());
afterEach(() => cleanup());

describe("SPM-155 useCancellationRequests (AC2)", () => {
  // Kills: FM45
  /** CANCEL-REQUEST-02-F: when two loads overlap, the later one wins even if the earlier reply arrives last. */
  it("CANCEL-REQUEST-02-F: a slow earlier load that succeeds after a newer load does not replace it", async () => {
    // Arrange: the first load is held back; the second (a reload) answers at once with Declined
    const first = deferred<CancellationRequest[]>();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockResolvedValueOnce([request("declined")]);
    const { result } = renderHook(() => useCancellationRequests("evt-1", true));

    // Act: reload while the first is in flight, then let the first (older, Pending) reply arrive
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.requests[0]?.status).toBe("declined"));
    await act(async () => {
      first.resolve([request("pending")]);
      await first.promise;
    });

    // Assert: still the newer reply
    expect(result.current.requests[0].status).toBe("declined");
  });

  // Kills: FM46
  /** CANCEL-REQUEST-02-F: an earlier load that fails after a newer one succeeded shows no error. */
  it("CANCEL-REQUEST-02-F: a slow earlier load that fails after a newer success shows no error", async () => {
    // Arrange
    const first = deferred<CancellationRequest[]>();
    fetchMock.mockReturnValueOnce(first.promise);
    fetchMock.mockResolvedValueOnce([request("pending")]);
    const { result } = renderHook(() => useCancellationRequests("evt-1", true));
    await act(async () => {
      await result.current.reload();
    });

    // Act
    await act(async () => {
      first.reject(new Error("late failure"));
      await first.promise.catch(() => undefined);
    });

    // Assert
    expect(result.current.error).toBe("");
    expect(result.current.requests).toHaveLength(1);
  });

  // Kills: FM49
  /** CANCEL-REQUEST-01-E: a disabled loader never asks the server. */
  it("CANCEL-REQUEST-01-E: a disabled loader makes no request and stays not loaded", () => {
    // Act
    const { result } = renderHook(() => useCancellationRequests("evt-1", false));

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
  });

  // Kills: FM55
  /** CANCEL-REQUEST-02-A: a reply that is not a list is read as no requests, not stored. */
  it("CANCEL-REQUEST-02-A: a reply that is not an array reads as no requests", async () => {
    // Arrange: the server (or a proxy) answers with an object
    fetchMock.mockResolvedValue({ message: "unexpected" } as never);

    // Act
    const { result } = renderHook(() => useCancellationRequests("evt-1", true));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // Assert
    expect(result.current.requests).toEqual([]);
    expect(result.current.error).toBe("");
  });
});
