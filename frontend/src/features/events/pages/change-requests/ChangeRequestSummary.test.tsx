import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeRequestSummary } from "@/features/events/pages/change-requests/ChangeRequestSummary";
import { fetchEventChangeRequests } from "@/features/events/api/change-requests-api";
import type { ChangeRequest } from "@/types";

vi.mock("@/features/events/api/change-requests-api", () => ({ fetchEventChangeRequests: vi.fn() }));
const fetchMock = vi.mocked(fetchEventChangeRequests);

/** SPM-64 AC5 — the latest change request's status on the event page. */

const LATEST: ChangeRequest = {
  id: "cr-2",
  eventId: "evt-1",
  eventName: "Alumni Networking Night",
  status: "Denied",
  changes: [{ field: "accessibility", originalValue: [], proposedValue: ["Hearing loop"] }],
  requiresSafetyCheck: true,
  requestedBy: "Organiser 1",
  createdAt: "2026-10-16T02:00:00.000Z",
  decisionReason: "Not possible at this venue.",
};

function renderSummary() {
  return render(
    <MemoryRouter>
      <ChangeRequestSummary eventId="evt-1" />
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
});
