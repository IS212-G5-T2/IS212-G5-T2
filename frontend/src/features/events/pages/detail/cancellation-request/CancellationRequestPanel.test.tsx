import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancellationRequestPanel } from "@/features/events/pages/detail/cancellation-request/CancellationRequestPanel";
import { fetchEventCancellationRequests, submitCancellationRequest } from "@/features/events/api/cancellation-requests-api";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import { deferred } from "@/test/deferred";
import type { EventRecord } from "@/types";

/*
 * SPM-155 Organiser request panel (AC1, AC2). The API client is the boundary and is mocked; the panel is real.
 * Test cases: CANCEL-REQUEST-01-A, 01-C, 01-E, 01-F, 01-H (UI parts) and 02-A to 02-F (display).
 * Oracle: docs/specs/SPM-155-test-cases.md; MSG-CR-01 text is the catalogue literal; the status words and the D4
 * Closed lines are Gate-1 DERIVED/ASSUMED text. Dates are SGT (12:00 SGT = 04:00Z).
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */

vi.mock("@/features/events/api/cancellation-requests-api", () => ({
  fetchEventCancellationRequests: vi.fn(),
  submitCancellationRequest: vi.fn(),
}));
const fetchMock = vi.mocked(fetchEventCancellationRequests);
const submitMock = vi.mocked(submitCancellationRequest);

const MSG_REQUESTED = "Cancellation request sent to your Event Coordinator.";
const T0 = "2026-10-12T04:00:00.000Z";

const event = (status: string, over: Partial<EventRecord> = {}) =>
  ({ id: "evt-1", name: "Hack Night", organiserId: "org-01", coordinatorId: "coo-01", status, ...over }) as unknown as EventRecord;
const org1 = { id: "org-01", role: "organiser" };
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
  submitMock.mockReset();
  fetchMock.mockResolvedValue([]);
});
afterEach(() => cleanup());

const open = async () => userEvent.click(await screen.findByRole("button", { name: "Request Cancellation" }));

