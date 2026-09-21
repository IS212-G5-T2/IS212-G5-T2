import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventDetailPage } from "@/pages/EventDetailPage";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/utils/api";
import type { EventRecord } from "@/types";

vi.mock("@/utils/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function assignedEvent(): EventRecord {
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
    coordinatorId: "coordinator-1",
    coordinatorName: "Demo Coordinator",
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
    attachments: [
      {
        id: "attachment-1",
        name: "proposal.txt",
        type: "text/plain",
        size: 8,
        dataUrl: "data:text/plain;base64,cHJvcG9zYWw=",
      },
    ],
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
  useAppStore.setState({
    currentUser: {
      id: "coordinator-1",
      name: "Demo Coordinator",
      email: "coordinator@example.test",
      role: "coordinator",
    },
    events: [],
  });
});

describe("EventDetailPage", () => {
  // Second story Test Case AC3
  it("shows attached files with view and download actions", async () => {
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      path.includes("/comments") ? Promise.resolve([]) : Promise.resolve(event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.getByText("Attached files")).toBeTruthy();
    expect(screen.getByText("proposal.txt")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View" })).toHaveProperty(
      "href",
      "data:text/plain;base64,cHJvcG9zYWw=",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveProperty(
      "download",
      "proposal.txt",
    );
  });

  // SPM-37 follow-up: coordinators claim an unassigned request explicitly.
  it("assigns the current coordinator only after clicking Assign Myself", async () => {
    // Load an unassigned event and an empty comment thread.
    const event = { ...assignedEvent(), coordinatorId: undefined, coordinatorName: undefined };
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    // Before claiming, an unassigned coordinator sees no review entrypoint.
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    // Claim the request through the visible control.
    fireEvent.click(screen.getByRole("button", { name: "Assign Myself as Coordinator" }));
    // After assignment the Review Event entrypoint appears (enabled), but there
    // is no approve/reject workflow behind it for SPM-37.
    expect(screen.getByRole("button", { name: "Review Event" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Submit Decision" })).toBeNull();
    expect(useAppStore.getState().events[0]).toMatchObject({
      coordinatorId: "coordinator-1", status: "under_review",
    });
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  // SPM-37 follow-up: submitting a draft must not pick a coordinator.
  it("leaves a submitted draft unassigned and sends only a submission notification", () => {
    // Start with a new draft and an empty notification list.
    useAppStore.setState({ events: [], notifications: [] });
    const draft = useAppStore.getState().createDraftEvent({ name: "Manual assignment" });
    // Submit without taking the separate assignment action.
    useAppStore.getState().submitEvent(draft.id);
    // Submission is visible to coordinators without an assignment notification.
    const state = useAppStore.getState();
    expect(state.events[0].status).toBe("submitted");
    expect(state.events[0].coordinatorId).toBeUndefined();
    expect(state.events[0].coordinatorName).toBeUndefined();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: "submission", message: '"Manual assignment" was submitted for review.',
    });
  });

  it("does not show review or assignment controls to a coordinator the event is not assigned to", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "coordinator-other",
        name: "Other Coordinator",
        email: "other@example.test",
        role: "coordinator",
      },
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByText(/Read-Only/i)).toBeNull();
    // No "not assigned" notice, no review entrypoint, and no claim control for a
    // coordinator the event already belongs to someone else.
    expect(screen.queryByText(/not been assigned to you/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  // SPM-83 builds the approve/reject decision controls behind the Review Event
  // entrypoint, replacing the SPM-37 "not available yet" placeholder. Full
  // coverage of the reject workflow lives in EventDetailPage.reject.test.tsx.
  it("reveals approve/reject decision controls when the assigned coordinator opens Review Event", async () => {
    // Load a request already assigned to the signed-in coordinator.
    const event = assignedEvent();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.includes("/comments") ? [] : event),
    );

    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Demo Coordinator",
        email: "coordinator@example.test",
        role: "coordinator",
      },
    });

    // Open the event detail page.
    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    // The review entrypoint is present and enabled; clicking it now reveals the
    // approve/reject decision controls (no more "not available yet" placeholder).
    const reviewButton = screen.getByRole("button", { name: "Review Event" });
    expect(reviewButton).toHaveProperty("disabled", false);
    fireEvent.click(reviewButton);
    expect(screen.queryByText("Event review is not available yet.")).toBeNull();
    expect(screen.getByRole("radio", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Reject" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  it("restricts venue staff from accessing unapproved submitted requests", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "venue-1",
        name: "Venue Staff",
        email: "venue@example.test",
        role: "venue_staff",
      },
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Access restricted: Venue and technical support staff cannot access unapproved submitted requests/i),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
  });

  it("restricts tech support staff from accessing unapproved submitted requests", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "tech-1",
        name: "Tech Support",
        email: "tech@example.test",
        role: "tech_support",
      },
    });

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Access restricted: Venue and technical support staff cannot access unapproved submitted requests/i),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome Evening" })).toBeNull();
  });
});

