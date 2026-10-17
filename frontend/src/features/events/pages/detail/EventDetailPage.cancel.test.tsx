import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventComment, EventRecord, PlanningView } from "@/types";

/*
 * SPM-136 Cancel an Event, page level (EventDetailPage). The HTTP layer is the boundary and is mocked; the
 * page, its role logic, the dialog and the panels are real.
 *   AC1 (CANCEL-EVENT-01-A/B/C F): only the assigned coordinator or submitting organiser sees Cancel Event.
 *   AC3 (03-A): the cancelled event shows Cancelled without a reload.
 *   AC7 (07-A UI): a cancelled event shows a banner and no change controls.
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000301";
const EVENT_NAME = "Annual Gala Dinner";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: EVENT_NAME,
    purpose: "Dinner",
    description: "A gala dinner.",
    organiserId: "org-01",
    organiserName: "Organiser 1",
    coordinatorId: "coo-01",
    coordinatorName: "Coordinator 1",
    status: "planning",
    startDateTime: "2026-11-05T02:00:00.000Z",
    endDateTime: "2026-11-05T04:00:00.000Z",
    expectedAttendance: 80,
    venueRequirements: { minCapacity: 80, layout: "Banquet", facilities: ["Catering"], accessibility: [] },
    equipmentNeeds: "Projector",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-10-04T09:00:00.000Z",
    ...overrides,
  };
}

function planningView(event: EventRecord): PlanningView {
  return {
    event,
    venueBookings: [{ id: "bk-1", venueName: "Main Hall", start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z", status: "Booked" }],
    equipmentArrangements: [{ id: "eq-1", name: "Projector", quantity: 1, status: "Reserved" }],
    pendingChanges: [],
    readOnly: false,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
  };
}

function routeApi(event: EventRecord, comments: EventComment[] = []) {
  apiMock.mockImplementation(((path: string) => {
    if (path.endsWith("/status-change")) {
      return Promise.resolve({ eventId: EVENT_ID, status: "Cancelled", message: `${EVENT_NAME} has been cancelled.` });
    }
    if (path.endsWith("/arrangements-status")) {
      return Promise.resolve({ eventId: EVENT_ID, ready: false, outstanding: [] });
    }
    if (path.endsWith("/planning")) return Promise.resolve(planningView(event));
    if (path.includes("/comments")) return Promise.resolve(comments);
    if (path.endsWith("/confirmed-arrangements")) return Promise.reject(new Error("not confirmed"));
    return Promise.resolve(event);
  }) as typeof api);
}

function renderAs(user: { id: string; role: string; roles: string[] }, event: EventRecord, comments: EventComment[] = []) {
  routeApi(event, comments);
  useAppStore.setState({
    currentUser: { ...user, name: user.id, email: `${user.id}@example.test` } as never,
    events: [event],
  });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const COORDINATOR = { id: "coo-01", role: "coordinator", roles: ["coordinator"] };
const ORGANISER = { id: "org-01", role: "organiser", roles: ["organiser"] };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SPM-136 AC1: Cancel Event is offered to the assigned coordinator and the submitting organiser only", () => {
  // Kills: F39 (the page hides Cancel Event on a Planning event)
  it("CANCEL-EVENT-01-A (page): the assigned coordinator sees Cancel Event on a Planning event", async () => {
    // Arrange
    renderAs(COORDINATOR, eventRecord());

    // Act: wait for the page to render the action
    const trigger = await screen.findByRole("button", { name: "Cancel Event" });

    // Assert: the action is visible to the assigned coordinator
    expect(trigger).toBeInTheDocument();
  });

  // Kills: F40 (the page hides Cancel Event from the organiser on a Confirmed event)
  it("CANCEL-EVENT-01-B (page): the submitting organiser sees Cancel Event on a Confirmed event", async () => {
    // Arrange
    renderAs(ORGANISER, eventRecord({ status: "confirmed" }));

    // Act: wait for the page to render the action
    const trigger = await screen.findByRole("button", { name: "Cancel Event" });

    // Assert: the action is visible to the submitting organiser
    expect(trigger).toBeInTheDocument();
  });

  // Kills: F26 (COO-02 row: the assigned-coordinator id check dropped); F1 (LEAD-01 row); F2 (ORG-02 row)
  it.each([
    ["COO-02, not assigned", { id: "coo-02", role: "coordinator", roles: ["coordinator"] }],
    ["ORG-02, another organiser", { id: "org-02", role: "organiser", roles: ["organiser"] }],
    ["LEAD-01, Coordinator Lead", { id: "lead-01", role: "coordinator_lead", roles: ["coordinator_lead"] }],
  ])("CANCEL-EVENT-01-C-F: %s does not see Cancel Event", async (_label, user) => {
    // Arrange
    renderAs(user, eventRecord());

    // Act: the page has rendered once the event heading is shown
    await screen.findByRole("heading", { name: EVENT_NAME });

    // Assert: no Cancel Event action for this user
    expect(screen.queryByRole("button", { name: "Cancel Event" })).not.toBeInTheDocument();
  });

  // Kills: F33 (cancelled allowed: the Cancel Event button shows on a cancelled event), F34 (completed allowed), F35 (rejected allowed)
  it.each([
    ["completed", "completed"],
    ["rejected", "rejected"],
    ["cancelled", "cancelled"],
  ])("CANCEL-EVENT-03-B (page): a %s event offers no Cancel Event action", async (_label, status) => {
    // Arrange
    renderAs(COORDINATOR, eventRecord({ status: status as EventRecord["status"] }));

    // Act: the page has rendered once the event heading is shown
    await screen.findByRole("heading", { name: EVENT_NAME });

    // Assert: no Cancel Event action on a non-cancellable event
    expect(screen.queryByRole("button", { name: "Cancel Event" })).not.toBeInTheDocument();
  });
});

describe("SPM-136 status timeline: a cancelled event ends at Cancelled", () => {
  // Kills: the timeline ending at completed instead of cancelled (status flow step removed or renamed)
  it("CANCEL-EVENT-03-C (timeline): the coordinator sees Confirmed then Cancelled, with Cancelled as the current step", async () => {
    // Arrange
    renderAs(COORDINATOR, eventRecord({ status: "cancelled" }));

    // Act: the timeline is shown for the assigned coordinator
    const timeline = await screen.findByRole("list", { name: "Event status timeline" });

    // Assert: Cancelled is the last step and is highlighted; Completed is no longer a step
    expect(within(timeline).getByText("cancelled")).toHaveClass("text-primary-800");
    expect(within(timeline).getByText("confirmed")).toHaveClass("text-primary-800");
    expect(within(timeline).queryByText("completed")).not.toBeInTheDocument();
  });
});

describe("SPM-136 AC2 and AC3: cancelling from the page", () => {
  // Kills: F6, F7, F15
  it("CANCEL-EVENT-03-A (page): after confirming, the page shows Cancelled and the banner without a reload", async () => {
    // Arrange
    const user = userEvent.setup();
    renderAs(COORDINATOR, eventRecord());
    await user.click(await screen.findByRole("button", { name: "Cancel Event" }));
    const dialog = screen.getByRole("dialog");

    // Act
    await user.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    // Assert: the MSG-CN-02 confirmation is announced in a status region (TR-136-02), the banner shows, and the request was sent once
    expect(await screen.findByRole("status")).toHaveTextContent("Annual Gala Dinner has been cancelled.");
    expect(screen.getByText("This event has been cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Event" })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([path]) => String(path).endsWith("/status-change"))).toHaveLength(1);
  });
});

describe("SPM-136 AC2: dismissing the dialog from the page (CANCEL-EVENT-02-B)", () => {
  // Kills: F8
  it("CANCEL-EVENT-02-B (page): Keep event closes the dialog, the event stays Planning and no cancel request is sent", async () => {
    // Arrange
    const user = userEvent.setup();
    renderAs(COORDINATOR, eventRecord());
    await user.click(await screen.findByRole("button", { name: "Cancel Event" }));
    const dialog = screen.getByRole("dialog");

    // Act
    await user.click(within(dialog).getByRole("button", { name: "Keep event" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("This event has been cancelled.")).not.toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([path]) => String(path).endsWith("/status-change"))).toHaveLength(0);
  });
});

describe("SPM-136 AC7: a cancelled event shows no change controls (07-A UI)", () => {
  // Kills: F6
  it("CANCEL-EVENT-07-A (page): the cancelled event shows the banner and hides the planning update form and confirm controls", async () => {
    // Arrange
    // Act: the coordinator opens a cancelled event
    renderAs(COORDINATOR, eventRecord({ status: "cancelled" }));

    // Assert
    expect(await screen.findByText("This event has been cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Update Event Information" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search Venues" })).not.toBeInTheDocument();
  });
});

// RR-136-03: a cancelled event is closed to change; its open clarification may not be answered or resolved.
function openClarification(): EventComment {
  return {
    id: "clar-1",
    eventId: EVENT_ID,
    parentId: null,
    type: "clarification",
    authorId: "coo-01",
    authorName: "Coordinator 1",
    authorRole: "coordinator",
    message: "Please confirm the catering headcount.",
    awaitingReply: true,
    resolved: false,
    createdAt: "2026-10-04T09:00:00.000Z",
  };
}

describe("SPM-136 AC7 (RR-136-03): a cancelled event offers no clarification reply or resolve", () => {
  // Kills: F16, F17
  it("CANCEL-EVENT-07-A-CLAR: the cancelled event shows the open clarification without Reply or Resolve", async () => {
    // Arrange: the assigned coordinator opens a cancelled event that still has an unanswered clarification
    // Act
    renderAs(COORDINATOR, eventRecord({ status: "cancelled" }), [openClarification()]);

    // Assert: the clarification is visible, but neither answer nor resolve controls are offered
    expect((await screen.findAllByText("Please confirm the catering headcount.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  // Kills: F41 (Reply hidden on a live Planning event, so a live event loses its clarification controls)
  it("CANCEL-EVENT-07-A-CLAR (control): a live event with the same open clarification offers Reply and Resolve", async () => {
    // Arrange: the same clarification on a Planning event, so the hidden controls are caused by the cancelled status
    // Act
    renderAs(COORDINATOR, eventRecord({ status: "planning" }), [openClarification()]);

    // Assert
    expect((await screen.findAllByText("Please confirm the catering headcount.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });
});

// CQ F2: focus never falls back to the document body when the cancel dialog closes.
describe("SPM-136 CQ F2 (page): focus after the cancel dialog closes", () => {
  // Kills: F8, F21, F22
  it("CANCEL-EVENT-02-D9: CQ F2 (page): Keep event returns focus to the Cancel Event button", async () => {
    // Arrange
    const user = userEvent.setup();
    renderAs(COORDINATOR, eventRecord());
    const trigger = await screen.findByRole("button", { name: "Cancel Event" });
    await user.click(trigger);

    // Act
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep event" }));

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // Kills: F6, F7, F15, F21, F22, F23
  it("CANCEL-EVENT-02-D10: CQ F2 (page): after a successful cancel and Close, focus rests on the cancelled banner", async () => {
    // Arrange
    const user = userEvent.setup();
    renderAs(COORDINATOR, eventRecord());
    await user.click(await screen.findByRole("button", { name: "Cancel Event" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm cancellation" }));
    await screen.findByRole("status");

    // Act
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Assert: the stable banner, not the body, holds focus, and it is not in the tab order
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const banner = screen.getByText("This event has been cancelled.");
    expect(banner).toHaveFocus();
    expect(banner).toHaveAttribute("tabindex", "-1");
  });
});
