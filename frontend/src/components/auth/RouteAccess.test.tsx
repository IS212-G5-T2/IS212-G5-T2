import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { RequireAssignedCoordinator } from "./RequireAssignedCoordinator";
import { RequireAuth } from "./RequireAuth";
import { RequireEventOwner } from "./RequireEventOwner";
import { RequireRole } from "./RequireRole";
import { useAppStore } from "@/store/useAppStore";
import { navByRole } from "@/components/layout/navConfig";
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

const technicalSupport: User = {
  id: "tech-support-1",
  name: "Technical Support",
  email: "support@example.com",
  role: "tech_support",
};

const venueStaff: User = {
  id: "venue-staff-1",
  name: "Venue Staff",
  email: "venue@example.com",
  role: "venue_staff",
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
        <Route element={<RequireRole allowedRoles={["coordinator", "venue_staff"]} />}>
          <Route path="/venues" element={<p>Venue catalogue</p>} />
          <Route path="/venues/availability" element={<p>Venue availability</p>} />
          <Route path="/venues/:id" element={<p>Venue detail</p>} />
          <Route path="/bookings" element={<p>Bookings</p>} />
        </Route>
        <Route element={<RequireRole allowedRoles={["tech_support"]} />}>
          <Route path="/equipment" element={<p>Equipment</p>} />
          <Route path="/equipment/create" element={<p>Create equipment</p>} />
          <Route path="/equipment/availability" element={<p>Equipment availability</p>} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator", "tech_support"]} />}>
          <Route path="/equipment/requests" element={<p>Equipment requests</p>} />
        </Route>
        <Route element={<RequireRole allowedRoles={["coordinator_lead"]} />}>
          <Route path="/lead/queue" element={<p>Assignment queue</p>} />
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

  // A secondary server-granted role authorizes the route even when it is not the display role.
  it("allows a multi-role user through a route granted by its secondary role", () => {
    useAppStore.setState({
      currentUser: { ...coordinator, role: "venue_staff", roles: ["venue_staff", "coordinator"] },
    });

    // /equipment/requests is granted to coordinators, not venue staff (SPM-111).
    renderRoutes("/equipment/requests");

    expect(screen.getByText("Equipment requests")).toBeInTheDocument();
  });

  it("redirects an attendee who directly opens an organiser-only route", () => {
    useAppStore.setState({ currentUser: attendee });
    renderRoutes("/events/create");

    expect(screen.getByText("Events dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Create event")).not.toBeInTheDocument();
  });

  it.each([
    "/venues",
    "/venues/availability",
    "/venues/venue-1",
    "/bookings",
    "/equipment",
    "/equipment/create",
    "/equipment/requests",
    "/equipment/availability",
  ])("redirects an attendee who directly opens restricted operational route %s", (path) => {
    useAppStore.setState({ currentUser: attendee });
    renderRoutes(path);

    expect(screen.getByText("Events dashboard")).toBeInTheDocument();
  });

  // EQUIP-VIEW-01-E (AC1, supplementary). Kills: RequireRole wiring for
  // /equipment/availability in this file's isolated route table. Fast, but NOT
  // authoritative for App.tsx itself, since this table is hand-maintained rather
  // than imported from App.tsx (confirmed by mutation testing: editing App.tsx's
  // real route config leaves this test green). EQUIP-VIEW-01-A/B in App.test.tsx
  // are the authoritative regression guard, rendering the real <App/>; the negative
  // side of this isolated table is covered above by the "/equipment/availability"
  // case in the restricted-operational-route table.
  it("EQUIP-VIEW-01-E allows Technical Support to reach the equipment inventory list", () => {
    useAppStore.setState({ currentUser: technicalSupport });

    renderRoutes("/equipment/availability");

    expect(screen.getByText("Equipment availability")).toBeInTheDocument();
  });

  // SPM-111 EQUIP-CRE-01-B: only Technical Support reaches the create-record route.
  it("allows Technical Support and blocks every other role from the equipment creation route", () => {
    useAppStore.setState({ currentUser: technicalSupport });
    const { unmount } = renderRoutes("/equipment/create");
    expect(screen.getByText("Create equipment")).toBeInTheDocument();

    unmount();
    for (const user of [organiser, coordinator, venueStaff, attendee]) {
      useAppStore.setState({ currentUser: user });
      const { unmount: unmountBlocked } = renderRoutes("/equipment/create");
      expect(screen.queryByText("Create equipment")).not.toBeInTheDocument();
      expect(screen.getByText("Events dashboard")).toBeInTheDocument();
      unmountBlocked();
    }
  });

  // Coordinators handle event equipment requests but not equipment records.
  it("allows a coordinator to view equipment requests but blocks equipment record routes", () => {
    useAppStore.setState({ currentUser: coordinator });
    const { unmount: unmountRequests } = renderRoutes("/equipment/requests");
    expect(screen.getByText("Equipment requests")).toBeInTheDocument();
    unmountRequests();

    for (const path of ["/equipment", "/equipment/create", "/equipment/availability"]) {
      const { unmount: unmountBlocked } = renderRoutes(path);
      expect(screen.getByText("Events dashboard")).toBeInTheDocument();
      unmountBlocked();
    }
  });

  // SPM-37: cover every branch of RequireRole's role-specific fallback redirect.
  it("redirects unauthorized venue_staff to /venues", () => {
    useAppStore.setState({
      currentUser: { ...organiser, id: "vs-1", role: "venue_staff" as const },
    });

    renderRoutes("/events/create");

    expect(screen.queryByText("Create event")).not.toBeInTheDocument();
  });

  it("redirects unauthorized tech_support to /equipment/requests", () => {
    useAppStore.setState({
      currentUser: { ...organiser, id: "ts-1", role: "tech_support" as const },
    });

    renderRoutes("/events/create");

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

describe("SPM-123 AC11: the Assignment Queue is Lead-only", () => {
  // Only the Lead reaches the queue or sees it in the nav; a Lead sent away lands on it.
  it("LEAD-ASN-11-SEC-4 shows the Assignment Queue only to the Lead", () => {
    // Arrange + Act: the Lead opens the queue.
    const lead = { ...organiser, id: "lead-1", role: "coordinator_lead" as const, roles: ["coordinator_lead" as const] };
    useAppStore.setState({ currentUser: lead });
    const { unmount } = renderRoutes("/lead/queue");

    // Assert: the Lead sees it.
    expect(screen.getByText("Assignment queue")).toBeInTheDocument();
    unmount();

    // Act + Assert: a coordinator and an organiser are sent to the events dashboard instead.
    for (const role of ["coordinator", "organiser"] as const) {
      useAppStore.setState({ currentUser: { ...organiser, id: `${role}-1`, role, roles: [role] } });
      const { unmount: unmountOther } = renderRoutes("/lead/queue");
      expect(screen.queryByText("Assignment queue")).not.toBeInTheDocument();
      expect(screen.getByText("Events dashboard")).toBeInTheDocument();
      unmountOther();
    }

    // Act + Assert: a Lead who opens a route they can't use lands on their queue, not a blank page.
    useAppStore.setState({ currentUser: lead });
    renderRoutes("/events/create");
    expect(screen.getByText("Assignment queue")).toBeInTheDocument();

    // Assert: only the Lead's navigation offers the queue.
    expect(navByRole.coordinator_lead.map((item) => item.to)).toEqual(["/lead/queue"]);
    for (const [role, items] of Object.entries(navByRole)) {
      if (role !== "coordinator_lead") expect(items.map((item) => item.to)).not.toContain("/lead/queue");
    }
  });
});
