import { cleanup, render, screen } from "@testing-library/react";
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

  it("does not render 'Assign Myself as Coordinator' button", async () => {
    const event = { ...assignedEvent(), coordinatorId: undefined, coordinatorName: undefined };
    apiMock.mockResolvedValue(event);

    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome Evening" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assign Myself/i })).toBeNull();
  });

  it("shows pop-up error message and restricts review actions for non-assigned coordinators without read-only badge", async () => {
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
    expect(screen.getAllByText("This event has not been assigned to you.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Review Event" })).toBeNull();
  });

  it("allows assigned coordinator to access review actions", async () => {
    const event = assignedEvent();
    apiMock.mockResolvedValue(event);

    useAppStore.setState({
      currentUser: {
        id: "coordinator-1",
        name: "Demo Coordinator",
        email: "coordinator@example.test",
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
    expect(screen.getByRole("button", { name: "Review Event" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Change Requests/i })).toBeTruthy();
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

