import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { RequireAssignedCoordinator } from "./RequireAssignedCoordinator";
import { RequireAuth } from "./RequireAuth";
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

const coordinator: User = {
  id: "coordinator-1",
  name: "Coordinator",
  email: "coordinator@example.com",
  role: "coordinator",
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
        <Route path="/login" element={<p>Login page</p>} />
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

/**
 * Renders one guard directly so its standalone loading and unauthenticated
 * behavior remains covered even when the production route nests it inside a
 * broader role guard.
 *
 * @param path - Guarded route path pattern.
 * @param initialEntry - URL to resolve through the route pattern.
 * @param element - Guard element, including a child to cover direct usage.
 */
function renderGuard(path: string, initialEntry: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/events" element={<p>Events dashboard</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("restricted organiser routes", () => {
  it("protects application content while preserving its loading and login states", () => {
    const { unmount: unmountAuthenticated } = renderGuard(
      "/authenticated-child",
      "/authenticated-child",
      <RequireAuth><p>Authenticated child</p></RequireAuth>,
    );
    expect(screen.getByText("Authenticated child")).toBeInTheDocument();
    unmountAuthenticated();

    useAppStore.setState({ authLoading: true });
    const { unmount: unmountLoading } = renderGuard(
      "/authenticated-child",
      "/authenticated-child",
      <RequireAuth><p>Authenticated child</p></RequireAuth>,
    );
    expect(screen.getByText(/checking your sign-in status/i)).toBeInTheDocument();
    unmountLoading();

    useAppStore.setState({ authLoading: false, isAuthenticated: false });
    renderGuard(
      "/authenticated-child",
      "/authenticated-child",
      <RequireAuth><p>Authenticated child</p></RequireAuth>,
    );
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("allows an organiser to create and edit an event they own", () => {
    renderRoutes("/events/create");
    expect(screen.getByText("Create event")).toBeInTheDocument();

    renderRoutes("/events/event-1/edit");
    expect(screen.getByText("Edit owned event")).toBeInTheDocument();
  });

  it("allows the coordinator assigned to an event to review its change requests", () => {
    useAppStore.setState({
      currentUser: coordinator,
      events: [{ ...event, coordinatorId: coordinator.id, coordinatorName: coordinator.name }],
    });

    renderRoutes("/events/event-1/change-requests");

    expect(screen.getByText("Review change requests")).toBeInTheDocument();
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

  it.each([
    "/events/create",
    "/events/event-1/edit",
    "/events/event-1/change-requests",
  ])("shows the auth loading screen before resolving %s", (path) => {
    useAppStore.setState({ authLoading: true });

    renderRoutes(path);

    expect(screen.getByText(/checking your sign-in status/i)).toBeInTheDocument();
  });

  it.each([
    "/events/create",
    "/events/event-1/edit",
    "/events/event-1/change-requests",
  ])("redirects an unauthenticated visitor from %s to login", (path) => {
    useAppStore.setState({ isAuthenticated: false });

    renderRoutes(path);

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders direct children for each standalone guard", () => {
    const { unmount: unmountRole } = renderGuard(
      "/role-child",
      "/role-child",
      <RequireRole allowedRoles={["organiser"]}><p>Role child</p></RequireRole>,
    );
    expect(screen.getByText("Role child")).toBeInTheDocument();
    unmountRole();

    const { unmount: unmountOwner } = renderGuard(
      "/events/:id/owner-child",
      "/events/event-1/owner-child",
      <RequireEventOwner><p>Owner child</p></RequireEventOwner>,
    );
    expect(screen.getByText("Owner child")).toBeInTheDocument();
    unmountOwner();

    useAppStore.setState({
      currentUser: coordinator,
      events: [{ ...event, coordinatorId: coordinator.id, coordinatorName: coordinator.name }],
    });
    renderGuard(
      "/events/:id/coordinator-child",
      "/events/event-1/coordinator-child",
      <RequireAssignedCoordinator><p>Coordinator child</p></RequireAssignedCoordinator>,
    );
    expect(screen.getByText("Coordinator child")).toBeInTheDocument();
  });

  it.each([
    { authLoading: true, expected: /checking your sign-in status/i },
    { authLoading: false, isAuthenticated: false, expected: "Login page" },
  ])("handles standalone owner guard state %#", ({ expected, ...state }) => {
    useAppStore.setState(state);

    renderGuard(
      "/events/:id/owner-state",
      "/events/event-1/owner-state",
      <RequireEventOwner><p>Owner content</p></RequireEventOwner>,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
