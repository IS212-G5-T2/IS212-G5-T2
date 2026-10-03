import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlaggedChangeReview } from "@/components/domain/FlaggedChangeReview";
import { formatDateTime } from "@/utils/format";
import type { ChangeHistoryEntry, FlaggedChange } from "@/types";

/**
 * SPM-85 — Coordinator reviews and resolves flagged changes. RED / TDD:
 * FlaggedChangeReview does not exist yet. Contract: props { changes, history,
 * onResolve({ changeId, decision, bookingId? }) }. Each change is an article named
 * after its field with "Current value" / "Proposed value" terms, a "Confirm change"
 * and "Reject change" button, and one role="group" per venue booking (named by venue)
 * with "Confirm for this booking" / "Reject for this booking" buttons when impacted.
 */

const CHANGE: FlaggedChange = {
  id: "chg-1",
  kind: "booking_conflict",
  field: "expectedAttendance",
  currentValue: 80,
  proposedValue: 150,
  status: "Needs Review",
  impacts: [
    { bookingId: "bk-1", venueName: "Hall A", impacted: true, conflicts: [{ kind: "capacity", detail: "Attendance 150 exceeds capacity 120" }] },
    { bookingId: "bk-2", venueName: "Hall B", impacted: true, conflicts: [{ kind: "turnaround", withBookingId: "nb-1", detail: "Only 30 min turnaround after Chemistry Workshop" }] },
    { bookingId: "bk-3", venueName: "Hall C", impacted: false, conflicts: [] },
  ],
};

const HISTORY: ChangeHistoryEntry[] = [
  { id: "chg-2", field: "layout", originalValue: "Banquet", proposedValue: "Theatre", resolvedValue: "Banquet", resolvedBy: "Coord Nine", resolvedAt: "2026-10-05T10:00:00.000Z", status: "Rejected" },
  { id: "chg-0", field: "expectedAttendance", originalValue: 60, proposedValue: 80, resolvedValue: 80, resolvedBy: "Coord Nine", resolvedAt: "2026-10-05T09:00:00.000Z", status: "Applied" },
];

function renderReview(history: ChangeHistoryEntry[] = []) {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  render(<FlaggedChangeReview changes={[CHANGE]} history={history} onResolve={onResolve} />);
  return { onResolve, card: screen.getByRole("article", { name: /expected attendance/i }) };
}

afterEach(cleanup);

describe("FlaggedChangeReview", () => {
  // EVENT-FLAG-02-A: current and proposed values sit side by side with the impacted bookings.
  it("EVENT-FLAG-02-A shows current value, proposed value and the reason for each impact", () => {
    const { card } = renderReview();
    expect(within(card).getByText("Current value").nextElementSibling).toHaveTextContent("80");
    expect(within(card).getByText("Proposed value").nextElementSibling).toHaveTextContent("150");
    expect(within(within(card).getByRole("group", { name: /hall a/i })).getByText(/exceeds capacity/i)).toBeInTheDocument();
    expect(within(within(card).getByRole("group", { name: /hall b/i })).getByText(/turnaround/i)).toBeInTheDocument();
  });

  // EVENT-FLAG-06-A: with several venue bookings, each has its own entry, including clear ones.
  it("EVENT-FLAG-06-A lists impacted bookings per venue booking", () => {
    const { card } = renderReview();
    expect(within(card).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Hall A", "Hall B", "Hall C"]);
    expect(within(within(card).getByRole("group", { name: /hall c/i })).getByText(/no impact/i)).toBeInTheDocument();
  });

  // EVENT-FLAG-03-A: rejecting sends a reject decision for the whole change.
  it("EVENT-FLAG-03-A sends a reject decision when the coordinator rejects the change", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    await user.click(within(card).getByRole("button", { name: /^reject change$/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "reject" });
  });

  // EVENT-FLAG-04-A: confirming sends a confirm decision for the whole change.
  it("EVENT-FLAG-04-A sends a confirm decision when the coordinator confirms the change", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    await user.click(within(card).getByRole("button", { name: /^confirm change$/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "confirm" });
  });

  // EVENT-FLAG-07-A: per-booking actions are scoped to that booking and leave the others usable.
  // NOTE: scoped-resolution semantics are an interpretation of the AC; confirm with the team.
  it("EVENT-FLAG-07-A confirming one booking sends only that booking and leaves the others actionable", async () => {
    const user = userEvent.setup();
    const { onResolve, card } = renderReview();
    const hallA = within(card).getByRole("group", { name: /hall a/i });
    const hallB = within(card).getByRole("group", { name: /hall b/i });
    await user.click(within(hallA).getByRole("button", { name: /confirm for this booking/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ changeId: "chg-1", decision: "confirm", bookingId: "bk-1" });
    expect(within(hallB).getByRole("button", { name: /reject for this booking/i })).toBeEnabled();
    expect(within(within(card).getByRole("group", { name: /hall c/i })).queryAllByRole("button")).toHaveLength(0);
  });

  // EVENT-FLAG-05-A: history rows show the values, coordinator, time and final status.
  it("EVENT-FLAG-05-A shows each resolved change with values, coordinator, timestamp and status", () => {
    renderReview(HISTORY);
    const rows = within(screen.getByRole("list", { name: /change history/i })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Banquet → Theatre");
    expect(rows[0]).toHaveTextContent("Coord Nine");
    expect(rows[0]).toHaveTextContent("Rejected");
    expect(rows[0]).toHaveTextContent(formatDateTime("2026-10-05T10:00:00.000Z"));
    expect(rows[1]).toHaveTextContent("60 → 80");
    expect(rows[1]).toHaveTextContent("Applied");
  });
});