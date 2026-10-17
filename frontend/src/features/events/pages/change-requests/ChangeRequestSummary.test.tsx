import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestSummary } from "@/features/events/pages/change-requests/ChangeRequestSummary";
import {
  approveChangeRequest,
  denyChangeRequest,
  fetchEventChangeRequests,
  previewChangeRequestConflicts,
} from "@/features/events/api/change-requests-api";
import { ApiError } from "@/utils/api";
import type { ChangeRequest } from "@/types";

vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchEventChangeRequests: vi.fn(),
  previewChangeRequestConflicts: vi.fn(),
  approveChangeRequest: vi.fn(),
  denyChangeRequest: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));
const fetchMock = vi.mocked(fetchEventChangeRequests);
const previewMock = vi.mocked(previewChangeRequestConflicts);
const approveMock = vi.mocked(approveChangeRequest);
const denyMock = vi.mocked(denyChangeRequest);

/** SPM-64 AC5 — the latest change request's status on the event page. */

const LATEST: ChangeRequest = {
  id: "cr-2",
  eventId: "evt-1",
  eventName: "Alumni Networking Night",
  status: "Denied",
  changes: [{ field: "accessibility", originalValue: [], proposedValue: ["Hearing loop"] }],
  requiresSafetyCheck: true,
  recheck: [],
  safetyCheckReset: false,
  requestedBy: "Organiser 1",
  createdAt: "2026-10-16T02:00:00.000Z",
  decisionReason: "Not possible at this venue.",
};

