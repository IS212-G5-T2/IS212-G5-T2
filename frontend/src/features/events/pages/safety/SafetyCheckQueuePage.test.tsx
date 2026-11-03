import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import * as apiModule from "@/utils/api";
import { SafetyCheckQueuePage } from "./SafetyCheckQueuePage";

const event = { id: "e1", name: "Welcome Evening", startDateTime: "2026-12-12T10:00:00Z", endDateTime: "2026-12-12T13:00:00Z", expectedAttendance: 80, venueRequirements: { layout: "Theatre", facilities: ["AV System"], accessibility: ["Wheelchair access"] } };
const details = { ...event, equipmentNeeds: "Wireless microphone", venues: [{ id: "booking-1", name: "Main Hall", location: "Level 2", capacity: 120, restrictions: "No open flames", facilities: ["AV System"], accessibility: ["Wheelchair access"], layouts: ["Theatre"] }], equipment: [{ id: "equipment-1", name: "Microphone", quantity: 1 }] };

function response(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }));
}

function selectVenueForAllChanges(dialog: HTMLElement) {
  const changeCount = within(dialog).getAllByRole("textbox").length;
  const checkboxes = within(dialog).getAllByRole("checkbox");
  for (let rowNumber = 0; rowNumber < changeCount; rowNumber += 1) {
    const checkbox = checkboxes[rowNumber * 2];
    if (!checkbox) throw new Error(`Venue checkbox for change ${rowNumber + 1} was not rendered.`);
    if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
  }
}

