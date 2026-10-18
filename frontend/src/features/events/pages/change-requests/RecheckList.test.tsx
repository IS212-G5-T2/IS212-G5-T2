import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecheckList } from "@/features/events/pages/change-requests/RecheckList";
import { markArrangementRechecked } from "@/features/events/api/change-requests-api";
import type { ChangeRequest } from "@/types";

vi.mock("@/features/events/api/change-requests-api", () => ({
  markArrangementRechecked: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));
const markMock = vi.mocked(markArrangementRechecked);

/** SPM-65 AC9 — arrangements to re-check after approval (REVIEW-CHANGE-09-A/B/C). */
const approved: ChangeRequest = {
  id: "cr-1",
  eventId: "evt-1",
  eventName: "Alumni Night",
  status: "Approved",
  changes: [],
  requiresSafetyCheck: false,
  requestedBy: "Organiser 1",
  createdAt: "2026-10-16T02:00:00.000Z",
  safetyCheckReset: false,
  recheck: [
    { id: "i1", kind: "venue", refId: "b1", name: "Hall", details: ["The booking must change"] },
    { id: "i2", kind: "equipment", refId: "q1", name: "Projector × 2", details: ["Reservation period must move"] },
  ],
};

beforeEach(() => vi.resetAllMocks());

describe("RecheckList", () => {
  it("REVIEW-CHANGE-09-C renders nothing when no arrangement is affected", () => {
    const { container } = render(<RecheckList request={{ ...approved, recheck: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("REVIEW-CHANGE-09-A shows the list read-only to everyone but the coordinator", () => {
    render(<RecheckList request={approved} />);
    expect(screen.getByText("Venue booking: Hall")).toBeInTheDocument();
    expect(screen.getByText("Equipment: Projector × 2")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 still to re-check.")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting re-check")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("REVIEW-CHANGE-09-B lets the coordinator mark an arrangement as re-checked", async () => {
    const updated = { ...approved, recheck: [{ ...approved.recheck[0], checkedAt: "2026-10-18T02:00:00.000Z", checkedBy: "Coord" }, approved.recheck[1]] };
    markMock.mockResolvedValue(updated);
    const onRechecked = vi.fn();
    render(<RecheckList request={approved} onRechecked={onRechecked} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Mark As Re-checked" })[0]);
    await waitFor(() => expect(onRechecked).toHaveBeenCalledWith(updated));
    expect(markMock).toHaveBeenCalledWith("evt-1", "cr-1", "i1");
  });

  it("shows who re-checked each arrangement and when all are done", () => {
    const done = approved.recheck.map((item) => ({ ...item, checkedAt: "2026-10-18T02:00:00.000Z", checkedBy: "Coord" }));
    render(<RecheckList request={{ ...approved, recheck: done }} onRechecked={vi.fn()} />);
    expect(screen.getByText("All arrangements are up to date.")).toBeInTheDocument();
    expect(screen.getAllByText(/Re-checked by Coord on/)).toHaveLength(2);
  });

  it("shows why marking failed", async () => {
    markMock.mockRejectedValueOnce(new Error("This arrangement has already been re-checked.")).mockRejectedValueOnce("offline");
    render(<RecheckList request={approved} onRechecked={vi.fn()} />);
    const [first, second] = screen.getAllByRole("button", { name: "Mark As Re-checked" });
    await userEvent.click(first);
    expect(await screen.findByText("This arrangement has already been re-checked.")).toBeInTheDocument();
    await userEvent.click(second);
    expect(await screen.findByText("Could not mark this arrangement as re-checked.")).toBeInTheDocument();
  });
});
