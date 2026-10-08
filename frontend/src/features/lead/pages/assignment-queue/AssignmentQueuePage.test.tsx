// SPM-123 Assign Event Requests to Coordinators (Lead): Assignment Queue page tests.
// ACs: AC2 (view the queue), AC3 (availability and workload), AC5 (assign),
// AC6 (unavailable refused), AC7 (none available), AC8 (confirmation).
// Test cases: LEAD-ASN-02-B, 02-C, 02-E, 03-D, 05-C, 05-BND-1, 06-C, 06-D, 06-F, 07-A, 08-A, 08-B;
// SPM-47 LEAD-REASN-10-H.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { ApiError } from "@/utils/api";
import { formatDateRange } from "@/utils/format";
import { AssignmentQueuePage } from "./AssignmentQueuePage";

const { getLeadQueue, getLeadCoordinators, assignRequest } = vi.hoisted(() => ({
  getLeadQueue: vi.fn(),
  getLeadCoordinators: vi.fn(),
  assignRequest: vi.fn(),
}));

vi.mock("@/features/lead/api/lead-api", () => ({ getLeadQueue, getLeadCoordinators, assignRequest }));

// SPM-47: the Lead's notifications panel on this page reads /notifications through api().
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/utils/api", async (importOriginal) => ({ ...(await importOriginal<object>()), api }));

const welcome = {
  id: "event-1",
  name: "Welcome Evening",
  purpose: "Community building",
  startDateTime: "2027-01-10T10:00:00.000Z",
  endDateTime: "2027-01-10T12:00:00.000Z",
  expectedAttendance: 80,
  submittedAt: "2026-10-01T09:00:00.000Z",
};
const gala = { ...welcome, id: "event-2", name: "Spring Gala", purpose: "Fundraising", expectedAttendance: 200 };

const available = { id: "c1", name: "Coordinator 1", available: true, activeAssignments: 2 };
const unavailable = { id: "c2", name: "Coordinator 2", available: false, activeAssignments: 0 };

// The request card that holds a given event name.
function card(name: string) {
  return screen.getByRole("article", { name });
}

// A promise that stays pending until the test resolves it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  // Fresh mocks; by default one queued request, one available and one unavailable coordinator.
  getLeadQueue.mockReset();
  getLeadCoordinators.mockReset();
  assignRequest.mockReset();
  getLeadQueue.mockResolvedValue([welcome]);
  getLeadCoordinators.mockResolvedValue([available, unavailable]);
  // No Lead notifications unless a test adds some.
  api.mockReset();
  api.mockResolvedValue([]);
});

