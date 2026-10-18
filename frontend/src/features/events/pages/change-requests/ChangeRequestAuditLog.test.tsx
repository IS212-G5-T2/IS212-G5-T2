import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestAuditLog } from "@/features/events/pages/change-requests/ChangeRequestAuditLog";
import { fetchChangeRequestAudit } from "@/features/events/api/change-requests-api";

vi.mock("@/features/events/api/change-requests-api", () => ({
  fetchChangeRequestAudit: vi.fn(),
  markChangeRequestNoticesRead: vi.fn(() => Promise.resolve()),
  fetchNewChangeRequestEventIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));
const auditMock = vi.mocked(fetchChangeRequestAudit);

/** SPM-65 AC10 — the audit log (REVIEW-CHANGE-10-A/B). */
beforeEach(() => vi.resetAllMocks());

describe("ChangeRequestAuditLog", () => {
  it("REVIEW-CHANGE-10-B lists each outcome in the order the server gives (newest first)", async () => {
    auditMock.mockResolvedValue([
      {
        id: "a2",
        changeRequestId: "cr-2",
        outcome: "Approved",
        changes: [{ field: "layout", originalValue: "Banquet", proposedValue: "Theatre" }],
        requestedBy: "Organiser 1",
        decidedBy: "Coord",
        decidedAt: "2026-10-18T02:00:00.000Z",
      },
      {
        id: "a1",
        changeRequestId: "cr-1",
        outcome: "Denied",
        changes: [{ field: "accessibility", originalValue: [], proposedValue: ["Ramp"] }],
        requestedBy: "Organiser 1",
        decidedBy: "Coord",
        reason: "Not possible here.",
        decidedAt: "2026-10-17T02:00:00.000Z",
      },
    ]);
    render(<ChangeRequestAuditLog eventId="evt-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading audit log…");
    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/^Approved by Coord on/);
    expect(items[0]).toHaveTextContent("Requested by Organiser 1: Room layout");
    expect(items[1]).toHaveTextContent("Accessibility / special requirements");
    expect(items[1]).toHaveTextContent("Reason: “Not possible here.”");
    expect(auditMock).toHaveBeenCalledWith("evt-1");
  });

  it("says when nothing is recorded and when the log cannot load", async () => {
    auditMock.mockResolvedValue([]);
    const { unmount } = render(<ChangeRequestAuditLog eventId="evt-1" />);
    expect(await screen.findByText("No decisions recorded yet.")).toBeInTheDocument();
    unmount();
    auditMock.mockRejectedValueOnce(new Error("Event not found."));
    const second = render(<ChangeRequestAuditLog eventId="evt-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Event not found.");
    second.unmount();
    auditMock.mockRejectedValueOnce("offline");
    render(<ChangeRequestAuditLog eventId="evt-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the audit log.");
  });

  it("reloads when the refresh key changes", async () => {
    auditMock.mockResolvedValue([]);
    const { rerender } = render(<ChangeRequestAuditLog eventId="evt-1" refreshKey={0} />);
    await screen.findByText("No decisions recorded yet.");
    rerender(<ChangeRequestAuditLog eventId="evt-1" refreshKey={1} />);
    await screen.findByText("No decisions recorded yet.");
    expect(auditMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a load that settles after unmounting", async () => {
    let resolve!: (value: never[]) => void;
    let reject!: (error: unknown) => void;
    auditMock
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    render(<ChangeRequestAuditLog eventId="evt-1" />).unmount();
    render(<ChangeRequestAuditLog eventId="evt-1" />).unmount();
    resolve([]);
    reject(new Error("late"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
