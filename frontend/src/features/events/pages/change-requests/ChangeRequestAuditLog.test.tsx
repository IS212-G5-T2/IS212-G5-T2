import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestAuditLog } from "@/features/events/pages/change-requests/ChangeRequestAuditLog";
import { fetchChangeRequestAudit } from "@/features/events/api/change-requests-api";
import type { ChangeRequestAuditEntry } from "@/types";

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

  /** REVIEW-CHANGE-10-B: the audit log’s empty and failed states. */
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

  /** REVIEW-CHANGE-10-B: the audit log reloads after a decision. */
  it("reloads when the refresh key changes", async () => {
    auditMock.mockResolvedValue([]);
    const { rerender } = render(<ChangeRequestAuditLog eventId="evt-1" refreshKey={0} />);
    await screen.findByText("No decisions recorded yet.");
    rerender(<ChangeRequestAuditLog eventId="evt-1" refreshKey={1} />);
    await screen.findByText("No decisions recorded yet.");
    expect(auditMock).toHaveBeenCalledTimes(2);
  });

  /**
   * REVIEW-CHANGE-10-SUP-LOAD: when a decision reloads the log (new refresh key) while the previous load is still
   * pending, the older load never replaces the newer entries, and its failure is not shown.
   * Kills: ChangeRequestAuditLog.tsx dropping the `active` guard on a superseded load.
   */
  it("REVIEW-CHANGE-10-SUP-LOAD keeps the newer log when an older load settles after it", async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof fetchChangeRequestAudit>>) => void;
    let resolveNew!: (value: Awaited<ReturnType<typeof fetchChangeRequestAudit>>) => void;
    auditMock
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => new Promise((r) => (resolveNew = r)));
    const entry = (id: string, decidedBy: string): ChangeRequestAuditEntry => ({
      id,
      changeRequestId: `cr-${id}`,
      outcome: "Approved" as const,
      changes: [{ field: "layout", originalValue: "Banquet", proposedValue: "Theatre" }],
      requestedBy: "Organiser 1",
      decidedBy,
      decidedAt: "2026-10-18T02:00:00.000Z",
    });
    const { rerender } = render(<ChangeRequestAuditLog eventId="evt-1" refreshKey={0} />);
    rerender(<ChangeRequestAuditLog eventId="evt-1" refreshKey={1} />);
    resolveNew([entry("new", "Newer Coordinator")]);
    expect(await screen.findByText(/^Approved by Newer Coordinator on/)).toBeInTheDocument();
    // act() flushes the state update a settled load makes, so a missing guard would show here.
    await act(async () => resolveOld([entry("old", "Older Coordinator")]));
    expect(screen.queryByText(/Older Coordinator/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Approved by Newer Coordinator on/)).toBeInTheDocument();
  });

  /** REVIEW-CHANGE-10-SUP-LOAD: an older load that fails after the newer one loaded shows no error. Kills: the failure-path guard dropped. */
  it("REVIEW-CHANGE-10-SUP-LOAD shows no error when an older load fails after a newer one", async () => {
    let rejectOld!: (error: unknown) => void;
    auditMock.mockImplementationOnce(() => new Promise((_, r) => (rejectOld = r))).mockResolvedValueOnce([]);
    const { rerender } = render(<ChangeRequestAuditLog eventId="evt-1" refreshKey={0} />);
    rerender(<ChangeRequestAuditLog eventId="evt-1" refreshKey={1} />);
    expect(await screen.findByText("No decisions recorded yet.")).toBeInTheDocument();
    await act(async () => rejectOld(new Error("Older load failed.")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No decisions recorded yet.")).toBeInTheDocument();
  });
});
