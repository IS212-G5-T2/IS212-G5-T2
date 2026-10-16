import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import {
  fetchEventChangeRequests,
  fetchMyChangeRequests,
  submitChangeRequest,
  withdrawChangeRequest,
} from "@/features/events/api/change-requests-api";

vi.mock("@/utils/api", () => ({ api: vi.fn().mockResolvedValue("ok") }));
const apiMock = vi.mocked(api);

/** SPM-64: the client calls the backend contract in backend/src/events/change-requests. */
describe("change requests API client", () => {
  beforeEach(() => {
    apiMock.mockClear();
  });

  /** REQ-CHANGE-01-A: submitting posts the changes and reason as JSON. */
  it("posts a submission", async () => {
    await submitChangeRequest("evt-1", { changes: { expectedAttendance: 140 }, reason: "More." });
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/change-requests", {
      method: "POST",
      body: JSON.stringify({ changes: { expectedAttendance: 140 }, reason: "More." }),
    });
  });

  /** REQ-CHANGE-05-A: reads an event's requests and the caller's requests, optionally by status. */
  it("reads an event's requests and the dashboard list", async () => {
    await fetchEventChangeRequests("evt-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests");
    await fetchMyChangeRequests("Pending");
    expect(apiMock).toHaveBeenLastCalledWith("/change-requests?status=Pending");
    await fetchMyChangeRequests();
    expect(apiMock).toHaveBeenLastCalledWith("/change-requests");
  });

  /** Withdrawing posts to the request's withdraw route. */
  it("withdraws a request", async () => {
    await withdrawChangeRequest("evt-1", "cr-1");
    expect(apiMock).toHaveBeenCalledWith("/events/evt-1/change-requests/cr-1/withdraw", { method: "POST" });
  });
});
