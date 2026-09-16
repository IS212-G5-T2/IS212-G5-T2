import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAssignedCoordinator } from "./RequireAssignedCoordinator";
import { RequireEventOwner } from "./RequireEventOwner";
import { RequireRole } from "./RequireRole";
import { useAppStore } from "@/store/useAppStore";
import type { EventRecord, User } from "@/types";

const organiser: User = {
  id: "organiser-1",
  name: "Owner",
  email: "owner@example.com",
  role: "organiser",
};

const attendee: User = {
  id: "attendee-1",
  name: "Attendee",
  email: "attendee@example.com",
  role: "attendee",
};

const event: EventRecord = {
  id: "event-1",
  name: "Owned event",
  purpose: "Test",
  description: "Test event",
  organiserId: organiser.id,
  organiserName: organiser.name,
  status: "draft",
  startDateTime: "2026-10-01T09:00:00.000Z",
  endDateTime: "2026-10-01T10:00:00.000Z",
  expectedAttendance: 10,
  venueRequirements: { minCapacity: 10, accessibility: [], facilities: [], layout: "" },
  equipmentNeeds: "",
  registrationEnabled: false,
  changeRequests: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

// Each route test starts from a signed-in organiser who owns the fixture event.
beforeEach(() => {
  useAppStore.setState({
    authLoading: false,
    isAuthenticated: true,
    currentUser: organiser,
    events: [event],
  });
});

/**
 * Renders only the guarded routes needed to test direct navigation behavior.
 *
 * @param initialEntry - The route a user attempts to open directly.
 * @returns The React Testing Library render result.
 */
function renderRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/events" element={<p>Events dashboard</p>} />
        <Route element={<RequireRole allowedRoles={["organiser"]} />}>
          <Route path="/events/create" element={<p>Create event</p>} />
          <Route element={<RequireEventOwner />}>
            <Route path="/events/:id/edit" element={<p>Edit owned event</p>} />
          </Route>
        </Route>
        <Route element={<RequireAssignedCoordinator />}>
          <Route path="/events/:id/change-requests" element={<p>Review change requests</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("restricted organiser routes", () => {
  it("allows an organiser to create and edit an event they own", () => {
    renderRoutes("/events/create");
    expect(screen.getByText("Create event")).toBeInTheDocument();

    renderRoutes("/events/event-1/edit");
    expect(screen.getByText("Edit owned event")).toBeInTheDocument();
  });

  it("redirects an attendee who directly opens an organiser-only route", () => {
    useAppStore.setState({ currentUser: attendee });
    renderRoutes("/events/create");

    expect(screen.getByText("Events dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Create event")).not.toBeInTheDocument();
  });

  it("redirects an organiser who directly opens another organiser's event", () => {
    useAppStore.setState({ currentUser: { ...organiser, id: "organiser-2" } });
    renderRoutes("/events/event-1/edit");

    expect(screen.getByText("Events dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Edit owned event")).not.toBeInTheDocument();
  });

  it("redirects an organiser who directly opens coordinator-only change reviews", () => {
    renderRoutes("/events/event-1/change-requests");

    expect(screen.getByText("Events dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Review change requests")).not.toBeInTheDocument();
  });
});
