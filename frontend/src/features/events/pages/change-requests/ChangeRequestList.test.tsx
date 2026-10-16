import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestList } from "@/features/events/pages/change-requests/ChangeRequestList";
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

  /** The owner can withdraw only a pending request; a failure is shown and the button re-enabled. */
  it("withdraws a pending request and reports a failure", async () => {
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
});
