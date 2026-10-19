import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, UserRole } from "@/types";

/**
 * Event decision controls: SPM-40 approval (EVENT-APPROVE-01-A-C, 04-C) and
 * SPM-83 rejection (EVENT-REJECT-01-A-I, 04-A). Both actions use the same
 * assigned-coordinator page setup; their distinct requirements remain in the
 * named test groups below.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignedEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "organiser-9",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
    status: "submitted",
    startDateTime: "2026-12-12T18:00:00.000Z",
    endDateTime: "2026-12-12T21:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: [], accessibility: [] },
    equipmentNeeds: "",
    registrationEnabled: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

function setUser(role: UserRole, id = "coordinator-1") {
  useAppStore.setState({
    currentUser: { id, name: "Test User", email: "user@example.test", role },
  });
}

function renderDetail(event: EventRecord) {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(String(path).includes("/comments") ? [] : event),
  );
  return render(
    <MemoryRouter initialEntries={[`/events/${event.id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openReview() {
  fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
  // Choosing Reject reveals the reason field / Submit Decision control.
  fireEvent.click(screen.getByRole("radio", { name: /reject/i }));
}

async function openReviewApprove() {
  fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
  fireEvent.click(screen.getByRole("radio", { name: /approve/i }));
}

function fillReason(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /reason/i }), {
    target: { value },
  });
}

function submitDecision() {
  fireEvent.click(screen.getByRole("button", { name: "Submit Decision" }));
}

function expectRequirementsBlock() {
  // SC-SPM150-01 (decided 19 Oct 2026): the block heading is "Please provide a reason that:".
  expect(screen.getByText("Please provide a reason that:")).toBeTruthy();
  expect(screen.getByText(/between 10 and 500 characters/i)).toBeTruthy();
  expect(screen.getByText(/at least 3 words/i)).toBeTruthy();
  expect(screen.getByText(/real words, not just numbers or symbols/i)).toBeTruthy();
}

function rejectRequestFired() {
  return apiMock.mock.calls.some(([p]) => String(p).includes("/reject"));
}

// Every API call made for a decision, as [path, init] pairs, so tests can assert the exact
// request (path, method, body) and how many times it was sent.
function rejectCalls() {
  return apiMock.mock.calls.filter(([p]) => String(p).includes("/reject"));
}

function approveCalls() {
  return apiMock.mock.calls.filter(([p]) => String(p).includes("/approve"));
}

const EVENT_ID = "00000000-0000-4000-8000-000000000036";

// Letters and single spaces only, with no leading or trailing whitespace, so the
// result has exactly n characters and n trimmed characters (n >= 10).
function reasonOfLength(n: number): string {
  const prefix = "ab cd ef "; // three words, nine characters
  return prefix + "g".repeat(n - prefix.length);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ events: [], notifications: [] });
  setUser("coordinator");
});

describe("EventDetailPage — reject workflow (SPM-83)", () => {
  // EVENT-REJECT-01-A — happy path (entry)
  it("lets the assigned coordinator open reject decision controls from Review Event", async () => {
    renderDetail(assignedEvent());

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    const reviewButton = screen.getByRole("button", { name: "Review Event" });
    expect(reviewButton).toHaveProperty("disabled", false);
    fireEvent.click(reviewButton);

    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
    expect(screen.queryByText("Event review is not available yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  /** EVENT-REJECT-01-B — happy path (submit): one POST to the reject route with the trimmed reason. */
  it("submits a valid rejection and fires the reject request", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("  Clashes with exam period.  ");
    submitDecision();

    expect(rejectCalls()).toEqual([
      [
        `/events/${EVENT_ID}/reject`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Clashes with exam period." }),
        }),
      ],
    ]);
    expect(screen.queryByText(/between 10 and 500 characters/i)).toBeNull();
  });

  /**
   * EVENT-REJECT-01-B — no duplicate request while the rejection is in flight. The store action is
   * held open (its status change is otherwise immediate), so the page stays in its submitting state.
   */
  it("sends the rejection exactly once when Submit Decision is clicked twice while in flight", async () => {
    const realReject = useAppStore.getState().rejectEvent;
    let settle: () => void = () => undefined;
    const heldReject = vi.fn((_id: string, _reason: string) => new Promise<void>((resolve) => { settle = resolve; }));
    useAppStore.setState({ rejectEvent: heldReject });
    try {
      renderDetail(assignedEvent());
      await openReview();
      fillReason("Clashes with exam period.");

      submitDecision();
      const inFlight = screen.getByRole("button", { name: /Submitting/ });
      expect(inFlight).toHaveProperty("disabled", true);
      fireEvent.click(inFlight);
      fireEvent.click(inFlight);

      expect(heldReject).toHaveBeenCalledTimes(1);
      expect(heldReject).toHaveBeenCalledWith(EVENT_ID, "Clashes with exam period.");

      settle();
      await waitFor(() => expect(screen.queryByRole("button", { name: /Submitting/ })).toBeNull());
      expect(heldReject).toHaveBeenCalledTimes(1);
    } finally {
      useAppStore.setState({ rejectEvent: realReject });
    }
  });

  // EVENT-REJECT-01-C — empty / whitespace-only
  it("blocks an empty or whitespace-only reason with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    submitDecision();
    expectRequirementsBlock();
    expect(screen.getByRole("textbox", { name: /reason/i })).toHaveProperty("ariaInvalid", "true");

    fillReason("   ");
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);
  });

  /** EVENT-REJECT-01-D — below minimum length (<10), measured on the trimmed reason */
  it("blocks a reason under 10 characters and accepts exactly 10", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("no fit ok"); // 9 chars
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("No fit yet"); // 10 chars, 3 words
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  /** EVENT-REJECT-01-D — padding does not count: 9 trimmed characters stay blocked */
  it("blocks a padded reason whose trimmed length is 9", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("  no fit ok  "); // raw 13, trimmed 9
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);
  });

  /** EVENT-REJECT-01-D — padding does not count: a padded reason of 10 trimmed characters is accepted */
  it("accepts a padded reason whose trimmed length is 10", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("  No fit yet  "); // raw 14, trimmed 10
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
    expect(rejectCalls()).toEqual([
      [
        `/events/${EVENT_ID}/reject`,
        expect.objectContaining({ body: JSON.stringify({ reason: "No fit yet" }) }),
      ],
    ]);
    expect(screen.queryByText(/between 10 and 500 characters/i)).toBeNull();
  });

  /** EVENT-REJECT-01-E — above maximum length (>500), measured on the trimmed reason; 500 is sent in full, not truncated */
  it("accepts exactly 500 trimmed characters and blocks 501", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason(reasonOfLength(501));
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason(reasonOfLength(500));
    submitDecision();
    expect(rejectCalls()).toEqual([
      [
        `/events/${EVENT_ID}/reject`,
        expect.objectContaining({ body: JSON.stringify({ reason: reasonOfLength(500) }) }),
      ],
    ]);
  });

  /** EVENT-REJECT-01-E — raw length over 500 is accepted when the trimmed reason is 500, and the full 500-character value is sent */
  it("accepts a reason whose raw length exceeds 500 but whose trimmed length is 500", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason(`  ${reasonOfLength(500)}  `); // raw 504, trimmed 500
    submitDecision();
    expect(rejectCalls()).toEqual([
      [
        `/events/${EVENT_ID}/reject`,
        expect.objectContaining({ body: JSON.stringify({ reason: reasonOfLength(500) }) }),
      ],
    ]);
    expect(screen.queryByText(/between 10 and 500 characters/i)).toBeNull();
  });

  // EVENT-REJECT-01-F — fewer than 3 words
  it("blocks a reason with fewer than 3 words with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("Reason today"); // 2 words
    submitDecision();
    expectRequirementsBlock();

    fillReason("aaaaaaaaaa"); // 1 word (single repeated char)
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("Venue is not available"); // 4 words
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-G — no letters (numbers / symbols only)
  it("blocks a letter-less reason with the requirements block", async () => {
    renderDetail(assignedEvent());
    await openReview();

    fillReason("123 456 7890");
    submitDecision();
    expectRequirementsBlock();

    fillReason("!!! ??? ...");
    submitDecision();
    expectRequirementsBlock();
    expect(rejectRequestFired()).toBe(false);

    fillReason("Venue is not available");
    submitDecision();
    expect(rejectRequestFired()).toBe(true);
  });

  // EVENT-REJECT-01-H — special characters preserved & rendered safely
  it("accepts a special-character reason and renders it safely to the organiser", async () => {
    const reason = 'Room too small & date clashed <not a tag> "quoted" — 🚫';
    renderDetail(assignedEvent());
    await openReview();

    fillReason(reason);
    submitDecision();
    // The entered value reaches the action unchanged (no fixed or altered reason).
    expect(rejectCalls()).toEqual([
      [
        `/events/${EVENT_ID}/reject`,
        expect.objectContaining({ body: JSON.stringify({ reason }) }),
      ],
    ]);

    // Rendered to the organiser as literal text (no markup interpretation).
    cleanup();
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent({ status: "rejected", rejectionReason: reason }));
    expect(await screen.findByText(reason)).toBeTruthy();
  });

  // EVENT-REJECT-04-A — authorization (UI): reject controls only for the assigned coordinator
  it("shows reject controls only to the assigned coordinator", async () => {
    // Unassigned coordinator: no Review Event entrypoint.
    setUser("coordinator", "coordinator-2");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    cleanup();

    // Organiser (owner): no reject controls.
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /reject/i })).toBeNull();
    cleanup();

    // Assigned coordinator: reject controls are available.
    setUser("coordinator", "coordinator-1");
    renderDetail(assignedEvent());
    fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
  });

  /** EVENT-REJECT-04-A: the owning organiser never sees the Review Event entrypoint or any decision control. */
  it("hides the Review Event entrypoint from the owning organiser", async () => {
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent());

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /reject/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /approve/i })).toBeNull();
  });

  /** EVENT-REJECT-04-A: venue staff and technical support have no reject or approve controls on a submitted request. */
  it.each(["venue_staff", "tech_support"] as const)(
    "shows no Review Event entrypoint or decision controls to %s",
    async (role) => {
      setUser(role, "venue-staff-1");
      renderDetail(assignedEvent());

      // Support staff are refused the unapproved submitted request (anchor: the access alert).
      expect(
        await screen.findByText(/Venue and technical support staff cannot access unapproved submitted requests/),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
      expect(screen.queryByRole("radio", { name: /reject|approve/i })).toBeNull();
      expect(screen.queryByRole("button", { name: "Submit Decision" })).toBeNull();
    },
  );

  // EVENT-REJECT-01-I — a rejected request shows draft → submitted → rejected,
  // without approval-pipeline statuses.
  it("shows a draft → submitted → rejected status timeline for a rejected request", async () => {
    setUser("organiser", "organiser-9");
    renderDetail(
      assignedEvent({ status: "rejected", rejectionReason: "Venue is not available" }),
    );

    const timeline = await screen.findByRole("list", { name: /Event status timeline/i });
    expect(within(timeline).getByText("draft")).toBeTruthy();
    expect(within(timeline).getByText("submitted")).toBeTruthy();
    expect(within(timeline).getByText("rejected")).toBeTruthy();
    // The approval pipeline steps are not part of a rejected request's timeline.
    expect(within(timeline).queryByText("approved")).toBeNull();
    expect(within(timeline).queryByText("under review")).toBeNull();
  });
});

