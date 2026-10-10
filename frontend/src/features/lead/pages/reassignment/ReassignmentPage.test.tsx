// SPM-47 Reassign an Event to Another Coordinator (Lead): Reassignment page tests.
// ACs: AC1 (assigned active events), AC2 (availability and workload), AC3
// (reassign to a different coordinator), AC4 (unavailable refused), AC7
// (confirmation; refusal refreshes), AC11 (unavailable coordinator flagged).
// Test cases: LEAD-REASN-01-C, 01-D, 01-E, 02-A, 03-D, 03-H, 03-BND-1, 04-C,
// 07-A, 07-D, 11-B.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/api";
import { formatDateTimeRange } from "@/utils/format";
import { ReassignmentPage } from "./ReassignmentPage";

const { getAssignedEvents, getLeadCoordinators, reassignEvent } = vi.hoisted(() => ({
  getAssignedEvents: vi.fn(),
  getLeadCoordinators: vi.fn(),
  reassignEvent: vi.fn(),
}));

vi.mock("@/features/lead/api/lead-api", () => ({ getAssignedEvents, getLeadCoordinators, reassignEvent }));

const welcome = {
  id: "event-1",
  name: "Welcome Evening",
  status: "Approved",
  startDateTime: "2027-01-10T10:00:00.000Z",
  endDateTime: "2027-01-12T12:00:00.000Z",
  coordinatorId: "c1",
  coordinatorName: "Coordinator 1",
  coordinatorAvailable: true,
};
const gala = { ...welcome, id: "event-2", name: "Spring Gala", status: "Submitted", coordinatorId: "c3", coordinatorName: "Coordinator 3" };

// Coordinators as the server sends them: fewest active first.
const current = { id: "c1", name: "Coordinator 1", available: true, activeAssignments: 1 };
const free = { id: "c2", name: "Coordinator 2", available: true, activeAssignments: 0 };
const busy = { id: "c4", name: "Coordinator 4", available: true, activeAssignments: 3 };
const away = { id: "c3", name: "Coordinator 3", available: false, activeAssignments: 2 };

// The card that holds a given event name.
function card(name: string) {
  return within(screen.getByRole("article", { name }));
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
  // Fresh mocks; by default one assigned event and the coordinators above.
  getAssignedEvents.mockReset();
  getLeadCoordinators.mockReset();
  reassignEvent.mockReset();
  getAssignedEvents.mockResolvedValue([welcome]);
  getLeadCoordinators.mockResolvedValue([free, current, away, busy]);
});

