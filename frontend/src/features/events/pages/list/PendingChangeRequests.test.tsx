import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PendingChangeRequests } from "@/features/events/pages/list/PendingChangeRequests";
import type { ChangeRequest } from "@/types";

/** SPM-65 AC1 — the coordinator's pending change requests (REVIEW-CHANGE-01-A, 01-D). */
function pending(id: string, createdAt: string, overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id,
    eventId: `evt-${id}`,
    eventName: `Event ${id}`,
    status: "Pending",
    changes: [{ field: "expectedAttendance", originalValue: 80, proposedValue: 120 }],
    requiresSafetyCheck: false,
    requestedBy: "Requester",
    organiserName: "Organiser 1",
    createdAt,
    recheck: [],
    safetyCheckReset: false,
    ...overrides,
  };
}

describe("PendingChangeRequests", () => {
  it("REVIEW-CHANGE-01-D says when nothing is pending", () => {
    render(<PendingChangeRequests requests={[]} />, { wrapper: MemoryRouter });
    expect(screen.getByText("No pending change requests.")).toBeInTheDocument();
  });

  it("REVIEW-CHANGE-01-A lists requests oldest first with event, organiser, details and a review link", () => {
    render(
      <PendingChangeRequests
        requests={[
          pending("b", "2026-10-17T02:00:00.000Z"),
          pending("a", "2026-10-16T02:00:00.000Z", { organiserName: undefined, changes: [{ field: "layout", originalValue: "Banquet", proposedValue: "Theatre" }] }),
        ]}
      />,
      { wrapper: MemoryRouter },
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Event a");
    expect(items[0]).toHaveTextContent("Requester · Room layout · submitted");
    expect(items[1]).toHaveTextContent("Organiser 1 · Expected attendance");
    expect(screen.getAllByRole("link", { name: "Review Change Request" })[0]).toHaveAttribute("href", "/events/evt-a");
  });

  it("REVIEW-CHANGE-01-F tags a request the coordinator has not opened yet as New", () => {
    render(
      <PendingChangeRequests
        requests={[pending("a", "2026-10-16T02:00:00.000Z"), pending("b", "2026-10-17T02:00:00.000Z")]}
        newEventIds={new Set(["evt-b"])}
      />,
      { wrapper: MemoryRouter },
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).not.toHaveTextContent("New");
    expect(second).toHaveTextContent("Event bNew");
  });
});