describe("SPM-155 CancellationRequestPanel: making a request (AC1)", () => {
  // Kills: FM10, FM11, FM15, FM7
  /** CANCEL-REQUEST-01-A: Request Cancellation, enter the reason, send; MSG-CR-01 is shown and the status then reads Pending. */
  it("CANCEL-REQUEST-01-A: the owner sends the reason, sees MSG-CR-01, and the reloaded request reads Pending", async () => {
    // Arrange: Approved event, no requests; after the POST the server returns the pending request
    submitMock.mockResolvedValue({ request: req(), message: MSG_REQUESTED });
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Act
    await open();
    await userEvent.type(screen.getByLabelText("Reason (optional)"), "No longer needed");
    fetchMock.mockResolvedValue([req()]);
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    // Assert: POST with the event id and the reason; the catalogue message; the pending status after the reload
    expect(submitMock).toHaveBeenCalledWith("evt-1", "No longer needed");
    expect(await screen.findByText(MSG_REQUESTED)).toBeInTheDocument();
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Cancellation" })).not.toBeInTheDocument();
  });

  // Kills: FM12, FM4
  /** CANCEL-REQUEST-01-C subtests A and B: no Request Cancellation action on a Completed or Cancelled event. */
  it.each(["completed", "cancelled", "rejected", "draft"])("CANCEL-REQUEST-01-C: a %s event offers no Request Cancellation action", async (status) => {
    // Arrange / Act
    render(<CancellationRequestPanel event={event(status)} currentUser={org1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Assert
    expect(screen.queryByRole("button", { name: "Request Cancellation" })).not.toBeInTheDocument();
  });

  // Kills: FM13, FM49
  /** CANCEL-REQUEST-01-E subtest E: ORG-02, COO-01 and ATT-01 see no action and the panel asks the server for nothing. */
  it.each([
    ["ORG-02", { id: "org-02", role: "organiser" }],
    ["COO-01", { id: "coo-01", role: "coordinator" }],
    ["ATT-01", { id: "att-01", role: "attendee" }],
  ])("CANCEL-REQUEST-01-E: %s sees no panel and nothing is fetched", async (_label, user) => {
    // Arrange / Act
    const { container } = render(<CancellationRequestPanel event={event("approved")} currentUser={user} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Kills: FM14
  /** CANCEL-REQUEST-01-F step 4: a double click on Send request sends one request; the button is disabled while it is pending. */
  it("CANCEL-REQUEST-01-F: double-clicking Send request posts once and disables the button while pending", async () => {
    // Arrange: a POST that stays pending until released
    const gate = deferred<{ request: CancellationRequest; message: string }>();
    submitMock.mockReturnValue(gate.promise);
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();

    // Act
    const send = screen.getByRole("button", { name: "Send request" });
    await userEvent.dblClick(send);

    // Assert: one call; disabled and busy while pending
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute("aria-busy", "true");
    gate.resolve({ request: req(), message: MSG_REQUESTED });
    expect(await screen.findByText(MSG_REQUESTED)).toBeInTheDocument();
  });

  // Kills: FM15, FM7
  /** CANCEL-REQUEST-01-F: with a pending request there is no Request Cancellation action. */
  it("CANCEL-REQUEST-01-F: a pending request hides the Request Cancellation action", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req()]);

    // Act
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Cancellation" })).not.toBeInTheDocument();
  });

  // Kills: FM16
  /** CANCEL-REQUEST-01-F: a 409 from the server is shown in an alert (MSG-CR-03 text) and the form stays open. */
  it("CANCEL-REQUEST-01-F: a server refusal is shown in an alert and the form stays open for the Organiser", async () => {
    // Arrange
    submitMock.mockRejectedValue(new Error("You already have a pending cancellation request for this event."));
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a pending cancellation request for this event.");
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  // Kills: FM17
  /** CANCEL-REQUEST-01-H subtests B and C (UI): 500 characters is accepted, 501 shows the field error and disables Send. */
  it("CANCEL-REQUEST-01-H: the counter reads 500/500 and Send stays enabled; 501 shows the error and disables Send", async () => {
    // Arrange
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();
    const box = screen.getByLabelText("Reason (optional)");

    // Act / Assert: 500 characters
    fireEvent.change(box, { target: { value: "r".repeat(500) } });
    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
    expect(screen.queryByText("Use 500 characters or fewer.")).not.toBeInTheDocument();

    // Act / Assert: 501 characters
    fireEvent.change(box, { target: { value: "r".repeat(501) } });
    expect(screen.getByText("501/500")).toBeInTheDocument();
    expect(screen.getByText("Use 500 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
  });

  // Kills: FM8
  /** CANCEL-REQUEST-01-H: the count is in code points, so 500 emoji are allowed. */
  it("CANCEL-REQUEST-01-H: 500 emoji count as 500 characters and are allowed", async () => {
    // Arrange
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();

    // Act
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "\u{1F600}".repeat(500) } });

    // Assert
    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  // Kills: FM18
  /** CANCEL-REQUEST-01-H subtest D: script text is displayed literally and no script element exists. */
  it("CANCEL-REQUEST-01-H: a reason of <script>alert(1)</script> is shown as plain text and no script runs", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req({ reason: "<script>alert(1)</script>" })]);

    // Act
    const { container } = render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert: the literal text is on screen; the DOM contains no script element
    expect(await screen.findByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("SPM-155 CancellationRequestPanel: the status (AC2)", () => {
  // Kills: FM19, FM7
  /** CANCEL-REQUEST-02-A: Pending with the request date in SGT. */
  it("CANCEL-REQUEST-02-A: shows Status: Pending and the request date 12 Oct 2026, 12:00 SGT", async () => {
    // Arrange
    fetchMock.mockResolvedValue([req()]);

    // Act
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.getByText(/Requested 12 Oct 2026, 12:00 SGT/)).toBeInTheDocument();
    expect(screen.getByText("No longer needed")).toBeInTheDocument();
  });

  // Kills: FM20
  /** CANCEL-REQUEST-02-B and 02-C: Accepted and Declined with the decision date and who decided. */
  it.each([
    ["accepted", "Status: Accepted"],
    ["declined", "Status: Declined"],
  ] as const)("CANCEL-REQUEST-02-B: a %s request shows %s with the decision date", async (status, line) => {
    // Arrange
    fetchMock.mockResolvedValue([req({ status, displayStatus: status, decidedAt: "2026-10-12T08:30:00.000Z", decidedBy: "Daniel Koh" })]);

    // Act
    render(<CancellationRequestPanel event={event(status === "accepted" ? "cancelled" : "confirmed")} currentUser={org1} />);

    // Assert: 08:30Z = 16:30 SGT
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByText(/Decided by Daniel Koh on 12 Oct 2026, 16:30 SGT/)).toBeInTheDocument();
  });

  // Kills: FM21, FM22, FM7
  /** CANCEL-REQUEST-02-E: the newest request is current; the earlier Declined one stays listed. */
  it("CANCEL-REQUEST-02-E: the newest pending request is current and the earlier Declined request is still listed", async () => {
    // Arrange: newest first, as the API returns them
    fetchMock.mockResolvedValue([
      req({ id: "req-2", reason: "Second try" }),
      req({ id: "req-1", status: "declined", displayStatus: "declined", reason: "First try", requestedAt: "2026-10-10T04:00:00.000Z", decidedAt: "2026-10-10T06:00:00.000Z", decidedBy: "Daniel Koh" }),
    ]);

    // Act
    render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);

    // Assert
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    expect(screen.getByText("Second try")).toBeInTheDocument();
    const earlier = screen.getByRole("list", { name: "Earlier requests" });
    expect(within(earlier).getByText(/Declined/)).toBeInTheDocument();
    expect(within(earlier).getByText("First try")).toBeInTheDocument();
  });

  // Kills: FM12, FM20, FM23, FM4
  /** CANCEL-REQUEST-02-SUP-CLOSED (D4): a closed request reads Closed with the server's line, and no action is offered. */
  it.each([
    ["completed", "The event is already completed."],
    ["cancelled", "The event is already cancelled."],
  ])("CANCEL-REQUEST-02-SUP-CLOSED: on a %s event the request reads Closed with its line", async (eventStatus, line) => {
    // Arrange
    fetchMock.mockResolvedValue([req({ displayStatus: "closed", closedNote: line })]);

    // Act
    render(<CancellationRequestPanel event={event(eventStatus)} currentUser={org1} />);

    // Assert
    expect(await screen.findByText("Status: Closed")).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.queryByText("Status: Pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Cancellation" })).not.toBeInTheDocument();
  });

  // Kills: FM20, FM54, FM7
  /** CANCEL-REQUEST-02-F: every mount reads the server again; no stale Pending is shown while the new read is in flight, and a reload shows Declined. */
  it("CANCEL-REQUEST-02-F: a remount shows the latest status (Declined) rather than the earlier Pending", async () => {
    // Arrange: first mount reads Pending
    fetchMock.mockResolvedValueOnce([req()]);
    const first = render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);
    expect(await screen.findByText("Status: Pending")).toBeInTheDocument();
    first.unmount();

    // Act: the Coordinator declined meanwhile; the page is reloaded and the read is still in flight
    const gate = deferred<CancellationRequest[]>();
    fetchMock.mockReturnValueOnce(gate.promise);
    render(<CancellationRequestPanel event={event("confirmed")} currentUser={org1} />);

    // Assert: nothing stale while loading; Declined once the server answers
    expect(screen.queryByText("Status: Pending")).not.toBeInTheDocument();
    gate.resolve([req({ status: "declined", displayStatus: "declined", decidedAt: T0, decidedBy: "Daniel Koh" })]);
    expect(await screen.findByText("Status: Declined")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Kills: FM25
  /** CANCEL-REQUEST-02-A: if the status cannot be loaded the Organiser is told, not shown an empty panel. */
  it("CANCEL-REQUEST-02-A: a failed load shows an alert", async () => {
    // Arrange
    fetchMock.mockRejectedValue(new Error("Unable to reach the server. Check your connection and try again."));

    // Act
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the cancellation request. Unable to reach the server. Check your connection and try again.");
  });
});

describe("SPM-155 CancellationRequestPanel: form controls and fallbacks", () => {
  // Kills: FM43
  /** CANCEL-REQUEST-01-A: Close hides the form again and sends nothing. */
  it("CANCEL-REQUEST-01-A: Close hides the form without sending anything", async () => {
    // Arrange
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    // Assert
    expect(screen.queryByLabelText("Reason (optional)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Cancellation" })).toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  // Kills: FM16
  /** CANCEL-REQUEST-01-F: a failure that carries no message still tells the Organiser. */
  it("CANCEL-REQUEST-01-F: a rejection that is not an Error shows the fallback alert", async () => {
    // Arrange
    submitMock.mockRejectedValue("boom");
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);
    await open();

    // Act
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the cancellation request.");
  });

  // Kills: FM25, FM50
  /** CANCEL-REQUEST-02-A: a load failure that carries no message still shows the alert, without a trailing detail. */
  it("CANCEL-REQUEST-02-A: a load rejection that is not an Error shows the alert with no detail", async () => {
    // Arrange
    fetchMock.mockRejectedValue("boom");

    // Act
    render(<CancellationRequestPanel event={event("approved")} currentUser={org1} />);

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Could not load the cancellation request\.$/);
  });
});