describe("AC2: the unassigned queue", () => {
  // The four basic fields are shown for every request.
  it("LEAD-ASN-02-B shows each unassigned request's name, purpose, date and time, and expected attendance", async () => {
    // Arrange: two queued requests.
    getLeadQueue.mockResolvedValue([welcome, gala]);

    // Act: open the page.
    render(<AssignmentQueuePage />);

    // Assert: each card shows its own details, in the order the server sent (oldest first).
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Welcome Evening", "Spring Gala"]);
    const first = within(card("Welcome Evening"));
    expect(first.getByRole("heading", { name: "Welcome Evening" })).toBeInTheDocument();
    expect(first.getByText("Community building")).toBeInTheDocument();
    expect(first.getByText(formatDateRange(welcome.startDateTime, welcome.endDateTime))).toBeInTheDocument();
    expect(first.getByText("Expected attendance: 80")).toBeInTheDocument();
    expect(within(card("Spring Gala")).getByText("Expected attendance: 200")).toBeInTheDocument();
  });

  // An empty queue says so rather than showing nothing.
  it("LEAD-ASN-02-C shows a message when there are no unassigned requests", async () => {
    // Arrange: nothing is waiting.
    getLeadQueue.mockResolvedValue([]);

    // Act: open the page.
    render(<AssignmentQueuePage />);

    // Assert: the empty message, and no request cards.
    expect(await screen.findByText("No unassigned requests.")).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
  // If the queue can't be loaded, the Lead is told instead of seeing an empty page.
  it("LEAD-ASN-02-E shows an error when the queue cannot be loaded", async () => {
    // Arrange: loading fails.
    getLeadQueue.mockRejectedValue(new ApiError("The service is temporarily unavailable. Please try again."));

    // Act: open the page.
    render(<AssignmentQueuePage />);

    // Assert: the error is shown and no "empty queue" message is claimed.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The service is temporarily unavailable. Please try again.",
    );
    expect(screen.queryByText("No unassigned requests.")).not.toBeInTheDocument();
  });
});

describe("AC3: coordinator availability and workload", () => {
  // The coordinators panel shows name, availability and active count.
  it("LEAD-ASN-03-D shows each coordinator's name, availability and active count", async () => {
    // Act: open the page.
    render(<AssignmentQueuePage />);

    // Assert: both coordinators are listed with their status and workload.
    const panel = await screen.findByRole("region", { name: "Coordinators" });
    const rows = within(panel).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Coordinator 1");
    expect(rows[0]).toHaveTextContent("Available");
    expect(rows[0]).toHaveTextContent("2 active");
    expect(rows[1]).toHaveTextContent("Coordinator 2");
    expect(rows[1]).toHaveTextContent("Unavailable");
    expect(rows[1]).toHaveTextContent("0 active");
  });
});

describe("AC5 and AC8: assigning a request", () => {
  // Choosing a coordinator and assigning sends both ids and removes the request.
  it("LEAD-ASN-05-C assigns the chosen coordinator and removes the request from the queue", async () => {
    // Arrange: the assignment succeeds.
    const user = userEvent.setup();
    assignRequest.mockResolvedValue({ message: 'Event request "Welcome Evening" assigned to Coordinator 1.' });
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));

    // Act: choose Coordinator 1 and assign.
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");
    await user.click(request.getByRole("button", { name: "Assign" }));

    // Assert: the ids were sent once and the request left the queue.
    expect(assignRequest).toHaveBeenCalledTimes(1);
    expect(assignRequest).toHaveBeenCalledWith("event-1", "c1");
    await waitFor(() => expect(screen.queryByRole("article", { name: "Welcome Evening" })).not.toBeInTheDocument());
  });

  // The Lead is told who the request went to.
  it("LEAD-ASN-08-A confirms which coordinator the request was assigned to", async () => {
    // Arrange: the assignment succeeds.
    const user = userEvent.setup();
    assignRequest.mockResolvedValue({ message: 'Event request "Welcome Evening" assigned to Coordinator 1.' });
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));

    // Act: assign to Coordinator 1.
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");
    await user.click(request.getByRole("button", { name: "Assign" }));

    // Assert: the server's confirmation is shown.
    expect(await screen.findByRole("status")).toHaveTextContent(
      'Event request "Welcome Evening" assigned to Coordinator 1.',
    );
  });

  // A failed assignment is reported and the request stays.
  it("LEAD-ASN-08-B shows an error and no confirmation when assigning fails", async () => {
    // Arrange: the assignment fails.
    const user = userEvent.setup();
    assignRequest.mockRejectedValue(new ApiError("Unable to reach the server. Check your connection and try again."));
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));

    // Act: try to assign.
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");
    await user.click(request.getByRole("button", { name: "Assign" }));

    // Assert: the error is shown, there is no confirmation, and the request is still queued.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to reach the server. Check your connection and try again.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Welcome Evening" })).toBeInTheDocument();
  });

  // Double-clicking Assign must not send two requests.
  it("LEAD-ASN-05-BND-1 disables Assign while assigning so only one request is sent", async () => {
    // Arrange: an assignment that stays pending.
    const user = userEvent.setup();
    const pending = deferred<{ message: string }>();
    assignRequest.mockReturnValue(pending.promise);
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");

    // Act: click Assign, then click again while it is still assigning.
    await user.click(request.getByRole("button", { name: "Assign" }));
    const assigning = request.getByRole("button", { name: "Assigning…" });
    expect(assigning).toBeDisabled();
    await user.click(assigning);

    // Assert: one request; it finishes normally.
    expect(assignRequest).toHaveBeenCalledTimes(1);
    pending.resolve({ message: 'Event request "Welcome Evening" assigned to Coordinator 1.' });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("AC6 and AC7: unavailable coordinators", () => {
  // Unavailable coordinators are visible in the picker but can't be chosen.
  it("LEAD-ASN-06-C lists unavailable coordinators but does not let them be chosen", async () => {
    // Act: open the page.
    render(<AssignmentQueuePage />);
    const picker = within(await screen.findByRole("article", { name: "Welcome Evening" })).getByLabelText("Assign to");

    // Assert: Coordinator 2 is listed as unavailable and disabled; Coordinator 1 is selectable.
    const unavailableOption = within(picker).getByRole("option", { name: "Coordinator 2 (Unavailable)" });
    expect(unavailableOption).toBeDisabled();
    expect(within(picker).getByRole("option", { name: "Coordinator 1 (2 active)" })).toBeEnabled();
  });

  // If the server refuses (e.g. they went unavailable), the page explains and refreshes.
  it("LEAD-ASN-06-D shows the error, keeps the request and refreshes coordinators when an assignment is refused", async () => {
    // Arrange: the server refuses; afterwards Coordinator 1 shows as unavailable.
    const user = userEvent.setup();
    assignRequest.mockRejectedValue(new ApiError("This coordinator is unavailable.", undefined, undefined, 409));
    getLeadCoordinators
      .mockResolvedValueOnce([available, unavailable])
      .mockResolvedValueOnce([{ ...available, available: false }, unavailable]);
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));

    // Act: try to assign to Coordinator 1.
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");
    await user.click(request.getByRole("button", { name: "Assign" }));

    // Assert: the reason is shown, the request stays, and the refreshed list marks Coordinator 1 unavailable.
    expect(await screen.findByRole("alert")).toHaveTextContent("This coordinator is unavailable.");
    expect(screen.getByRole("article", { name: "Welcome Evening" })).toBeInTheDocument();
    await waitFor(() => expect(getLeadCoordinators).toHaveBeenCalledTimes(2));
    expect(
      await within(request.getByLabelText("Assign to")).findByRole("option", { name: "Coordinator 1 (Unavailable)" }),
    ).toBeDisabled();
  });

  // If the request was already handled elsewhere, the refusal also removes its stale card.
  it("LEAD-ASN-06-F reloads the queue after a refusal so a request assigned elsewhere disappears", async () => {
    // Arrange: another tab already assigned the request, so the server refuses
    // and the reloaded queue no longer contains it.
    const user = userEvent.setup();
    assignRequest.mockRejectedValue(
      new ApiError("This event request has already been assigned.", undefined, undefined, 409),
    );
    getLeadQueue.mockResolvedValueOnce([welcome, gala]).mockResolvedValueOnce([gala]);
    render(<AssignmentQueuePage />);
    const request = within(await screen.findByRole("article", { name: "Welcome Evening" }));

    // Act: try to assign it.
    await user.selectOptions(request.getByLabelText("Assign to"), "c1");
    await user.click(request.getByRole("button", { name: "Assign" }));

    // Assert: the reason stays on screen, the stale card is gone and the other request remains.
    expect(await screen.findByRole("alert")).toHaveTextContent("This event request has already been assigned.");
    await waitFor(() => expect(screen.queryByRole("article", { name: "Welcome Evening" })).not.toBeInTheDocument());
    expect(screen.getByRole("article", { name: "Spring Gala" })).toBeInTheDocument();
    expect(getLeadQueue).toHaveBeenCalledTimes(2);
  });

  // With nobody available, the Lead is told and the request stays queued.
  it("LEAD-ASN-07-A tells the Lead no coordinators are available and keeps the request queued", async () => {
    // Arrange: every coordinator is unavailable.
    getLeadCoordinators.mockResolvedValue([unavailable, { ...available, available: false }]);

    // Act: open the page.
    render(<AssignmentQueuePage />);

    // Assert: the message is shown, the request is still listed, and Assign is disabled.
    expect(
      await screen.findByText("No coordinators are available right now. The request stays in the queue."),
    ).toBeInTheDocument();
    const request = within(screen.getByRole("article", { name: "Welcome Evening" }));
    expect(request.getByRole("button", { name: "Assign" })).toBeDisabled();
  });
});

describe("SPM-47 AC10: the Lead's notifications on the Assignment Queue page", () => {
  // The Lead sees coordinator-unavailable notices on the page they land on.
  it("LEAD-REASN-10-H shows the Lead's coordinator-unavailable notifications on the Assignment Queue page", async () => {
    // Arrange: the Lead is signed in and has one unread notice.
    useAppStore.setState({
      currentUser: { id: "lead-1", name: "Coordinator Lead", email: "lead@example.test", role: "coordinator_lead", roles: ["coordinator_lead"] },
    });
    api.mockResolvedValue([
      {
        id: "notif-3",
        audienceRole: "coordinator_lead",
        type: "coordinator_unavailable",
        message: "Coordinator 1 is now unavailable and has 3 active events that may need reassignment.",
        read: false,
        createdAt: "2026-10-07T09:00:00.000Z",
      },
    ]);

    // Act: open the page.
    render(
      <MemoryRouter>
        <AssignmentQueuePage />
      </MemoryRouter>,
    );

    // Assert: the page includes the panel with the notice.
    const panel = await screen.findByRole("region", { name: "Coordinator availability" });
    expect(panel).toHaveTextContent("Coordinator 1 is now unavailable and has 3 active events that may need reassignment.");
  });
});
