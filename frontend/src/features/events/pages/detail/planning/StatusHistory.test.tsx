// Story: SPM-148 Event Status Changes from Approved to Planning
// ACs: AC4
// Test cases: PLAN-STATUS-04-A (FE), PLAN-STATUS-04-D (FE)
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/utils/api";
import { StatusHistory } from "./StatusHistory";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000801";

describe("SPM-148 AC4: the status history is shown in Singapore time", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  afterEach(cleanup);

  // Kills: M10 time shown as UTC, entry or actor missing.
  it("PLAN-STATUS-04-A: shows Approved to Planning at 12:00 SGT with the Coordinator's name", async () => {
    // Arrange: 04:00Z is 12:00 SGT.
    apiMock.mockResolvedValue([
      { fromStatus: "Approved", toStatus: "Planning", changedAt: "2026-10-15T04:00:00.000Z", changedBy: { id: "c1", name: "Daniel Koh" } },
    ]);

    // Act
    render(<StatusHistory eventId={EVENT_ID} />);

    // Assert
    expect(await screen.findByText("Approved to Planning, 15 Oct 2026 12:00 SGT, by Daniel Koh")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(`/events/${EVENT_ID}/status-history`);
  });

  // Kills: M10 UTC date shown instead of the SGT date.
  it("PLAN-STATUS-04-D: 16:30Z on 10 Nov is shown as 11 Nov 00:30 SGT", async () => {
    apiMock.mockResolvedValue([
      { fromStatus: "Approved", toStatus: "Planning", changedAt: "2026-11-10T16:30:00.000Z", changedBy: { id: "c1", name: "Daniel Koh" } },
    ]);

    render(<StatusHistory eventId={EVENT_ID} />);

    expect(await screen.findByText(/11 Nov 2026 00:30 SGT/)).toBeInTheDocument();
  });

  // Kills: an error from the history endpoint breaking the page.
  it("PLAN-STATUS-04-A: renders nothing when the history cannot be read", async () => {
    apiMock.mockImplementation(() => Promise.reject(new Error("boom")));

    const { container } = render(<StatusHistory eventId={EVENT_ID} />);
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });
});

// ASSUMPTION index
// A1: entry text "Approved to Planning, 15 Oct 2026 12:00 SGT, by Daniel Koh" -> 04-A
