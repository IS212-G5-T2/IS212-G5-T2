import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/features/events/pages/detail/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord, PlanningView } from "@/types";

/*
 * SPM-135 Confirm an Event, page level (EventDetailPage). The HTTP layer is the
 * boundary and is mocked; the page, its role logic and the panels are real.
 * AC1: only the assigned coordinator is offered Confirm Event (CONFIRM-EVENT-01-A/C).
 * AC4: after a successful confirm the status shows Confirmed without a reload (04-A).
 * AC5: the organiser sees the confirmed arrangements only once the event is Confirmed (05-B).
 */

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EVENT_ID = "00000000-0000-4000-8000-000000000201";
const EVENT_NAME = "Product Launch Mixer";

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: EVENT_ID,
    name: EVENT_NAME,
    purpose: "Launch",
    description: "A mixer for the launch.",
    organiserId: "organiser-1",
    organiserName: "Demo Organiser",
    coordinatorId: "coordinator-1",
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
    readOnly: true,
    editableFields: [],
    lastUpdatedAt: "2026-10-04T09:00:00.000Z",
  };
}

/** Routes the mocked HTTP layer by path. `eventStatus` is what GET /events/:id keeps returning (no reload changes it). */
function routeApi(event: EventRecord) {
  apiMock.mockImplementation(((path: string) => {
    if (path.endsWith("/status-change")) {
      return Promise.resolve({ eventId: EVENT_ID, status: "Confirmed", message: `${EVENT_NAME} has been confirmed.` });
    }
    if (path.endsWith("/arrangements-status")) return Promise.resolve({ eventId: EVENT_ID, ready: true, outstanding: [] });
    if (path.endsWith("/confirmed-arrangements")) {
      return Promise.resolve({
        eventId: EVENT_ID,
        status: "Confirmed",
        venueBookings: [{ venueName: "Main Hall", start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z", status: "Approved" }],
        equipment: [{ name: "Projector", quantity: 1, status: "Reserved" }],
        safety: { state: "Approved" },
      });
    }
    if (path.endsWith("/planning")) return Promise.resolve(planningView(event));
    if (path.includes("/comments")) return Promise.resolve([]);
    return Promise.resolve(event);
  }) as typeof api);
}

const readinessCalls = () => apiMock.mock.calls.filter(([path]) => String(path).endsWith("/arrangements-status")).length;
const eventFetchCalls = () => apiMock.mock.calls.filter(([path]) => path === `/events/${EVENT_ID}`).length;

function renderAs(user: { id: string; role: string; roles: string[] }, event: EventRecord) {
  routeApi(event);
  useAppStore.setState({
    currentUser: { ...user, name: user.id, email: `${user.id}@example.test` } as never,
    events: [],
  });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SPM-135 AC1: only the assigned coordinator is offered Confirm Event (page level)", () => {
  // CONFIRM-EVENT-01-A (FE page): the assigned coordinator on a Planning event sees the action.
  it("CONFIRM-EVENT-01-A (page): the assigned coordinator sees Confirm Event on a Planning event", async () => {
    // Arrange: COO-01 is the assigned coordinator of EVT-201 (Planning)
    renderAs({ id: "coordinator-1", role: "coordinator", roles: ["coordinator"] }, eventRecord());

    // Act / Assert
    expect(await screen.findByRole("button", { name: "Confirm Event" })).toBeInTheDocument();
  });

  // CONFIRM-EVENT-01-C (FE page): another coordinator (COO-02) sees no action and the readiness view is not requested.
  it("CONFIRM-EVENT-01-C (page): another coordinator (COO-02) sees no Confirm Event and makes no readiness request", async () => {
    // Arrange: COO-02 is signed in; the event is assigned to COO-01
    renderAs({ id: "coordinator-2", role: "coordinator", roles: ["coordinator"] }, eventRecord());

    // Act
    await screen.findByText("Event Details");

    // Assert
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(readinessCalls()).toBe(0);
  });

  // CONFIRM-EVENT-01-C (FE page): the Coordinator Lead (role coordinator_lead) is not the assigned coordinator.
  it("CONFIRM-EVENT-01-C (page): the Coordinator Lead sees no Confirm Event and makes no readiness request", async () => {
    // Arrange: the Lead LEAD-01 is signed in with the coordinator_lead role; the event is assigned to COO-01
    renderAs({ id: "lead-1", role: "coordinator_lead", roles: ["coordinator_lead"] }, eventRecord());

    // Act
    await screen.findByText("Event Details");

    // Assert
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
    expect(readinessCalls()).toBe(0);
  });
});

describe("SPM-135 AC4: the status is Confirmed after a successful confirm, without a reload (page level)", () => {
  // CONFIRM-EVENT-04-A (FE page): the timeline shows confirmed as the current step from the response, with no event refetch.
  it("CONFIRM-EVENT-04-A (page): after Confirm Event the status shows confirmed as the current step and the event is not refetched", async () => {
    // Arrange: COO-01 on a ready Planning event; the server keeps returning the event as Planning
    renderAs({ id: "coordinator-1", role: "coordinator", roles: ["coordinator"] }, eventRecord());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Confirm Event" }));
    const fetchesBeforeClick = eventFetchCalls();

    // Act: the confirm response is read; no page reload
    expect(await screen.findByRole("status")).toHaveTextContent(`${EVENT_NAME} has been confirmed.`);

    // Assert: the status timeline now marks confirmed as current and completed as not yet reached
    const timeline = screen.getByRole("list", { name: "Event status timeline" });
    expect(within(timeline).getByText("confirmed")).toHaveClass("text-primary-800");
    expect(within(timeline).getByText("completed")).toHaveClass("text-gray-400");
    expect(eventFetchCalls()).toBe(fetchesBeforeClick);
    expect(screen.queryByRole("button", { name: "Confirm Event" })).not.toBeInTheDocument();
  });
});

describe("SPM-135 AC5: the organiser sees confirmed arrangements only once the event is Confirmed (page level)", () => {
  // CONFIRM-EVENT-05-B (FE page): a Planning event shows no confirmed arrangements and requests none.
  it("CONFIRM-EVENT-05-B (page): the submitting organiser of a Planning event sees no confirmed arrangements", async () => {
    // Arrange: ORG-01 submitted EVT-201, still Planning
    renderAs({ id: "organiser-1", role: "organiser", roles: ["organiser"] }, eventRecord({ status: "planning" }));

    // Act
    await screen.findByText("Event Details");

    // Assert
    expect(screen.queryByRole("heading", { name: "Confirmed arrangements" })).not.toBeInTheDocument();
    expect(apiMock.mock.calls.some(([path]) => String(path).endsWith("/confirmed-arrangements"))).toBe(false);
  });

  // CONFIRM-EVENT-05-B (FE page): once Confirmed, the submitting organiser sees the arrangements.
  it("CONFIRM-EVENT-05-B (page): the submitting organiser sees the confirmed arrangements of a Confirmed event", async () => {
    // Arrange: ORG-01 submitted EVT-201, now Confirmed
    renderAs({ id: "organiser-1", role: "organiser", roles: ["organiser"] }, eventRecord({ status: "confirmed" }));

    // Act / Assert
    expect(await screen.findByRole("heading", { name: "Confirmed arrangements" })).toBeInTheDocument();
    expect(screen.getByText(/Main Hall:/)).toBeInTheDocument();
    expect(screen.getByText(/Projector x1/)).toBeInTheDocument();
  });
});
