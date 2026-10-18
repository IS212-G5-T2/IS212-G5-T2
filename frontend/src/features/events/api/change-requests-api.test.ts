import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import {
  fetchNewChangeRequestEventIds,
  markChangeRequestNoticesRead,
  approveChangeRequest,
  denyChangeRequest,
  fetchChangeRequestAudit,
  markArrangementRechecked,
  previewChangeRequestConflicts,
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

  /** SPM-65: the review routes (REVIEW-CHANGE-03-A, 04-A, 05-A, 09-B, 10-B). */
  it("calls the SPM-65 review routes", async () => {
    await previewChangeRequestConflicts("evt-1", "cr-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests/cr-1/conflicts");
    await approveChangeRequest("evt-1", "cr-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests/cr-1/approve", { method: "POST", body: "{}" });
    await denyChangeRequest("evt-1", "cr-1", "Not on that date.");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests/cr-1/deny", {
      method: "POST",
      body: JSON.stringify({ reason: "Not on that date." }),
    });
    await markArrangementRechecked("evt-1", "cr-1", "item-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests/cr-1/recheck/item-1", { method: "POST" });
    await fetchChangeRequestAudit("evt-1");
    expect(apiMock).toHaveBeenLastCalledWith("/events/evt-1/change-requests/audit");
  });

  /** REQ-CHANGE-03-A / REVIEW-CHANGE-01-A: unread change request notices tag requests New; opening marks them read. */
  it("finds events with an unread change request notice and marks them read", async () => {
    const notices = [
      { id: "n1", type: "coordinator_change_request", read: false, relatedEventId: "evt-1" },
      { id: "n2", type: "coordinator_change_request", read: true, relatedEventId: "evt-2" },
      { id: "n3", type: "coordinator_assignment", read: false, relatedEventId: "evt-3" },
      { id: "n4", type: "coordinator_change_request", read: false },
      { id: "n5", type: "coordinator_change_request", read: false, relatedEventId: "evt-4" },
    ];
    apiMock.mockResolvedValue(notices);
    expect([...(await fetchNewChangeRequestEventIds())]).toEqual(["evt-1", "evt-4"]);
    expect(apiMock).toHaveBeenLastCalledWith("/notifications");
    apiMock.mockClear();
    await markChangeRequestNoticesRead("evt-1");
    expect(apiMock.mock.calls).toEqual([["/notifications"], ["/notifications/n1/read", { method: "POST" }]]);
    apiMock.mockResolvedValue("ok");
  });
});