describe("AC1 and AC11: the assigned events", () => {
  // Each event shows its name, status, exact dates and times, and current coordinator.
  it("LEAD-REASN-01-C shows each event's name, status, date and time, and current coordinator in the server's order", async () => {
    // Arrange: two assigned events, soonest first.
    getAssignedEvents.mockResolvedValue([welcome, gala]);

    // Act: open the page.
    render(<ReassignmentPage />);

    // Assert: cards in the server's order, each with its own details.
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Welcome Evening", "Spring Gala"]);
    const first = card("Welcome Evening");
    expect(first.getByRole("heading", { name: "Welcome Evening" })).toBeInTheDocument();
    expect(first.getByText("Approved")).toBeInTheDocument();
    expect(first.getByText(formatDateTimeRange(welcome.startDateTime, welcome.endDateTime))).toBeInTheDocument();
    expect(first.getByText("Coordinator: Coordinator 1")).toBeInTheDocument();
    expect(card("Spring Gala").getByText("Coordinator: Coordinator 3")).toBeInTheDocument();
  });

  // An empty list says so.
  it("LEAD-REASN-01-D shows a message when there are no assigned events", async () => {
    // Arrange: nothing is assigned.
    getAssignedEvents.mockResolvedValue([]);

    // Act: open the page.
    render(<ReassignmentPage />);

    // Assert: the empty message, and no cards.
    expect(await screen.findByText("No assigned events to reassign.")).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  // If the list can't be loaded, the Lead is told instead of seeing an empty page.
  it("LEAD-REASN-01-E shows an error when the list cannot be loaded", async () => {
    // Arrange: loading fails.
    getAssignedEvents.mockRejectedValue(new ApiError("The service is temporarily unavailable. Please try again."));

    // Act: open the page.
    render(<ReassignmentPage />);

    // Assert: the error, and no false "nothing to reassign".
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable. Please try again.");
    expect(screen.queryByText("No assigned events to reassign.")).not.toBeInTheDocument();
  });

  // Events whose coordinator is unavailable stand out.
  it('LEAD-REASN-11-B labels events whose coordinator is unavailable "Coordinator unavailable"', async () => {
    // Arrange: one event with an unavailable coordinator, one without.
    getAssignedEvents.mockResolvedValue([welcome, { ...gala, coordinatorAvailable: false }]);

    // Act: open the page.
    render(<ReassignmentPage />);

    // Assert: only the affected event carries the label.
    await screen.findAllByRole("article");
    expect(card("Spring Gala").getByText("Coordinator unavailable")).toBeInTheDocument();
    expect(card("Welcome Evening").queryByText("Coordinator unavailable")).not.toBeInTheDocument();
  });
});

describe("AC2, AC3 and AC4: choosing the new coordinator", () => {
  // The picker keeps the server's fewest-first order and shows availability and workload.
  it("LEAD-REASN-02-A lists coordinators fewest active first with their availability and active count", async () => {
    // Act: open the page.
    render(<ReassignmentPage />);
    const picker = (await screen.findByRole("article", { name: "Welcome Evening" })).querySelector("select")!;

    // Assert: one option per coordinator, in the server's order, with availability and count.
    const options = within(picker).getAllByRole("option").slice(1).map((o) => o.textContent);
    expect(options).toEqual([
      "Coordinator 2 (0 active)",
      "Coordinator 1 (current)",
      "Coordinator 3 (Unavailable)",
      "Coordinator 4 (3 active)",
    ]);
  });

  // The coordinator the event already has can't be picked.
  it("LEAD-REASN-03-D does not let the Lead choose the event's current coordinator", async () => {
    // Act: open the page.
    render(<ReassignmentPage />);
    const picker = await screen.findByLabelText("Reassign to");

    // Assert: the current coordinator is shown but disabled, and nothing is chosen yet so Reassign is off.
    expect(within(picker).getByRole("option", { name: "Coordinator 1 (current)" })).toBeDisabled();
    expect(card("Welcome Evening").getByRole("button", { name: "Reassign" })).toBeDisabled();
  });

  // Unavailable coordinators are listed but can't be chosen.
  it("LEAD-REASN-04-C lists unavailable coordinators but does not let them be chosen", async () => {
    // Act: open the page.
    render(<ReassignmentPage />);
    const picker = await screen.findByLabelText("Reassign to");

    // Assert: Coordinator 3 is disabled; Coordinator 2 is selectable.
    expect(within(picker).getByRole("option", { name: "Coordinator 3 (Unavailable)" })).toBeDisabled();
    expect(within(picker).getByRole("option", { name: "Coordinator 2 (0 active)" })).toBeEnabled();
  });

  // Reassigning sends the chosen and the shown coordinator, and the card shows the new one.
  it("LEAD-REASN-03-H reassigns to the chosen coordinator and shows them on the event", async () => {
    // Arrange: the server accepts; the reloaded list shows the new coordinator.
    const user = userEvent.setup();
    reassignEvent.mockResolvedValue({ message: 'Event "Welcome Evening" reassigned to Coordinator 2.' });
    getAssignedEvents
      .mockResolvedValueOnce([welcome])
      .mockResolvedValue([{ ...welcome, coordinatorId: "c2", coordinatorName: "Coordinator 2" }]);
    render(<ReassignmentPage />);

    // Act: choose Coordinator 2 and reassign.
    await user.selectOptions(await screen.findByLabelText("Reassign to"), "c2");
    await user.click(card("Welcome Evening").getByRole("button", { name: "Reassign" }));

    // Assert: one call with event, new and current coordinator; the card now shows Coordinator 2.
    expect(reassignEvent).toHaveBeenCalledTimes(1);
    expect(reassignEvent).toHaveBeenCalledWith("event-1", "c2", "c1");
    expect(await card("Welcome Evening").findByText("Coordinator: Coordinator 2")).toBeInTheDocument();
  });

  // A double click sends one request.
  it("LEAD-REASN-03-BND-1 disables Reassign while reassigning so only one request is sent", async () => {
    // Arrange: the reassignment is held pending.
    const user = userEvent.setup();
    const pending = deferred<{ message: string }>();
    reassignEvent.mockReturnValue(pending.promise);
    render(<ReassignmentPage />);
    await user.selectOptions(await screen.findByLabelText("Reassign to"), "c2");

    // Act: click, then click again while it is pending.
    const button = card("Welcome Evening").getByRole("button", { name: "Reassign" });
    await user.click(button);
    await user.click(card("Welcome Evening").getByRole("button", { name: "Reassigning…" }));

    // Assert: disabled while pending and called once; the confirmation appears when it finishes.
    expect(card("Welcome Evening").getByRole("button", { name: "Reassigning…" })).toBeDisabled();
    expect(reassignEvent).toHaveBeenCalledTimes(1);
    pending.resolve({ message: 'Event "Welcome Evening" reassigned to Coordinator 2.' });
    expect(await screen.findByRole("status")).toHaveTextContent('Event "Welcome Evening" reassigned to Coordinator 2.');
  });
});

describe("AC7: confirmation and refusals", () => {
  // A successful reassignment is confirmed with the server's message.
  it("LEAD-REASN-07-A confirms which coordinator the event was reassigned to", async () => {
    // Arrange: the server accepts.
    const user = userEvent.setup();
    reassignEvent.mockResolvedValue({ message: 'Event "Welcome Evening" reassigned to Coordinator 2.' });
    render(<ReassignmentPage />);

    // Act: reassign to Coordinator 2.
    await user.selectOptions(await screen.findByLabelText("Reassign to"), "c2");
    await user.click(card("Welcome Evening").getByRole("button", { name: "Reassign" }));

    // Assert: the confirmation names the event and the new coordinator.
    expect(await screen.findByRole("status")).toHaveTextContent('Event "Welcome Evening" reassigned to Coordinator 2.');
  });

  // When the server refuses (e.g. the page was stale), the reason is shown and the page refreshes.
  it("LEAD-REASN-07-D shows the reason and reloads the events and coordinators when a reassignment is refused", async () => {
    // Arrange: the server refuses as stale; the reloaded list shows who really has the event now.
    const user = userEvent.setup();
    reassignEvent.mockRejectedValue(
      new ApiError("This event was changed since you loaded the page. Refresh and try again.", undefined, undefined, 409),
    );
    getAssignedEvents
      .mockResolvedValueOnce([welcome])
      .mockResolvedValue([{ ...welcome, coordinatorId: "c4", coordinatorName: "Coordinator 4" }]);
    render(<ReassignmentPage />);

    // Act: try to reassign to Coordinator 2.
    await user.selectOptions(await screen.findByLabelText("Reassign to"), "c2");
    await user.click(card("Welcome Evening").getByRole("button", { name: "Reassign" }));

    // Assert: the reason stays on screen, both lists reload, and the card shows the real coordinator.
    expect(await screen.findByRole("alert")).toHaveTextContent("This event was changed since you loaded the page. Refresh and try again.");
    await waitFor(() => expect(getAssignedEvents).toHaveBeenCalledTimes(2));
    expect(getLeadCoordinators).toHaveBeenCalledTimes(2);
    expect(await card("Welcome Evening").findByText("Coordinator: Coordinator 4")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
