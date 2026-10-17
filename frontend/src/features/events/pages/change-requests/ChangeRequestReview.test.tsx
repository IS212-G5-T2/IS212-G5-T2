import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestReview } from "@/features/events/pages/change-requests/ChangeRequestReview";
import {
  approveChangeRequest,
  denyChangeRequest,
  markChangeRequestNoticesRead,
  previewChangeRequestConflicts,
} from "@/features/events/api/change-requests-api";
import type { ChangeRequest, ChangeRequestConflicts } from "@/types";
import { ApiError } from "@/utils/api";

vi.mock("@/features/events/api/change-requests-api", () => ({
  previewChangeRequestConflicts: vi.fn(),
  approveChangeRequest: vi.fn(),
  denyChangeRequest: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));
const previewMock = vi.mocked(previewChangeRequestConflicts);
const approveMock = vi.mocked(approveChangeRequest);
const denyMock = vi.mocked(denyChangeRequest);

/**
 * SPM-65 — the coordinator's review of one pending request: read-only conflict preview (AC3),
 * approve with confirmation (AC4), deny with a reason (AC5) and requests closed automatically by withdrawal or cancellation (AC11, REVIEW-CHANGE-12-C).
 * Test IDs refer to the Confluence pages under SPM-28 > SPM-65 (REVIEW-CHANGE-NN-X).
 */
const request: ChangeRequest = {
  id: "cr-1",
  eventId: "evt-1",
  eventName: "Alumni Night",
  status: "Pending",
  changes: [{ field: "expectedAttendance", originalValue: 80, proposedValue: 120 }],
  requiresSafetyCheck: true,
  requestedBy: "Organiser 1",
  createdAt: "2026-10-16T02:00:00.000Z",
  recheck: [],
  safetyCheckReset: false,
};

const conflicts: ChangeRequestConflicts = {
  requestId: "cr-1",
  venueBookings: [{ kind: "venue", refId: "b1", name: "Hall", details: ["Attendance 120 exceeds capacity 100"] }],
  equipment: [{ kind: "equipment", refId: "q1", name: "Projector × 2", details: ["Reservation period must move"] }],
  registrations: { registered: 3, waitlisted: 0, details: ["3 attendees are already registered; the requested attendance is 2"] },
  hasConflicts: true,
};

function renderReview(overrides: Partial<ChangeRequest> = {}) {
  const handlers = { onApproved: vi.fn(), onDenied: vi.fn(), onStale: vi.fn() };
  const user = userEvent.setup();
  render(<ChangeRequestReview request={{ ...request, ...overrides }} {...handlers} />);
  return { user, ...handlers };
}

beforeEach(() => {
  vi.resetAllMocks();
  previewMock.mockResolvedValue({ ...conflicts, venueBookings: [], equipment: [], registrations: { registered: 0, waitlisted: 0, details: [] }, hasConflicts: false });
});

describe("ChangeRequestReview", () => {
  it("REVIEW-CHANGE-03-B says when there are no conflicts", async () => {
    renderReview();
    expect(screen.getByRole("status")).toHaveTextContent("Checking for conflicts…");
    expect(await screen.findByText("No conflicts with existing bookings or registrations.")).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledWith("evt-1", "cr-1");
    expect(screen.getByText("A preview only: nothing changes until you approve.")).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-03-A lists venue, equipment and registration conflicts", async () => {
    previewMock.mockResolvedValue(conflicts);
    renderReview();
    expect(await screen.findByText("Venue bookings")).toBeInTheDocument();
    expect(screen.getByText("Hall")).toBeInTheDocument();
    expect(screen.getByText("Attendance 120 exceeds capacity 100")).toBeInTheDocument();
    expect(screen.getByText("Projector × 2")).toBeInTheDocument();
    expect(screen.getByText("Registrations")).toBeInTheDocument();
    expect(screen.getByText("3 attendees are already registered; the requested attendance is 2")).toBeInTheDocument();
  });

  it("hides sections without conflicts", async () => {
    previewMock.mockResolvedValue({ ...conflicts, venueBookings: [], registrations: { registered: 0, waitlisted: 0, details: [] } });
    renderReview();
    expect(await screen.findByText("Equipment reservations")).toBeInTheDocument();
    expect(screen.queryByText("Venue bookings")).not.toBeInTheDocument();
    expect(screen.queryByText("Registrations")).not.toBeInTheDocument();
  });

  it("shows why the preview could not load", async () => {
    previewMock.mockRejectedValue(new Error("Change request not found."));
    renderReview();
    expect(await screen.findByRole("alert")).toHaveTextContent("Change request not found.");
    previewMock.mockRejectedValue("offline");
    renderReview({ id: "cr-2" });
    expect(await screen.findByText("Could not check for conflicts.")).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-04-A approves after confirmation, mentioning the safety check reset", async () => {
    const result = { request: { ...request, status: "Approved" as const }, eventStatus: "planning" as const, safetyCheckReset: true };
    approveMock.mockResolvedValue(result);
    const { user, onApproved } = renderReview();
    await user.click(screen.getByRole("button", { name: "Approve Change" }));
    expect(screen.getByText(/Its safety check will be reset and must be requested again\./)).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(result));
    expect(approveMock).toHaveBeenCalledWith("evt-1", "cr-1");
  });

  it("can cancel the approval and omits the safety note when none applies", async () => {
    const { user } = renderReview({ requiresSafetyCheck: false });
    await user.click(screen.getByRole("button", { name: "Approve Change" }));
    expect(screen.queryByText(/safety check will be reset/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Approve Change" })).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-12-C shows the server's message and reloads when the request was closed meanwhile", async () => {
    approveMock.mockRejectedValue(new ApiError("The organiser has withdrawn this change request.", undefined, "change_request_withdrawn", 409));
    const { user, onStale, onApproved } = renderReview();
    await user.click(screen.getByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("The organiser has withdrawn this change request.")).toBeInTheDocument();
    expect(onStale).toHaveBeenCalled();
    expect(onApproved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm Approval" })).toBeEnabled();
  });

  it("shows other refusals without reloading", async () => {
    approveMock.mockRejectedValueOnce(new ApiError("A change to this detail is already awaiting review.", undefined, undefined, 409));
    const { user, onStale } = renderReview();
    await user.click(screen.getByRole("button", { name: "Approve Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("A change to this detail is already awaiting review.")).toBeInTheDocument();
    approveMock.mockRejectedValueOnce("network");
    await user.click(screen.getByRole("button", { name: "Confirm Approval" }));
    expect(await screen.findByText("Could not record the decision.")).toBeInTheDocument();
    expect(onStale).not.toHaveBeenCalled();
  });

  it("REVIEW-CHANGE-05-B checks the denial reason before sending", async () => {
    const { user } = renderReview();
    await user.click(screen.getByRole("button", { name: "Deny Change" }));
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    expect(screen.getByText("Please give a reason for denying this change.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Reason for denying/), "Too short");
    expect(screen.queryByText("Please give a reason for denying this change.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    expect(screen.getByText("Use between 10 and 500 characters.")).toBeInTheDocument();
    expect(denyMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Reason for denying/)).toHaveAttribute("maxLength", "500");
  });

  it("REVIEW-CHANGE-05-A denies with the trimmed reason", async () => {
    const denied = { ...request, status: "Denied" as const, decisionReason: "The hall is too small." };
    denyMock.mockResolvedValue({ request: denied });
    const { user, onDenied } = renderReview();
    await user.click(screen.getByRole("button", { name: "Deny Change" }));
    await user.type(screen.getByLabelText(/Reason for denying/), "  The hall is too small.  ");
    expect(screen.getByText(/22\/500 characters/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledWith(denied));
    expect(denyMock).toHaveBeenCalledWith("evt-1", "cr-1", "The hall is too small.");
  });

  it("shows the server's reason error and can cancel the denial", async () => {
    denyMock.mockRejectedValue(new ApiError("Use between 10 and 500 characters.", { reason: "Use between 10 and 500 characters." }, undefined, 400));
    const { user } = renderReview();
    await user.click(screen.getByRole("button", { name: "Deny Change" }));
    await user.type(screen.getByLabelText(/Reason for denying/), "A long enough reason.");
    await user.click(screen.getByRole("button", { name: "Confirm Denial" }));
    expect(await screen.findByText("Use between 10 and 500 characters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Deny Change" })).toBeInTheDocument();
  });

  it("ignores a preview that settles after the panel closes", async () => {
    let resolve!: (value: ChangeRequestConflicts) => void;
    let reject!: (error: unknown) => void;
    previewMock
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    render(<ChangeRequestReview request={request} onApproved={vi.fn()} onDenied={vi.fn()} onStale={vi.fn()} />).unmount();
    render(<ChangeRequestReview request={request} onApproved={vi.fn()} onDenied={vi.fn()} onStale={vi.fn()} />).unmount();
    resolve(conflicts);
    reject(new Error("late"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("REVIEW-CHANGE-01-F marks the event's change request notice read when the review opens", async () => {
    const markMock = vi.mocked(markChangeRequestNoticesRead);
    markMock.mockRejectedValueOnce(new Error("offline"));
    renderReview();
    expect(await screen.findByText("No conflicts with existing bookings or registrations.")).toBeInTheDocument();
    expect(markMock).toHaveBeenCalledWith("evt-1");
  });
});