describe("EventDetailPage — approve workflow (SPM-40)", () => {
  // EVENT-APPROVE-01-A — happy path (entry)
  it("lets the assigned coordinator open the decision controls with an Approve option", async () => {
    renderDetail(assignedEvent());

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Event" }));

    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /reject/i })).toBeTruthy();
  });

  /** EVENT-APPROVE-01-B — happy path (submit): one POST to the approve route, with no body and no reason. */
  it("submits an approval and fires the approve request without asking for a reason", async () => {
    renderDetail(assignedEvent());
    await openReviewApprove();

    // Approve requires no reason field.
    expect(screen.queryByRole("textbox", { name: /reason/i })).toBeNull();

    submitDecision();

    expect(approveCalls()).toEqual([[`/events/${EVENT_ID}/approve`, { method: "POST" }]]);
  });

  /** EVENT-APPROVE-01-B — no duplicate approval while the request is in flight (store action held open). */
  it("sends the approval exactly once when Submit Decision is clicked twice while in flight", async () => {
    const realApprove = useAppStore.getState().approveEvent;
    let settle: () => void = () => undefined;
    const heldApprove = vi.fn((_id: string) => new Promise<void>((resolve) => { settle = resolve; }));
    useAppStore.setState({ approveEvent: heldApprove });
    try {
      renderDetail(assignedEvent());
      await openReviewApprove();

      submitDecision();
      const inFlight = screen.getByRole("button", { name: /Submitting/ });
      expect(inFlight).toHaveProperty("disabled", true);
      fireEvent.click(inFlight);
      fireEvent.click(inFlight);

      expect(heldApprove).toHaveBeenCalledTimes(1);
      expect(heldApprove).toHaveBeenCalledWith(EVENT_ID);

      settle();
      await waitFor(() => expect(screen.queryByRole("button", { name: /Submitting/ })).toBeNull());
      expect(heldApprove).toHaveBeenCalledTimes(1);
    } finally {
      useAppStore.setState({ approveEvent: realApprove });
    }
  });

  // EVENT-APPROVE-01-C — authorization (UI): controls only for the assigned coordinator
  it("shows the Approve controls only to the assigned coordinator", async () => {
    // Unassigned coordinator: no Review Event entrypoint.
    setUser("coordinator", "coordinator-2");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    cleanup();

    // Organiser (owner): no decision controls.
    setUser("organiser", "organiser-9");
    renderDetail(assignedEvent());
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /approve/i })).toBeNull();
    cleanup();

    // Assigned coordinator: the Approve control is available.
    setUser("coordinator", "coordinator-1");
    renderDetail(assignedEvent());
    fireEvent.click(await screen.findByRole("button", { name: "Review Event" }));
    expect(screen.getByRole("radio", { name: /approve/i })).toBeTruthy();
  });

  // EVENT-APPROVE-04-C — immutability (UI): no approve/revert controls once approved
  it("hides the approve controls once the event is approved", async () => {
    setUser("coordinator", "coordinator-1");

    // An already-approved event offers no Review Event entrypoint / decision controls.
    renderDetail(assignedEvent({ status: "approved" }));
    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /approve/i })).toBeNull();
    cleanup();

    // Contrast: while still submitted, the Approve entrypoint is shown.
    renderDetail(assignedEvent({ status: "submitted" }));
    expect(await screen.findByRole("button", { name: "Review Event" })).toBeTruthy();
  });
});
