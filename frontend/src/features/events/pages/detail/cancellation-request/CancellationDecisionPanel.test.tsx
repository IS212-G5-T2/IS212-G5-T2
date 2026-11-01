import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancellationDecisionPanel } from "@/features/events/pages/detail/cancellation-request/CancellationDecisionPanel";
import { decideCancellationRequest, fetchEventCancellationRequests } from "@/features/events/api/cancellation-requests-api";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { deferred } from "@/test/deferred";
import type { EventRecord } from "@/types";

/*
 * SPM-155 Coordinator decision panel (AC3, AC4, AC5). The API client is the boundary and is mocked; the panel and
 * CancelEventDialog are real. Test cases: CANCEL-REQUEST-03-A to 03-G (UI parts), 04-C (UI), 05-A.
 * Oracle: docs/specs/SPM-155-test-cases.md; F1/F2/F7 (Accept opens the confirmation dialog, Decline does not).
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/features/events/api/cancellation-requests-api", () => ({
  fetchEventCancellationRequests: vi.fn(),
  decideCancellationRequest: vi.fn(),
}));
// The dialog's default action would use the SPM-136 route; the panel must not reach it.
vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api: vi.fn() }));
const fetchMock = vi.mocked(fetchEventCancellationRequests);
const decideMock = vi.mocked(decideCancellationRequest);

const T0 = "2026-10-12T04:00:00.000Z";
const event = (status: string, over: Partial<EventRecord> = {}) =>
  ({ id: "evt-1", name: "Annual Gala Dinner", organiserId: "org-01", coordinatorId: "coo-01", status, ...over }) as unknown as EventRecord;
const coo1 = { id: "coo-01", role: "coordinator" };
const req = (over: Partial<CancellationRequest> = {}): CancellationRequest => ({
  id: "req-1",
  eventId: "evt-1",
  eventName: "Annual Gala Dinner",
  status: "pending",
  displayStatus: "pending",
  reason: "Sponsor withdrew",
  requestedBy: "Farid Rahman",
  requestedAt: T0,
  ...over,
});

beforeEach(() => {
  fetchMock.mockReset();
  decideMock.mockReset();
  fetchMock.mockResolvedValue([req()]);
});
afterEach(() => cleanup());

describe("SPM-155 CancellationDecisionPanel (AC3)", () => {
  // Kills: FM18b, FM26
  /** CANCEL-REQUEST-03-A step 1: the assigned Coordinator sees the pending request with its reason and requester. */
  it("CANCEL-REQUEST-03-A: shows the pending request with the requester, the date and the reason as text", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req({ reason: "<b>Sponsor</b> withdrew" })]);

    // Act
    const { container } = render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Assert: text only (the markup is shown literally), with Accept and Decline offered
    expect(await screen.findByText("<b>Sponsor</b> withdrew")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/Requested by Farid Rahman on 12 Oct 2026, 12:00 SGT/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  // Kills: FM24, FM27, FM30, FM9
  /** CANCEL-REQUEST-03-A (F7): Accept opens CancelEventDialog; nothing is decided until Confirm cancellation; then accept is sent. */
  it("CANCEL-REQUEST-03-A: Accept opens the confirmation dialog, and Confirm cancellation sends the accept decision", async () => {
    // Arrange
    decideMock.mockResolvedValue({ request: req({ status: "accepted", displayStatus: "accepted" }), message: "Cancellation request accepted. Annual Gala Dinner is cancelled." });
    const onAccepted = vi.fn();
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={onAccepted} />);

    // Act 1: Accept opens the dialog and decides nothing
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(screen.getByRole("dialog", { name: "Cancel Annual Gala Dinner?" })).toBeInTheDocument();
    expect(decideMock).not.toHaveBeenCalled();

    // Act 2: confirm
    fetchMock.mockResolvedValue([req({ status: "accepted", displayStatus: "accepted", decidedAt: T0, decidedBy: "Daniel Koh" })]);
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    // Assert: the accept decision for this request, MSG-CR-04 shown, the page told, the status reloaded
    expect(decideMock).toHaveBeenCalledWith("req-1", "accept");
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Cancellation request accepted. Annual Gala Dinner is cancelled.")).toBeInTheDocument();
    expect(onAccepted).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Status: Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  // Kills: FM27, FM28, FM53
  /** CANCEL-REQUEST-03-A (F7): Keep event closes the dialog and the request stays pending. */
  it("CANCEL-REQUEST-03-A: Keep event closes the dialog and sends nothing", async () => {
    // Arrange
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Keep event" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decideMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  // Kills: FM24, FM29
  /** CANCEL-REQUEST-03-B (F7): Decline sends the decline decision at once, with no dialog, and shows MSG-CR-05. */
  it("CANCEL-REQUEST-03-B: Decline sends the decline decision with no dialog, shows MSG-CR-05 and reloads the status", async () => {
    // Arrange
    decideMock.mockResolvedValue({ request: req({ status: "declined", displayStatus: "declined" }), message: "Cancellation request declined." });
    const onAccepted = vi.fn();
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={onAccepted} />);

    // Act
    const decline = await screen.findByRole("button", { name: "Decline" });
    // The server's status after the decision is what the reload reads
    fetchMock.mockResolvedValue([req({ status: "declined", displayStatus: "declined", decidedAt: T0, decidedBy: "Daniel Koh" })]);
    await userEvent.click(decline);

    // Assert
    await waitFor(() => expect(decideMock).toHaveBeenCalledWith("req-1", "decline"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Cancellation request declined.")).toBeInTheDocument();
    expect(await screen.findByText("Status: Declined")).toBeInTheDocument();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  // Kills: FM49, FM6, FM6b
  /** CANCEL-REQUEST-03-C: the controls are not shown to COO-02, LEAD-01, ORG-01 or ATT-01, and nothing is fetched. */
  it.each([
    ["COO-02, not assigned", { id: "coo-02", role: "coordinator" }],
    ["LEAD-01", { id: "lead-01", role: "lead" }],
    ["ORG-01, the requester", { id: "org-01", role: "organiser" }],
    ["ATT-01", { id: "att-01", role: "attendee" }],
  ])("CANCEL-REQUEST-03-C: %s sees no decision panel", async (_label, user) => {
    // Arrange / Act
    const { container } = render(<CancellationDecisionPanel event={event("confirmed")} currentUser={user} onAccepted={vi.fn()} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Kills: FM30
  /** CANCEL-REQUEST-03-D: a decided request shows its status and no Accept or Decline. */
  it.each([
    ["accepted", "Status: Accepted"],
    ["declined", "Status: Declined"],
  ] as const)("CANCEL-REQUEST-03-D: a %s request shows %s and no decision controls", async (status, line) => {
    // Arrange
    fetchMock.mockResolvedValue([req({ status, displayStatus: status, decidedAt: T0, decidedBy: "Daniel Koh" })]);

    // Act
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Assert
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });

  // Kills: FM24, FM31
  /** CANCEL-REQUEST-03-D and 03-E: when the server says the request was already decided, the Coordinator reads it. */
  it("CANCEL-REQUEST-03-E: an already-decided refusal is shown in an alert and the status is reloaded", async () => {
    // Arrange: the other decision won the race
    decideMock.mockRejectedValue(new Error("This request has already been decided."));
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Act
    const decline = await screen.findByRole("button", { name: "Decline" });
    fetchMock.mockResolvedValue([req({ status: "accepted", displayStatus: "accepted", decidedAt: T0, decidedBy: "Daniel Koh" })]);
    await userEvent.click(decline);

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("This request has already been decided.");
    expect(await screen.findByText("Status: Accepted")).toBeInTheDocument();
  });

  // Kills: FM32
  /** CANCEL-REQUEST-03-E (UI): Decline is disabled while its request is in flight, so two clicks send one decision. */
  it("CANCEL-REQUEST-03-E: double-clicking Decline sends one decision and disables both buttons while pending", async () => {
    // Arrange
    const gate = deferred<{ request: CancellationRequest; message: string }>();
    decideMock.mockReturnValue(gate.promise);
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);
    const decline = await screen.findByRole("button", { name: "Decline" });

    // Act
    await userEvent.dblClick(decline);

    // Assert
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decline).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    gate.resolve({ request: req({ status: "declined", displayStatus: "declined" }), message: "Cancellation request declined." });
    expect(await screen.findByText("Cancellation request declined.")).toBeInTheDocument();
  });

  // Kills: FM23b, FM30
  /** CANCEL-REQUEST-03-F and 03-G (D4): a closed request reads Closed with its line and offers no controls. */
  it.each([
    ["completed", "The event is already completed."],
    ["cancelled", "The event is already cancelled."],
  ])("CANCEL-REQUEST-03-F: a request on a %s event reads Closed (%s) with no Accept or Decline", async (eventStatus, line) => {
    // Arrange
    fetchMock.mockResolvedValue([req({ displayStatus: "closed", closedNote: line })]);

    // Act
    render(<CancellationDecisionPanel event={event(eventStatus)} currentUser={coo1} onAccepted={vi.fn()} />);

    // Assert
    expect(await screen.findByText("Status: Closed")).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });

  // Kills: FM48
  /** CANCEL-REQUEST-03-A: with no request the Coordinator sees no panel. */
  it("CANCEL-REQUEST-03-A: an event with no request shows no panel", async () => {
    // Arrange
    fetchMock.mockResolvedValue([]);

    // Act
    const { container } = render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  // Kills: FM25
  /** CANCEL-REQUEST-03-A: a failed load is reported to the Coordinator. */
  it("CANCEL-REQUEST-03-A: a failed load shows an alert", async () => {
    // Arrange
    fetchMock.mockRejectedValue(new Error("Unable to reach the server. Check your connection and try again."));

    // Act
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the cancellation request. Unable to reach the server. Check your connection and try again.");
  });
});

describe("SPM-155 CancellationDecisionPanel: fallbacks", () => {
  // Kills: FM31
  /** CANCEL-REQUEST-03-B: a decline failure that carries no message still tells the Coordinator. */
  it("CANCEL-REQUEST-03-B: a rejection that is not an Error shows the fallback alert", async () => {
    // Arrange
    decideMock.mockRejectedValue("boom");
    render(<CancellationDecisionPanel event={event("confirmed")} currentUser={coo1} onAccepted={vi.fn()} />);

    // Act
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not decline the cancellation request.");
  });
});
