import { cleanup, render, screen } from "@testing-library/react";
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

  // SPM-123 AC9: the coordinator sees new assignments on the events page itself, not just in the standalone panel.
  it("LEAD-ASN-09-M shows the coordinator's new-assignment panel on the events page", async () => {
    // Arrange: a coordinator whose notifications feed has one unread assignment; the events list is empty.
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/notifications"
          ? [
              {
                id: "notif-1",
                audienceRole: "coordinator",
                audienceUserId: "coordinator-1",
                type: "coordinator_assignment",
                message: 'New event request "Welcome Evening" is awaiting your review.',
                relatedEventId: "event-1",
                read: false,
                createdAt: "2026-10-06T09:00:00.000Z",
              },
            ]
          : [],
      ) as ReturnType<typeof api>,
    );
    useAppStore.setState({
      currentUser: { id: "coordinator-1", name: "Coordinator One", email: "coordinator@example.test", role: "coordinator" },
      events: [],
    });

    // Act: open the events page.
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Assert: the page includes the "Assignment updates" panel with the assignment.
    const panel = await screen.findByRole("region", { name: "Assignment updates" });
    expect(panel).toHaveTextContent('New event request "Welcome Evening" is awaiting your review.');
  });

  // SPM-61: attendees get Upcoming/Registered/Past/Cancelled filters, see
  // "Confirmed" for Approved events, and a Registered badge beside the status.
  it("gives attendees personal filters and a Registered badge", async () => {
    const user = userEvent.setup();
    const future = new Date(Date.now() + 7 * 86_400_000);
    const futureEnd = new Date(future.getTime() + 3 * 3_600_000);
    const base = { ...submittedEvent(), registrationEnabled: true, startDateTime: future.toISOString(), endDateTime: futureEnd.toISOString() };
    const events: EventRecord[] = [
      { ...base, id: "e-open", name: "Open Approved Event", status: "approved" },
      { ...base, id: "e-mine", name: "My Registered Event", status: "confirmed", myRegistrationStatus: "registered" },
      { ...base, id: "e-past", name: "My Past Event", status: "completed", myRegistrationStatus: "registered",
        startDateTime: "2020-01-01T00:00:00.000Z", endDateTime: "2020-01-01T03:00:00.000Z" },
      { ...base, id: "e-cancel", name: "My Cancelled Event", status: "cancelled", myRegistrationStatus: "registered" },
    ];
    apiMock.mockResolvedValue(events);
    useAppStore.setState({
      currentUser: { id: "attendee-1", name: "Alice", email: "alice@example.com", role: "attendee" },
    });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Default Upcoming view: both published future events, Approved shown as Confirmed.
    expect(await screen.findByText("Open Approved Event")).toBeInTheDocument();
    expect(screen.getByText("My Registered Event")).toBeInTheDocument();
    expect(screen.queryByText("My Past Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
    expect(screen.getAllByText("Registered")).toHaveLength(1);
    expect(screen.queryByLabelText("Filter by status")).not.toBeInTheDocument();

    // Registered Events: only my future registration, with both badges.
    await user.selectOptions(screen.getByLabelText("Show"), "registered");
    expect(screen.getByText("My Registered Event")).toBeInTheDocument();
    expect(screen.queryByText("Open Approved Event")).not.toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Registered")).toBeInTheDocument();

    // Past Events keeps the Completed tag and adds Registered.
    await user.selectOptions(screen.getByLabelText("Show"), "past");
    expect(screen.getByText("My Past Event")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Registered")).toBeInTheDocument();

    // Cancelled: only the cancelled event I registered for.
    await user.selectOptions(screen.getByLabelText("Show"), "cancelled");
    expect(screen.getByText("My Cancelled Event")).toBeInTheDocument();
    expect(screen.queryByText("My Past Event")).not.toBeInTheDocument();
  });
});
