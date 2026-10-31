import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "@/utils/api";
import { SafetyCheckQueuePage } from "./SafetyCheckQueuePage";

const event = { id: "e1", name: "Welcome Evening", startDateTime: "2026-12-12T10:00:00Z", endDateTime: "2026-12-12T13:00:00Z", expectedAttendance: 80, venueRequirements: { layout: "Theatre", facilities: ["AV System"], accessibility: ["Wheelchair access"] } };
const details = { ...event, equipmentNeeds: "Wireless microphone", venues: [{ name: "Main Hall", location: "Level 2", capacity: 120, restrictions: "No open flames", facilities: ["AV System"], accessibility: ["Wheelchair access"], layouts: ["Theatre"] }], equipment: [{ name: "Microphone", quantity: 1 }] };

function response(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }));
}

describe("SPM-129 SafetyCheckQueuePage", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.restoreAllMocks());

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

  /** SAFETY-QUEUE-05: recording a response refreshes the queue and removes the event. */
  it("SAFETY-QUEUE-05 records an approval and refreshes the queue", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "approved" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve arrangement" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/safety-officer/queue/e1/decision",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved", reason: "" }) }),
    );
  });

  /** SAFETY-QUEUE-05: rejection needs a nonblank reason and posts that reason. */
  it("requires a reason before rejecting an arrangement", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(details));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    const reject = await screen.findByRole("button", { name: "Reject arrangement" });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for rejection or requested changes"), { target: { value: "Add an accessible route." } });
    await waitFor(() => expect(reject).toBeEnabled());
  });

  /** SAFETY-QUEUE-05: a response submission error is shown and restores the decision controls. */
  it("shows a response error and allows a retry", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ message: "Decision unavailable" }, 503));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve arrangement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable.");
    expect(screen.getByRole("button", { name: "Approve arrangement" })).toBeEnabled();
  });

  /** SAFETY-QUEUE-05: rejection with a reason is recorded and the event leaves the queue. */
  it("SAFETY-QUEUE-05 records a rejection with its reason", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "rejected" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    fireEvent.change(await screen.findByLabelText("Reason for rejection or requested changes"), { target: { value: "Please add an accessible route." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject arrangement" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/decision"), expect.objectContaining({ body: JSON.stringify({ decision: "rejected", reason: "Please add an accessible route." }) }));
  });

  /** SAFETY-QUEUE-05: requesting changes with a reason records the response and removes the event from this queue. */
  it("SAFETY-QUEUE-05 records a changes-needed response", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => response([event]))
      .mockImplementationOnce(() => response(details))
      .mockImplementationOnce(() => response({ eventId: "e1", status: "changes_needed" }))
      .mockImplementationOnce(() => response([]));
    render(<SafetyCheckQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review arrangements" }));
    fireEvent.change(await screen.findByLabelText("Reason for rejection or requested changes"), { target: { value: "Confirm a backup microphone." } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(await screen.findByText("No events are awaiting a safety check.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/decision"), expect.objectContaining({ body: JSON.stringify({ decision: "changes_needed", reason: "Confirm a backup microphone." }) }));
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
    vi.mocked(fetch).mockImplementationOnce(() => response([event])).mockImplementationOnce(() => response(sparse));
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
    expect(screen.getByText("Welcome Evening")).toBeInTheDocument();
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
