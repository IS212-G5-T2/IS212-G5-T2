import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestList } from "@/features/events/pages/change-requests/ChangeRequestList";
import { fetchChangeRequestAudit, previewChangeRequestConflicts } from "@/features/events/api/change-requests-api";

vi.mock("@/features/events/api/change-requests-api", () => ({
  previewChangeRequestConflicts: vi.fn(),
  fetchChangeRequestAudit: vi.fn(),
  markArrangementRechecked: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));
import type { ChangeRequest } from "@/types";

/** SPM-64 AC5 — the change request history with statuses (REQ-CHANGE-05-*). */

function request(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: "cr-1",
    eventId: "evt-1",
    eventName: "Alumni Networking Night",
    status: "Pending",
    changes: [
      { field: "expectedAttendance", originalValue: 120, proposedValue: 140 },
      { field: "startDateTime", originalValue: "2030-02-05T10:30:00.000Z", proposedValue: "2030-02-05T11:00:00.000Z" },
    ],
    requiresSafetyCheck: true,
    recheck: [],
    safetyCheckReset: false,
    requestedBy: "Organiser 1",
    createdAt: "2026-10-16T02:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("ChangeRequestList", () => {
  /** REQ-CHANGE-05-A: a pending request shows its fields, values in Singapore time, status and safety note. */
  it("REQ-CHANGE-05-A shows a pending request with its changes and status", () => {
    render(<ChangeRequestList requests={[request({ reason: "More guests." })]} />);
    const card = screen.getByRole("article", { name: "Requested by Organiser 1 on 16 Oct 2026, 10:00 am" });
    expect(within(card).getByText("Pending review")).toBeInTheDocument();
    const attendance = within(card).getByRole("rowheader", { name: "Expected attendance" }).closest("tr")!;
    expect(attendance).toHaveTextContent("120");
    expect(attendance).toHaveTextContent("140");
    expect(within(card).getByRole("rowheader", { name: "Start date & time" }).closest("tr")).toHaveTextContent(
      "5 Feb 2030, 6:30 pm5 Feb 2030, 7:00 pm",
    );
    expect(card).toHaveTextContent("Reason: “More guests.”");
    expect(card).toHaveTextContent("If approved, the event will need a new safety check");
    // Without onWithdraw (coordinator view) there is no action.
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  /** REQ-CHANGE-05-B: decided requests show who decided and when, and a denial shows the coordinator's reason. */
  it("REQ-CHANGE-05-B shows the decision, the decider and the denial reason", () => {
    render(
      <ChangeRequestList
        requests={[
          request({ id: "cr-2", status: "Denied", decidedBy: "Coordinator 1", decidedAt: "2026-10-17T01:00:00.000Z", decisionReason: "Venue cannot fit the group." }),
          request({ id: "cr-3", status: "Approved", decidedBy: "Coordinator 1", decidedAt: "2026-10-17T01:00:00.000Z" }),
        ]}
      />,
    );
    const [denied, approved] = screen.getAllByRole("article");
    expect(denied).toHaveTextContent("Denied by Coordinator 1 on 17 Oct 2026, 9:00 am");
    expect(denied).toHaveTextContent("Coordinator’s reason: “Venue cannot fit the group.”");
    expect(denied).not.toHaveTextContent("safety check");
    expect(approved).toHaveTextContent("Approved by Coordinator 1");
    expect(approved).not.toHaveTextContent("Coordinator’s reason");
  });

  /** REQ-CHANGE-05-E: the empty state. */
  it("REQ-CHANGE-05-E says when there are no change requests", () => {
    render(<ChangeRequestList requests={[]} />);
    expect(screen.getByText("No change requests for this event.")).toBeInTheDocument();
  });

  /** REQ-CHANGE-09-B: the owner can withdraw only a pending request; a failure is shown and the button re-enabled. */
  it("REQ-CHANGE-09-B withdraws a pending request and reports a failure", async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn().mockRejectedValueOnce(new Error("This change request has already been decided.")).mockRejectedValueOnce("x");
    render(<ChangeRequestList requests={[request(), request({ id: "cr-9", status: "Withdrawn" })]} onWithdraw={onWithdraw} />);
    const [pending, withdrawn] = screen.getAllByRole("article");
    expect(within(withdrawn).queryByRole("button")).not.toBeInTheDocument();
    await user.click(within(pending).getByRole("button", { name: "Withdraw Request" }));
    expect(onWithdraw).toHaveBeenCalledWith(expect.objectContaining({ id: "cr-1" }));
    expect(await within(pending).findByRole("alert")).toHaveTextContent("This change request has already been decided.");
    await user.click(within(pending).getByRole("button", { name: "Withdraw Request" }));
    expect(await within(pending).findByText("Could not withdraw this change request.")).toBeInTheDocument();
  });

  /** SPM-65: closed requests, safety resets, re-check lists and the coordinator's review panel. */
  it("REVIEW-CHANGE-12-B shows why a request was closed", () => {
    render(<ChangeRequestList requests={[request({ status: "Closed", decidedBy: "System", decidedAt: "2026-10-18T02:00:00.000Z", decisionReason: "The event was cancelled." })]} />);
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("Closed by System on");
    expect(card).toHaveTextContent("The event was cancelled.");
    expect(vi.mocked(fetchChangeRequestAudit)).not.toHaveBeenCalled();
  });

  it("REVIEW-CHANGE-08-A notes the safety check reset and lists arrangements to re-check on an approved request", () => {
    render(
      <ChangeRequestList
        requests={[
          request({
            status: "Approved",
            decidedBy: "Coord",
            decidedAt: "2026-10-18T02:00:00.000Z",
            safetyCheckReset: true,
            recheck: [{ id: "i1", kind: "venue", refId: "b1", name: "Hall", details: ["Must move"] }],
          }),
        ]}
      />,
    );
    expect(screen.getByText("The event’s safety check was reset and must be requested again.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Arrangements to re-check" })).toHaveTextContent("Venue booking: Hall");
    expect(screen.queryByRole("button", { name: "Mark As Re-checked" })).not.toBeInTheDocument();
  });

  it("REVIEW-CHANGE-02-A gives the coordinator the review panel on pending requests only", async () => {
    vi.mocked(previewChangeRequestConflicts).mockResolvedValue({
      requestId: "cr-1",
      venueBookings: [],
      equipment: [],
      registrations: { registered: 0, waitlisted: 0, details: [] },
      hasConflicts: false,
    });
    const review = { onApproved: vi.fn(), onDenied: vi.fn(), onRechecked: vi.fn(), onStale: vi.fn() };
    render(<ChangeRequestList requests={[request(), request({ id: "cr-0", status: "Denied" })]} review={review} />);
    expect(await screen.findAllByRole("region", { name: "Review this change request" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Approve Change" })).toBeInTheDocument();
  });
});