function renderSummary(reviewer = false, onDecided?: () => void) {
  return render(
    <MemoryRouter>
      <ChangeRequestSummary eventId="evt-1" reviewer={reviewer} onDecided={onDecided} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

describe("ChangeRequestSummary", () => {
  /** REQ-CHANGE-05-A, 05-B: the newest request's status, fields, date and any denial reason, with a link. */
  it("REQ-CHANGE-05-B shows the latest request's status and a link to all requests", async () => {
    fetchMock.mockResolvedValue([LATEST, { ...LATEST, id: "cr-1", status: "Approved" }]);
    renderSummary();
    const section = await screen.findByRole("region", { name: "Change request status" });
    expect(section).toHaveTextContent("Change request Denied");
    expect(section).toHaveTextContent("Accessibility / special requirements · submitted 16 Oct 2026, 10:00 am");
    expect(section).toHaveTextContent("Coordinator’s reason: “Not possible at this venue.”");
    expect(screen.getByRole("link", { name: "View Change Requests" })).toHaveAttribute("href", "/events/evt-1/change-requests");
    expect(fetchMock).toHaveBeenCalledWith("evt-1");
  });

  /** REQ-CHANGE-05-E: nothing is shown before the first request. */
  it("REQ-CHANGE-05-E renders nothing when there are no requests", async () => {
    fetchMock.mockResolvedValue([]);
    const { container } = renderSummary();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  /** A load failure is reported instead of silently hiding a pending request. */
  it("shows an error when the requests cannot be loaded", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("down")));
    renderSummary();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your change requests.");
  });

  /** A load that finishes after leaving the event page changes nothing. */
  it("ignores a load that settles after unmounting", async () => {
    let resolve!: (requests: ChangeRequest[]) => void;
    let reject!: (error: unknown) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    renderSummary().unmount();
    renderSummary().unmount();
    resolve([LATEST]);
    reject(new Error("late"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("View Change Requests")).not.toBeInTheDocument();
  });

  /** A failure that is not an Error shows the plain message. */
  it("shows the plain message for a non-Error failure", async () => {
    fetchMock.mockRejectedValue("offline");
    renderSummary();
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Could not load your change requests\.$/);
  });

  /** REVIEW-CHANGE-02-A, 02-C: the assigned coordinator reviews a pending request on the event page. */
  it("REVIEW-CHANGE-02-A shows the requested changes and the review actions to the coordinator", async () => {
    previewMock.mockResolvedValue({ requestId: "cr-2", venueBookings: [], equipment: [], registrations: { registered: 0, waitlisted: 0, details: [] }, hasConflicts: false });
    fetchMock.mockResolvedValue([
      {
        ...LATEST,
        status: "Pending",
        reason: "Guests asked for it.",
        changes: [{ field: "facilities", originalValue: ["Catering"], proposedValue: ["Projector"] }],
      },
    ]);
    renderSummary(true);
    expect(await screen.findByText("Change Requested by Organiser")).toBeInTheDocument();
    expect(screen.getByText(/^Requested by .+ on /)).toBeInTheDocument();
    const diff = screen.getByRole("list", { name: "Required facilities changes" });
    expect(diff).toHaveTextContent("+ Projector");
    expect(diff).toHaveTextContent("− Catering");
    expect(screen.getByText("Reason: “Guests asked for it.”")).toBeInTheDocument();
    expect(await screen.findByText("No conflicts with existing bookings or registrations.")).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-06-A confirms an approval and tells the event page", async () => {
    previewMock.mockResolvedValue({ requestId: "cr-2", venueBookings: [], equipment: [], registrations: { registered: 0, waitlisted: 0, details: [] }, hasConflicts: false });
    fetchMock.mockResolvedValue([{ ...LATEST, status: "Pending" }]);
    approveMock.mockResolvedValue({
      request: { ...LATEST, status: "Approved", recheck: [{ id: "i", kind: "venue", refId: "b", name: "Hall", details: [] }] },
      eventStatus: "planning",
      safetyCheckReset: true,
    });
    const onDecided = vi.fn();
    renderSummary(true, onDecided);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Change request approved. Event details have been updated. The safety check was reset; request a new safety check. See the arrangements to re-check on the Change Requests page.",
    );
    expect(onDecided).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Approve Change" })).not.toBeInTheDocument();
  });

  it("REVIEW-CHANGE-06-A confirms a denial", async () => {
    previewMock.mockResolvedValue({ requestId: "cr-2", venueBookings: [], equipment: [], registrations: { registered: 0, waitlisted: 0, details: [] }, hasConflicts: false });
    fetchMock.mockResolvedValue([{ ...LATEST, status: "Pending" }]);
    denyMock.mockResolvedValue({ request: { ...LATEST, status: "Denied", decisionReason: "Not this time, sorry." } });
    renderSummary(true);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Deny Change" }));
    await user.type(screen.getByLabelText(/Reason for denying/), "Not this time, sorry.");
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    expect(await screen.findByText("Change request denied. The organiser has been notified.")).toBeInTheDocument();
    expect(screen.getByText("Coordinator’s reason: “Not this time, sorry.”")).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-12-C reloads a request that was withdrawn meanwhile", async () => {
    previewMock.mockResolvedValue({ requestId: "cr-2", venueBookings: [], equipment: [], registrations: { registered: 0, waitlisted: 0, details: [] }, hasConflicts: false });
    fetchMock
      .mockResolvedValueOnce([{ ...LATEST, status: "Pending" }])
      .mockResolvedValueOnce([{ ...LATEST, status: "Withdrawn" }])
      .mockResolvedValueOnce([{ ...LATEST, status: "Pending" }])
      .mockRejectedValueOnce(new Error("offline"));
    approveMock.mockRejectedValue(new ApiError("The organiser has withdrawn this change request.", undefined, "change_request_withdrawn", 409));
    const user = userEvent.setup();
    const first = renderSummary(true);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    await waitFor(() => expect(screen.queryByText("Change Requested by Organiser")).not.toBeInTheDocument());
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    first.unmount();
    // A failed reload keeps the request as shown.
    renderSummary(true);
    await user.click(await screen.findByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("The organiser has withdrawn this change request.")).toBeInTheDocument();
    expect(screen.getByText("Change Requested by Organiser")).toBeInTheDocument();
  });

  it("keeps the plain label for the coordinator once the request is decided", async () => {
    fetchMock.mockResolvedValue([LATEST]);
    renderSummary(true);
    expect(await screen.findByRole("link", { name: "View Change Requests" })).toBeInTheDocument();
    expect(screen.queryByText("Change Requested by Organiser")).not.toBeInTheDocument();
  });
});
