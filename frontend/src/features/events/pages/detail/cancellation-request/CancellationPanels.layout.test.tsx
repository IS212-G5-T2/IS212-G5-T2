import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancellationDecisionPanel } from "@/features/events/pages/detail/cancellation-request/CancellationDecisionPanel";
import { CancellationRequestPanel } from "@/features/events/pages/detail/cancellation-request/CancellationRequestPanel";
import { fetchEventCancellationRequests } from "@/features/events/api/cancellation-requests-api";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import type { EventRecord } from "@/types";

/*
 * SPM-155 layout of the two cancellation panels (commit 02e56aa3): the Organiser's Request Cancellation button is a red
 * button below the status box at the bottom right, the box is titled Cancellation Request and appears only when there is
 * something to show, earlier requests sit in a collapsed Earlier Requests dropdown, and both panels label the reason.
 * The API client is the boundary and is mocked; the panels are real.
 * Test cases: CANCEL-REQUEST-02-SUP-LAYOUT (Organiser panel), 03-SUP-LAYOUT (Coordinator panel). Oracle tier: DERIVED
 * (the user's UI decisions of 1 Nov 2026 recorded in the commit message of 02e56aa3).
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/features/events/api/cancellation-requests-api", () => ({
  fetchEventCancellationRequests: vi.fn(),
  submitCancellationRequest: vi.fn(),
  decideCancellationRequest: vi.fn(),
}));
const fetchMock = vi.mocked(fetchEventCancellationRequests);

const T0 = "2026-10-12T04:00:00.000Z";
const event = (status: string) =>
  ({ id: "evt-1", name: "Hack Night", organiserId: "org-01", coordinatorId: "coo-01", status }) as unknown as EventRecord;
const org1 = { id: "org-01", role: "organiser" };
const coo1 = { id: "coo-01", role: "coordinator" };
const req = (over: Partial<CancellationRequest> = {}): CancellationRequest => ({
  id: "req-1",
  eventId: "evt-1",
  eventName: "Hack Night",
  status: "pending",
  displayStatus: "pending",
  reason: "No longer needed",
  requestedBy: "Farid Rahman",
  requestedAt: T0,
  ...over,
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe("SPM-155 Organiser request panel layout", () => {
  // Kills: FM76, FM79
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): with no request and the form closed there is no box, only the button. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: with no request the box is not shown until Request Cancellation is clicked, then it is titled Cancellation Request", async () => {
    // Arrange
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    const button = await screen.findByRole("button", { name: "Request Cancellation" });

    // Assert 1: no box and no heading yet
    expect(screen.queryByRole("heading", { name: "Cancellation Request" })).not.toBeInTheDocument();

    // Act
    await userEvent.click(button);

    // Assert 2: the box opens with its title and the reason field; the opening button is gone
    expect(screen.getByRole("heading", { name: "Cancellation Request" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reason (optional)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Cancellation" })).not.toBeInTheDocument();
  });

  // Kills: FM74, FM75, FM78, FM79
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): the button is red, at the bottom right, and below the status box. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: Request Cancellation is a red button, right-aligned, below the status box", async () => {
    // Arrange: a declined request, so the box shows a status and the action is offered again
    fetchMock.mockResolvedValue([req({ status: "declined", displayStatus: "declined", decidedAt: T0, decidedBy: "Daniel Koh" })]);
    render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);

    // Act
    const button = await screen.findByRole("button", { name: "Request Cancellation" });
    const heading = screen.getByRole("heading", { name: "Cancellation Request" });

    // Assert: danger styling (red), right-aligned wrapper, and after the box in the document
    expect(button).toHaveClass("bg-danger-600");
    expect(button.parentElement).toHaveClass("justify-end");
    expect(Boolean(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  // Kills: FM7, FM71, FM73
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): the reason is labelled "Reason:" and shown as text; with no reason there is no label. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: the request shows a Reason: label before the reason text, and none when there is no reason", async () => {
    // Arrange: first a request with a reason
    fetchMock.mockResolvedValue([req({ reason: "No longer needed" })]);
    const { unmount } = render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert 1
    const label = await screen.findByText("Reason:");
    expect(label.parentElement).toHaveTextContent("Reason: No longer needed");
    unmount();

    // Arrange / Assert 2: a request with no reason shows no label
    fetchMock.mockResolvedValue([req({ reason: null })]);
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.queryByText("Reason:")).not.toBeInTheDocument();
  });

  // Kills: FM21, FM71, FM77, FM81
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): earlier requests are in a dropdown that starts closed and opens on its summary. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: earlier requests sit in a collapsed Earlier Requests dropdown that opens when clicked", async () => {
    // Arrange: a current pending request and one earlier declined request with its own reason
    fetchMock.mockResolvedValue([
      req({ id: "req-2", reason: "Second try" }),
      req({ id: "req-1", status: "declined", displayStatus: "declined", reason: "First try", decidedAt: T0, decidedBy: "Daniel Koh" }),
    ]);
    render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);

    // Act
    const summary = await screen.findByText("Earlier Requests");
    const dropdown = summary.closest("details") as HTMLDetailsElement;

    // Assert: a details element, closed at first; the earlier reason is labelled inside it; clicking the summary opens it
    expect(dropdown).not.toBeNull();
    expect(dropdown.open).toBe(false);
    expect(within(dropdown).getByText("Reason:")).toBeInTheDocument();
    await userEvent.click(summary);
    expect(dropdown.open).toBe(true);
  });

  // Kills: FM7
  /** CANCEL-REQUEST-02-SUP-LAYOUT (DERIVED): with a single request there is no Earlier Requests dropdown. */
  it("CANCEL-REQUEST-02-SUP-LAYOUT: with one request there is no Earlier Requests dropdown", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req()]);

    // Act
    render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);
    await screen.findByText("Status: Pending");

    // Assert
    expect(screen.queryByText("Earlier Requests")).not.toBeInTheDocument();
  });
});

describe("SPM-155 Coordinator decision panel layout", () => {
  // Kills: FM72, FM80
  /** CANCEL-REQUEST-03-SUP-LAYOUT (DERIVED): the decision panel is titled Cancellation Request and labels the reason. */
  it("CANCEL-REQUEST-03-SUP-LAYOUT: the decision panel is titled Cancellation Request and shows Reason: before the reason text", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req({ reason: "Sponsor withdrew" })]);

    // Act
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Assert
    expect(await screen.findByRole("heading", { name: "Cancellation Request" })).toBeInTheDocument();
    expect(screen.getByText("Reason:").parentElement).toHaveTextContent("Reason: Sponsor withdrew");
  });

  // Kills: FM7
  /** CANCEL-REQUEST-03-SUP-LAYOUT (DERIVED): a request with no reason shows no Reason: label to the Coordinator. */
  it("CANCEL-REQUEST-03-SUP-LAYOUT: a request without a reason shows no Reason: label to the Coordinator", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req({ reason: null })]);

    // Act
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);
    await screen.findByText("Status: Pending");

    // Assert
    expect(screen.queryByText("Reason:")).not.toBeInTheDocument();
  });
});