describe("SPM-129 SafetyCheckQueuePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  /** SAFETY-QUEUE-01, SAFETY-QUEUE-02, SAFETY-QUEUE-03, SAFETY-QUEUE-04: an eligible event is visible and all required event, venue, and technical details can be inspected. */
  it("SAFETY-QUEUE-01 lists an eligible event and opens its details", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    expect(await screen.findByText("Welcome Evening")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    expect(screen.getByText("Requested layout: Theatre")).toBeInTheDocument();
    expect(screen.getByText("Accessibility requirements: Wheelchair access")).toBeInTheDocument();
    expect(screen.getByText("Required facilities: AV System")).toBeInTheDocument();
    expect(await screen.findByText("Capacity: 120")).toBeInTheDocument();
    expect(screen.getByText("Restrictions: No open flames")).toBeInTheDocument();
    expect(screen.getByText("Technical requirements: Wireless microphone")).toBeInTheDocument();
    expect(screen.getByText("Facilities: AV System")).toBeInTheDocument();
    expect(screen.getByText("Accessibility: Wheelchair access")).toBeInTheDocument();
    expect(screen.getByText("Layouts: Theatre")).toBeInTheDocument();
    expect(screen.getByText("Microphone: 1")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/safety-officer/queue/e1", expect.anything());
  });

  /** SAFETY-DECISION-01: approving succeeds and shows confirmation before returning to the refreshed queue. */
  it("SAFETY-DECISION-01 approves an arrangement and confirms the decision", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "approved" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reason for rejection")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Change 1")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Approve arrangement" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Approve arrangement" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to queue" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/safety-officer/queue/e1/decision",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved" }) }),
    );
  });

  /** SAFETY-DECISION-02: rejection opens its required-feedback modal without submitting a decision. */
  it("SAFETY-DECISION-02 opens rejection feedback only after the reject action", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reason for rejection")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject arrangement" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject arrangement" });
    expect(within(dialog).getByLabelText("Reason for rejection")).toBeRequired();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  /** SAFETY-DECISION-03: request-changes opens its own required-description modal without submitting. */
  it("SAFETY-DECISION-03 opens the change-description modal only after its action", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    expect(within(dialog).getByLabelText("Change 1")).toBeRequired();
    expect(within(dialog).queryByLabelText("Reason for rejection")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  /** SAFETY-OUTCOME-04: the Safety Officer selects affected venue or technical arrangements per change, and cannot submit an empty selection. */
  it("SAFETY-OUTCOME-04 submits selected affected arrangements with each change description", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.type(within(dialog).getByLabelText("Change 1"), "Review the microphone setup.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.type(within(dialog).getByLabelText("Change 2"), "Review the venue route.");
    const firstChange = within(dialog).getByLabelText("Change 1").parentElement?.parentElement;
    if (!firstChange) throw new Error("Change row 1 was not rendered.");
    const secondChange = within(dialog).getByLabelText("Change 2").parentElement?.parentElement;
    if (!secondChange) throw new Error("Change row 2 was not rendered.");
    await user.click(within(firstChange).getByRole("checkbox", { name: "Main Hall (venue)" }));
    await user.click(within(firstChange).getByRole("checkbox", { name: "Main Hall (venue)" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Change 1 must select at least one arrangement for review.");
    expect(fetch).toHaveBeenCalledTimes(2);

    await user.click(within(firstChange).getByRole("checkbox", { name: "Microphone (equipment)" }));
    await user.click(within(firstChange).getByRole("checkbox", { name: "Microphone (equipment)" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(fetch).toHaveBeenCalledTimes(2);
    await user.click(within(firstChange).getByRole("checkbox", { name: "Microphone (equipment)" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Change 2 must select at least one arrangement for review.");
    await user.click(within(secondChange).getByRole("checkbox", { name: "Microphone (equipment)" }));
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({
      body: JSON.stringify({ decision: "changes_needed", changes: [
        { text: "Review the microphone setup.", venueIds: [], equipmentIds: ["equipment-1"] },
        { text: "Review the venue route.", venueIds: [], equipmentIds: ["equipment-1"] },
      ] }),
    }));
  });

  async function expectAccessibleFeedbackModal(action: string, label: string) {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: action }));
    const dialog = await screen.findByRole("dialog", { name: action });
    expect(within(dialog).getByLabelText(label)).toBeRequired();
    if (action === "Request changes") {
      const addButton = within(dialog).getByRole("button", { name: "Add change" });
      expect(addButton).toHaveTextContent("+");
      expect(addButton).toBeEnabled();
    }
    const results = await axe(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  }

  /** SAFETY-DECISION-02: the rejection reason control is accessible inside its modal. */
  it("SAFETY-DECISION-02 has an accessible rejection modal", async () => {
    await expectAccessibleFeedbackModal("Reject arrangement", "Reason for rejection");
  });

  /** SAFETY-DECISION-03: the change description control is accessible inside its modal. */
  it("SAFETY-DECISION-03 has an accessible request-changes modal", async () => {
    await expectAccessibleFeedbackModal("Request changes", "Change 1");
  });

  /** SAFETY-DECISION-03: adding and removing change rows works, and cancelling discards added rows. */
  it("SAFETY-DECISION-03 starts with one row and discards added rows on cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Remove change 1" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(3);

    await user.type(within(dialog).getByLabelText("Change 1"), "Remove the first row.");
    await user.type(within(dialog).getByLabelText("Change 2"), "Keep this row.");
    await user.type(within(dialog).getByLabelText("Change 3"), "Discard this draft.");
    await user.click(within(dialog).getByRole("button", { name: "Remove change 1" }));
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    expect(within(dialog).getByLabelText("Change 1")).toHaveValue("Keep this row.");
    expect(within(dialog).getByLabelText("Change 2")).toHaveValue("Discard this draft.");
    await user.click(within(dialog).getByRole("button", { name: "Remove change 1" }));
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
    expect(within(dialog).getByLabelText("Change 1")).toHaveValue("Discard this draft.");
    expect(within(dialog).getByRole("button", { name: "Remove change 1" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const reopened = await screen.findByRole("dialog", { name: "Request changes" });
    expect(within(reopened).getAllByRole("textbox")).toHaveLength(1);
    expect(within(reopened).getByLabelText("Change 1")).toHaveValue("");
    expect(within(reopened).getByRole("button", { name: "Remove change 1" })).toBeDisabled();
  });

  /** SAFETY-DECISION-03: removing the last row preserves the earlier rows, with Remove beside its textarea, and submits only the survivors. */
  it("SAFETY-DECISION-03 removes the last change row and submits the remaining rows", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.type(within(dialog).getByLabelText("Change 1"), "Add a fire exit plan.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.type(within(dialog).getByLabelText("Change 2"), "Confirm occupancy.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.type(within(dialog).getByLabelText("Change 3"), "Label emergency lighting.");

    const lastRowField = within(dialog).getByLabelText("Change 3");
    expect(lastRowField.parentElement).toContainElement(within(dialog).getByRole("button", { name: "Remove change 3" }));
    await user.click(within(dialog).getByRole("button", { name: "Remove change 3" }));
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    expect(within(dialog).getByLabelText("Change 1")).toHaveValue("Add a fire exit plan.");
    expect(within(dialog).getByLabelText("Change 2")).toHaveValue("Confirm occupancy.");

    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({
      body: JSON.stringify({ decision: "changes_needed", changes: [{ text: "Add a fire exit plan.", venueIds: ["booking-1"], equipmentIds: [] }, { text: "Confirm occupancy.", venueIds: ["booking-1"], equipmentIds: [] }] }),
    }));
  });

  /** SAFETY-DECISION-04: every change row must be nonblank, and validation does not submit a partial decision. */
  it("SAFETY-DECISION-04 validates every change row before submitting any", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.type(within(dialog).getByLabelText("Change 1"), "Add a fire exit plan.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Change 2");
    expect(fetch).toHaveBeenCalledTimes(2);

    await user.type(within(dialog).getByLabelText("Change 2"), "Confirm occupancy.");
    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({
      body: JSON.stringify({ decision: "changes_needed", changes: [{ text: "Add a fire exit plan.", venueIds: ["booking-1"], equipmentIds: [] }, { text: "Confirm occupancy.", venueIds: ["booking-1"], equipmentIds: [] }] }),
    }));
  });

  /** SAFETY-DECISION-03: each remaining row after removal is submitted as an independent item. */
  it("SAFETY-DECISION-03 submits every remaining change row separately", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.type(within(dialog).getByLabelText("Change 1"), "Add a fire exit plan.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    const second = within(dialog).getByLabelText("Change 2");
    await user.type(second, "Confirm occupancy.");
    expect(second).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.type(within(dialog).getByLabelText("Change 3"), "Temporary third item.");
    await user.click(within(dialog).getByRole("button", { name: "Remove change 2" }));
    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({
      body: JSON.stringify({ decision: "changes_needed", changes: [{ text: "Add a fire exit plan.", venueIds: ["booking-1"], equipmentIds: [] }, { text: "Temporary third item.", venueIds: ["booking-1"], equipmentIds: [] }] }),
    }));
  });

  /** SAFETY-DECISION-03: pending submission disables row actions, and recoverable errors retain all row text for retry. */
  it("SAFETY-DECISION-03 retains multiple rows through pending submission and a recoverable error", async () => {
    const user = userEvent.setup();
    let rejectDecision!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { rejectDecision = resolve; }))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.type(within(dialog).getByLabelText("Change 1"), "Add a fire exit plan.");
    await user.click(within(dialog).getByRole("button", { name: "Add change" }));
    await user.type(within(dialog).getByLabelText("Change 2"), "Confirm occupancy.");
    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));

    expect(within(dialog).getByRole("button", { name: "Add change" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Remove change 2" })).toBeDisabled();
    expect(within(dialog).getByLabelText("Change 1")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    rejectDecision(new Response(JSON.stringify({ message: "Decision unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The service is temporarily unavailable.");
    expect(within(dialog).getByLabelText("Change 1")).toHaveValue("Add a fire exit plan.");
    expect(within(dialog).getByLabelText("Change 2")).toHaveValue("Confirm occupancy.");
    selectVenueForAllChanges(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({
      body: JSON.stringify({ decision: "changes_needed", changes: [{ text: "Add a fire exit plan.", venueIds: ["booking-1"], equipmentIds: [] }, { text: "Confirm occupancy.", venueIds: ["booking-1"], equipmentIds: [] }] }),
    }));
  });

  /** SAFETY-DECISION-02: cancel and close discard an abandoned rejection draft before approval. */
  it.each(["Cancel", "Close dialog"] as const)("SAFETY-DECISION-02 discards a rejection draft on %s before direct approval", async (closeAction) => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "approved" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Reject arrangement" }));
    fireEvent.change(await screen.findByLabelText("Reason for rejection"), { target: { value: "Stale draft reason" } });
    fireEvent.click(screen.getByRole("button", { name: closeAction }));
    expect(screen.queryByRole("dialog", { name: "Reject arrangement" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Reject arrangement" }));
    expect(await screen.findByLabelText("Reason for rejection")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Approve arrangement" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    const decisionCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/decision"));
    expect(decisionCall?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ decision: "approved" }) }));
    expect(decisionCall?.[1]?.body).not.toContain("Stale draft reason");
  });

  /** SAFETY-DECISION-04: action-specific modals reject missing and whitespace-only feedback without POST. */
  it.each([
    ["rejected", "Reject arrangement", "Reason for rejection", "Submit rejection", "Enter a reason for rejection."],
    ["changes_needed", "Request changes", "Change 1", "Submit change request", "Change 1 cannot be blank."],
  ] as const)("SAFETY-DECISION-04 blocks blank feedback for %s", async (_decision, action, label, submit, expectedError) => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(await screen.findByRole("button", { name: action }));
    const dialog = await screen.findByRole("dialog", { name: action });
    fireEvent.click(within(dialog).getByRole("button", { name: submit }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(expectedError);
    expect(within(dialog).getByLabelText(label)).toHaveAttribute("aria-describedby", "safety-decision-error");
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: submit }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(expectedError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  /** SAFETY-DECISION-02: a recoverable rejection error retains the draft and permits retry. */
  it("SAFETY-DECISION-02 retains rejection feedback and allows a retry after a recoverable error", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ message: "Decision unavailable" }, 503))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "rejected" }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Reject arrangement" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject arrangement" });
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), { target: { value: "Add the missing safety plan." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit rejection" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The service is temporarily unavailable.");
    expect(screen.getByRole("dialog", { name: "Reject arrangement" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for rejection")).toHaveValue("Add the missing safety plan.");
    fireEvent.click(screen.getByRole("button", { name: "Submit rejection" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/decision"), expect.objectContaining({ body: JSON.stringify({ decision: "rejected", reason: "Add the missing safety plan." }) }));
  });

  /** SAFETY-DECISION-03: only one request can be pending and its feedback modal cannot be dismissed. */
  it("SAFETY-DECISION-03 disables duplicate submission and pending dismissal", async () => {
    let resolveDecision!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveDecision = resolve; }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    fireEvent.change(within(dialog).getByLabelText("Change 1"), { target: { value: "Provide a second exit." } });
    selectVenueForAllChanges(dialog);
    const submit = within(dialog).getByRole("button", { name: "Submit change request" });
    act(() => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(within(dialog).getByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog", { name: "Request changes" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);

    resolveDecision(new Response(JSON.stringify({ eventId: "e1", status: "changes_needed" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-05: stale decisions refresh the queue and close invalidated details after 404 or 409. */
  it.each([404, 409])("SAFETY-DECISION-03 closes stale feedback after a %s response refusal", async (status) => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ message: "This event is no longer awaiting a safety check." }, status))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    fireEvent.change(within(dialog).getByLabelText("Change 1"), { target: { value: "Refresh the current safety plan." } });
    selectVenueForAllChanges(dialog);
    fireEvent.click(screen.getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("This event is no longer awaiting a safety check.");
    expect(screen.queryByText("Expected attendance: 80")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  /** SAFETY-QUEUE-02: venue arrangements use booking identity even when multiple bookings share a display label. */
  it("uses unique booking identity for venue cards with duplicate names and locations", async () => {
    const duplicateVenue = { ...details.venues[0], id: "booking-2" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response({ ...details, venues: [...details.venues, duplicateVenue] }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findAllByText("Main Hall · Level 2")).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("same key"), expect.anything());
  });

  /** SAFETY-QUEUE-03: equipment rows use reservation identity when names repeat. */
  it("uses reservation IDs for equipment rows with duplicate names", async () => {
    const duplicateEquipment = [
      { id: "reservation-1", name: "Microphone", quantity: 1 },
      { id: "reservation-2", name: "Microphone", quantity: 2 },
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response({ ...details, equipment: duplicateEquipment }));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));

    expect(await screen.findByText("Microphone: 1")).toBeInTheDocument();
    expect(screen.getByText("Microphone: 2")).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("same key"), expect.anything());
  });

  /** SAFETY-QUEUE-05: returning to the queue refreshes it so decisions made elsewhere disappear. */
  it("refreshes the queue when returning from details after a concurrent decision", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Expected attendance: 80")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to queue" }));

    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(screen.queryByText("Welcome Evening")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  /** SAFETY-DECISION-02: rejection with a reason is recorded and confirmed. */
  it("SAFETY-DECISION-02 rejects with its reason and confirms the decision", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "rejected" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(await screen.findByRole("button", { name: "Reject arrangement" }));
    const input = await screen.findByLabelText("Reason for rejection");
    await user.click(input);
    await user.type(input, "Please add an accessible route.");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Please add an accessible route.");
    fireEvent.click(screen.getByRole("button", { name: "Submit rejection" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Return to queue" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/decision"), expect.objectContaining({ body: JSON.stringify({ decision: "rejected", reason: "Please add an accessible route." }) }));
  });

  /** SAFETY-DECISION-03: a described change request is recorded and confirmed. */
  it("SAFETY-DECISION-03 requests changes with a description and confirms the decision", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    const input = within(dialog).getByLabelText("Change 1");
    await user.click(input);
    await user.type(input, "Confirm a backup microphone.");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Confirm a backup microphone.");
    selectVenueForAllChanges(dialog);
    fireEvent.click(screen.getByRole("button", { name: "Submit change request" }));
    expect(await screen.findByRole("dialog", { name: "Decision submitted" })).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Return to queue" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/decision"), expect.objectContaining({ body: JSON.stringify({ decision: "changes_needed", changes: [{ text: "Confirm a backup microphone.", venueIds: ["booking-1"], equipmentIds: [] }] }) }));
  });

  /** SAFETY-DECISION-05: every successful decision displays a confirmation modal before returning to the refreshed queue. */
  it.each([
    ["approved", "Approve arrangement", "", true],
    ["rejected", "Reject arrangement", "Please add a fire exit plan.", false],
    ["changes_needed", "Request changes", "Confirm a backup microphone.", false],
  ] as const)("SAFETY-DECISION-05 confirms the %s decision", async (decision, action, reason, closeWithHeader) => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: decision }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    await screen.findByText("Expected attendance: 80");
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (decision !== "approved") {
      const label = decision === "rejected" ? "Reason for rejection" : "Change 1";
      const submit = decision === "rejected" ? "Submit rejection" : "Submit change request";
      fireEvent.change(await screen.findByLabelText(label), { target: { value: reason } });
      if (decision === "changes_needed") selectVenueForAllChanges(screen.getByRole("dialog", { name: "Request changes" }));
      fireEvent.click(screen.getByRole("button", { name: submit }));
    }

    const dialog = await screen.findByRole("dialog", { name: "Decision submitted" });
    expect(dialog).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    expect(screen.getByText("Welcome Evening")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: closeWithHeader ? "Close dialog" : "Return to queue" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-01: if arrangements become unavailable before detail opens, the queue refreshes. */
  it("refreshes after details are no longer available", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response({ message: "Event no longer available" }, 404))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-02, SAFETY-QUEUE-03, SAFETY-QUEUE-04: empty optional venue and equipment details have readable fallbacks. */
  it("SAFETY-QUEUE-02 shows empty arrangement values explicitly", async () => {
    const sparse = { ...details, equipmentNeeds: "", venues: [{ ...details.venues[0], facilities: [], accessibility: [], layouts: [] }], equipment: [], venueRequirements: { layout: "", facilities: [], accessibility: [] } };
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(sparse)).mockImplementationOnce(() => response([event]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("Requested layout: None specified")).toBeInTheDocument();
    expect(screen.getByText("Accessibility requirements: None specified")).toBeInTheDocument();
    expect(screen.getByText("Required facilities: None specified")).toBeInTheDocument();
    expect(screen.getByText("Technical requirements: None specified")).toBeInTheDocument();
    expect(screen.getByText("No equipment requested.")).toBeInTheDocument();
    expect(screen.getByText("Facilities: None listed")).toBeInTheDocument();
    expect(screen.getByText("Accessibility: None listed")).toBeInTheDocument();
    expect(screen.getByText("Layouts: None listed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to queue" }));
    expect(await screen.findByText("Welcome Evening")).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-01: a successful read with no eligible events shows an empty queue. */
  it("SAFETY-QUEUE-01 shows the empty queue state", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
  });

  /** SAFETY-QUEUE-01: a failed queue read is surfaced as a recoverable load error. */
  it("SAFETY-QUEUE-01 shows a queue load error", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response({ message: "Queue unavailable" }, 503));
    render(<SafetyCheckQueuePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable.");
  });

  /** SAFETY-QUEUE-01: network failures while loading the queue produce a readable fallback message. */
  it("SAFETY-QUEUE-01 shows a generic queue error when the request fails outside the API wrapper", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValueOnce(new Error("network failure"));
    render(<SafetyCheckQueuePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the safety check queue.");
  });

  /** SAFETY-QUEUE-01: network failures while loading event details are reported and the queue is refreshed. */
  it("SAFETY-QUEUE-01 shows a generic detail error and refreshes after a network failure", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValueOnce([event]).mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce([]);
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load event details.");
  });

  /** SAFETY-QUEUE-05: network failures while submitting a decision preserve the review state and show an error. */
  it("SAFETY-QUEUE-05 shows a generic decision error when the submission request fails", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValueOnce([event]).mockResolvedValueOnce(details)
      .mockRejectedValueOnce(new Error("network failure"));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve arrangement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to submit the safety decision.");
  });
});
