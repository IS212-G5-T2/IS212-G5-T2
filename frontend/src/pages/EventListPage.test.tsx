import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventCreatePage } from "@/pages/EventCreatePage";
import { EventListPage } from "@/pages/EventListPage";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function submittedEvent(): EventRecord {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  return {
    id: "00000000-0000-4000-8000-000000000036",
    name: "Welcome Evening",
    purpose: "Community building",
    description: "A welcome event for new members.",
    organiserId: "current-user",
    organiserName: "Demo Organiser",
    status: "submitted",
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    expectedAttendance: 80,
    venueRequirements: {
      minCapacity: 80,
      layout: "Banquet",
      facilities: ["Catering"],
      accessibility: ["Wheelchair ramps"],
    },
    attachments: [],
    equipmentNeeds: "Two microphones",
    registrationEnabled: false,
    changeRequests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockResolvedValue([]);
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: {
      id: "current-user",
      name: "Demo Organiser",
      email: "organiser@example.test",
      role: "organiser",
    },
    events: [],
  });
});

describe("EventListPage", () => {
  // SPM-36 Test Case EVE-CRE-01-A
  it("EVE-CRE-01-A opens the Event Request form from Event Planning", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/planning"]}>
        <Routes>
          <Route path="/planning" element={<EventListPage />} />
          <Route path="/events/create" element={<EventCreatePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Event Planning" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /create event/i }));

    expect(screen.getByRole("heading", { name: /create new event request/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /event name/i })).toBeTruthy();
  });

  // SPM-36 Test Case EVE-CRE-07-B
  it("EVE-CRE-07-B shows a submitted event under My Events", async () => {
    const event = submittedEvent();
    apiMock.mockResolvedValue([event]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "My Events" })).toBeTruthy();
    expect(await screen.findByText("Welcome Evening")).toBeTruthy();
    expect(screen.getByText("Community building")).toBeTruthy();
    expect(screen.getByText("Submitted", { selector: "span" })).toBeTruthy();
  });

  // Coordinators can view rejected requests via the "Rejected" status filter.
  it("lets coordinators view rejected requests through the Rejected status filter", async () => {
    const user = userEvent.setup();
    const rejected: EventRecord = {
      ...submittedEvent(),
      id: "00000000-0000-4000-8000-0000000000ff",
      name: "Rejected Gala",
      status: "rejected",
      rejectionReason: "Venue unavailable for the requested date.",
    };
    apiMock.mockResolvedValue([submittedEvent(), rejected]);

    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Coordinator One",
        email: "coordinator@example.test",
        role: "coordinator",
      },
      events: [],
    });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // The Rejected option is available in the coordinator's status filter.
    expect(await screen.findByRole("option", { name: "Rejected" })).toBeTruthy();

    // Default is the Submitted (Pending Requests) view; switching to Rejected
    // surfaces the rejected request.
    expect(screen.getByText("Welcome Evening")).toBeTruthy();
    expect(screen.queryByText("Rejected Gala")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Filter by status"), "rejected");

    expect(screen.getByText("Rejected Gala")).toBeTruthy();
    expect(screen.queryByText("Welcome Evening")).toBeNull();
  });

  // SPM-123 AC4 + AC5: the coordinator's dashboard is their assigned requests.
  // Pending ones are the default queue (SPM-83); approved and rejected requests
  // stay assigned to them and are one status-filter change away.
  it("EVE-ASN-04-B shows a coordinator their pending assigned requests, with approved and rejected ones still reachable", async () => {
    useAppStore.setState({
      currentUser: { id: "coord-1", name: "Coordinator One", email: "c@example.test", role: "coordinator" },
    });
    const assigned = { coordinatorId: "coord-1", coordinatorName: "Coordinator One" };
    apiMock.mockResolvedValue([
      { ...submittedEvent(), ...assigned, id: "e-1", name: "Pending Gala", status: "submitted" },
      { ...submittedEvent(), ...assigned, id: "e-2", name: "Approved Fair", status: "approved" },
      { ...submittedEvent(), ...assigned, id: "e-3", name: "Rejected Rally", status: "rejected" },
    ]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "My Assigned Requests" })).toBeTruthy();
    // The description explains that decided requests stay assigned and reachable.
    expect(
      screen.getByText(
        "Requests assigned to you. Pending ones show first; use the status filter to see approved and rejected requests, which stay assigned to you.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Pending Gala")).toBeTruthy();
    expect(screen.queryByText("Approved Fair")).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "" } });

    expect(screen.getByText("Pending Gala")).toBeTruthy();
    expect(screen.getByText("Approved Fair")).toBeTruthy();
    expect(screen.getByText("Rejected Rally")).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/events");
  });

  // Only coordinators get the assigned-requests dashboard; other staff keep the full list.
  it("EVE-ASN-04-D does not show the assigned-requests dashboard to non-coordinators", async () => {
    // Arrange: a venue staff account with one event to list.
    useAppStore.setState({
      currentUser: { id: "venue-1", name: "Venue Staff", email: "v@example.test", role: "venue_staff" },
    });
    apiMock.mockResolvedValue([{ ...submittedEvent(), id: "e-1", name: "Pending Gala", status: "submitted" }]);

    // Act: open the events page.
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the general "All Events" view, not "My Assigned Requests".
    expect(await screen.findByRole("heading", { name: "All Events" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "My Assigned Requests" })).toBeNull();
    expect(screen.queryByText(/Requests assigned to you/)).toBeNull();
  });

  it("EVE-ASN-04-C shows a coordinator an empty dashboard, not someone else's requests, when nothing is assigned", async () => {
    useAppStore.setState({
      currentUser: { id: "coord-1", name: "Coordinator One", email: "c@example.test", role: "coordinator" },
    });
    apiMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "My Assigned Requests" })).toBeTruthy();
    expect(screen.queryByText("Welcome Evening")).toBeNull();
  });
});
